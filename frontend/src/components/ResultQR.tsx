"use client";

import { QRCodeSVG } from "qrcode.react";

interface ResultQRProps {
  url: string;
  imagePreview?: string;
  imageId?: string;
  videoId?: string;
}

export default function ResultQR({ url, imagePreview, imageId, videoId }: ResultQRProps) {
  if (!url) return null;

  // 수동 다운로드 실행 함수
  const handleDownload = (fileName: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const isVideo = fileName.toLowerCase().endsWith(".mp4");
    const saveName = isVideo ? "4cut_video.mp4" : "4cut_photo.jpg";
    const downloadUrl = `${apiUrl}/api/download/${fileName}?name=${encodeURIComponent(saveName)}`;
    
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 p-6 md:p-12">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-10 items-start">
        
        {/* 완성된 사진 프리뷰 */}
        {imagePreview && (
          <div className="flex-1 flex justify-center">
            <img 
              src={imagePreview} 
              alt="Final Preview" 
              className="w-full max-w-md rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.4)] object-contain"
            />
          </div>
        )}

        {/* QR 코드 및 버튼 영역 */}
        <div className="flex-1 flex flex-col items-center text-center">
          <h2 className="text-3xl font-extrabold text-white mb-8 leading-tight">
            네컷사진 완성!<br />
            스마트폰으로 사진 받기
          </h2>
          
          <div className="p-4 border-4 border-primary rounded-xl bg-white inline-block mb-8">
            <QRCodeSVG value={url} size={240} level="H" includeMargin={false} />
          </div>
          
          <p className="text-zinc-400 mb-10 text-lg font-medium break-keep">
            위 QR 코드를 카메라로 스캔하면<br />원본 고화질 사진을 다운로드할 수 있습니다.<br/><span className="text-sm font-normal text-zinc-500">(서버에서 24시간 후 자동 삭제됩니다)</span>
          </p>

          {/* 다운로드 버튼 영역 */}
          <div className="flex flex-col gap-3 w-full max-w-sm mb-6">
            {imageId && (
              <button 
                onClick={() => handleDownload(imageId)}
                className="px-8 py-4 bg-primary text-white text-lg rounded-full font-black hover:scale-105 active:scale-95 transition-all shadow-lg"
              >
                📸 사진 다운로드 (기기에 저장)
              </button>
            )}
            {videoId && (
              <button 
                onClick={() => handleDownload(videoId)}
                className="px-8 py-4 bg-zinc-800 text-white text-lg rounded-full font-black hover:scale-105 active:scale-95 transition-all shadow-lg"
              >
                🎞️ 영상 다운로드 (기기에 저장)
              </button>
            )}
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="px-10 py-5 bg-white text-black text-xl rounded-full font-bold hover:bg-zinc-200 transition-colors w-full max-w-sm shadow-lg opacity-80"
          >
            처음부터 다시 촬영하기
          </button>
        </div>
      </div>
    </div>
  );
}
