"use client";

import { useState, useRef } from "react";

interface CanvasRendererProps {
  selectedSlots: string[];
  selectedFrame: string;
  shotImages: string[];
  shotVideos: Blob[];
  onUploaded: (serverResultUrl: string, finalImageId: string, videoUrl?: string) => void;
}

export default function CanvasRenderer({ selectedSlots, selectedFrame, shotImages, shotVideos, onUploaded }: CanvasRendererProps) {
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

  const handleComplete = async () => {
    setIsProcessing(true);
    setLoadingText("서버에서 사진을 합성 중입니다...");

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
          try {
            const img = await loadImage(selectedSlots[i]);
            ctx.drawImage(img, coordinates[i].x, coordinates[i].y, coordinates[i].w, coordinates[i].h);
          } catch {
            console.error("Image load fail");
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
        // 3. 외부 디자인 프레임(PNG) - CORS 방지를 위해 백엔드 프록시 사용
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
          const proxyUrl = `${apiUrl}/api/proxy-image?url=${encodeURIComponent(selectedFrame)}`;
          const frameImg = await loadImage(proxyUrl);
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

      setLoadingText("4분할 액자 동영상을 렌더링 중입니다 (최대 10초 소요)...");
      let uploadedVideoUrl = "";
      let uploadedVideoId = "";
      
      try {
         const videoFormData = new FormData();
         videoFormData.append("frame", selectedFrame);
         
         // 선택된 슬롯 → 원본 인덱스 → 해당 비디오 매핑
         let videoCount = 0;
         selectedSlots.forEach((slotDataUrl, i) => {
            const index = shotImages.indexOf(slotDataUrl);
            console.log(`[Video] Slot ${i}: shotImages index=${index}, hasVideo=${!!(index !== -1 && shotVideos[index])}, totalVideos=${shotVideos.length}`);
            if (index !== -1 && shotVideos[index]) {
               videoFormData.append("videos", shotVideos[index], `slot_${i}.webm`);
               videoCount++;
            }
         });

         console.log(`[Video] Total videos to upload: ${videoCount}`);
         
         if (videoCount !== 4) {
            console.warn(`[Video] 비디오 ${videoCount}개만 수집됨. 4개 필요. 영상 생성 건너뜀.`);
         } else {
           const videoRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/save-video`, {
              method: "POST",
              body: videoFormData
           });
           
            if (videoRes.ok) {
              const vData = await videoRes.json();
              uploadedVideoUrl = vData.url;
              const parts = uploadedVideoUrl.split("/");
              uploadedVideoId = parts[parts.length - 1];
            } else {
              const errBody = await videoRes.text();
              console.error("[Video] Server error:", videoRes.status, errBody);
            }
          }
        } catch (e) {
          console.error("비디오 렌더링 실패:", e);
        }
 
       setLoadingText("완료되었습니다!");
 
       // 자동 다운로드 - 아이폰에서도 재생이 아닌 '파일 저장'이 되도록 서버 API를 사용합니다.
       const triggerDownload = (fileName: string) => {
         const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
         const saveName = fileName.startsWith("result_") ? "4cut_photo.jpg" : "4cut_video.mp4";
         const downloadUrl = `${apiUrl}/api/download/${fileName}?name=${encodeURIComponent(saveName)}`;
         
         const a = document.createElement("a");
         a.href = downloadUrl;
         a.target = "_blank"; // 새 창을 열면서 동시에 다운로드 헤더로 인해 저장 팝업 유도
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
       };
 
       try {
         if (finalImageId) {
           triggerDownload(finalImageId);
         }
         if (uploadedVideoId) {
           setTimeout(() => {
             triggerDownload(uploadedVideoId);
           }, 1500);
         }
       } catch { console.warn("자동 다운로드 처리 중 오류 발생"); }

      setTimeout(() => {
        onUploaded(finalImageUrl, finalImageId, uploadedVideoId);
      }, 2000);

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

      <button
        onClick={handleComplete}
        disabled={isProcessing}
        className={`px-10 py-5 text-2xl w-full max-w-md font-black rounded-full shadow-lg transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed ${isProcessing ? 'bg-zinc-200 text-zinc-500' : 'bg-primary text-white hover:bg-primary-hover shadow-primary/40'}`}
      >
        {isProcessing ? "최종본 저장 중..." : "합성완료 및 출력하기"}
      </button>
    </>
  );
}
