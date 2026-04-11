const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const mime = require("mime-types");

const https = require("https");

const app = express();
app.set('trust proxy', true);

// Cloudflare R2 설정
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "3951114ac8cb013f4bd1759894bb2952";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "53030f7c5ab8bccccad67b7a81a017e3";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "6dee324261a5346e7197f37fd44564768b347cf4f661831ccffb76a629cf29f3";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "4cut-photos";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "https://pub-1bb31f7734c744dcbe3d3a0e03d4a6a2.r2.dev";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// 파일 업로드 헬퍼 함수 (폴더 구조 지원)
async function uploadFileToR2(filePath, fileName, folder = "results") {
  const fileStream = fs.createReadStream(filePath);
  const contentType = mime.lookup(filePath) || "application/octet-stream";
  const key = `${folder}/${fileName}`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
    },
  });

  await upload.done();
  return `${R2_PUBLIC_URL}/${key}`;
}

// 서비스 설정 보존 로직
const CONFIG_KEY = "system/config.json";

async function saveConfigToR2() {
  try {
    const configData = JSON.stringify(config);
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: CONFIG_KEY,
      Body: configData,
      ContentType: "application/json",
    });
    await s3Client.send(command);
    console.log("[R2] Config saved successfully.");
  } catch (err) {
    console.error("[R2] Config save failed:", err);
  }
}

const { GetObjectCommand } = require("@aws-sdk/client-s3");
async function loadConfigFromR2() {
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: CONFIG_KEY,
    });
    const response = await s3Client.send(command);
    const bodyContents = await response.Body.transformToString();
    const savedConfig = JSON.parse(bodyContents);
    config = { ...config, ...savedConfig };
    console.log("[R2] Config loaded successfully:", config);
  } catch (err) {
    console.log("[R2] No saved config found, using defaults.");
  }
}

const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.BACKEND_URL;

// 현재 요청을 바탕으로 서비스의 기본 주소(Base URL)를 결정하는 헬퍼 함수
const getCurrentBaseUrl = (req) => {
  if (BASE_URL) return BASE_URL;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
};

// 프레임 이미지를 로컬로 잠시 내려받는 헬퍼 함수 (FFmpeg 안정성 및 SIGSEGV 방지용)
function downloadFrameTemp(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`프레임 다운로드 실패: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// [R2 전용] 24시간이 지난 결과물 파일을 자동 삭제하는 헬퍼 함수
async function cleanupR2Results() {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: "results/"
    });
    const { Contents } = await s3Client.send(listCommand);
    if (!Contents || Contents.length === 0) return;

    const now = new Date();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    
    // LastModified가 24시간을 넘긴 오브젝트만 필터링
    const toDelete = Contents
      .filter(obj => obj.Key !== "results/" && (now - new Date(obj.LastModified)) > ONE_DAY_MS)
      .map(obj => ({ Key: obj.Key }));

    if (toDelete.length > 0) {
      console.log(`[Cron R2] 24시간 경과된 오브젝트 ${toDelete.length}개를 삭제합니다.`);
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: { Objects: toDelete }
      });
      await s3Client.send(deleteCommand);
    }
  } catch (err) {
    console.error("[Cron R2 Error]", err);
  }
}

// [작업 대기열] 저사양 서버 메모리 보호를 위해 작업을 하나씩 순서대로 처리
class JobQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }
  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }
  async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    const { task, resolve, reject } = this.queue.shift();
    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }
}
const videoQueue = new JobQueue();

// CORS 설정: 배포 환경에서는 보안을 위해 실제 프론트엔드 주소만 허용하도록 설정 가능
app.use(cors({
  origin: "*", // 테스트 단계에서는 모두 허용, 추후 FRONTEND_URL로 제한 가능
  methods: ["GET", "POST", "DELETE", "OPTIONS"]
}));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

let config = {
  intervalSeconds: 6,
  maxShots: 6,
  readySeconds: 10,
  secretFrames: {},
  frameUrl: null
};

// 디렉토리 세팅
const resultDir = path.join(__dirname, "uploads/results");
const externalFrameDir = path.join(__dirname, "external-frames");

if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
if (!fs.existsSync(externalFrameDir)) fs.mkdirSync(externalFrameDir, { recursive: true });
if (!fs.existsSync("uploads/frames")) fs.mkdirSync("uploads/frames", { recursive: true });
if (!fs.existsSync("backend/uploads/temp")) fs.mkdirSync("backend/uploads/temp", { recursive: true });

const resultStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resultDir),
  filename: (req, file, cb) => cb(null, `result_${Date.now()}${path.extname(file.originalname)}`)
});
const frameStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads/frames")),
  filename: (req, file, cb) => cb(null, `frame_${Date.now()}.png`)
});

const uploadResult = multer({ storage: resultStorage });
const uploadFrame = multer({ storage: frameStorage });

// 설정 라우터
app.get("/api/config", (req, res) => res.json(config));
app.post("/api/config", async (req, res) => {
  if (req.body.intervalSeconds) config.intervalSeconds = req.body.intervalSeconds;
  if (req.body.maxShots) config.maxShots = req.body.maxShots;
  if (req.body.readySeconds) config.readySeconds = req.body.readySeconds;
  
  await saveConfigToR2(); // R2에 즉시 영구 저장
  res.json(config);
});

/**
 * [CORS 해결용 이미지 프록시]
 * R2에서 직접 불러올 때 발생하는 CORS 보안 문제를 해결하기 위해 서버가 대신 이미지를 내려받아 전달합니다.
 * 스트림 방식을 사용하여 서버 메모리 점유를 최소화합니다.
 */
app.get("/api/proxy-image", (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send("URL이 필요합니다.");

  try {
    https.get(imageUrl, (proxyRes) => {
      if (proxyRes.statusCode !== 200) {
        return res.status(proxyRes.statusCode).send("이미지를 불러올 수 없습니다.");
      }
      res.setHeader("Content-Type", proxyRes.headers["content-type"] || "image/png");
      res.setHeader("Access-Control-Allow-Origin", "*");
      proxyRes.pipe(res);
    }).on("error", (err) => {
      console.error("[Proxy Error]", err);
      res.status(500).send("이미지 프록시 오류");
    });
  } catch (err) {
    res.status(500).send("프록시 처리 실패");
  }
});

// 결과 사진 저장 (QR 제공 목적)
app.post("/api/save-result", uploadResult.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  try {
    const r2Url = await uploadFileToR2(req.file.path, req.file.filename, "results");
    res.json({ url: r2Url, filename: req.file.filename });
  } catch (err) {
    console.error("[R2 Upload Error]", err);
    // 폴백: R2 업로드 실패 시 로컬 주소로 응답 (results 폴더 경로 포함)
    const currentBase = getCurrentBaseUrl(req);
    const fileUrl = `${currentBase}/results/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.filename });
  }
});

// 강제 다운로드 엔드포인트 (Content-Disposition 헤더로 파일명 강제 지정)
app.get("/api/download/:filename", (req, res) => {
  const filename = req.params.filename;
  if (!filename) return res.status(400).json({ error: "Missing filename" });

  const targetPath = path.join(resultDir, filename);
  const downloadName = req.query.name || filename;
  const encodedName = encodeURIComponent(downloadName);

  // 다운로드 강제 헤더 설정
  res.setHeader("Content-Disposition", `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
  if (filename.endsWith('.mp4')) res.setHeader("Content-Type", "video/mp4");
  else if (filename.endsWith('.jpg')) res.setHeader("Content-Type", "image/jpeg");

  if (fs.existsSync(targetPath)) {
    // 1. 로컬에 있을 때
    res.sendFile(targetPath);
  } else {
    // 2. 로컬에 없을 때 -> R2에서 스트리밍으로 가져와서 전달 (아이폰에서 저장 기능 보장)
    const r2Url = `${R2_PUBLIC_URL}/results/${filename}`;
    console.log("[Download] Streaming from R2 to force download:", r2Url);
    
    https.get(r2Url, (r2Res) => {
      if (r2Res.statusCode !== 200) {
        return res.status(r2Res.statusCode).send("File not found on R2");
      }
      r2Res.pipe(res);
    }).on("error", (err) => {
      console.error("[Download Error]", err);
      res.status(500).send("Streaming error");
    });
  }
});

// 정적 파일(/results) 및 과거 경로 요청 시에도 로컬에 없으면 R2로 연결
app.use("/results", (req, res, next) => {
  const filename = req.path.split("/").pop();
  if (filename && filename.includes(".")) {
    const targetPath = path.join(resultDir, filename);
    if (!fs.existsSync(targetPath)) {
      return res.redirect(`${R2_PUBLIC_URL}/results/${filename}`);
    }
  }
  next();
}, express.static(resultDir));

app.use("/uploads/results", (req, res, next) => {
  const filename = req.path.split("/").pop();
  if (filename && filename.includes(".")) {
    return res.redirect(`${R2_PUBLIC_URL}/results/${filename}`);
  }
  next();
}, express.static(resultDir));

// 비디오 파일들 보관소
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resultDir),
  filename: (req, file, cb) => cb(null, `vid_${Date.now()}_${Math.random().toString(36).substring(7)}.webm`)
});
const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 100 * 1024 * 1024 } });

// 라이브 멀티그리드 비디오 생성 API
app.post("/api/save-video", uploadVideo.array("videos", 4), async (req, res) => {
  console.log("[Video] Received files:", req.files ? req.files.length : 0);
  if (!req.files || req.files.length !== 4) {
    console.error("[Video] Expected 4 files, got:", req.files ? req.files.length : 0);
    return res.status(400).json({ error: "4 videos required, got: " + (req.files ? req.files.length : 0) });
  }

  // 무거운 합성 작업은 대기열(Queue)에 넣어 하나씩 처리합니다.
  return videoQueue.add(async () => {
    const frameStr = req.body.frame; 
    const timestamp = Date.now();
    const outFilename = `result_vid_${timestamp}.mp4`;
    const outPath = path.join(__dirname, "uploads/results", outFilename);
    const tempDir = path.join(__dirname, "uploads/temp");

  let command = ffmpeg();
  req.files.forEach(f => command.input(f.path));

  const cropFilter = 'hflip,scale=-2:691,crop=465:691,setsar=1';
  let filterComplex = '';
  let tempFramePath = ""; // 임시 프레임 파일 경로 보관용

  // 임시 데이터 청소 함수 (메모리 및 용량 관리)
  const cleanup = () => {
    if (tempFramePath && fs.existsSync(tempFramePath)) {
      fs.unlink(tempFramePath, () => console.log("[Cleanup] Temp frame deleted."));
    }
  };

  if (frameStr && frameStr.startsWith('#')) {
    // 단색 프레임일 경우
    const hex = frameStr.replace('#', '0x');
    filterComplex = `color=c=${hex}:s=1080x1920:d=4 [bg];`;
    filterComplex += `[0:v]${cropFilter} [v1];`;
    filterComplex += `[1:v]${cropFilter} [v2];`;
    filterComplex += `[2:v]${cropFilter} [v3];`;
    filterComplex += `[3:v]${cropFilter} [v4];`;
    filterComplex += `[bg][v1]overlay=63:76:shortest=1[o1];`
    filterComplex += `[o1][v2]overlay=550:76:shortest=1[o2];`
    filterComplex += `[o2][v3]overlay=63:789:shortest=1[o3];`
    filterComplex += `[o3][v4]overlay=550:789:shortest=1[out]`

    command
      .complexFilter(filterComplex, 'out')
      .outputOptions([
        '-c:v', 'libx264', 
        '-pix_fmt', 'yuv420p', 
        '-t', '4', 
        '-shortest',
        '-preset', 'ultrafast',
        '-threads', '1',
        '-crf', '28'
      ])
      .save(outPath)
      .on('start', (cmd) => console.log('[FFmpeg] cmd:', cmd))
      .on('end', async () => { 
        console.log('[FFmpeg] Done:', outFilename); 
        try {
          const r2Url = await uploadFileToR2(outPath, outFilename);
          if (!res.headersSent) {
            res.json({ url: r2Url }); 
          }
        } catch (uploadErr) {
          console.error("[R2 Video Upload Error]", uploadErr);
          if (!res.headersSent) {
            res.json({ url: `${getCurrentBaseUrl(req)}/uploads/results/${outFilename}` }); 
          }
        }
      })
      .on('error', (err) => { 
        console.error('[FFmpeg] Error:', err.message); 
        if (!res.headersSent) {
          res.status(500).json({error: 'encoding failed: ' + err.message}); 
        }
      });
  } else {
    // 외부 PNG 프레임일 경우 (R2 URL 또는 로컬 경로)
    let frameInput = "";
    if (frameStr && frameStr.startsWith("http")) {
       // [이중 잠금] 클라우드 주소인 경우 로컬 temp 폴더로 선(先) 다운로드
       if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
       tempFramePath = path.join(tempDir, `temp_frame_${timestamp}.png`);
       try {
         console.log("[Video] Downloading frame to local cache:", frameStr);
         frameInput = await downloadFrameTemp(frameStr, tempFramePath);
       } catch (err) {
         console.error("[Video] Frame download failed, fallback to white:", err);
       }
    } else if (frameStr && frameStr.includes("/external-frames/")) {
       const parts = frameStr.split("/external-frames/");
       const localPath = path.join(externalFrameDir, decodeURIComponent(parts[1]));
       if (fs.existsSync(localPath)) frameInput = localPath;
    }
    
    // 바탕은 흰색, 영상을 배치한 뒤, 맨 위(5번째 인풋)에 PNG 올리기
    if (frameInput) {
       command.input(frameInput).inputOptions('-loop 1'); // 0,1,2,3번은 영상, 4번이 PNG 프레임 (무한 루프 설정)
       filterComplex = `color=c=white:s=1080x1920:d=4 [base];`;
       filterComplex += `[0:v]${cropFilter} [v1];`;
       filterComplex += `[1:v]${cropFilter} [v2];`;
       filterComplex += `[2:v]${cropFilter} [v3];`;
       filterComplex += `[3:v]${cropFilter} [v4];`;
       filterComplex += `[base][v1]overlay=63:76:shortest=1[o1];`;
       filterComplex += `[o1][v2]overlay=550:76:shortest=1[o2];`;
       filterComplex += `[o2][v3]overlay=63:789:shortest=1[o3];`;
       filterComplex += `[o3][v4]overlay=550:789:shortest=1[o4];`;
       filterComplex += `[o4][4:v]overlay=0:0:shortest=1[out]`;
    } else {
       // 프레임 인식 실패시 단순 흰화면 베이스 폴백
       filterComplex = `color=c=white:s=1080x1920:d=4 [base];`;
       filterComplex += `[0:v]${cropFilter} [v1];`;
       filterComplex += `[1:v]${cropFilter} [v2];`;
       filterComplex += `[2:v]${cropFilter} [v3];`;
       filterComplex += `[3:v]${cropFilter} [v4];`;
       filterComplex += `[base][v1]overlay=63:76:shortest=1[o1];`;
       filterComplex += `[o1][v2]overlay=550:76:shortest=1[o2];`;
       filterComplex += `[o2][v3]overlay=63:789:shortest=1[o3];`;
       filterComplex += `[o3][v4]overlay=550:789:shortest=1[out]`;
    }

    command
      .complexFilter(filterComplex, 'out')
      .outputOptions([
        '-c:v', 'libx264', 
        '-pix_fmt', 'yuv420p', 
        '-t', '4', 
        '-shortest',
        '-preset', 'ultrafast',
        '-threads', '1',
        '-crf', '28'
      ])
      .save(outPath)
      .on('start', (cmd) => console.log('[FFmpeg] cmd:', cmd))
      .on('end', async () => { 
        console.log('[FFmpeg] Done:', outFilename); 
        cleanup(); // 임시 프레임 삭제
        try {
          const r2Url = await uploadFileToR2(outPath, outFilename, "results");
          if (!res.headersSent) {
            res.json({ url: r2Url }); 
          }
        } catch (uploadErr) {
          console.error("[R2 Video Upload Error]", uploadErr);
          if (!res.headersSent) {
            res.json({ url: `${getCurrentBaseUrl(req)}/results/${outFilename}` }); 
          }
        }
      })
      .on('error', (err) => { 
        console.error('[FFmpeg] Error:', err.message); 
        cleanup(); // 에러 발생 시에도 청소
        if (!res.headersSent) {
          res.status(500).json({error: 'encoding failed: ' + err.message}); 
        }
      });
    }
  });
});

// 외부 폴더 (external-frames) 정적 서빙 및 목록 조회
app.use("/external-frames", express.static(externalFrameDir));

const { ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

app.get("/api/frames-list", async (req, res) => {
  try {
    // Cloudflare R2에서 frames/ 폴더 내 파일만 필터링하여 조회
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: "frames/"
    });
    
    const { Contents } = await s3Client.send(command);
    if (!Contents) return res.json([]);
    
    // 파일명만 추출하여 공용 URL 생성
    const urls = Contents
      .filter(obj => obj.Key.toLowerCase().endsWith(".png") || obj.Key.toLowerCase().endsWith(".jpg"))
      .map(obj => `${R2_PUBLIC_URL}/${encodeURIComponent(obj.Key)}`);
      
    res.json(urls);
  } catch (err) {
    console.error("[R2 List Error]", err);
    if (!fs.existsSync(externalFrameDir)) return res.json([]);
    const files = fs.readdirSync(externalFrameDir).filter(f => f.toLowerCase().endsWith(".png") || f.toLowerCase().endsWith(".jpg"));
    const urls = files.map(f => `${R2_PUBLIC_URL}/frames/${encodeURIComponent(f)}`);
    res.json(urls);
  }
});

const frameStorageExternal = multer.diskStorage({
  destination: (req, file, cb) => cb(null, externalFrameDir),
  filename: (req, file, cb) => {
    // 보안 및 한글 이슈 방지를 위해 타임스탬프 기반 파일명 강제 적용 (Safe Renaming)
    cb(null, `frame_${Date.now()}.png`);
  }
});
const uploadFrameExternal = multer({ storage: frameStorageExternal });

app.post("/api/frame-external", uploadFrameExternal.single("frame"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  try {
    const r2Url = await uploadFileToR2(req.file.path, req.file.filename, "frames");
    res.json({ url: r2Url });
  } catch (err) {
    console.error("[R2 Frame Upload Error]", err);
    res.json({ url: `${getCurrentBaseUrl(req)}/external-frames/${encodeURIComponent(req.file.filename)}` });
  }
});

app.delete("/api/frame-external/:name", (req, res) => {
  const filename = req.params.name;
  const targetPath = path.join(externalFrameDir, filename);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  res.json({ success: true });
});

// 프레임 저장
app.post("/api/frame", uploadFrame.single("frame"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  config.frameUrl = `/uploads/frames/${req.file.filename}`;
  
  // 프론트엔드가 Next.js 이며 같은 머신에 있으므로,
  // public 폴더로 덮어쓰기 복사하여 CanvasRenderer가 쉽게 접근할 수 있도록 동기화
  const frontendPublicPath = path.join(__dirname, "../frontend/public/default-frame.png");
  if (fs.existsSync(path.dirname(frontendPublicPath))) {
    fs.copyFileSync(req.file.path, frontendPublicPath);
  }

  res.json({ url: config.frameUrl });
});

// 프레임 삭제
app.delete("/api/frame", (req, res) => {
  config.frameUrl = null;
  const frontendPublicPath = path.join(__dirname, "../frontend/public/default-frame.png");
  if (fs.existsSync(frontendPublicPath)) fs.unlinkSync(frontendPublicPath);
  res.json({ success: true });
});

// 정기 삭제 스케줄러 (매시간 정각마다 실행)
cron.schedule("0 * * * *", async () => {
  console.log("[Cron] 24시간 이상 지난 로컬 및 R2 결과물을 청소합니다.");
  
  // 1. R2 클라우드 청소
  await cleanupR2Results();

  // 2. 로컬 파일 청소
  const resultsDir = path.join(__dirname, "uploads/results");
  if (!fs.existsSync(resultsDir)) return;
  
  const files = fs.readdirSync(resultsDir);
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  
  let deletedCount = 0;
  files.forEach((file) => {
    const filePath = path.join(resultsDir, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > ONE_DAY_MS) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    } catch (e) {
      // 파일이 이미 삭제된 경우 등 예외 처리
    }
  });
  console.log(`[Cron] 로컬 파일 처리 완료. 삭제된 파일 수: ${deletedCount}`);
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Backend server listening at http://0.0.0.0:${PORT}`);
  await loadConfigFromR2(); // 서버 시작 시 R2에서 설정 불러오기
});
