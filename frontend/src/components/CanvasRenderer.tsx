"use client";

import { useState, useRef } from "react";

interface CanvasRendererProps {
  selectedSlots: (string | null)[];
  selectedIndices: (number | null)[];
  selectedFrame: string;
  shotImages: string[];
  shotVideos: (Blob | null)[];
  onUploaded: (serverResultUrl: string, finalImageId: string, videoId?: string, localPreviewUrl?: string) => void;
  videoDuration?: number;
}

export default function CanvasRenderer({ selectedSlots, selectedIndices, selectedFrame, shotImages, shotVideos, onUploaded, videoDuration = 4 }: CanvasRendererProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!src.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image Load Frame Error: " + src));
      img.src = src;
    });
  };

  const handleComplete = async (mode: 'photo' | 'video' = 'video') => {
    setIsProcessing(true);
    setLoadingText(mode === 'photo' ? "사진 전용 결과물을 저장 중입니다..." : "서버에서 사진과 영상을 합성 중입니다...");

    try {
      // useRef로 인해 HTML에 canvas가 없으면 실행 자체가 안 되고 튕기던 현상 해결
      // 메모리 상에 즉시 캔버스를 생성하여 안전하게 렌더링
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스 객체 생성 실패");
      
      // 사진의 렌더링 베이스 (흰색 배경 고정)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 1080, 1920);

      const coordinates = [
        { x: 63, y: 76, w: 467, h: 693 },
        { x: 550, y: 76, w: 467, h: 693 },
        { x: 63, y: 789, w: 467, h: 693 },
        { x: 550, y: 789, w: 467, h: 693 },
      ];

      // 1. 사진 4장을 그림
      for (let i = 0; i < 4; i++) {
          const slot = selectedSlots[i];
          if (slot) {
            try {
              const img = await loadImage(slot);
              ctx.drawImage(img, coordinates[i].x, coordinates[i].y, coordinates[i].w, coordinates[i].h);
            } catch {
              console.error("Image load fail");
            }
          }
      }

      // 2. 단색 컬러일 경우 사진 구멍만 빼고 마스크 오버레이 덮기
      if (selectedFrame.startsWith("#")) {
        ctx.fillStyle = selectedFrame;
        ctx.beginPath();
        ctx.rect(0, 0, 1080, 1920);
        ctx.rect(64, 77, 465, 691);
        ctx.rect(551, 77, 465, 691);
        ctx.rect(64, 790, 465, 691);
        ctx.rect(551, 790, 465, 691);
        ctx.fill('evenodd');
      } else {
        // 3. 외부 디자인 프레임(PNG) - 로컬(blob)은 직접 로드, 원격은 프록시 사용
        try {
          let frameUrl = selectedFrame;
          if (!selectedFrame.startsWith("blob:") && !selectedFrame.startsWith("data:") && !selectedFrame.includes("/api/proxy-image")) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
            frameUrl = `${apiUrl}/api/proxy-image?url=${encodeURIComponent(selectedFrame)}`;
          }
          const frameImg = await loadImage(frameUrl);
          ctx.drawImage(frameImg, 0, 0, 1080, 1920);
        } catch (e) {
          console.warn("오버레이 프레임 렌더링 실패.", e);
        }
      }

      const finalDataUrl = canvas.toDataURL("image/jpeg", 0.95);

      // Blob 변환 유틸리티
      const dataURLtoBlob = (dataurl: string) => {
        const arr = dataurl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){ u8arr[n] = bstr.charCodeAt(n); }
        return new Blob([u8arr], {type:mime});
      };

      // 로컬 다운로드 - 서버 다운로드 API 사용 (파일명 보장)
      // 사진은 서버에 업로드 후 다운로드 (아래에서 처리)

      const blob = dataURLtoBlob(finalDataUrl);
      const formData = new FormData();
      formData.append("image", blob, "photo.jpg");

      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/save-result`, {
        method: "POST",
        body: formData,
      });

      let finalImageUrl = "";
      let finalImageId = "";

      if (uploadRes.ok) {
        const data = await uploadRes.json();
        finalImageUrl = data.url;
        finalImageId = data.filename;
      } else {
        alert("통신 오류가 발생했습니다.");
      }

      let uploadedVideoUrl = "";
      let uploadedVideoId = "";
      
      if (mode === 'video') {
        setLoadingText("브라우저에서 영상을 직접 합성 중입니다 (쾌속 모드) 🚀");
        try {
          // 1. 선택된 인덱스를 활용하여 비디오 조각들 수집 (정확도 100%)
          const videoBlobs: Blob[] = [];
          selectedIndices.forEach((shotIdx) => {
            if (shotIdx !== null && shotVideos[shotIdx]) {
              videoBlobs.push(shotVideos[shotIdx]);
            }
          });

          if (videoBlobs.length !== 4) {
             console.warn(`[Video] 비디오 조각이 ${videoBlobs.length}개만 확보되었습니다 (4개 필요). 영상 합성을 건너뜁니다.`);
             setLoadingText("일부 영상 조각이 누락되어 타임랩스 생성을 건너뜁니다...");
             await new Promise(res => setTimeout(res, 2000));
          } else {
            // 2. 브라우저 엔진(FFmpeg) 인스턴스 확보 및 실행
            const { composeVideoOnClient } = await import("@/hooks/useFfmpeg");
            const ffmpeg = (window as any).FFmpegInstance;
            
            if (!ffmpeg) throw new Error("FFmpeg 엔진이 로드되지 않았습니다.");
            
            const mp4Data = await composeVideoOnClient(ffmpeg, videoBlobs, selectedFrame, videoDuration);
            const mp4Blob = new Blob([mp4Data as any], { type: 'video/mp4' });

            // 3. 서버에는 이제 완성된 MP4 하나만 전송
            const videoFormData = new FormData();
            videoFormData.append("video", mp4Blob, `${Date.now()}.mp4`);
            
            const videoRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/save-video`, {
              method: "POST",
              body: videoFormData
            });
            
            if (videoRes.ok) {
              const vData = await videoRes.json();
              uploadedVideoUrl = vData.url;
              uploadedVideoId = vData.filename;
            } else {
              console.error("[Video] Server upload error");
            }
          }
        } catch (e) {
          console.error("브라우저 비디오 렌더링 실패:", e);
          // 비디오가 실패해도 이미지는 살려두기 위해 여기서 중단만 함
          setLoadingText("앗! 영상 합성 중 오류가 발생하여 이미지만 생성합니다.");
          await new Promise(res => setTimeout(res, 2000));
        }
      }
       setLoadingText("완료되었습니다!");
 
       // 자동 다운로드 - 아이폰에서도 재생이 아닌 '파일 저장'이 되도록 서버 API를 사용합니다.
       const triggerDownload = (fileName: string) => {
         const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
         const isVideo = fileName.toLowerCase().endsWith(".mp4");
         const saveName = isVideo ? "4cut_video.mp4" : "4cut_photo.jpg";
         const downloadUrl = `${apiUrl}/api/download/${fileName}?name=${encodeURIComponent(saveName)}`;
         
         const a = document.createElement("a");
         a.href = downloadUrl;
         a.target = "_blank"; // 새 창을 열면서 동시에 다운로드 헤더로 인해 저장 팝업 유도
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
       };
 
       /* 수동 다운로드로 변경을 위해 자동 다운로드 주석 처리
       try {
         if (finalImageId) {
           triggerDownload(finalImageId);
         }
          if (mode === "video" && uploadedVideoId) {
           setTimeout(() => {
             triggerDownload(uploadedVideoId);
           }, 1500);
         }
       } catch { console.warn("자동 다운로드 처리 중 오류 발생"); }
       */

      setTimeout(() => {
        // finalDataUrl(로컬 베이스64)을 4번째 인자로 전달하여 즉시 미리보기 구현
        onUploaded(finalImageUrl, finalImageId, uploadedVideoId, finalDataUrl);
      }, 1500);

    } catch (error: any) {
      console.error("합성 치명적 오류:", error);
      alert("이미지 처리 중 문제가 발생했습니다: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {isProcessing && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center text-white pb-20 fade-in">
          <div className="w-24 h-24 border-8 border-primary border-t-transparent rounded-full animate-spin mb-8"></div>
          <h2 className="text-3xl font-black mb-4 tracking-tight">네컷 사진이 만들어지고 있어요 📸</h2>
          <p className="text-xl text-zinc-300 font-bold mb-8">잠시만 기다려주세요...</p>
          <div className="w-1/2 max-w-md bg-zinc-800 rounded-full h-4 overflow-hidden mb-4 shadow-inner">
             <div className="bg-primary h-full rounded-full animate-[progress_10s_ease-out_forwards]" style={{width: '90%', animationDuration: '8s'}}></div>
          </div>
          <p className="text-sm font-bold text-zinc-400 animate-pulse">{loadingText}</p>
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
