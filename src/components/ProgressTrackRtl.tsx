"use client";
import React from "react";
import { humanDelta, speedEmojiByTotal } from "@/lib/progress";
import { cn } from "@/lib/utils";

type Props = {
  startMs: number;
  targetMs: number;
  nowMs: number;
  minDurationMs?: number; // röd zon
  direction?: "horizontal" | "vertical";
  className?: string;
  variant?: "track" | "overlay"; // "track" = smal mätare, "overlay" = täcker hela ytan
};

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export default function ProgressTrack({
  startMs,
  targetMs,
  nowMs,
  minDurationMs = 0,
  direction = "horizontal",
  className = "",
  variant = "track",
}: Props) {
  const total = Math.max(1, targetMs - startMs);
  const progress = clamp((nowMs - startMs) / total, 0, 1);
  const remaining = Math.max(0, targetMs - nowMs);
  const runner = speedEmojiByTotal(total);

  // röd zon: sista minDurationMs av total
  const safeMin = Math.max(0, Math.min(minDurationMs, total));
  const redPct = (safeMin / total) * 100;

  const isHorizontal = direction === "horizontal";

  const dotSize = 14; // px offset för emoji centreringskorrigering

  const remainingPosStyle = isHorizontal
    ? { right: `calc(${progress * 100}% - ${dotSize + 4}px)` }
    : { top: `calc(${progress * 100}% - ${dotSize - 20}px)`, left: '50%', transform: 'translateX(-50%)' };

  if (variant === "overlay") {
    const lineStyle = isHorizontal
      ? { right: `calc(${progress * 100}% - 0.5px)` }
      : { top: `calc(${progress * 100}% - 0.5px)` };
    const emojiStyle = isHorizontal
      ? { right: `calc(${progress * 100}% - ${dotSize}px)`, top: "4px" }
      : { left: "4px", top: `calc(${progress * 100}% - ${dotSize}px)` };

    return (
      <div
        className={cn("w-full h-full relative pointer-events-none", className)}
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Bas */}
        <div className="absolute inset-0 bg-black/20" />
        {/* Förbrukad tid */}
        <div
          className={cn("absolute bg-black/60", isHorizontal ? "inset-y-0 right-0" : "inset-x-0 top-0")}
          style={isHorizontal ? { width: `${progress * 100}%` } : { height: `${progress * 100}%` }}
        />
        {/* Röd zon */}
        <div
          className={cn("absolute bg-red-500/25", isHorizontal ? "inset-y-0 left-0" : "inset-x-0 bottom-0")}
          style={isHorizontal ? { width: `${redPct}%` } : { height: `${redPct}%` }}
        />
        {/* Progresslinje */}
        <div
          className={cn("absolute bg-white/90", isHorizontal ? "h-full w-[2px]" : "w-full h-[2px]")}
          style={lineStyle}
        />
        {/* Emoji */}
        <div
          className="absolute text-lg select-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
          style={emojiStyle}
          aria-label="progress-emoji"
        >
          {runner}
        </div>
        {/* Återstående tid */}
        <div
          className="absolute text-[10px] text-neutral-200"
          style={remainingPosStyle}
        >
          {humanDelta(remaining)}
        </div>
      </div>
    );
  }

  const posStyle = isHorizontal
    ? { right: `calc(${progress * 100}% - ${dotSize}px)` }
    : { top: `calc(${progress * 100}% - ${dotSize}px)` };

  return (
    <div
      className={cn("w-full", className)}
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("relative", isHorizontal ? "h-6" : "h-full w-6 mx-auto")}> 
        {/* Bas-spår */}
        <div className={cn("absolute rounded-full bg-neutral-800/60 overflow-hidden", isHorizontal ? "inset-0" : "inset-y-0 inset-x-1")}> 
          {/* Fylld del (förbrukad tid) */}
          <div
            className={cn("absolute bg-neutral-700/40", isHorizontal ? "inset-y-0 right-0" : "inset-x-0 top-0")}
            style={isHorizontal ? { width: `${progress * 100}%` } : { height: `${progress * 100}%`}}
          />
          {/* Röd zon */}
          <div
            className={cn("absolute bg-red-500/25", isHorizontal ? "inset-y-0 left-0" : "inset-x-0 bottom-0")}
            style={isHorizontal ? { width: `${redPct}%` } : { height: `${redPct}%` }}
          />
        </div>

        {/* Hål (mål) */}
        <div className={cn("absolute grid place-items-center", isHorizontal ? "inset-y-0 left-0 w-4" : "left-0 right-0 bottom-0 h-4")}> 
          <div className="text-lg" aria-hidden="true">🕳️</div>
        </div>

        {/* Emoji-löpare */}
        <div className={cn("absolute text-lg select-none", isHorizontal ? "-top-1" : "-left-1") } style={posStyle} aria-label="progress-emoji">
          {runner}
        </div>

        {/* Återstående tid */}
        <div
          className={cn("absolute text-[10px] text-neutral-300", isHorizontal ? "-bottom-4" : "top-full mt-1 w-full text-center")}
          style={remainingPosStyle}
        >
          {humanDelta(remaining)}
        </div>
      </div>
    </div>
  );
}
