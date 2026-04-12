"use client";

import { Dispatch, SetStateAction } from "react";
import { X } from "lucide-react";

interface PhotoSelectorProps {
  selectedSlots: (string | null)[];
  setSelectedSlots: Dispatch<SetStateAction<(string | null)[]>>;
}

export default function PhotoSelector({ selectedSlots, setSelectedSlots }: PhotoSelectorProps) {
  const handleRemove = (index: number) => {
    const newSlots = [...selectedSlots];
    newSlots[index] = null;
    setSelectedSlots(newSlots);
  };

  const slotsLayout = [
    { left: `${(64 / 1080) * 100}%`, top: `${(77 / 1920) * 100}%` },
    { left: `${(551 / 1080) * 100}%`, top: `${(77 / 1920) * 100}%` },
    { left: `${(64 / 1080) * 100}%`, top: `${(790 / 1920) * 100}%` },
    { left: `${(551 / 1080) * 100}%`, top: `${(790 / 1920) * 100}%` },
  ];

  const slotWidth = `${(465 / 1080) * 100}%`;
  const slotHeight = `${(691 / 1920) * 100}%`;

  return (
    <div className="absolute inset-0 w-full h-full bg-transparent overflow-hidden">
      {slotsLayout.map((layout, idx) => {
        const imageSrc = selectedSlots[idx];
        return (
          <div
            key={idx}
            className="absolute bg-zinc-100 flex items-center justify-center transition-all bg-opacity-80 shadow-inner"
            style={{
              left: layout.left,
              top: layout.top,
              width: slotWidth,
              height: slotHeight,
            }}
          >
            {imageSrc ? (
              <div className="relative w-full h-full">
                <img crossOrigin="anonymous" src={imageSrc} alt={`slot-${idx}`} className="w-full h-full object-cover" />
              </div>
            ) : (
              <span className="text-zinc-300 font-bold text-2xl select-none">{idx + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
