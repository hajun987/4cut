const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Upload } = require("@aws-sdk/lib-storage");
const mime = require("mime-types");
const crypto = require("crypto");
const https = require("https");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

const app = express();
app.set('trust proxy', true);

// Gofile API 설정
const GOFILE_TOKEN = process.env.GOFILE_TOKEN;

// Cloudflare R2 설정 (백업용 및 설정 보존용)
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

/**
 * Gofile.io 업로드용 최적 서버 조회
 */
async function getGofileServer() {
  try {
    const resp = await axios.get("https://api.gofile.io/servers");
    if (resp.data.status === "ok" && resp.data.data.servers.length > 0) {
      return resp.data.data.servers[0].name;
    }
  } catch (err) {
    console.error("[Gofile] 서버 조회 실패:", err.message);
  }
  return "store1";
}

/**
 * Gofile.io 파일 업로드 함수
 */
async function uploadToGofile(filePath, folderId = null) {
  if (!GOFILE_TOKEN) throw new Error("GOFILE_TOKEN이 설정되지 않았습니다.");
  
  const server = await getGofileServer();
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  if (folderId) form.append("folderId", folderId);
  
  const resp = await axios.post(`https://${server}.gofile.io/uploadFile`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${GOFILE_TOKEN}`,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  
  if (resp.data.status !== "ok") {
    throw new Error(`Gofile 업로드 실패: ${JSON.stringify(resp.data)}`);
  }
  return resp.data.data;
}

/**
 * Gofile.io 계정의 루트 폴더 ID 조회
 */
async function getGofileRootId() {
  const envRootId = process.env.GOFILE_ROOT_ID;
  if (envRootId) return envRootId; // 환경 변수가 있으면 즉시 사용 (무료 계정 권장)

  if (!GOFILE_TOKEN) return null;
  try {
    const resp = await axios.get("https://api.gofile.io/accounts/getDetails", {
      headers: { Authorization: `Bearer ${GOFILE_TOKEN}` },
    });
    return resp.data.data.rootFolder;
  } catch (err) {
    console.error(`[Gofile] 루트 ID 조회 실패 (403이면 GOFILE_ROOT_ID 설정 필수): ${err.message}`);
    return null;
  }
}

// R2 업로드 헬퍼 (백업용)
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

const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.BACKEND_URL;

const getCurrentBaseUrl = (req) => {
  if (BASE_URL) return BASE_URL;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
};

async function cleanupR2Results() {
  try {
    const listCommand = new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: "results/" });
    const { Contents } = await s3Client.send(listCommand);
    if (!Contents || Contents.length === 0) return;
    const now = new Date();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const toDelete = Contents
      .filter(obj => obj.Key !== "results/" && (now - new Date(obj.LastModified)) > ONE_DAY_MS)
      .map(obj => ({ Key: obj.Key }));
    if (toDelete.length > 0) {
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: { Objects: toDelete }
      }));
    }
  } catch (err) { console.error("[R2 Cleanup Error]", err); }
}

app.use(cors({ origin: "*", methods: ["GET", "POST", "DELETE", "OPTIONS"] }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

let config = {
  intervalSeconds: 6,
  maxShots: 6,
  readySeconds: 10,
  secretFrames: {},
  frameUrl: null
};

const resultDir = path.join(__dirname, "uploads/results");
if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
if (!fs.existsSync("uploads/frames")) fs.mkdirSync("uploads/frames", { recursive: true });

const uploadResult = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, resultDir),
  filename: (req, file, cb) => cb(null, `result_${crypto.randomUUID()}${path.extname(file.originalname)}`)
})});

const uploadSingleVideo = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, resultDir),
  filename: (req, file, cb) => cb(null, `vid_${crypto.randomUUID()}.mp4`)
})});

// 결과 사진 저장 (Gofile 연동 및 EXIF 삭제)
app.post("/api/save-result", uploadResult.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  const tempPath = path.join(path.dirname(req.file.path), "clean_" + req.file.filename);
  
  try {
    // 1. 이미지 메타데이터(EXIF) 삭제
    await sharp(req.file.path).toFile(tempPath);
    
    // 2. Gofile에 업로드 및 폴더 생성
    const gofileData = await uploadToGofile(tempPath);
    
    // 3. 임시 파일 삭제
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    
    res.json({ 
      url: gofileData.downloadPage, 
      filename: req.file.filename,
      folderId: gofileData.parentFolder 
    });

    // R2 백업
    uploadFileToR2(req.file.path, req.file.filename, "results").catch(() => {});
    
  } catch (err) {
    console.error("[Save-Result Error]", err);
    res.json({ url: `${getCurrentBaseUrl(req)}/results/${req.file.filename}`, filename: req.file.filename });
  }
});

// 비디오 저장 (Gofile 연동)
app.post("/api/save-video", uploadSingleVideo.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video file uploaded" });
  const folderId = req.body.folderId;
  try {
    const gofileData = await uploadToGofile(req.file.path, folderId);
    res.json({ url: gofileData.downloadPage, filename: req.file.filename });
    uploadFileToR2(req.file.path, req.file.filename, "results").catch(() => {});
  } catch (err) {
    console.error("[Save-Video Error]", err);
    res.status(500).json({ error: "Gofile upload failed" });
  }
});

app.use("/results", express.static(resultDir));

// 설정 불러오기/저장 로직 생략(R2 유지)
app.get("/api/config", (req, res) => res.json(config));
app.post("/api/config", (req, res) => {
  Object.assign(config, req.body);
  res.json({ success: true, config });
});

// [Gofile 자동 삭제 크론 - 테스트 모드: 1분마다 실행, 1분 지난 파일 삭제]
cron.schedule("* * * * *", async () => {
  console.log(`[Cron] Gofile 정기 삭제 체크 중... (${new Date().toLocaleString()})`);
  if (!GOFILE_TOKEN) return;
  try {
    const rootId = await getGofileRootId();
    if (!rootId) return;
    const resp = await axios.get(`https://api.gofile.io/contents/${rootId}`, {
      headers: { Authorization: `Bearer ${GOFILE_TOKEN}` },
    });
    if (resp.data.status !== "ok") return;
    const contents = resp.data.data.children;
    const now = Math.floor(Date.now() / 1000);
    const TEST_THRESHOLD_SEC = 60; // 테스트를 위해 1분으로 설정 (상용 시 86400)
    const toDelete = [];
    for (const item of Object.values(contents)) {
      if (now - item.createTime > TEST_THRESHOLD_SEC) {
        console.log(`[Cron] 삭제 대상 발견: ${item.name} (생성: ${new Date(item.createTime * 1000).toLocaleString()})`);
        toDelete.push(item.id);
      }
    }
    if (toDelete.length > 0) {
      await axios.delete("https://api.gofile.io/contents/delete", {
        data: { contentsId: toDelete },
        headers: { Authorization: `Bearer ${GOFILE_TOKEN}` }
      });
      console.log(`[Cron] ${toDelete.length}개 항목 삭제 완료: ${toDelete.join(", ")}`);
    } else {
      console.log("[Cron] 삭제할 항목이 없습니다.");
    }
  } catch (err) { console.error("[Cron Error]", err.message); }
  cleanupR2Results().catch(() => {});
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend server listening at http://0.0.0.0:${PORT}`);
});
