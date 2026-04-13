"use client";

import { useState, useEffect, useRef } from "react";
import WebcamCapture from "@/components/WebcamCapture";
import PhotoSelector from "@/components/PhotoSelector";
import CanvasRenderer from "@/components/CanvasRenderer";
import ResultQR from "@/components/ResultQR";
import { getAllFrames, saveFrame, deleteFrame } from "@/utils/indexedDb";

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
  const [finalPreviewUrl, setFinalPreviewUrl] = useState<string | null>(null); // 화면 표시용 로컬 미리보기 (이미지)
  const [finalVideoPreviewUrl, setFinalVideoPreviewUrl] = useState<string | null>(null); // 로컬 비디오 URL
  const [externalFrames, setExternalFrames] = useState<string[]>([]);
  const [secretCode, setSecretCode] = useState<string | null>(null);
  const [secretFrameMap, setSecretFrameMap] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<"COLOR" | "DESIGN">("COLOR");

  const [engineLoaded, setEngineLoaded] = useState(false);

  // 촬영 환경 설정 상태
  const [readySeconds, setReadySeconds] = useState(10);
  const [intervalSeconds, setIntervalSeconds] = useState(6);
  const [maxShots, setMaxShots] = useState(6);
  const [showSettings, setShowSettings] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState<string | null>(null);

  // 나만의 프레임 상태
  const [customFrames, setCustomFrames] = useState<{ id: number; name: string; url: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 하단 텍스트 설정 상태
  const [frameText, setFrameText] = useState("");
  const [frameFont, setFrameFont] = useState("NexonMaplestory");
  const [frameFontSize, setFrameFontSize] = useState(60); // pt 단위
  const [frameTextColor, setFrameTextColor] = useState("#000000");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) setSecretCode(code);

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
      try {
        const res = await fetch(`${apiUrl}/api/config`);
        if (!res.ok) throw new Error("Config load failed");
        const data = await res.json();
        const secretMap = data.secretFrames || {};
        setSecretFrameMap(secretMap);
        
        if (code && secretMap[code]) {
           const entry = secretMap[code];
           const frameUrl = typeof entry === 'string' ? entry : entry.url;
           const message = typeof entry === 'string' ? null : entry.message;
           if (frameUrl) setSelectedFrame(frameUrl);
           if (message) setGreetingMessage(message);
        }

        const framesRes = await fetch(`${apiUrl}/api/frames-list`);
        if (framesRes.ok) {
          const framesData = await framesRes.json();
          if (Array.isArray(framesData)) {
            // 비밀 코드가 할당된 모든 URL 수집
            const secretUrls = new Set(Object.values(secretMap).map((data: any) => data.url));
            
            // 필터링: 비밀 프레임이 아니거나, 현재 접속 코드로 허용된 프레임인 경우만 노출
            const filteredFrames = framesData.filter((url: string) => {
              if (!secretUrls.has(url)) return true; // 일반 프레임
              if (code && secretMap[code] && secretMap[code].url === url) return true; // 현재 코드로 해금된 프레임
              return false; // 다른 코드용 비밀 프레임은 숨김
            });

            setExternalFrames(filteredFrames);
          }
        }
      } catch (e) {
        console.error("초기 데이터 로드 실패", e);
      }
    }

    async function loadCustomFrames() {
      try {
        const frames = await getAllFrames();
        const framesWithUrls = frames.map(f => ({
          id: f.id,
          name: f.name,
          url: URL.createObjectURL(f.blob)
        }));
        setCustomFrames(framesWithUrls);
      } catch (e) {
        console.error("커스텀 프레임 로드 실패", e);
      }
    }

    loadEngine();
    loadInitialData();
    loadCustomFrames();
  }, [apiUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("ready", readySeconds.toString());
    params.set("interval", intervalSeconds.toString());
    params.set("shots", maxShots.toString());
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [readySeconds, intervalSeconds, maxShots]);

  const handleCustomFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("파일 크기는 2MB 이하여야 합니다.");
      return;
    }
    try {
      const id = await saveFrame(file.name, file);
      const url = URL.createObjectURL(file);
      setCustomFrames(prev => [...prev, { id, name: file.name, url }]);
      setSelectedFrame(url);
    } catch (err) {
      console.error("프레임 저장 실패", err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCustomFrameDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("이 프레임을 삭제하시겠습니까?")) return;
    try {
      await deleteFrame(id);
      setCustomFrames(prev => {
        const target = prev.find(f => f.id === id);
        if (target) URL.revokeObjectURL(target.url);
        return prev.filter(f => f.id !== id);
      });
      if (selectedFrame.startsWith("blob:")) setSelectedFrame("#FFFFFF");
    } catch (err) {
      console.error("프레임 삭제 실패", err);
    }
  };

  // 1. HOME
  if (step === "HOME") {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col items-center justify-center bg-white text-zinc-900 border-t-8 border-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 pattern-dots pointer-events-none" />
        <div className="z-10 bg-white p-12 lg:p-16 rounded-[2rem] lg:rounded-[3rem] shadow-[0_20px_60px_rgba(255,71,133,0.15)] flex flex-col items-center text-center border-2 border-primary/10 max-w-[90%] lg:max-w-none">
          {greetingMessage && (
            <div className="mb-6 px-4 py-2 lg:px-6 lg:py-3 bg-primary/10 rounded-2xl animate-bounce-subtle border border-primary/20">
              <p className="text-primary font-black text-sm lg:text-lg">✨ {greetingMessage} ✨</p>
            </div>
          )}
          <h1 className="text-3xl lg:text-5xl font-black mb-6 lg:mb-8 leading-tight tracking-tighter">
            나만의 <span className="text-primary">네컷 사진</span>을<br/>직접 만들어볼까요?
          </h1>
          <p className="text-zinc-500 font-medium mb-10 lg:mb-12 text-sm lg:text-xl">가장 빛나는 오늘의 모습을 남겨보세요 ✨</p>
          
          {engineLoaded ? (
            <div className="flex flex-col items-center gap-4 lg:gap-6">
              <button 
                onClick={() => setStep("SHOOTING")} 
                className="px-12 py-4 lg:px-16 lg:py-6 bg-primary text-white text-xl lg:text-3xl font-black rounded-full shadow-[0_15px_30px_rgba(255,71,133,0.4)] transition-transform hover:scale-105 active:scale-95 animate-in zoom-in duration-500"
              >
                시작하기
              </button>
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className="text-zinc-400 font-bold hover:text-primary transition-colors text-xs lg:text-sm underline underline-offset-4"
              >
                {showSettings ? "⚙️ 설정 닫기" : "⚙️ 촬영 환경 설정"}
              </button>
              {showSettings && (
                <div className="mt-4 p-4 lg:p-6 bg-zinc-50 rounded-2xl lg:rounded-3xl border-2 border-zinc-100 flex flex-col gap-3 lg:gap-4 animate-in fade-in slide-in-from-top-4 duration-300 w-full">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs lg:text-sm font-bold text-zinc-600">준비 시간</label>
                    <div className="flex items-center gap-2">
                       <input type="range" min="3" max="20" value={readySeconds} onChange={(e) => setReadySeconds(Number(e.target.value))} className="accent-primary w-24 lg:w-32" />
                       <span className="text-primary font-black w-8 text-xs lg:text-sm">{readySeconds}초</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs lg:text-sm font-bold text-zinc-600">촬영 간격</label>
                    <div className="flex items-center gap-2">
                       <input type="range" min="3" max="15" value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))} className="accent-primary w-24 lg:w-32" />
                       <span className="text-primary font-black w-8 text-xs lg:text-sm">{intervalSeconds}초</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs lg:text-sm font-bold text-zinc-600">총 촬영 컷</label>
                    <div className="flex items-center gap-2">
                       <input type="range" min="4" max="10" value={maxShots} onChange={(e) => setMaxShots(Number(e.target.value))} className="accent-primary w-24 lg:w-32" />
                       <span className="text-primary font-black w-8 text-xs lg:text-sm">{maxShots}장</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-primary font-bold animate-pulse text-sm lg:text-lg">엔진 예열 중... 🔥</p>
            </div>
          )}
        </div>
        <a href="/admin" className="absolute bottom-6 right-8 text-[10px] font-semibold text-zinc-300 hover:text-primary z-50 transition-colors">Admin Center</a>
      </div>
    );
  }

  // 2. SHOOTING
  if (step === "SHOOTING") {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 relative">
        <WebcamCapture 
          onCapture={(photo, video) => {
            setShots(prev => [...prev, photo]);
            setShotVideos(prev => [...prev, video || null]);
          }} 
          isCapturing={isCapturing}
          setIsCapturing={setIsCapturing}
          onComplete={() => setStep("SELECTION")}
          initialReadySeconds={readySeconds}
          initialIntervalSeconds={intervalSeconds}
          initialMaxShots={maxShots}
        />
      </div>
    );
  }

  // 3. RESULT
  if (step === "RESULT" && finalQrUrl && finalImageId) {
    return (
      <ResultQR 
        url={finalQrUrl} 
        imagePreview={finalPreviewUrl || finalQrUrl} 
        videoPreview={finalVideoPreviewUrl || undefined}
        imageId={finalImageId} 
        videoId={finalVideoId || undefined} 
      />
    );
  }

  // 4. SELECTION & FRAME_SELECTION
  const pastelColors = ["#FFFFFF", "#111111", "#FFD1DC", "#FFB7B2", "#E2F0CB", "#B5EAD7", "#C7CEEA", "#E0BBE4"];

  return (
    <div className="w-full min-h-screen flex flex-col lg:flex-row relative bg-white text-zinc-900 border-t-8 border-primary overflow-x-hidden font-sans">
      <section className="h-[55dvh] lg:h-screen lg:min-h-screen lg:flex-[1.2] flex flex-col items-center justify-center p-4 lg:p-12 bg-zinc-100 relative border-b lg:border-b-0 lg:border-l border-zinc-200 order-1 lg:order-2">
        <div className="w-full h-full max-h-[100%] flex items-center justify-center mb-0 lg:mb-8 perspective">
          <div className="h-full aspect-[1080/1920] relative rounded-lg bg-zinc-200/50 shadow-2xl overflow-hidden transition-transform duration-500 transform lg:hover:scale-[1.01]">
            <PhotoSelector selectedSlots={selectedSlots} setSelectedSlots={setSelectedSlots} />
            {selectedFrame.startsWith("#") ? (
              <svg width="100%" height="100%" viewBox="0 0 1080 1920" className="absolute inset-0 pointer-events-none z-10">
                <path fill={selectedFrame} fillRule="evenodd" d="M 0 0 H 1080 V 1920 H 0 Z M 65 78 H 528 V 767 H 65 Z M 552 78 H 1015 V 767 H 552 Z M 65 791 H 528 V 1480 H 65 Z M 552 791 H 1015 V 1480 H 552 Z" />
                {frameText && frameText.split("\n").map((line, i, arr) => {
                  const fontSizePx = frameFontSize * 1.5;
                  const lineHeight = fontSizePx * 1.2;
                  const totalHeight = lineHeight * arr.length;
                  const startY = 1700 - (totalHeight / 2) + (lineHeight / 2);
                  return (
                    <text 
                      key={i}
                      x="540" 
                      y={startY + (lineHeight * i)} 
                      textAnchor="middle" 
                      dominantBaseline="middle" 
                      fill={frameTextColor} 
                      style={{ fontFamily: frameFont, fontSize: `${fontSizePx}px`, fontWeight: '700' }}
                    >
                      {line}
                    </text>
                  );
                })}
              </svg>
            ) : (
              <img 
                crossOrigin="anonymous" 
                src={
                  (selectedFrame.startsWith("blob:") || selectedFrame.startsWith("data:") || selectedFrame.includes("/api/proxy-image"))
                    ? selectedFrame 
                    : selectedFrame.startsWith("http") 
                      ? `${apiUrl}/api/proxy-image?url=${encodeURIComponent(selectedFrame.split('?')[0])}` 
                      : selectedFrame
                } 
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" 
                alt="frame"
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
                onUploaded={(url, id, vidId, localUrl, localVidUrl) => {
                  setFinalQrUrl(url); // Gofile URL
                  setFinalPreviewUrl(localUrl || null); // 로컬 이미지
                  setFinalVideoPreviewUrl(localVidUrl || null); // 로컬 비디오
                  setFinalImageId(id);
                  if (vidId) setFinalVideoId(vidId);
                  setStep("RESULT");
                }}
                videoDuration={intervalSeconds}
              />
            )}
        </div>
      </section>

      <section className="h-[45dvh] lg:h-screen lg:min-h-screen lg:flex-1 flex flex-col p-4 lg:p-12 justify-center bg-zinc-50 border-t lg:border-t-0 lg:border-r border-zinc-200 z-20 order-2 lg:order-1 relative overflow-y-auto hide-scrollbar">
        {step === "SELECTION" ? (
          <>
            <div className="mb-4 lg:mb-8 text-center lg:text-left">
              <h2 className="text-xl lg:text-4xl font-black text-zinc-900 mb-1 lg:mb-2">사진을 골라주세요 📸</h2>
              <p className="text-zinc-500 font-medium text-[11px] lg:text-lg">원하는 사진 4장을 순서대로 터치하세요.</p>
            </div>
            <div className="flex-1 flex flex-row lg:flex-wrap gap-2 lg:gap-4 overflow-x-auto lg:overflow-x-visible hide-scrollbar py-2 lg:py-6 items-center lg:items-start">
              {shots.map((shot, idx) => {
                const isSelected = selectedSlots.includes(shot);
                const order = selectedSlots.indexOf(shot) + 1;
                return (
                  <div key={idx} className="relative group flex-shrink-0 lg:flex-shrink">
                    <img 
                      crossOrigin="anonymous" src={shot} alt={`shot ${idx + 1}`} 
                      className={`w-24 lg:w-44 aspect-[463/689] object-cover rounded-xl lg:rounded-2xl shadow-lg border-2 lg:border-4 border-white transition-all transform hover:scale-[1.02] ${isSelected ? 'opacity-30 grayscale blur-[1px]' : 'hover:border-primary cursor-pointer'}`}
                      onClick={() => {
                        const slotIdx = selectedSlots.indexOf(shot);
                        if (slotIdx > -1) {
                          const newSlots = [...selectedSlots];
                          const newIndices = [...selectedIndices];
                          newSlots[slotIdx] = null;
                          newIndices[slotIdx] = null;
                          setSelectedSlots(newSlots);
                          setSelectedIndices(newIndices);
                        } else {
                          const emptyIdx = selectedSlots.findIndex(s => s === null);
                          if (emptyIdx !== -1) {
                            const newSlots = [...selectedSlots];
                            const newIndices = [...selectedIndices];
                            newSlots[emptyIdx] = shot;
                            newIndices[emptyIdx] = idx;
                            setSelectedSlots(newSlots);
                            setSelectedIndices(newIndices);
                          }
                        }
                      }}
                    />
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-xl lg:rounded-2xl bg-black/10">
                        <span className="bg-primary text-white font-black px-3 py-1.5 lg:px-5 lg:py-2.5 rounded-full text-xs lg:text-base shadow-xl border-2 border-white animate-in zoom-in-50 duration-200">{order}번</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-center">
              {secretCode && secretFrameMap[secretCode] ? (
                <CanvasRenderer 
                  selectedSlots={selectedSlots} selectedIndices={selectedIndices} selectedFrame={selectedFrame}
                  shotImages={shots} shotVideos={shotVideos as (Blob | null)[]}
                  onUploaded={(url, id, vidId, localUrl) => {
                    setFinalQrUrl(localUrl || url); setFinalImageId(id);
                    if (vidId) setFinalVideoId(vidId); setStep("RESULT");
                  }}
                  videoDuration={intervalSeconds}
                  frameText={frameText}
                  frameFont={frameFont}
                  frameFontSize={frameFontSize}
                  frameTextColor={frameTextColor}
                />
              ) : (
                <button 
                  onClick={() => setStep("FRAME_SELECTION")} disabled={selectedSlots.filter(s => s !== null).length < 4}
                  className="px-10 py-3 lg:px-16 lg:py-5 bg-primary text-white text-base lg:text-2xl font-black rounded-full shadow-2xl hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 transition-all"
                >
                  프레임 꾸미기 🎨
                </button>
              )}
            </div>
          </>
        ) : step === "FRAME_SELECTION" ? (
          <div className="flex flex-col h-full py-2 lg:py-4 px-1 lg:px-2 relative">
            <button onClick={() => setStep("SELECTION")} className="absolute top-0 right-0 px-3 py-1 bg-zinc-200 text-zinc-700 rounded-lg font-bold text-[10px] lg:text-sm hover:bg-zinc-300 transition-colors">← 사진 다시 선택</button>
            <h2 className="text-xl lg:text-4xl font-black text-zinc-900 mb-4">프레임 선택 🎨</h2>
            
            <div className="flex lg:hidden bg-zinc-200 p-1.5 rounded-xl mb-4 shadow-inner">
              <button onClick={() => setActiveTab("COLOR")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${activeTab === "COLOR" ? "bg-white text-primary shadow-sm" : "text-zinc-500"}`}>심플 컬러</button>
              <button onClick={() => setActiveTab("DESIGN")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${activeTab === "DESIGN" ? "bg-white text-primary shadow-sm" : "text-zinc-500"}`}>디자인</button>
            </div>

            <div className="flex-none lg:flex-1 overflow-x-auto lg:overflow-y-auto hide-scrollbar">
              <div className={`${activeTab === "COLOR" ? "flex" : "hidden md:hidden"} lg:flex gap-4 flex-nowrap lg:flex-wrap`}>
                {pastelColors.map(c => (
                  <button key={c} onClick={() => setSelectedFrame(c)} className={`w-14 h-14 lg:w-24 lg:h-24 rounded-xl shadow-lg border-2 lg:border-4 flex-shrink-0 transition-transform hover:scale-105 ${selectedFrame === c ? 'border-primary ring-2 ring-primary/20' : 'border-zinc-200 hover:border-zinc-300'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              
              <div className={`${activeTab === "DESIGN" ? "flex" : "hidden md:hidden"} lg:flex gap-4 flex-nowrap lg:flex-wrap mt-2 lg:mt-8`}>
                <button onClick={() => fileInputRef.current?.click()} className="w-16 lg:w-36 aspect-[1080/1920] rounded-xl border-4 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-2 hover:border-primary hover:text-primary transition-all flex-shrink-0 bg-zinc-50 hover:bg-white group">
                  <span className="text-2xl lg:text-4xl font-black group-hover:scale-110 transition-transform">+</span>
                  <span className="text-[10px] lg:text-sm font-bold">커스텀<br/>업로드</span>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleCustomFrameUpload} />
                </button>
                {customFrames.slice().reverse().map(f => (
                  <div key={f.id} className="relative flex-shrink-0 group">
                    <button onClick={() => setSelectedFrame(f.url)} className={`w-16 lg:w-36 aspect-[1080/1920] rounded-xl border-2 lg:border-4 overflow-hidden shadow-xl transition-all ${selectedFrame === f.url ? 'border-primary ring-2 ring-primary/20' : 'border-zinc-200'}`}><img src={f.url} className="w-full h-full object-cover" alt="custom" /></button>
                    <button onClick={e => handleCustomFrameDelete(f.id, e)} className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-900 border-2 border-white text-white rounded-full flex items-center justify-center text-sm font-bold shadow-xl hover:bg-red-500 transition-colors opacity-0 group-hover:opacity-100">×</button>
                  </div>
                ))}
                {externalFrames.map((url, idx) => (
                  <button key={idx} onClick={() => setSelectedFrame(url)} className={`w-16 lg:w-36 aspect-[1080/1920] rounded-xl border-2 lg:border-4 flex-shrink-0 overflow-hidden shadow-xl transition-all hover:scale-[1.02] ${selectedFrame === url ? 'border-primary ring-2 ring-primary/20' : 'border-zinc-200'}`}><img crossOrigin="anonymous" src={(url.startsWith("blob:") || url.startsWith("data:") || url.includes("/api/proxy-image")) ? url : url.startsWith("http") ? `${apiUrl}/api/proxy-image?url=${encodeURIComponent(url.split('?')[0])}` : url} className="w-full h-full object-cover" alt="external" /></button>
                ))}
              </div>

              {/* 컬러 프레임일 경우 텍스트 설정 UI 추가 */}
              {selectedFrame.startsWith("#") && (
                <div className="mt-4 lg:mt-6 p-4 lg:p-5 bg-white rounded-2xl border-2 border-zinc-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">✍️ 하단 문구 (가운데 정렬)</h3>
                    <p className="text-[10px] text-zinc-400 font-medium">엔터로 줄바꿈 가능</p>
                  </div>
                  
                  <textarea 
                    value={frameText} 
                    onChange={(e) => setFrameText(e.target.value)}
                    placeholder="여기에 문구를 입력하세요"
                    rows={2}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 p-3 rounded-xl text-sm text-center font-bold outline-none focus:border-primary transition-colors resize-none"
                  />

                  <div className="flex flex-wrap lg:flex-nowrap gap-3 items-end">
                    <div className="flex-1 min-w-[120px] space-y-1.5">
                       <label className="text-[10px] font-black text-zinc-400 uppercase">폰트</label>
                       <select 
                         value={frameFont} 
                         onChange={(e) => setFrameFont(e.target.value)}
                         className="w-full bg-zinc-50 border border-zinc-200 p-2 rounded-lg text-xs outline-none focus:border-primary transition-colors"
                       >
                         <option value="NexonMaplestory">넥슨 메이플</option>
                         <option value="ChangwonDanggamAsak">창원단감</option>
                         <option value="SchoolSafetyNotification">학교알림장</option>
                       </select>
                    </div>

                    <div className="flex-1 min-w-[100px] space-y-1.5">
                       <label className="text-[10px] font-black text-zinc-400 uppercase">크기 ({frameFontSize}pt)</label>
                       <input 
                         type="range" 
                         min="20" max="150" 
                         value={frameFontSize} 
                         onChange={(e) => setFrameFontSize(Number(e.target.value))}
                         className="w-full accent-primary h-8"
                       />
                    </div>
                    
                    <div className="flex-1 min-w-[120px] space-y-1.5">
                       <label className="text-[10px] font-black text-zinc-400 uppercase block">색상</label>
                       <div className="flex gap-1.5">
                         <button 
                           onClick={() => setFrameTextColor("#000000")}
                           className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all border ${frameTextColor === "#000000" ? 'bg-black text-white border-black' : 'bg-white text-black border-zinc-200'}`}
                         >
                           검정
                         </button>
                         <button 
                           onClick={() => setFrameTextColor("#FFFFFF")}
                           className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all border ${frameTextColor === "#FFFFFF" ? 'bg-zinc-100 text-black border-zinc-400' : 'bg-white text-zinc-400 border-zinc-200'}`}
                         >
                           흰색
                         </button>
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex lg:hidden justify-center items-center">
              <CanvasRenderer 
                selectedSlots={selectedSlots} selectedIndices={selectedIndices} selectedFrame={selectedFrame}
                shotImages={shots} shotVideos={shotVideos}
                onUploaded={(url, id, vidId, localUrl, localVidUrl) => {
                  setFinalQrUrl(url); // Gofile URL
                  setFinalPreviewUrl(localUrl || null); // 로컬 이미지
                  setFinalVideoPreviewUrl(localVidUrl || null); // 로컬 비디오
                  setFinalImageId(id);
                  if (vidId) setFinalVideoId(vidId);
                  setStep("RESULT");
                }}
                videoDuration={intervalSeconds}
                frameText={frameText}
                frameFont={frameFont}
                frameFontSize={frameFontSize}
                frameTextColor={frameTextColor}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
             <div className="w-12 h-12 lg:w-20 lg:h-20 border-[6px] border-primary border-t-transparent rounded-full animate-spin mb-6 lg:mb-8 shadow-sm" />
             <p className="text-lg lg:text-4xl font-black text-zinc-900">추억을 굽는 중입니다... 🔥</p>
             <p className="text-zinc-500 mt-2 text-sm lg:text-xl">잠시만 기다려주세요!</p>
          </div>
        )}
      </section>
    </div>
  );
}
