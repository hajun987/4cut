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
    <div className="min-h-screen bg-zinc-950 p-4 lg:p-12 flex items-center justify-center overflow-x-hidden">
      <div className="max-w-6xl w-full mx-auto flex flex-col lg:flex-row gap-8 lg:gap-20 items-center justify-center">
        
        {/* Result Preview */}
        {imagePreview && (
          <div className="flex-[2] lg:flex-1 flex justify-center w-full min-h-[50dvh] lg:h-screen items-center">
            <img 
              crossOrigin={imagePreview.startsWith("data:") ? undefined : "anonymous"}
              src={imagePreview} 
              alt="Final Preview" 
              className="w-full max-w-[320px] lg:max-w-md rounded-xl shadow-[0_20px_80px_rgba(255,71,133,0.3)] object-contain border-4 border-white/5 transition-all hover:scale-[1.02]"
            />
          </div>
        )}

        {/* QR and Buttons */}
        <div className="flex-1 lg:flex-1 flex flex-col items-center text-center w-full border-t lg:border-t-0 border-white/10 pt-8 lg:pt-0">
          <h2 className="text-2xl lg:text-4xl font-black text-white mb-6 lg:mb-10 leading-tight tracking-tight">
            네컷사진 완성!<br className="hidden lg:block" />
            <span className="text-primary italic">스마트폰으로 받기</span>
          </h2>
          
          <div className="p-3 lg:p-4 border-[6px] border-primary rounded-2xl bg-white inline-block mb-6 lg:mb-8 shadow-[0_0_30px_rgba(255,71,133,0.3)]">
            <QRCodeSVG value={url} size={180} className="lg:w-[240px] lg:h-[240px]" level="H" includeMargin={false} />
          </div>
          
          <p className="text-zinc-500 mb-8 lg:mb-12 text-sm lg:text-lg font-medium break-keep px-4">
            위 QR 코드를 스캔하여 <br className="lg:hidden" /> 원본 사진을 다운로드하세요.<br/>
            <span className="text-[10px] lg:text-xs opacity-50 mt-1 block">(서버에서 24시간 후 자동 삭제됩니다)</span>
          </p>

          {/* Download Buttons */}
          <div className="flex flex-col gap-3 w-full max-w-xs lg:max-w-sm mb-8 px-4">
            {imageId && (
              <button 
                onClick={() => handleDownload(imageId)}
                className="px-8 py-4 bg-primary text-white text-base lg:text-lg rounded-full font-black hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_rgba(255,71,133,0.3)]"
              >
                📸 사진 다운로드 (기기 저장)
              </button>
            )}
            {videoId && (
              <button 
                onClick={() => handleDownload(videoId)}
                className="px-8 py-4 bg-zinc-800 text-white text-base lg:text-lg rounded-full font-black hover:scale-105 active:scale-95 transition-all shadow-lg"
              >
                🎞️ 영상 다운로드 (기기 저장)
              </button>
            )}
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="px-10 py-5 bg-white/10 text-white/50 text-sm lg:text-xl rounded-full font-bold hover:bg-white/20 transition-colors w-full max-w-[200px] lg:max-w-sm"
          >
            처음부터 다시 촬영하기
          </button>
        </div>
      </div>
    </div>
  );
}
