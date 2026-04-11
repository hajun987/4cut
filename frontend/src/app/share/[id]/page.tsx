"use client";

import { useEffect, useState, use } from "react";
import { Download, Film } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [timestampStr, setTimestampStr] = useState<string>("");
  const searchParams = useSearchParams();
  const vid = searchParams.get("vid");
  
  const { id } = resolvedParams;
  const imageUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/uploads/results/${id}`;

  useEffect(() => {
    try {
      const timeMatch = id.match(/result_(\d+)/);
      if (timeMatch && timeMatch[1]) {
        const date = new Date(parseInt(timeMatch[1], 10));
        setTimestampStr(date.toLocaleString("ko-KR", { 
          year: "numeric", month: "long", day: "numeric", 
          hour: "2-digit", minute: "2-digit" 
        }));
      } else {
        setTimestampStr(new Date().toLocaleString("ko-KR"));
      }
    } catch {
      setTimestampStr("");
    }
  }, [id]);

  const handleManualDownload = async (serverFile: string, saveName: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/download/${serverFile}?name=${encodeURIComponent(saveName)}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = objUrl;
      a.download = saveName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      }, 5000);
    } catch {
      console.warn("다운로드 실패, 폴백 시도:");
      window.open(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/download/${serverFile}?name=${encodeURIComponent(saveName)}`, "_blank");
    }
  };

  const doDownload = handleManualDownload;

  return (
    <div className="bg-[#f8f9fa] text-black px-4 py-6">
      <div className="bg-red-500 text-white text-center py-2 text-sm font-bold rounded-xl mb-6">
        ⚠️ 24시간 이후 링크가 영구 만료됩니다.
      </div>

      <h1 className="text-2xl font-black text-center mb-1">나만의 네컷 사진</h1>
      {timestampStr && (
        <p className="text-center text-zinc-500 text-sm mb-4">촬영: {timestampStr}</p>
      )}

      <img src={imageUrl} alt="Result" className="w-full rounded-xl shadow-lg border border-zinc-200 mb-4" />

      <button 
        onClick={() => doDownload(id, `4cut_photo.jpg`)}
        className="flex items-center justify-center gap-3 w-full py-4 bg-black text-white font-bold rounded-2xl active:scale-95 mb-4"
      >
        <Download size={20} />
        사진 다운로드 받기
      </button>

      {vid && (
        <>
          <video 
            src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/uploads/results/${vid}`} 
            controls autoPlay loop muted playsInline 
            className="w-full rounded-xl shadow-lg border border-zinc-200 mb-4 mt-4" 
          />
          <button 
            onClick={() => doDownload(vid, `4cut_video.mp4`)}
            className="flex items-center justify-center gap-3 w-full py-4 bg-primary text-white font-bold rounded-2xl active:scale-95"
          >
            <Film size={20} />
            동영상 다운로드 받기
          </button>
        </>
      )}

      <p className="mt-6 text-xs text-zinc-400 text-center">
        Powered by 최첨단 스마트 포토부스
      </p>
    </div>
  );
}
