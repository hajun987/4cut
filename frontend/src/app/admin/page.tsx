"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState("");
  
  const [intervalSeconds, setIntervalSeconds] = useState(6);
  const [maxShots, setMaxShots] = useState(6);
  const [readySeconds, setReadySeconds] = useState(10);
  const [isSaving, setIsSaving] = useState(false);
  
  const [frames, setFrames] = useState<string[]>([]);

  const checkPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passInput === "0000") {
      setIsAuthenticated(true);
      fetchConfig();
      fetchFrames();
    } else {
      alert("비밀번호가 틀렸습니다.");
      setPassInput("");
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/config`);
      if (res.ok) {
        const data = await res.json();
        setIntervalSeconds(data.intervalSeconds || 6);
        setMaxShots(data.maxShots || 6);
        setReadySeconds(data.readySeconds || 10);
      }
    } catch(e) {
      console.warn("Backend config fetch failed", e);
    }
  };

  const fetchFrames = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/frames-list`);
      if (res.ok) {
        const data = await res.json();
        setFrames(data);
      }
    } catch(e) {
      console.warn("Frames list fetch failed", e);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalSeconds, maxShots, readySeconds })
      });
      alert("설정이 저장되었습니다.");
    } catch(e) {
      alert("설정 저장 실패");
    }
    setIsSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("frame", file);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/frame-external`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        alert("성공적으로 업로드되었습니다.");
        fetchFrames();
      }
    } catch(e) {
      alert("업로드 실패");
    }
  };

  const handleDeleteFrame = async (frameUrl: string) => {
    if (!confirm("정말 이 프레임을 삭제하시겠습니까?")) return;
    try {
      // 프레임 파일명 추출 (URL의 마지막 부분 파싱 후 decode)
      const filename = decodeURIComponent(frameUrl.split('/').pop() || "");
      if(!filename) return;

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/frame-external/${encodeURIComponent(filename)}`, {
        method: "DELETE"
      });
      alert("삭제되었습니다.");
      fetchFrames();
    } catch(e) {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-zinc-50 flex items-center justify-center text-black">
        <div className="bg-white p-10 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-primary text-2xl font-black">🔒</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">관리자 로그인</h1>
          <p className="text-sm text-zinc-500 mb-8">안전한 시스템 설정을 위해<br/>PIN 코드를 입력하세요.</p>
          <form onSubmit={checkPassword} className="flex flex-col gap-4">
            <input 
              type="password" 
              placeholder="PIN 번호를 입력하세요" 
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              className="border-2 border-zinc-200 p-4 rounded-xl text-center text-xl tracking-[0.5em] font-black focus:border-primary focus:outline-none transition-colors"
              autoFocus
            />
            <button type="submit" className="bg-black text-white font-bold py-4 rounded-xl hover:bg-zinc-800 transition-colors">
              입장하기
            </button>
          </form>
          <a href="/" className="inline-block mt-8 text-sm text-zinc-400 hover:text-primary transition-colors">홈으로 돌아가기</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-50 p-8 text-black pb-32">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-10 pb-6 border-b border-zinc-200">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 flex items-center gap-3">
            <span className="bg-primary text-white text-sm px-3 py-1 rounded-lg">Admin</span>
            기기 통합 설정창
          </h1>
          <a href="/" className="px-6 py-3 bg-white border border-zinc-200 text-zinc-600 rounded-lg hover:bg-zinc-50 font-bold shadow-sm transition-colors">
            촬영 화면으로 돌아가기
          </a>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <section className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200 h-fit">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">⏱️ 촬영 환경 설정</h2>
            <div className="flex flex-col gap-6">
              
              <div>
                <label className="text-sm font-bold text-zinc-600 mb-2 block">최초 촬영 준비 대기시간</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="number" min={0} max={30}
                    value={readySeconds}
                    onChange={(e) => setReadySeconds(Number(e.target.value))}
                    className="border-2 border-zinc-200 p-3 rounded-xl w-24 text-lg font-bold outline-none focus:border-primary transition-colors"
                  />
                  <span className="text-lg font-bold">초 (Sec)</span>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-100">
                <label className="text-sm font-bold text-zinc-600 mb-2 block">컷당 촬영 대기시간</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="number" min={1} max={30}
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                    className="border-2 border-zinc-200 p-3 rounded-xl w-24 text-lg font-bold outline-none focus:border-primary"
                  />
                  <span className="text-lg font-bold">초 (Sec)</span>
                </div>
              </div>
              
              <div className="pt-2 border-t border-zinc-100">
                <label className="text-sm font-bold text-zinc-600 mb-2 block">지정 총 촬영 낱장 수 (보통 6~8)</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="number" min={4} max={10}
                    value={maxShots}
                    onChange={(e) => setMaxShots(Number(e.target.value))}
                    className="border-2 border-zinc-200 p-3 rounded-xl w-24 text-lg font-bold outline-none focus:border-primary"
                  />
                  <span className="text-lg font-bold">장 (Shots)</span>
                </div>
              </div>

              <button 
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="mt-6 w-full py-4 bg-zinc-900 text-white font-bold text-lg rounded-xl hover:bg-black transition-colors"
               >
                {isSaving ? "저장 중..." : "설정 적용하기"}
              </button>
            </div>
          </section>

          <section className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200 md:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">🖼️ 내장 프레임 관리</h2>
              
              <label className="cursor-pointer px-6 py-3 bg-primary/10 text-primary font-bold rounded-xl hover:bg-primary hover:text-white transition-colors shadow-sm">
                + 새 디자인 올리기 (PNG)
                <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            
            <p className="text-sm text-zinc-500 mb-6 bg-zinc-50 p-4 rounded-xl font-medium border border-zinc-100">
              * 이곳에 업로드된 이미지는 고객이 직접 액자로 선택할 수 있습니다. 1080x1920 픽셀에 가운데 4장이 투명하게 뚫려있어야 완벽합니다.
            </p>

            {frames.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {frames.map((url, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100 aspect-[1080/1920]">
                    <img src={url} alt="frame thumbnail" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                       <button 
                         onClick={() => handleDeleteFrame(url)}
                         className="px-4 py-2 bg-red-500 text-white font-bold rounded-lg shadow-lg hover:bg-red-600 hover:scale-105 transition-all text-sm flex items-center gap-2"
                       >
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                         삭제
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full py-16 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50">
                <span className="text-4xl mb-3">📭</span>
                <p className="font-bold">등록된 외부 프레임이 없습니다</p>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
