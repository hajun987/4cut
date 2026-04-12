import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export const composeVideoOnClient = async (
  ffmpeg: FFmpeg,
  videoBlobs: Blob[],
  frameUrlOrColor: string,
  duration: number = 4,
  renderedFrameUrl?: string // [추가] 텍스트가 이미 포함된 사전 렌더링 프레임
): Promise<Uint8Array> => {
  if (!ffmpeg.loaded) return new Uint8Array();

  // 0. 입력값 정리 (인코딩 방지)
  const decodedFrame = decodeURIComponent(frameUrlOrColor).trim();
  console.log(`[FFmpeg] 입력 준비: 영상 ${videoBlobs.length}개, 프레임: ${decodedFrame}`);

  // 1. 기존 잔재 파일 삭제 (FS 오류 방지)
  const safeDelete = async (name: string) => {
    try { await ffmpeg.deleteFile(name); } catch {}
  };
  await safeDelete("v1.webm");
  await safeDelete("v2.webm");
  await safeDelete("v3.webm");
  await safeDelete("v4.webm");
  await safeDelete("frame.png");
  await safeDelete("output.mp4");

  // 2. 입력 파일들을 FFmpeg 가상 파일 시스템에 쓰기
  for (let i = 0; i < videoBlobs.length; i++) {
    const data = await fetchFile(videoBlobs[i]);
    console.log(`[FFmpeg] v${i+1}.webm 쓰기 (크기: ${data.length} bytes)`);
    if (data.length === 0) throw new Error(`비디오 데이터 ${i+1}번이 비어있습니다.`);
    await ffmpeg.writeFile(`v${i+1}.webm`, data);
  }

  const cropImgRatio = 465 / 691;
  const cropFilter = `hflip,crop='min(iw,ih*${cropImgRatio})':'min(ih,iw/${cropImgRatio})',scale=465:691,setsar=1`;
  let filterComplex = "";

  let hasFrame = false;
  
  // [수정] 사전 렌더링된 프레임(텍스트 포함)이 있으면 우선적으로 로드
  if (renderedFrameUrl) {
    try {
      console.log(`[FFmpeg] 사전 렌더링 프레임 로드: ${renderedFrameUrl.substring(0, 50)}...`);
      const frameData = await fetchFile(renderedFrameUrl);
      await ffmpeg.writeFile("frame.png", frameData);
      hasFrame = true;
    } catch (e) {
      console.warn("[FFmpeg] 사전 렌더링 프레임 로드 실패, 원본 로직 진행:", e);
    }
  }

  // [수정] 사전 렌더링 프레임이 없고 디자인 프레임(PNG)인 경우 원본 로드
  if (!hasFrame && !decodedFrame.startsWith("#")) {
    try {
      let frameData: Uint8Array;
      if (decodedFrame.startsWith("blob:") || decodedFrame.startsWith("data:")) {
        frameData = await fetchFile(decodedFrame);
      } else {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const proxyUrl = `${apiUrl}/api/proxy-image?url=${encodeURIComponent(decodedFrame)}`;
        frameData = await fetchFile(proxyUrl);
      }
      await ffmpeg.writeFile("frame.png", frameData);
      hasFrame = true;
    } catch (e) {
      console.warn("[FFmpeg] 디자인 프레임 로드 실패:", e);
    }
  }

  if (renderedFrameUrl && hasFrame) {
    // [1] 텍스트가 포함된 컬러 프레임: 프레임 파일 자체가 배경(Base)이 되어야 함
    filterComplex = `[4:v]scale=1080:1920,setsar=1 [base];`;
    filterComplex += `[0:v]${cropFilter} [v1];`;
    filterComplex += `[1:v]${cropFilter} [v2];`;
    filterComplex += `[2:v]${cropFilter} [v3];`;
    filterComplex += `[3:v]${cropFilter} [v4];`;
    filterComplex += `[base][v1]overlay=63:76[o1];`;
    filterComplex += `[o1][v2]overlay=550:76[o2];`;
    filterComplex += `[o2][v3]overlay=63:789[o3];`;
    filterComplex += `[o3][v4]overlay=550:789[out]`;
  } else if (decodedFrame.startsWith("#")) {
    // [2] 텍스트 없는 단순 컬레 프레임: 색상 필터를 배경으로 사용
    const hex = decodedFrame.replace("#", "0x");
    filterComplex = `color=c=${hex}:s=1080x1920:d=${duration} [bg];`;
    filterComplex += `[0:v]${cropFilter} [v1];`;
    filterComplex += `[1:v]${cropFilter} [v2];`;
    filterComplex += `[2:v]${cropFilter} [v3];`;
    filterComplex += `[3:v]${cropFilter} [v4];`;
    filterComplex += `[bg][v1]overlay=63:76[o1];`;
    filterComplex += `[o1][v2]overlay=550:76[o2];`;
    filterComplex += `[o2][v3]overlay=63:789[o3];`;
    filterComplex += `[o3][v4]overlay=550:789[out]`;
  } else {
    // [3] 디자인 프레임(PNG) 또는 기타: 흰색 배경에 영상을 올리고 그 위에 PNG를 오버레이
    filterComplex = `color=c=white:s=1080x1920:d=${duration} [base];`;
    filterComplex += `[0:v]${cropFilter} [v1];`;
    filterComplex += `[1:v]${cropFilter} [v2];`;
    filterComplex += `[2:v]${cropFilter} [v3];`;
    filterComplex += `[3:v]${cropFilter} [v4];`;
    filterComplex += `[base][v1]overlay=63:76[o1];`;
    filterComplex += `[o1][v2]overlay=550:76[o2];`;
    filterComplex += `[o2][v3]overlay=63:789[o3];`;
    filterComplex += `[o3][v4]overlay=550:789[o4];`;
    
    if (hasFrame) {
      filterComplex += `[o4][4:v]overlay=0:0[out]`;
    } else {
      filterComplex += `[o4]copy[out]`;
    }
  }

  const args = [
    "-fflags", "+genpts", // 누락된 타임스탬프 자동 생성
    "-i", "v1.webm",
    "-i", "v2.webm",
    "-i", "v3.webm",
    "-i", "v4.webm",
  ];

  if (hasFrame) {
    args.push("-i", "frame.png");
  }

  args.push(
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-t", duration.toString(),
    "-preset", "ultrafast",
    "-movflags", "+faststart", // 웹 재생 최적화 (moov atom을 앞으로)
    "-avoid_negative_ts", "make_zero",
    "-threads", "2",
    "-crf", "32",
    "output.mp4"
  );

  // 3. FFmpeg 명령어 실행
  console.log("[FFmpeg] 최종 명령어 인자:", args.join(" "));
  const result = await ffmpeg.exec(args);
  
  if (result !== 0) {
    throw new Error(`FFmpeg 실행 실패 (에러 코드: ${result}). 가상 파일 시스템 점검 필요.`);
  }

  // 4. 결과 파일 읽기
  try {
    const data = await ffmpeg.readFile("output.mp4");
    console.log(`[FFmpeg] 합성 완료! 최종 파일 크기: ${data.length} bytes`);
    return data as Uint8Array;
  } catch (e) {
    throw new Error("output.mp4 파일을 찾을 수 없습니다. (FS error)");
  }
};
