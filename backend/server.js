const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const PORT = process.env.PORT || 4000;
// 환경 변수가 없으면 요청마다 동적으로 감지합니다.
const BASE_URL = process.env.BACKEND_URL;

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
  frameUrl: null
};

// 디렉토리 세팅
const resultDir = path.join(__dirname, "uploads/results");
const externalFrameDir = path.join(__dirname, "external-frames");

if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
if (!fs.existsSync(externalFrameDir)) fs.mkdirSync(externalFrameDir, { recursive: true });
if (!fs.existsSync("uploads/frames")) fs.mkdirSync("uploads/frames", { recursive: true });

const resultStorage = multer.diskStorage({
  destination: "uploads/results/",
  filename: (req, file, cb) => cb(null, `result_${Date.now()}${path.extname(file.originalname)}`)
});
const frameStorage = multer.diskStorage({
  destination: "uploads/frames/",
  filename: (req, file, cb) => cb(null, `frame_${Date.now()}.png`)
});

const uploadResult = multer({ storage: resultStorage });
const uploadFrame = multer({ storage: frameStorage });

// 설정 라우터
app.get("/api/config", (req, res) => res.json(config));
app.post("/api/config", (req, res) => {
  if (req.body.intervalSeconds) config.intervalSeconds = req.body.intervalSeconds;
  if (req.body.maxShots) config.maxShots = req.body.maxShots;
  if (req.body.readySeconds) config.readySeconds = req.body.readySeconds;
  res.json(config);
});

// 결과 사진 저장 (QR 제공 목적)
app.post("/api/save-result", uploadResult.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  const host = req.get('host');
  const protocol = req.protocol === 'http' && host.includes('render.com') ? 'https' : req.protocol;
  const currentBase = BASE_URL || `${protocol}://${host}`;
  const fileUrl = `${currentBase}/uploads/results/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename });
});

// 강제 다운로드 엔드포인트 (Content-Disposition 헤더로 파일명 강제 지정)
app.get("/api/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads/results", filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
  
  const downloadName = req.query.name || filename;
  const encodedName = encodeURIComponent(downloadName);
  
  // RFC 5987 준수하는 filename* 파라미터 추가 (멀티바이트 및 특수문자 대응)
  res.setHeader("Content-Disposition", `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
  
  // 파일 확장자에 따라 MIME 타입 설정
  if (filename.endsWith('.mp4')) res.setHeader("Content-Type", "video/mp4");
  else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) res.setHeader("Content-Type", "image/jpeg");
  
  res.sendFile(filePath);
});

// 비디오 파일들 보관소
const videoStorage = multer.diskStorage({
  destination: "uploads/results/",
  filename: (req, file, cb) => cb(null, `vid_${Date.now()}_${Math.random().toString(36).substring(7)}.webm`)
});
const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 100 * 1024 * 1024 } });

// 라이브 멀티그리드 비디오 생성 API
app.post("/api/save-video", uploadVideo.array("videos", 4), (req, res) => {
  console.log("[Video] Received files:", req.files ? req.files.length : 0);
  if (!req.files || req.files.length !== 4) {
    console.error("[Video] Expected 4 files, got:", req.files ? req.files.length : 0);
    return res.status(400).json({ error: "4 videos required, got: " + (req.files ? req.files.length : 0) });
  }
  
  const frameStr = req.body.frame; // e.g., "#FF4785" or "http://localhost:4000/external-frames/..."
  const outFilename = `result_vid_${Date.now()}.mp4`;
  const outPath = path.join(__dirname, "uploads/results", outFilename);

  let command = ffmpeg();
  // 4개의 비디오 원격 파일 로드
  req.files.forEach(f => command.input(f.path));

  // 센터크롭 필터: 사진 영역을 1px씩 확장하여 틈새 방지 (463x689 -> 465x691)
  const cropFilter = 'hflip,scale=-2:691,crop=465:691,setsar=1';
  let filterComplex = '';

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
      .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '4', '-shortest'])
      .save(outPath)
      .on('start', (cmd) => console.log('[FFmpeg] cmd:', cmd))
      .on('end', () => { console.log('[FFmpeg] Done:', outFilename); res.json({ url: `${BASE_URL}/uploads/results/${outFilename}` }); })
      .on('error', (err) => { console.error('[FFmpeg] Error:', err.message); res.status(500).json({error: 'encoding failed: ' + err.message}); });
  } else {
    // 외부 PNG 프레임일 경우
    let framePath = "";
    if (frameStr && frameStr.includes("/external-frames/")) {
       const parts = frameStr.split("/external-frames/");
       framePath = path.join(externalFrameDir, decodeURIComponent(parts[1]));
    }
    
    // 바탕은 흰색, 영상을 배치한 뒤, 맨 위(5번째 인풋)에 PNG 올리기
    if (framePath && fs.existsSync(framePath)) {
       command.input(framePath).inputOptions('-loop 1'); // 0,1,2,3번은 영상, 4번이 PNG 프레임 (무한 루프 설정)
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
      .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '4', '-shortest'])
      .save(outPath)
      .on('start', (cmd) => console.log('[FFmpeg] cmd:', cmd))
      .on('end', () => { console.log('[FFmpeg] Done:', outFilename); res.json({ url: `${BASE_URL}/uploads/results/${outFilename}` }); })
      .on('error', (err) => { console.error('[FFmpeg] Error:', err.message); res.status(500).json({error: 'encoding failed: ' + err.message}); });
  }
});

// 외부 폴더 (external-frames) 정적 서빙 및 목록 조회
app.use("/external-frames", express.static(externalFrameDir));

app.get("/api/frames-list", (req, res) => {
  if (!fs.existsSync(externalFrameDir)) return res.json([]);
  const files = fs.readdirSync(externalFrameDir).filter(f => f.toLowerCase().endsWith(".png") || f.toLowerCase().endsWith(".jpg"));
  const host = req.get('host');
  const protocol = req.protocol === 'http' && host.includes('render.com') ? 'https' : req.protocol;
  const currentBase = BASE_URL || `${protocol}://${host}`;
  const urls = files.map(f => `${currentBase}/external-frames/${encodeURIComponent(f)}`);
  res.json(urls);
});

const frameStorageExternal = multer.diskStorage({
  destination: externalFrameDir,
  filename: (req, file, cb) => cb(null, Buffer.from(file.originalname, 'latin1').toString('utf8'))
});
const uploadFrameExternal = multer({ storage: frameStorageExternal });

app.post("/api/frame-external", uploadFrameExternal.single("frame"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const host = req.get('host');
  const protocol = req.protocol === 'http' && host.includes('render.com') ? 'https' : req.protocol;
  const currentBase = BASE_URL || `${protocol}://${host}`;
  res.json({ url: `${currentBase}/external-frames/${encodeURIComponent(req.file.filename)}` });
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
cron.schedule("0 * * * *", () => {
  console.log("[Cron] 24시간 이상 지난 결과 사진을 스캔하여 삭제합니다.");
  const resultsDir = path.join(__dirname, "uploads/results");
  if (!fs.existsSync(resultsDir)) return;
  
  const files = fs.readdirSync(resultsDir);
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  
  let deletedCount = 0;
  files.forEach((file) => {
    const filePath = path.join(resultsDir, file);
    const stats = fs.statSync(filePath);
    
    if (now - stats.mtimeMs > ONE_DAY_MS) {
      fs.unlinkSync(filePath);
      deletedCount++;
    }
  });
  console.log(`[Cron] 처리 완료. 삭제된 파일 수: ${deletedCount}`);
});

app.listen(PORT, () => {
  console.log(`Backend server listening at http://localhost:${PORT}`);
});
