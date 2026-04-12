import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export const composeVideoOnClient = async (
  ffmpeg: FFmpeg,
  videoBlobs: Blob[],
  frameUrlOrColor: string
): Promise<Uint8Array> => {
  if (!ffmpeg.loaded) return new Uint8Array();

  // 1. 입력 파일들을 FFmpeg 가상 파일 시스템에 쓰기
  for (let i = 0; i < videoBlobs.length; i++) {
    await ffmpeg.writeFile(`v${i+1}.webm`, await fetchFile(videoBlobs[i]));
  }

  const cropImgRatio = 465 / 691;
  const cropFilter = `hflip,crop=min(iw\\,ih*${cropImgRatio}):min(ih\\,iw/${cropImgRatio}),scale=465:691,setsar=1`;
  let filterComplex = "";

  if (frameUrlOrColor.startsWith("#")) {
    const hex = frameUrlOrColor.replace("#", "0x");
    filterComplex = `color=c=${hex}:s=1080x1920:d=4 [bg];`;
    filterComplex += `[0:v]${cropFilter} [v1];`;
    filterComplex += `[1:v]${cropFilter} [v2];`;
    filterComplex += `[2:v]${cropFilter} [v3];`;
    filterComplex += `[3:v]${cropFilter} [v4];`;
    filterComplex += `[bg][v1]overlay=63:76:shortest=1[o1];`;
    filterComplex += `[o1][v2]overlay=550:76:shortest=1[o2];`;
    filterComplex += `[o2][v3]overlay=63:789:shortest=1[o3];`;
    filterComplex += `[o3][v4]overlay=550:789:shortest=1[out]`;
    // 이미지 프레임일 때 - R2 CORS 이슈 방지를 위해 프록시 주소 활용
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const proxyUrl = `${apiUrl}/api/proxy-image?url=${encodeURIComponent(frameUrlOrColor)}`;
    await ffmpeg.writeFile("frame.png", await fetchFile(proxyUrl));
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
  }

  const args = [
    "-i", "v1.webm",
    "-i", "v2.webm",
    "-i", "v3.webm",
    "-i", "v4.webm",
  ];

  if (!frameUrlOrColor.startsWith("#")) {
    args.push("-i", "frame.png");
  }

  args.push(
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-t", "4",
    "-preset", "ultrafast",
    "-threads", "4",
    "-crf", "28",
    "output.mp4"
  );

  // 2. FFmpeg 명령어 실행
  await ffmpeg.exec(args);

  // 3. 결과 파일 읽기
  const data = await ffmpeg.readFile("output.mp4");
  return data as Uint8Array;
};
