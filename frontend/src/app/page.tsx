"use client";

import { useState, useEffect } from "react";
import WebcamCapture from "@/components/WebcamCapture";
import PhotoSelector from "@/components/PhotoSelector";
import CanvasRenderer from "@/components/CanvasRenderer";
import ResultQR from "@/components/ResultQR";

export default function Home() {
  const [step, setStep] = useState<"HOME" | "SHOOTING" | "SELECTION" | "FRAME_SELECTION" | "RESULT">("HOME");
  
  const [shots, setShots] = useState<string[]>([]);
  const [shotVideos, setShotVideos] = useState<Blob[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<(string | null)[]>([null, null, null, null]);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const [selectedFrame, setSelectedFrame] = useState<string>("#FFFFFF");
  const [finalQrUrl, setFinalQrUrl] = useState<string | null>(null);
  const [finalImageId, setFinalImageId] = useState<string | null>(null);
  const [finalVideoId, setFinalVideoId] = useState<string | null>(null);
  const [externalFrames, setExternalFrames] = useState<string[]>([]);
  const [secretCode, setSecretCode] = useState<string | null>(null);
  const [secretFrameMap, setSecretFrameMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"COLOR" | "DESIGN">("COLOR");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) setSecretCode(code);

    async function loadInitialData() {
      try {
        console.log("[Debug] API 호출 시작:", apiUrl);
        const configRes = await fetch(`${apiUrl}/api/config`);
        const configData = await configRes.json();
        console.log("[Debug] 전체 설정 데이터:", configData);
        
        const secretMap = configData.secretFrames || {};
        setSecretFrameMap(secretMap);

        // 파일명으로 매칭하는 헬퍼 함수
        const getFilename = (url: string) => url.split('/').pop() || "";

        if (code && secretMap[code]) {
          console.log("[Debug] 비밀 코드 감지:", code);
          setSelectedFrame(secretMap[code].trim());
        }

        const framesRes = await fetch(`${apiUrl}/api/frames-list`);
        const allFrames = await framesRes.json();
        
        if (Array.isArray(allFrames)) {
          // 파일명 리스트로 만들어서 더 강력하게 필터링 (도메인이 달라도 파일명이 같으면 필터링)
          const secretFilenames = Object.values(secretMap).map((url: any) => getFilename(url.trim()));
          console.log("[Debug] 비밀 프레임 파일명들:", secretFilenames);

          const filtered = allFrames.filter(url => !secretFilenames.includes(getFilename(url.trim())));
          console.log("[Debug] 필터링된 프레임 목록:", filtered);
          setExternalFrames(filtered);
        }
      } catch (err) {
        console.error("[Debug] 데이터 로드 중 치명적 오류:", err);
      }
    }

    loadInitialData();
  }, []);

  if (step === "HOME") {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col items-center justify-center bg-white text-zinc-900 border-t-8 border-primary relative">
        <div className="absolute inset-0 bg-primary/5 pattern-dots pointer-events-none" />
        <div className="z-10 bg-white p-16 rounded-[3rem] shadow-[0_20px_60px_rgba(255,71,133,0.15)] flex flex-col items-center text-center border-2 border-primary/10">
          <h1 className="text-5xl font-black mb-8 leading-tight tracking-tighter">
            나만의 <span className="text-primary">네컷 사진</span>을<br/>직접 만들어볼까요?
          </h1>
          <p className="text-zinc-500 font-medium mb-12 text-xl">가장 빛나는 오늘의 모습을 남겨보세요 ✨</p>
          
          <button 
            onClick={() => setStep("SHOOTING")}
            className="px-16 py-6 bg-primary text-white text-3xl font-black rounded-full shadow-[0_15px_30px_rgba(255,71,133,0.4)] transition-transform hover:scale-110 active:scale-95"
          >
            시작하기
          </button>
        </div>
        <a href="/admin" className="absolute bottom-6 right-8 text-[8px] font-semibold text-zinc-300 hover:text-zinc-500 z-50 transition-colors">
          Admin ({process.env.NEXT_PUBLIC_API_URL || "local:4000"})
        </a>
      </div>
    );
  }

  if (step === "SHOOTING") {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 relative">
        <WebcamCapture 
          onCapture={(image, videoBlob) => {
             setShots(prev => [...prev, image]);
             if (videoBlob) setShotVideos(prev => [...prev, videoBlob]);
          }} 
          isCapturing={isCapturing}
          setIsCapturing={setIsCapturing}
          onComplete={() => setStep("SELECTION")}
        />
        <a href="/admin" className="absolute bottom-6 right-8 text-[8px] font-semibold text-zinc-300 hover:text-zinc-500 z-50 transition-colors">
          Admin ({process.env.NEXT_PUBLIC_API_URL || "local:4000"})
        </a>
      </div>
    );
  }

  if (step === "RESULT" && finalQrUrl && finalImageId) {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const qrTargetUrl = finalVideoId 
       ? `${baseUrl}/share/${finalImageId}?vid=${finalVideoId}` 
       : `${baseUrl}/share/${finalImageId}`;
    return <ResultQR url={qrTargetUrl} imagePreview={finalQrUrl} imageId={finalImageId} videoId={finalVideoId || undefined} />;
  }

  const pastelColors = [
    "#FFFFFF", "#111111", "#FFD1DC", "#FFB7B2", "#E2F0CB", "#B5EAD7", "#C7CEEA", "#E0BBE4"
  ];

  return (
    <div className="w-full h-screen lg:h-auto flex flex-col lg:flex-row relative bg-white text-zinc-900 border-t-8 border-primary overflow-hidden lg:overflow-visible">
      
      {/* 1. 상단 프리뷰 영역 (모바일에서 55% 고정 및 최상단 배치) */}
      <section className="h-[55dvh] lg:h-auto lg:flex-1 flex flex-col items-center justify-center p-4 lg:p-8 bg-zinc-100 relative border-b lg:border-b-0 lg:border-l border-zinc-200 order-1 lg:order-2">
        <div className="w-full h-full max-h-[100%] flex items-center justify-center mb-0 lg:mb-8 perspective">
          <div className="h-full aspect-[1080/1920] relative rounded-lg bg-zinc-200/50 shadow-[0_15px_40px_rgba(0,0,0,0.15)] overflow-hidden transition-transform duration-500 transform lg:hover:scale-[1.02]">
            <PhotoSelector selectedSlots={selectedSlots} setSelectedSlots={setSelectedSlots} />
            {selectedFrame.startsWith("#") ? (
              <svg width="100%" height="100%" viewBox="0 0 1080 1920" className="absolute inset-0 pointer-events-none z-10">
                <path fill={selectedFrame} fillRule="evenodd" d="M 0 0 H 1080 V 1920 H 0 Z M 65 78 H 528 V 767 H 65 Z M 552 78 H 1015 V 767 H 552 Z M 65 791 H 528 V 1480 H 65 Z M 552 791 H 1015 V 1480 H 552 Z" />
              </svg>
            ) : (
              <img src={selectedFrame} alt="frame overlay" className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />
            )}
          </div>
        </div>

        <div className="hidden lg:flex w-full items-center justify-center">
            {step !== "SELECTION" && (
              <CanvasRenderer 
                selectedSlots={selectedSlots as string[]} 
                selectedFrame={selectedFrame}
                shotImages={shots}
                shotVideos={shotVideos}
                onUploaded={(url, id, vidId) => {
                  setFinalQrUrl(url); 
                  setFinalImageId(id);
                  if (vidId) setFinalVideoId(vidId);
                  setStep("RESULT");
                }}
             />
            )}
        </div>
      </section>

      {/* 2. 하단 리스트/컨트롤 영역 (모바일에서 45% 고정 및 하단 배치) */}
      <section className="h-[45dvh] lg:h-auto lg:flex-1 flex flex-col p-4 lg:p-8 justify-center bg-zinc-50 border-t lg:border-t-0 lg:border-r border-zinc-200 z-20 order-2 lg:order-1 relative">
        {step === "SELECTION" ? (
          <>
            <div className="mb-2 lg:mb-6 pt-0 lg:pt-4 text-center lg:text-left">
              <h2 className="text-lg lg:text-3xl font-black text-black mb-0.5 lg:mb-3">원하는 사진 4장을 픽하세요 📸</h2>
              <p className="text-zinc-500 font-medium text-[10px] lg:text-lg">사진을 터치하면 프리뷰에 들어갑니다.</p>
            </div>
            
            <div className="flex-1 flex flex-row lg:flex-wrap gap-2 lg:gap-4 overflow-x-auto lg:overflow-x-visible hide-scrollbar py-2 lg:py-6 items-center lg:items-start justify-start">
              {shots.map((shot, idx) => {
                const isSelected = selectedSlots.includes(shot);
                return (
                  <div key={idx} className="relative group flex-shrink-0 lg:flex-shrink">
                    <img 
                      src={shot} 
                      alt={`shot ${idx + 1}`} 
                      className={`w-20 lg:w-40 aspect-[463/689] object-cover cursor-pointer rounded-lg lg:rounded-xl shadow-md border-2 lg:border-4 border-white transition-all 
                        ${isSelected ? 'opacity-40 grayscale blur-[0.5px]' : 'hover:border-primary'}
                      `}
                      onClick={() => {
                        if (isSelected) {
                          const slotIndex = selectedSlots.indexOf(shot);
                          if (slotIndex > -1) {
                            const newSlots = [...selectedSlots];
                            newSlots[slotIndex] = null;
                            setSelectedSlots(newSlots);
                          }
                        } else {
                          const firstEmptyIndex = selectedSlots.findIndex(slot => slot === null);
                          if (firstEmptyIndex !== -1) {
                            const newSlots = [...selectedSlots];
                            newSlots[firstEmptyIndex] = shot;
                            setSelectedSlots(newSlots);
                          }
                        }
                      }}
                    />
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-lg lg:rounded-xl bg-black/20">
                        <span className="bg-primary text-white font-black px-2.5 py-1 lg:px-4 lg:py-2 rounded-full text-[10px] lg:text-sm shadow-md border-2 border-white animate-in zoom-in-75 duration-300">
                          {selectedSlots.indexOf(shot) + 1}번
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 사진 선택 완료 버튼 (모바일용 소형 버튼) */}
            <div className="mt-2 flex justify-center">
              <button 
                onClick={() => {
                  if (secretCode && secretFrameMap[secretCode]) setStep("RESULT");
                  else setStep("FRAME_SELECTION");
                }}
                disabled={selectedSlots.filter(s => s !== null).length < 4}
                className="px-8 py-2.5 bg-primary text-white text-sm lg:text-2xl font-black rounded-full shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                프레임 고르기 🎨
              </button>
            </div>
          </>
        ) : step === "FRAME_SELECTION" ? (
          <div className="flex flex-col h-full py-2 lg:py-6 px-1 lg:px-2 relative">
            <button 
              onClick={() => setStep("SELECTION")} 
              className="absolute top-0 right-0 px-2 py-1 bg-zinc-100 text-zinc-600 rounded-md font-bold text-[10px] lg:text-sm z-30"
            >
              ← 다시 고르기
            </button>
            <h2 className="text-lg lg:text-3xl font-black text-black mb-2">액자 꾸미기 🎨</h2>
            
            <div className="flex lg:hidden bg-zinc-200 p-1 rounded-lg mb-3">
              <button onClick={() => setActiveTab("COLOR")} className={`flex-1 py-2 rounded-md text-xs font-bold ${activeTab === "COLOR" ? "bg-white text-primary" : "text-zinc-500"}`}>심플 컬러</button>
              <button onClick={() => setActiveTab("DESIGN")} className={`flex-1 py-2 rounded-md text-xs font-bold ${activeTab === "DESIGN" ? "bg-white text-primary" : "text-zinc-500"}`}>디자인</button>
            </div>

            <div className="flex-1 overflow-x-auto lg:overflow-y-auto hide-scrollbar">
              <div className={`${activeTab === "COLOR" ? "flex" : "hidden md:hidden"} lg:flex gap-3`}>
                {pastelColors.map((color) => (
                  <button key={color} onClick={() => setSelectedFrame(color)} className={`w-12 h-12 lg:w-20 lg:h-20 rounded-lg shadow-md border-2 lg:border-4 flex-shrink-0 ${selectedFrame === color ? 'border-primary' : 'border-zinc-200'}`} style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className={`${activeTab === "DESIGN" ? "flex" : "hidden md:hidden"} lg:flex gap-3 mt-0 lg:mt-6`}>
                {externalFrames.map((url, idx) => (
                  <button key={idx} onClick={() => setSelectedFrame(url)} className={`w-16 lg:w-32 aspect-[1080/1920] rounded-md lg:rounded-xl shadow-md border-2 lg:border-4 flex-shrink-0 overflow-hidden ${selectedFrame === url ? 'border-primary' : 'border-zinc-200'}`}><img src={url} className="w-full h-full object-cover" /></button>
                ))}
              </div>
            </div>

            {/* 프레임 선택 완료 버튼 (모바일) */}
            <div className="mt-2 flex lg:hidden justify-center items-center">
              <CanvasRenderer 
                selectedSlots={selectedSlots as string[]} 
                selectedFrame={selectedFrame}
                shotImages={shots}
                shotVideos={shotVideos}
                onUploaded={(url, id, vidId) => {
                  setFinalQrUrl(url); setFinalImageId(id);
                  if (vidId) setFinalVideoId(vidId);
                  setStep("RESULT");
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
             <div className="w-8 h-8 lg:w-16 lg:h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-2 lg:mb-6"></div>
             <p className="text-sm lg:text-3xl font-black">사진 굽는 중... 🔥</p>
          </div>
        )}
      </section>

      <a href="/admin" className="absolute bottom-6 right-6 text-[8px] font-semibold text-zinc-300 hover:text-zinc-500 z-50">
        Admin ({process.env.NEXT_PUBLIC_API_URL || "local:4000"})
      </a>
    </div>
  );
}
