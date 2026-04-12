"use client";

import { useState, useEffect } from "react";
import WebcamCapture from "@/components/WebcamCapture";
import PhotoSelector from "@/components/PhotoSelector";
import CanvasRenderer from "@/components/CanvasRenderer";
import ResultQR from "@/components/ResultQR";

export default function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [step, setStep] = useState<"HOME" | "SHOOTING" | "SELECTION" | "FRAME_SELECTION" | "RESULT">("HOME");
  
  const [shots, setShots] = useState<string[]>([]);
  const [shotVideos, setShotVideos] = useState<(Blob | null)[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<(string | null)[]>([null, null, null, null]);
  const [selectedIndices, setSelectedIndices] = useState<(number | null)[]>([null, null, null, null]);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const [selectedFrame, setSelectedFrame] = useState<string>("#FFFFFF");
  const [finalQrUrl, setFinalQrUrl] = useState<string | null>(null);
  const [finalImageId, setFinalImageId] = useState<string | null>(null);
  const [finalVideoId, setFinalVideoId] = useState<string | null>(null);
  const [externalFrames, setExternalFrames] = useState<string[]>([]);
  const [secretCode, setSecretCode] = useState<string | null>(null);
  const [secretFrameMap, setSecretFrameMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"COLOR" | "DESIGN">("COLOR");

  const [loadingProgress, setLoadingProgress] = useState(0);
  const [engineLoaded, setEngineLoaded] = useState(false);

  // 0. 촬영 환경 설정 상태 (URL 파라미터 우선)
  const [readySeconds, setReadySeconds] = useState(10);
  const [intervalSeconds, setIntervalSeconds] = useState(6);
  const [maxShots, setMaxShots] = useState(6);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) setSecretCode(code);

    // URL에서 설정값 읽기
    const urlReady = params.get("ready");
    const urlInterval = params.get("interval");
    const urlShots = params.get("shots");

    if (urlReady) setReadySeconds(Number(urlReady));
    if (urlInterval) setIntervalSeconds(Number(urlInterval));
    if (urlShots) setMaxShots(Number(urlShots));

    async function loadEngine() {
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const { toBlobURL } = await import("@ffmpeg/util");
        
        // 이미 생성된 인스턴스가 있으면 재사용, 없으면 신규 생성
        let ffmpeg = (window as any).FFmpegInstance;
        if (!ffmpeg) {
          ffmpeg = new FFmpeg();
          (window as any).FFmpegInstance = ffmpeg;
        }

        if (ffmpeg.loaded) {
          setEngineLoaded(true);
          return;
        }

        ffmpeg.on("log", ({ message }: { message: string }) => {
          console.log("[FFmpeg Log]", message);
        });

        // 로딩 진행률 추적 (가상의 진행률 시뮬레이션 및 데이터 로드 병행)
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        
        setEngineLoaded(true);
      } catch (err) {
        console.error("FFmpeg 엔진 로드 실패:", err);
      }
    }

    async function loadInitialData() {
      // ... (기존 데이터 로딩 로직)
      try {
        const configRes = await fetch(`${apiUrl}/api/config`);
        const configData = await configRes.json();
        const secretMap = configData.secretFrames || {};
        setSecretFrameMap(secretMap);
        const getFilename = (url: string) => url.split('/').pop() || "";
        if (code && secretMap[code]) setSelectedFrame(secretMap[code].trim());
        const framesRes = await fetch(`${apiUrl}/api/frames-list`);
        const allFrames = await framesRes.json();
        if (Array.isArray(allFrames)) {
          const secretFilenames = Object.values(secretMap).map((url: any) => getFilename(url.trim()));
          const filtered = allFrames.filter(url => !secretFilenames.includes(getFilename(url.trim())));
          setExternalFrames(filtered);
        }
      } catch (err) {
        console.error("데이터 로드 오류:", err);
      }
    }

    loadEngine();
    loadInitialData();
  }, []);

  // 설정값이 바뀔 때마다 URL 동기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("ready", readySeconds.toString());
    params.set("interval", intervalSeconds.toString());
    params.set("shots", maxShots.toString());
    
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [readySeconds, intervalSeconds, maxShots]);

  if (step === "HOME") {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col items-center justify-center bg-white text-zinc-900 border-t-8 border-primary relative">
        <div className="absolute inset-0 bg-primary/5 pattern-dots pointer-events-none" />
        <div className="z-10 bg-white p-16 rounded-[3rem] shadow-[0_20px_60px_rgba(255,71,133,0.15)] flex flex-col items-center text-center border-2 border-primary/10">
          <h1 className="text-5xl font-black mb-8 leading-tight tracking-tighter">
            나만의 <span className="text-primary">네컷 사진</span>을<br/>직접 만들어볼까요?
          </h1>
          <p className="text-zinc-500 font-medium mb-12 text-xl">가장 빛나는 오늘의 모습을 남겨보세요 ✨</p>
          
          {engineLoaded ? (
            <div className="flex flex-col items-center gap-6">
              <button 
                onClick={() => setStep("SHOOTING")}
                className="px-16 py-6 bg-primary text-white text-3xl font-black rounded-full shadow-[0_15px_30px_rgba(255,71,133,0.4)] transition-transform hover:scale-110 active:scale-95 animate-in zoom-in duration-500"
              >
                시작하기
              </button>
              
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="text-zinc-400 font-bold hover:text-primary transition-colors text-sm underline underline-offset-4"
              >
                {showSettings ? "⚙️ 설정 닫기" : "⚙️ 촬영 환경 설정"}
              </button>

              {showSettings && (
                <div className="mt-4 p-6 bg-zinc-50 rounded-3xl border-2 border-zinc-100 flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center justify-between gap-8">
                    <label className="text-sm font-bold text-zinc-600">준비 시간</label>
                    <div className="flex items-center gap-2">
                       <input type="range" min="3" max="20" value={readySeconds} onChange={(e) => setReadySeconds(Number(e.target.value))} className="accent-primary w-24" />
                       <span className="text-primary font-black w-8">{readySeconds}초</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-8">
                    <label className="text-sm font-bold text-zinc-600">촬영 간격</label>
                    <div className="flex items-center gap-2">
                       <input type="range" min="3" max="15" value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))} className="accent-primary w-24" />
                       <span className="text-primary font-black w-8">{intervalSeconds}초</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-8">
                    <label className="text-sm font-bold text-zinc-600">총 촬영 컷</label>
                    <div className="flex items-center gap-2">
                       <input type="range" min="4" max="10" value={maxShots} onChange={(e) => setMaxShots(Number(e.target.value))} className="accent-primary w-24" />
                       <span className="text-primary font-black w-8">{maxShots}장</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-64 h-3 bg-zinc-100 rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-primary animate-pulse w-full origin-left translate-x-[-50%]" />
              </div>
              <p className="text-primary font-bold animate-pulse text-lg">엔진 예열 중... 🔥</p>
            </div>
          )}
        </div>
        <a href="/admin" className="absolute bottom-6 right-8 text-[8px] font-semibold text-zinc-300 hover:text-zinc-500 z-50 transition-colors">
          Admin
        </a>
      </div>
    );
  }

  if (step === "SHOOTING") {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 relative">
        <WebcamCapture 
          onCapture={(photo: string, video?: Blob) => {
            setShots(prev => [...prev, photo]);
            setShotVideos(prev => [...prev, video || null]);
          }} 
          isCapturing={isCapturing}
          setIsCapturing={setIsCapturing}
          onComplete={() => setStep("SELECTION")}
          // URL 또는 홈 화면에서 설정된 값 전달
          initialReadySeconds={readySeconds}
          initialIntervalSeconds={intervalSeconds}
          initialMaxShots={maxShots}
        />

      </div>
    );
  }

  if (step === "RESULT" && finalQrUrl && finalImageId) {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const qrTargetUrl = finalVideoId 
       ? `${baseUrl}/share/${finalImageId}?vid=${finalVideoId}` 
       : `${baseUrl}/share/${finalImageId}`;
    
    // finalQrUrl에 로컬 데이터(base64)가 들어있으므로 즉시 미리보기가 가능합니다.
    return <ResultQR url={qrTargetUrl} imagePreview={finalQrUrl} imageId={finalImageId} videoId={finalVideoId || undefined} />;
  }

  const pastelColors = [
    "#FFFFFF", "#111111", "#FFD1DC", "#FFB7B2", "#E2F0CB", "#B5EAD7", "#C7CEEA", "#E0BBE4"
  ];

  return (
    <div className="w-full min-h-screen flex flex-col lg:flex-row relative bg-white text-zinc-900 border-t-8 border-primary overflow-x-hidden lg:overflow-visible font-sans">
      
      {/* 1. Top Preview Area */}
      <section className="h-[55dvh] lg:h-screen lg:min-h-screen lg:flex-[1.2] flex flex-col items-center justify-center p-4 lg:p-12 bg-zinc-100 relative border-b lg:border-b-0 lg:border-l border-zinc-200 order-1 lg:order-2 overflow-hidden">
        <div className="w-full h-full max-h-[100%] flex items-center justify-center mb-0 lg:mb-8 perspective">
          <div className="h-full aspect-[1080/1920] relative rounded-lg bg-zinc-200/50 shadow-[0_15px_40px_rgba(0,0,0,0.15)] overflow-hidden transition-transform duration-500 transform lg:hover:scale-[1.02]">
            <PhotoSelector selectedSlots={selectedSlots} setSelectedSlots={setSelectedSlots} />
            {selectedFrame.startsWith("#") ? (
              <svg width="100%" height="100%" viewBox="0 0 1080 1920" className="absolute inset-0 pointer-events-none z-10">
                <path fill={selectedFrame} fillRule="evenodd" d="M 0 0 H 1080 V 1920 H 0 Z M 65 78 H 528 V 767 H 65 Z M 552 78 H 1015 V 767 H 552 Z M 65 791 H 528 V 1480 H 65 Z M 552 791 H 1015 V 1480 H 552 Z" />
              </svg>
            ) : (
              <img 
                crossOrigin="anonymous" 
                src={selectedFrame.startsWith("http") ? `${apiUrl}/api/proxy-image?url=${encodeURIComponent(selectedFrame)}` : selectedFrame} 
                alt="frame overlay" 
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" 
              />
            )}
          </div>
        </div>

        <div className="hidden lg:flex w-full items-center justify-center">
            {(step === "FRAME_SELECTION" || (step === "SELECTION" && secretCode && secretFrameMap[secretCode])) && (
              <CanvasRenderer 
                selectedSlots={selectedSlots} 
                selectedIndices={selectedIndices}
                selectedFrame={selectedFrame}
                shotImages={shots}
                shotVideos={shotVideos}
                onUploaded={(url, id, vidId, localUrl) => {
                  setFinalQrUrl(localUrl || url); 
                  setFinalImageId(id);
                  if (vidId) setFinalVideoId(vidId);
                  setStep("RESULT");
                }}
                videoDuration={intervalSeconds}
             />
            )}
        </div>
      </section>

      {/* 2. Bottom Control Area */}
      <section className="h-[45dvh] lg:h-screen lg:min-h-screen lg:flex-1 flex flex-col p-4 lg:p-12 justify-center bg-zinc-50 border-t lg:border-t-0 lg:border-r border-zinc-200 z-20 order-2 lg:order-1 relative overflow-y-auto">
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
                      crossOrigin="anonymous"
                      src={shot} 
                      alt={`shot ${idx + 1}`} 
                      className={`w-20 lg:w-40 aspect-[463/689] object-cover cursor-pointer rounded-lg lg:rounded-xl shadow-md border-2 lg:border-4 border-white transition-all 
                        ${isSelected ? 'opacity-40 grayscale blur-[0.5px]' : 'hover:border-primary'}
                      `}
                      onClick={() => {
                          const slotIndex = selectedSlots.indexOf(shot);
                          if (slotIndex > -1) {
                            const newSlots = [...selectedSlots];
                            const newIndices = [...selectedIndices];
                            newSlots[slotIndex] = null;
                            newIndices[slotIndex] = null;
                            setSelectedSlots(newSlots);
                            setSelectedIndices(newIndices);
                          } else {
                          const firstEmptyIndex = selectedSlots.findIndex(slot => slot === null);
                          if (firstEmptyIndex !== -1) {
                            const newSlots = [...selectedSlots];
                            const newIndices = [...selectedIndices];
                            newSlots[firstEmptyIndex] = shot;
                            newIndices[firstEmptyIndex] = idx;
                            setSelectedSlots(newSlots);
                            setSelectedIndices(newIndices);
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

            <div className="mt-2 flex justify-center">
              {secretCode && secretFrameMap[secretCode] ? (
                <CanvasRenderer 
                  selectedSlots={selectedSlots} 
                  selectedIndices={selectedIndices}
                  selectedFrame={selectedFrame}
                  shotImages={shots}
                  shotVideos={shotVideos as (Blob | null)[]}
                  onUploaded={(url, id, vidId, localUrl) => {
                    setFinalQrUrl(localUrl || url); 
                    setFinalImageId(id);
                    if (vidId) setFinalVideoId(vidId);
                    setStep("RESULT");
                  }}
                  videoDuration={intervalSeconds}
                />
              ) : (
                <button 
                  onClick={() => setStep("FRAME_SELECTION")}
                  disabled={selectedSlots.filter(s => s !== null).length < 4}
                  className="px-8 py-2.5 bg-primary text-white text-sm lg:text-2xl font-black rounded-full shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  프레임 고르기 🎨
                </button>
              )}
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
                  <button 
                    key={idx} 
                    onClick={() => setSelectedFrame(url)} 
                    className={`w-16 lg:w-32 aspect-[1080/1920] rounded-md lg:rounded-xl shadow-md border-2 lg:border-4 flex-shrink-0 overflow-hidden ${selectedFrame === url ? 'border-primary' : 'border-zinc-200'}`}
                  >
                    <img 
                      crossOrigin="anonymous" 
                      src={`${apiUrl}/api/proxy-image?url=${encodeURIComponent(url)}`} 
                      className="w-full h-full object-cover" 
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* 프레임 선택 완료 버튼 (모바일) */}
            <div className="mt-2 flex lg:hidden justify-center items-center">
              <CanvasRenderer 
                selectedSlots={selectedSlots} 
                selectedIndices={selectedIndices}
                selectedFrame={selectedFrame}
                shotImages={shots}
                shotVideos={shotVideos}
                onUploaded={(url, id, vidId, localUrl) => {
                  setFinalQrUrl(localUrl || url); 
                  setFinalImageId(id);
                  if (vidId) setFinalVideoId(vidId);
                  setStep("RESULT");
                }}
                videoDuration={intervalSeconds}
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


    </div>
  );
}
// Force redeploy to clean up admin link cache
