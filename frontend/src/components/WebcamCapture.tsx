"use client";

import { useRef, useState, useEffect } from "react";

interface WebcamCaptureProps {
  onCapture: (imageResultUrl: string, videoBlob?: Blob) => void;
  isCapturing: boolean;
  setIsCapturing: (val: boolean) => void;
  onComplete: () => void;
  initialReadySeconds?: number;
  initialIntervalSeconds?: number;
  initialMaxShots?: number;
}

export default function WebcamCapture({ 
  onCapture, isCapturing, setIsCapturing, onComplete,
  initialReadySeconds, initialIntervalSeconds, initialMaxShots
}: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [maxShots, setMaxShots] = useState(initialMaxShots || 6);
  const [intervalSeconds, setIntervalSeconds] = useState(initialIntervalSeconds || 6);
  const [readySeconds, setReadySeconds] = useState(initialReadySeconds || 10);
  const [shotCount, setShotCount] = useState(0);

  const [setupCountdown, setSetupCountdown] = useState<number | null>(null);
  const startLoopRef = useRef<(() => void) | null>(null);
  const isExecutionLocked = useRef(false);

  useEffect(() => {
    startLoopRef.current = startShootingLoop;
  });

  useEffect(() => {
    let rc = initialReadySeconds !== undefined ? initialReadySeconds : 10;
    let timerId: NodeJS.Timeout | null = null;
    let isMounted = true;

    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/config`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        // Props(URL)로 전달된 값이 없을 때만 서버 설정을 따름
        if (!initialMaxShots && data.maxShots) setMaxShots(data.maxShots);
        if (!initialIntervalSeconds && data.intervalSeconds) setIntervalSeconds(data.intervalSeconds);
        if (!initialReadySeconds && data.readySeconds !== undefined) {
          setReadySeconds(data.readySeconds);
          rc = data.readySeconds;
        }
      })
      .catch(e => console.warn("설정값 로드 실패", e))
      .finally(() => {
        if (!isMounted) return;
        if (rc > 0) {
          setSetupCountdown(rc);
          timerId = setInterval(() => {
            setSetupCountdown(prev => {
              if (prev === null) return null;
              if (prev <= 1) {
                if (timerId) clearInterval(timerId);
                setTimeout(() => { if (startLoopRef.current) startLoopRef.current(); }, 0);
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          setSetupCountdown(null);
          setTimeout(() => { if (startLoopRef.current) startLoopRef.current(); }, 0);
        }
      });

    navigator.mediaDevices.getUserMedia({ 
      video: { width: 1280, height: 720, facingMode: "user" }
    }).then((s) => {
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
    }).catch(err => console.error("Webcam init error:", err));

    audioRef.current = new Audio("/sutter.mp3");

    return () => {
      isMounted = false;
      if (timerId) clearInterval(timerId);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []); // 컴포넌트 마운트 시 단 1회만 완벽하게 실행, 불필요한 useEffect 재실행 차단

  const takePhotoAndCrop = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0) return;

    // 플래시 효과 및 .mp3 소리 재생
    setShowFlash(true);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.error("사운드 재생 실패", e));
    }
    setTimeout(() => setShowFlash(false), 200);

    const canvas = canvasRef.current;
    canvas.width = 463;
    canvas.height = 689;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const targetAspect = 463 / 689;
    const videoAspect = vw / vh;

    let sx = 0, sy = 0, sWidth = vw, sHeight = vh;
    if (videoAspect > targetAspect) {
      sWidth = vh * targetAspect;
      sx = (vw - sWidth) / 2;
    } else {
      sHeight = vw / targetAspect;
      sy = (vh - sHeight) / 2;
    }

    ctx.save();
    ctx.translate(463, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, 463, 689);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    return dataUrl;
  };

  const startShootingLoop = async () => {
    if (isExecutionLocked.current) return;
    isExecutionLocked.current = true;

    // 음원 재생 권한 획득 사전요청
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        audioRef.current!.pause();
        audioRef.current!.currentTime = 0;
      }).catch(()=>{});
    }

    setIsCapturing(true);
    setShotCount(0);
    let currentCount = 0;

    for (let i = 0; i < maxShots; i++) {
      if ((isExecutionLocked.current as any) === false) break;

      const chunks: Blob[] = [];
      let mediaRecorder: MediaRecorder | null = null;
      if (streamRef.current) {
         // 브라우저별 지원 MIME 감지 (Safari는 webm 미지원)
         let mimeType = 'video/webm';
         if (typeof MediaRecorder !== 'undefined') {
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
               mimeType = 'video/webm;codecs=vp9';
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
               mimeType = 'video/webm;codecs=vp8';
            } else if (MediaRecorder.isTypeSupported('video/webm')) {
               mimeType = 'video/webm';
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
               mimeType = 'video/mp4';
            }
         }
         try {
           mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
           mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
           mediaRecorder.start(100); // 100ms마다 데이터 청크 수집 (한번에 몰아 받기 방지)
           console.log(`[Rec] Shot ${i+1} recording started, mime: ${mimeType}`);
         } catch(recErr) {
           console.warn("[Rec] MediaRecorder 생성 실패:", recErr);
           mediaRecorder = null;
         }
      }

      for (let sec = intervalSeconds; sec > 0; sec--) {
        setCountdown(sec);
        await new Promise(res => setTimeout(res, 1000));
      }
      setCountdown(null);

      let videoBlob: Blob | undefined;
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
         mediaRecorder.stop();
         await new Promise<void>(res => { mediaRecorder!.onstop = () => res(); });
         videoBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'video/webm' });
         console.log(`[Rec] Shot ${i+1} recorded: ${(videoBlob.size / 1024).toFixed(1)}KB, chunks: ${chunks.length}`);
      } else {
         console.warn(`[Rec] Shot ${i+1}: MediaRecorder was inactive or null`);
      }

      const photoDataUrl = takePhotoAndCrop();
      if (photoDataUrl) {
         onCapture(photoDataUrl, videoBlob);
      } else {
         console.error(`[Rec] Shot ${i+1}: takePhotoAndCrop returned undefined!`);
      }

      currentCount++;
      setShotCount(currentCount);

      if (currentCount === maxShots) break;
    }

    // 마지막 사진 촬영 후 화면이 당장 전환되지 않도록 1초 딜레이 (플래시, 사운드 시각적 확보)
    setTimeout(() => {
      setIsCapturing(false);
      onComplete();
    }, 1000);
  };

  return (
    <div className="relative w-full h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 overflow-hidden py-4 lg:py-0">
      
      {/* 촬영 인터페이스 메인 컨테이너 */}
      <div className="relative w-full h-full max-w-4xl mx-auto flex flex-col items-center justify-between lg:justify-center p-4 lg:p-0 gap-2 lg:gap-0">
        
        {/* 1. 안내사항 (상단) */}
        <div className="w-full lg:absolute lg:top-1/2 lg:-left-12 lg:transform lg:-translate-x-full lg:-translate-y-1/2 lg:w-auto px-4 lg:px-0 z-20">
          <div className="relative bg-white px-4 py-3 lg:px-8 lg:py-8 rounded-2xl lg:rounded-3xl shadow-lg border-2 lg:border-4 border-primary text-center lg:text-right">
            <p className="text-sm lg:text-2xl font-black text-primary mb-1 tracking-tight">안내사항 💡</p>
            <p className="text-[10px] lg:text-xl font-bold text-zinc-700">
              <span className="text-primary font-black">{intervalSeconds}초마다</span> 자동 촬영,
              총 <span className="text-primary font-black">{maxShots}컷</span>
            </p>
          </div>
        </div>

        {/* 2. 카메라 메인 영역 (중앙) */}
        <div className="relative aspect-[463/689] flex-1 max-h-[60vh] lg:max-h-none lg:h-[95dvh] flex-shrink-1 lg:flex-shrink-0 z-10 shadow-2xl mx-auto">
          <div className="absolute inset-0 rounded-2xl overflow-hidden bg-white shadow-xl border-4 lg:border-8 border-white pointer-events-none z-10">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover transform -scale-x-100" 
            />
            {countdown !== null && (
              <div className="absolute top-[20%] w-full flex items-center justify-center transition-none z-20">
                <span className="text-6xl lg:text-[8.4rem] font-black text-white select-none drop-shadow-2xl" style={{ textShadow: '4px 4px 0 #FF4785, -2px -2px 0 #FF4785, 2px -2px 0 #FF4785, -2px 2px 0 #FF4785, 2px 2px 0 #FF4785' }}>
                  {countdown}
                </span>
              </div>
            )}
            {showFlash && <div className="absolute inset-0 bg-white z-30 animate-flash pointer-events-none" />}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        {/* 3. 진행/대기 알림 패널 (하단) */}
        <div className="w-full lg:absolute lg:top-1/2 lg:-right-12 lg:transform lg:translate-x-full lg:-translate-y-1/2 lg:w-auto px-4 lg:px-0 flex justify-center z-20">
          {!isCapturing ? (
             <div className="bg-white rounded-2xl lg:rounded-3xl border-2 lg:border-4 border-zinc-200 shadow-md p-3 lg:p-8 text-center min-w-[150px] lg:min-w-[240px] w-full lg:w-auto">
               {setupCountdown !== null ? (
                 <>
                   <div className="text-3xl lg:text-7xl font-black text-primary tracking-tighter">{setupCountdown}</div>
                   <div className="text-[10px] lg:text-xl font-bold text-zinc-600">초 뒤 시작</div>
                 </>
               ) : (
                 <div className="text-xs lg:text-xl font-bold text-zinc-400 animate-pulse">준비 중...</div>
               )}
             </div>
          ) : (
             <div className="bg-white px-5 py-3 lg:px-8 lg:py-6 rounded-2xl lg:rounded-3xl border-2 lg:border-[6px] border-primary shadow-xl min-w-[200px] lg:min-w-[320px] w-full lg:w-auto text-center flex flex-col items-center justify-center">
              <span className="text-zinc-500 font-bold text-[10px] lg:text-base">총 {maxShots}장 중</span>
              <span className="text-base lg:text-3xl font-black text-zinc-900">
                {shotCount >= maxShots ? (
                  <span className="text-primary tracking-tight font-black block">촬영 완료! 👏</span>
                ) : (
                  <>
                    <span className="text-primary tracking-tight">"{shotCount + 1}번째"</span> 찍는 중 📸
                  </>
                )}
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
