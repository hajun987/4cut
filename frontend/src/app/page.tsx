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

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) setSecretCode(code);

    async function loadInitialData() {
      try {
        // 1. 서버 설정(비밀 프레임 정보 포함)을 먼저 가져옴
        const configRes = await fetch(`${apiUrl}/api/config`);
        const configData = await configRes.json();
        
        const secretMap = configData.secretFrames || {};
        setSecretFrameMap(secretMap);

        // 2. 코드가 있고 매핑된 프레임이 있다면 즉시 선택
        if (code && secretMap[code]) {
          setSelectedFrame(secretMap[code]);
        }

        // 3. 프레임 목록을 가져오고 비밀 프레임은 즉시 필터링
        const framesRes = await fetch(`${apiUrl}/api/frames-list`);
        const allFrames = await framesRes.json();
        
        if (Array.isArray(allFrames)) {
          const secretUrls = Object.values(secretMap);
          const filtered = allFrames.filter(url => !secretUrls.includes(url));
          setExternalFrames(filtered);
        }
      } catch (err) {
        console.warn("데이터 로드 중 오류 발생:", err);
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
        <a href="/admin" className="absolute bottom-6 right-8 text-sm font-semibold text-zinc-300 hover:text-zinc-500 z-50 transition-colors">
          Admin
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
        <a href="/admin" className="absolute bottom-6 right-8 text-sm font-semibold text-zinc-300 hover:text-zinc-500 z-50 transition-colors">
          Admin
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
    <div className="w-full min-h-[100dvh] flex flex-col lg:flex-row relative bg-white text-zinc-900 border-t-8 border-primary">
      <section className="flex-1 flex flex-col p-8 lg:pr-12 justify-center min-h-[50dvh] bg-zinc-50 border-r border-zinc-200">
        {step === "SELECTION" ? (
          <>
            <div className="mb-6 pt-4 text-center lg:text-left">
              <h2 className="text-3xl font-black text-black mb-3">찰칵! 원하는 사진 4장을 픽하세요 📸</h2>
              <p className="text-zinc-500 font-medium text-lg text-balance">
                사진을 터치하면 우측 프레임에 쏙 들어갑니다. 다시 누르면 빠져나와요!
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto py-6 flex flex-wrap gap-4 items-center justify-center lg:justify-start content-start">
              {shots.map((shot, idx) => {
                const isSelected = selectedSlots.includes(shot);
                return (
                  <div key={idx} className="relative group perspective">
                    <img 
                      src={shot} 
                      alt={`shot ${idx + 1}`} 
                      className={`w-32 lg:w-40 aspect-[463/689] object-cover cursor-pointer rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] border-4 border-white transition-all duration-300 ease-out 
                        ${isSelected ? 'opacity-30 grayscale blur-[1px] scale-95' : 'hover:border-primary hover:-translate-y-2 hover:shadow-[0_15px_30px_rgba(255,71,133,0.2)]'}
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
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-xl bg-black/20">
                        <span className="bg-primary text-white font-black px-4 py-2 rounded-full text-sm shadow-md border-2 border-white scale-105">
                          {selectedSlots.indexOf(shot) + 1}번 칸 선택됨
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : step === "FRAME_SELECTION" ? (
          <div className="flex flex-col h-full py-6 px-2 lg:text-left text-center relative">
            <button 
              onClick={() => setStep("SELECTION")} 
              className="absolute top-2 right-2 lg:-top-2 lg:right-0 px-4 py-2 bg-zinc-100 text-zinc-600 rounded-lg font-bold text-sm hover:bg-zinc-200 transition-colors"
            >
              ← 사진 다시 고르기
            </button>
            <h2 className="text-3xl font-black text-black mb-3 pr-20">나만의 액자를 만들어볼까요? 🎨</h2>
            <p className="text-zinc-500 mb-8 font-medium">색상이나 특별한 디자인을 고른 후 '완료' 버튼을 누르세요.</p>
            
            <div className="flex-1 overflow-y-auto pb-10">
              <h3 className="text-xl font-bold text-black mb-4 border-b-2 border-primary/20 pb-3 inline-block">기본 디자인 테마</h3>
              <div className="flex flex-wrap gap-5 mb-12">
                {pastelColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedFrame(color)}
                    className={`w-20 h-20 rounded-2xl shadow-md border-4 transition-all hover:scale-110 active:scale-95
                      ${selectedFrame === color ? 'border-primary shadow-[0_0_20px_rgba(255,71,133,0.4)] scale-110' : 'border-zinc-200'}
                    `}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              {externalFrames.length > 0 && (
                <>
                  <h3 className="text-xl font-bold text-black mb-4 border-b-2 border-primary/20 pb-3 inline-block mt-4">특별한 아트 프레임</h3>
                  <div className="flex flex-wrap gap-5">
                    {externalFrames.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedFrame(url)}
                        className={`w-32 aspect-[1080/1920] bg-zinc-100 rounded-xl shadow-md border-4 transition-all hover:scale-105 bg-contain bg-center bg-no-repeat overflow-hidden 
                          ${selectedFrame === url ? 'border-primary ring-4 ring-primary/30 scale-105 flex-shrink-0 relative' : 'border-zinc-200'}
                        `}
                        style={{ backgroundImage: `url(${url})` }}
                      >
                         <img src={url} alt="frame thumbnail" className="w-full h-full object-contain pointer-events-none" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
             <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
             <h2 className="text-3xl font-black text-black mb-3">멋진 사진을 굽는 중입니다... 🔥</h2>
             <p className="text-zinc-500 font-medium">잠시만 기다려 주시면 고화질 네컷사진이 완성됩니다!</p>
          </div>
        )}
      </section>

      <section className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-100 relative">
        <div className="w-full h-full max-h-[85dvh] flex items-center justify-center mb-8 perspective">
          <div className="h-full max-w-full aspect-[1080/1920] relative rounded-lg bg-zinc-200/50 shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden transition-transform duration-500 transform hover:scale-[1.02]">
            
            {/* 뒤에 깔리는 4장의 사진 영역 */}
            <PhotoSelector selectedSlots={selectedSlots} setSelectedSlots={setSelectedSlots} />
            
            {/* 완전히 위에서 덮어씌워지는(Overlay) 프레임 마스크 로직 */}
            {selectedFrame.startsWith("#") ? (
              <svg width="100%" height="100%" viewBox="0 0 1080 1920" className="absolute inset-0 pointer-events-none z-10">
                {/* 배경은 선택한 색상으로 채우고, 4구역만 정확히 네모나게 뚫어냅니다 (evenodd rule) */}
                <path fill={selectedFrame} fillRule="evenodd" d="M 0 0 H 1080 V 1920 H 0 Z M 65 78 H 528 V 767 H 65 Z M 552 78 H 1015 V 767 H 552 Z M 65 791 H 528 V 1480 H 65 Z M 552 791 H 1015 V 1480 H 552 Z" />
              </svg>
            ) : (
              <img src={selectedFrame} alt="frame overlay" className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />
            )}

          </div>
        </div>

        <div className="w-full flex items-center justify-center">
          {step === "SELECTION" ? (
              <button 
                onClick={() => {
                  if (secretCode && secretFrameMap[secretCode]) {
                    // 비밀 코드가 있으면 프레임 선택 단계를 건너뛰고 바로 결과 단계로 진입
                    setStep("RESULT");
                  } else {
                    setStep("FRAME_SELECTION");
                  }
                }}
                disabled={selectedSlots.filter(s => s !== null).length < 4}
                className="w-full py-5 bg-primary text-white text-2xl font-black rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:hover:scale-100"
              >
                {secretCode && secretFrameMap[secretCode] ? "사진 완성하기 ✨" : "프레임 고르러 가기 🎨"}
              </button>
          ) : (
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

      <a href="/admin" className="absolute bottom-6 right-6 text-xs font-semibold text-zinc-300 hover:text-zinc-500 z-50">
        Admin
      </a>
    </div>
  );
}
