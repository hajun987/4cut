"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function AdminPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState("");
  
  const [intervalSeconds, setIntervalSeconds] = useState(6);
  const [maxShots, setMaxShots] = useState(6);
  const [readySeconds, setReadySeconds] = useState(10);
  const [secretFrames, setSecretFrames] = useState<Record<string, { url: string; message: string }>>({}); // { "코드": { url, message } }
  const [isSaving, setIsSaving] = useState(false);
  
  // 모달 상태 관리
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [modalFrameUrl, setModalFrameUrl] = useState("");
  const [modalCodeValue, setModalCodeValue] = useState("");
  const [modalMessageValue, setModalMessageValue] = useState("");
  
  const [frames, setFrames] = useState<string[]>([]);

  const checkPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passInput })
      });
      
      if (res.ok) {
        setIsAuthenticated(true);
        fetchConfig();
        fetchFrames();
      } else {
        const data = await res.json();
        alert(data.message || "비밀번호가 틀렸습니다.");
        setPassInput("");
      }
    } catch (err) {
      alert("로그인 중 서버 오류가 발생했습니다.");
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/config`);
      if (res.ok) {
        const data = await res.json();
        setIntervalSeconds(data.intervalSeconds || 6);
        setMaxShots(data.maxShots || 6);
        setReadySeconds(data.readySeconds || 10);
        setSecretFrames(data.secretFrames || {});
      }
    } catch {
      console.warn("Backend config fetch failed");
    }
  };

  const fetchFrames = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/frames-list`);
      if (res.ok) {
        const data = await res.json();
        setFrames(data);
      }
    } catch {
      console.warn("Frames list fetch failed");
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalSeconds, maxShots, readySeconds, secretFrames })
      });
      alert("설정이 저장되었습니다.");
    } catch {
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
    } catch {
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
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  // 비밀 코드 할당 모달 열기
  const handleAssignSecretCode = (frameUrl: string) => {
    const existingEntry = Object.entries(secretFrames).find(([_, data]) => data.url === frameUrl);
    setModalFrameUrl(frameUrl);
    setModalCodeValue(existingEntry ? existingEntry[0] : "");
    setModalMessageValue(existingEntry ? existingEntry[1].message : "");
    setShowCodeModal(true);
  };

  const saveCodeFromModal = () => {
    if (!modalCodeValue.trim()) {
      alert("코드를 입력해주세요.");
      return;
    }
    
    // 이미 다른 프레임에 동일한 코드가 있는지 확인 (현재 프레임 제외)
    const duplicateCode = Object.entries(secretFrames).find(([code, data]) => code === modalCodeValue && data.url !== modalFrameUrl);
    if (duplicateCode) {
      if (!confirm("이미 다른 프레임에 지정된 코드입니다. 이 프레임으로 변경하시겠습니까?")) return;
    }

    const newSecretFrames = { ...secretFrames, [modalCodeValue.trim()]: { url: modalFrameUrl, message: modalMessageValue || "" } };
    setSecretFrames(newSecretFrames);
    updateSecretFramesOnServer(newSecretFrames);
    setShowCodeModal(false);
  };

  const handleRemoveSecretCode = (code: string) => {
    if (!confirm(`'${code}' 코드를 삭제하시겠습니까?`)) return;
    const newSecretFrames = { ...secretFrames };
    delete newSecretFrames[code];
    setSecretFrames(newSecretFrames);
    updateSecretFramesOnServer(newSecretFrames);
  };

  const updateSecretFramesOnServer = async (newSecretFrames: Record<string, { url: string; message: string }>) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalSeconds, maxShots, readySeconds, secretFrames: newSecretFrames })
      });
      if (res.ok) {
        console.log("[Admin] 서버 저장 성공!");
      }
    } catch (e) {
      console.error("비밀 코드 서버 저장 실패", e);
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
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-10 pb-6 border-b border-zinc-200">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 flex items-center gap-3">
            <span className="bg-primary text-white text-sm px-3 py-1 rounded-lg">Admin</span>
            고유 프레임 관리 센터
          </h1>
          <a href="/" className="px-6 py-3 bg-white border border-zinc-200 text-zinc-600 rounded-lg hover:bg-zinc-50 font-bold shadow-sm transition-colors">
            촬영 화면으로 돌아가기
          </a>
        </header>

        <div className="w-full">
          <section className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200 mb-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">📂 전체 라이브러리 (행사용 후보)</h2>
              
              <label className="cursor-pointer px-6 py-3 bg-primary/10 text-primary font-bold rounded-xl hover:bg-primary hover:text-white transition-colors shadow-sm">
                + 새 디자인 업로드 (PNG)
                <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            
            <p className="text-xs text-zinc-400 mb-6 bg-zinc-50 p-3 rounded-lg">
              * 업로드한 뒤 각 이미지 아래의 `코드 부여` 버튼을 눌러 특정 이벤트용 비밀 코드를 생성하세요.
            </p>

            {frames.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {frames.map((url, idx) => {
                  const isSecret = Object.values(secretFrames).some(data => data.url === url);
                  const assignedCode = Object.entries(secretFrames).find(([_, data]) => data.url === url)?.[0];

                  return (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100 aspect-[1080/1920]">
                      <img 
                        crossOrigin="anonymous" 
                        src={`${apiUrl}/api/proxy-image?url=${encodeURIComponent(url)}`} 
                        alt="frame thumbnail" 
                        className={`w-full h-full object-contain transition-all ${isSecret ? 'brightness-[0.4] grayscale-[0.5]' : ''}`} 
                      />
                      
                      {isSecret && (
                        <div className="absolute top-2 right-2 bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-md shadow-lg flex items-center gap-1 z-10">
                          🔑 {assignedCode}
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                         <button 
                           onClick={() => handleAssignSecretCode(url)}
                           className="w-11/12 py-1.5 bg-primary text-white font-bold rounded shadow-lg hover:scale-105 transition-all text-[10px] flex items-center justify-center gap-1"
                         >
                           {isSecret ? "🔑 코드/인사말 변경" : "🔑 코드 부여"}
                         </button>
                         <button 
                           onClick={() => handleDeleteFrame(url)}
                           className="w-11/12 py-1.5 bg-red-500 text-white font-bold rounded shadow-lg hover:bg-red-600 hover:scale-105 transition-all text-[10px] flex items-center justify-center gap-1"
                         >
                           🗑️ 영구 삭제
                         </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="w-full py-10 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50">
                <p className="text-sm font-bold">라이브러리가 비어있습니다.</p>
              </div>
            )}
          </section>
        </div>

        {/* 비밀 고유 코드 관리 섹션 */}
        <section className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200">
          <h2 className="text-xl font-black mb-6 flex items-center gap-2 text-primary">🤫 비밀 프레임 (고유 코드) 목록 및 인사말</h2>
          
          {Object.keys(secretFrames).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-100 italic text-zinc-400 text-xs">
                    <th className="py-4 font-bold">코드</th>
                    <th className="py-4 font-bold">인사말 (첫화면 노출)</th>
                    <th className="py-4 font-bold">미리보기/링크</th>
                    <th className="py-4 font-bold text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(secretFrames).map(([code, data]) => (
                    <tr key={code} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                      <td className="py-4">
                        <span className="px-3 py-1 bg-primary text-white font-black rounded text-xs">
                          {code}
                        </span>
                      </td>
                      <td className="py-4">
                        <p className="text-sm font-bold text-zinc-700 max-w-[250px] truncate">
                          {data.message || "- 인사말 없음 -"}
                        </p>
                      </td>
                      <td className="py-4">
                         <div className="flex items-center gap-4">
                           <img 
                             crossOrigin="anonymous" 
                             src={`${apiUrl}/api/proxy-image?url=${encodeURIComponent(data.url)}`} 
                             alt="secret frame" 
                             className="h-12 w-auto rounded border border-zinc-100 shadow-sm" 
                           />
                           <button 
                             onClick={() => {
                               const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
                               const link = `${baseUrl}/?code=${code}`;
                               navigator.clipboard.writeText(link);
                               alert("링크가 복사되었습니다!");
                             }}
                             className="text-[10px] font-black text-zinc-400 hover:text-primary underline"
                           >
                             🔗 링크 복사
                           </button>
                         </div>
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleAssignSecretCode(data.url)} className="text-zinc-400 hover:text-primary text-xs font-bold">수정</button>
                          <button onClick={() => handleRemoveSecretCode(code)} className="text-red-300 hover:text-red-500 text-xs font-bold">해제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-zinc-400 font-medium">
              아직 지정된 고유 코드가 없습니다. 라이브러리에서 코드를 부여하세요.
            </div>
          )}
        </section>
      </div>

      {/* 커스텀 코드 입력 모달 */}
      {showCodeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black mb-2 flex items-center gap-2">🔑 고유 코드 설정</h3>
            <p className="text-sm text-zinc-500 mb-6 font-medium break-keep">이 프레임에 접근할 수 있는 특별한 단어나 코드를 입력하세요.</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase mb-1 block">고유 코드 (영문/숫자 권장)</label>
                <input 
                  type="text"
                  placeholder="예: wedding_2026"
                  value={modalCodeValue}
                  onChange={(e) => setModalCodeValue(e.target.value)}
                  className="w-full border-2 border-zinc-100 p-3 rounded-xl text-lg font-bold outline-none focus:border-primary transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase mb-1 block">첫 화면 인사말 (선택)</label>
                <input 
                  type="text"
                  placeholder="예: 행복한 결혼식에 오신 것을 환영합니다!"
                  value={modalMessageValue}
                  onChange={(e) => setModalMessageValue(e.target.value)}
                  className="w-full border-2 border-zinc-100 p-3 rounded-xl text-sm font-medium outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowCodeModal(false)}
                className="flex-1 py-4 bg-zinc-50 text-zinc-400 font-bold rounded-xl hover:bg-zinc-100 transition-colors"
              >
                취소
              </button>
              <button 
                onClick={saveCodeFromModal}
                className="flex-1 py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-sm"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
