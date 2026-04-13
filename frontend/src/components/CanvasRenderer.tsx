"use client";

import { useState, useRef } from "react";

interface CanvasRendererProps {
  selectedSlots: (string | null)[];
  selectedIndices: (number | null)[];
  selectedFrame: string;
  shotImages: string[];
  shotVideos: (Blob | null)[];
  onUploaded: (serverResultUrl: string, finalImageId: string, videoId?: string, localPreviewUrl?: string, localVideoUrl?: string) => void;
  videoDuration?: number;
  frameText?: string;
  frameFont?: string;
  frameFontSize?: number;
  frameTextColor?: string;
}

export default function CanvasRenderer({ 
  selectedSlots, selectedIndices, selectedFrame, shotImages, shotVideos, onUploaded, 
  videoDuration = 4, frameText, frameFont, frameFontSize = 60, frameTextColor = "#000000" 
}: CanvasRendererProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState("");

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!src.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("이미지 로드 실패: " + src));
      img.src = src;
    });
  };

  const handleComplete = async (mode: 'photo' | 'video' = 'video') => {
    setIsProcessing(true);
    setLoadingText(mode === 'photo' ? "사진 전용 결과물을 저장 중입니다..." : "서버에서 사진과 영상을 합성 중입니다...");

    try {
      // 폰트가 완전히 로드될 때까지 대기
      await document.fonts.ready;

      // 1. 사전 렌더링: 컬러 프레임일 경우 텍스트 포함 프레임 생성 (JPG/FFmpeg 공용)
      let renderedFrameDataUrl = "";
      if (selectedFrame.startsWith("#")) {
        const textCanvas = document.createElement("canvas");
        textCanvas.width = 1080;
        textCanvas.height = 1920;
        const tCtx = textCanvas.getContext("2d");
        if (tCtx) {
          // 사진이 들어갈 자리를 비워두고 배경색 채우기 (Even-Odd Fill)
          const coordinates = [
            { x: 63, y: 76, w: 467, h: 693 },
            { x: 550, y: 76, w: 467, h: 693 },
            { x: 63, y: 789, w: 467, h: 693 },
            { x: 550, y: 789, w: 467, h: 693 },
          ];

          tCtx.fillStyle = selectedFrame;
          tCtx.beginPath();
          tCtx.rect(0, 0, 1080, 1920); // 전체 배경
          coordinates.forEach(c => {
            tCtx.rect(c.x, c.y, c.w, c.h); // 사진 구멍
          });
          tCtx.fill('evenodd');
          
          try {
            if (frameText && frameFont) {
              // 폰트가 실제로 가용할 때까지 로드 대기
              await document.fonts.load(`bold ${frameFontSize * 1.5}px ${frameFont}`);
              await document.fonts.ready;
            }
          } catch (e) {
            console.warn("폰트 로드 실패:", e);
          }

          if (frameText) {
            const lines = frameText.split("\n");
            const fontSizePx = frameFontSize * 1.5;
            const lineHeight = fontSizePx * 1.2;
            const totalHeight = lineHeight * lines.length;
            
            tCtx.font = `bold ${fontSizePx}px ${frameFont}, sans-serif`;
            tCtx.fillStyle = frameTextColor;
            tCtx.textAlign = "center";
            tCtx.textBaseline = "middle";
            
            const startY = 1700 - (totalHeight / 2) + (lineHeight / 2);
            lines.forEach((line, i) => {
              tCtx.fillText(line, 540, startY + (lineHeight * i));
            });
          }
          
          renderedFrameDataUrl = textCanvas.toDataURL("image/png");
        }
      }

      // 2. 메인 사진 합성 (JPG용)
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스 생성 실패");
      
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 1080, 1920);

      const coordinates = [
        { x: 63, y: 76, w: 467, h: 693 },
        { x: 550, y: 76, w: 467, h: 693 },
        { x: 63, y: 789, w: 467, h: 693 },
        { x: 550, y: 789, w: 467, h: 693 },
      ];

      for (let i = 0; i < 4; i++) {
        const slot = selectedSlots[i];
        if (slot) {
          try {
            const img = await loadImage(slot);
            ctx.drawImage(img, coordinates[i].x, coordinates[i].y, coordinates[i].w, coordinates[i].h);
          } catch {
            console.error("사진 로드 실패:", i);
          }
        }
      }

      if (selectedFrame.startsWith("#")) {
        // [수정] 위에서 구멍을 뚫어 생성한 renderedFrameDataUrl을 사진 위에 겹침
        try {
          if (renderedFrameDataUrl) {
            const frameImg = await loadImage(renderedFrameDataUrl);
            ctx.drawImage(frameImg, 0, 0, 1080, 1920);
          }
        } catch (e) {
          console.warn("컬러 프레임 합성 실패 (fallback 사용):", e);
          ctx.fillStyle = selectedFrame;
          ctx.beginPath();
          ctx.rect(0, 0, 1080, 1920);
          coordinates.forEach(c => ctx.rect(c.x, c.y, c.w, c.h));
          ctx.fill('evenodd');
        }
      } else {
        try {
          let frameUrl = selectedFrame;
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
          if (!selectedFrame.startsWith("blob:") && !selectedFrame.startsWith("data:") && !selectedFrame.includes("/api/proxy-image")) {
            frameUrl = `${apiUrl}/api/proxy-image?url=${encodeURIComponent(selectedFrame)}`;
          }
          const frameImg = await loadImage(frameUrl);
          ctx.drawImage(frameImg, 0, 0, 1080, 1920);
        } catch (e) {
          console.warn("디자인 프레임 로드 실패:", e);
        }
      }

      const finalDataUrl = canvas.toDataURL("image/jpeg", 0.95);

      // 사진 서버 전송
      const dataURLtoBlob = (dataurl: string) => {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){ u8arr[n] = bstr.charCodeAt(n); }
        return new Blob([u8arr], {type:mime});
      };

      const photoBlob = dataURLtoBlob(finalDataUrl);
      const photoFormData = new FormData();
      photoFormData.append("image", photoBlob, "photo.jpg");

      const photoUploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/save-result`, {
        method: "POST",
        body: photoFormData,
      });

      let finalImageUrl = "";
      let finalImageId = "";
      let sharedFolderId = ""; // Gofile 폴더 ID 저장용
      if (photoUploadRes.ok) {
        const pData = await photoUploadRes.json();
        finalImageUrl = pData.url;
        finalImageId = pData.filename;
        sharedFolderId = pData.folderId; // Gofile 폴더 ID
      } else {
        throw new Error("사진 서버 저장 실패");
      }

      let localVidUrl = "";
      let uploadedVideoId = "";
      if (mode === 'video') {
        setLoadingText("브라우저에서 영상을 직접 합성 중입니다 🚀");
        try {
          const videoBlobs: Blob[] = [];
          selectedIndices.forEach((shotIdx) => {
            if (shotIdx !== null && shotVideos[shotIdx]) videoBlobs.push(shotVideos[shotIdx]);
          });

          if (videoBlobs.length === 4) {
            const { composeVideoOnClient } = await import("@/hooks/useFfmpeg");
            const ffmpeg = (window as any).FFmpegInstance;
            if (ffmpeg) {
              const mp4Data = await composeVideoOnClient(ffmpeg, videoBlobs, selectedFrame, videoDuration, renderedFrameDataUrl);
              const mp4Blob = new Blob([mp4Data as any], { type: 'video/mp4' });
              localVidUrl = URL.createObjectURL(mp4Blob);

              const videoFormData = new FormData();
              videoFormData.append("video", mp4Blob, `${Date.now()}.mp4`);
              if (sharedFolderId) {
                videoFormData.append("folderId", sharedFolderId); // Gofile 폴더에 묶기
              }
              
              const videoRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/save-video`, {
                method: "POST",
                body: videoFormData
              });
              if (videoRes.ok) {
                const vData = await videoRes.json();
                uploadedVideoId = vData.filename;
              }
            }
          }
        } catch (e) {
          console.error("비디오 합성 실패:", e);
        }
      }

      setLoadingText("완료되었습니다!");
      setTimeout(() => {
        onUploaded(finalImageUrl, finalImageId, uploadedVideoId, finalDataUrl, localVidUrl);
      }, 1500);

    } catch (error: any) {
      console.error("합성 중 치명적 오류:", error);
      alert("처리 중 문제가 발생했습니다: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {isProcessing && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center text-white pb-20 fade-in backdrop-blur-sm">
          <div className="relative mb-12">
            <div className="w-20 h-20 border-4 border-white/20 rounded-full"></div>
            <div className="absolute top-0 left-0 w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-3xl lg:text-4xl font-black mb-4 tracking-tighter">네컷 사진이 만들어지는 중 ✨</h2>
          <p className="text-lg lg:text-xl text-zinc-400 font-bold mb-10">오늘의 추억을 예쁘게 담고 있어요.</p>
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-black text-primary animate-pulse uppercase tracking-widest">{loadingText}</p>
            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
               <div className="h-full bg-primary animate-progress-loading"></div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-md px-4 lg:px-6">
        <button
          onClick={() => handleComplete('video')}
          disabled={isProcessing}
          className="px-8 py-4 lg:py-6 text-xl lg:text-2xl font-black rounded-full bg-primary text-white shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {isProcessing ? "작업 중..." : "✨ 네컷사진 받기"}
        </button>
      </div>
    </>
  );
}
