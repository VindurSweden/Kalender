
"use client";
import React from "react";
import { humanDelta, speedEmojiByTotal } from "@/lib/progress";

type Props = {
  startMs: number;
  targetMs: number;
  nowMs: number;
  minDurationMs?: number; // röd zon (sista delen)
  rtl?: boolean;          // default true (höger->vänster)
  className?: string;
};

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export default function ProgressTrackRtl({ startMs, targetMs, nowMs, minDurationMs = 0, rtl = true, className = "" }: Props) {
  const total = Math.max(1, targetMs - startMs);
  const progress = clamp((nowMs - startMs) / total, 0, 1);
  const remaining = Math.max(0, targetMs - nowMs);
  const runner = speedEmojiByTotal(total);

  // röd zon: sista minDurationMs av total, förankrad i vänster kant (målet)
  const safeMin = Math.max(0, Math.min(minDurationMs, total));
  const redPct = (safeMin / total) * 100;

  const dotSize = 14; // px offset för emoji centreringskorrigering
  const posStyle = rtl
    ? { right: `calc(${progress * 100}% - ${dotSize}px)` }
    : { left: `calc(${progress * 100}% - ${dotSize}px)` };

  return (
    <div className={"w-full " + className} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="relative h-6">
        {/* Bas-spår */}
        <div className="absolute inset-0 rounded-full bg-neutral-800/60 overflow-hidden">
          {/* Fylld del (förbrukad tid) */}
          <div
            className={`absolute inset-y-0 ${rtl ? "right-0" : "left-0"} bg-neutral-700/40`}
            style={{ width: `${progress * 100}%` }}
          />
          {/* Röd zon (sista minDuration fram till hålet) */}
          <div className={`absolute inset-y-0 left-0 bg-red-500/25`} style={{ width: `${redPct}%` }} />
        </div>

        {/* Hål (mål) */}
        <div className="absolute inset-y-0 left-0 w-4 grid place-items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-black shadow-inner shadow-black/70" aria-hidden />
        </div>

        {/* Emoji-löpare */}
        <div className="absolute -top-1 text-lg select-none" style={posStyle} aria-label="progress-emoji">
          {runner}
        </div>

        {/* Återstående tid under löparen */}
        <div
          className="absolute -bottom-4 text-[10px] text-neutral-300"
          style={rtl ? { right: `calc(${progress * 100}% - ${dotSize + 4}px)` } : { left: `calc(${progress * 100}% - ${dotSize + 4}px)` }}
        >
          {humanDelta(remaining)}
        </div>
      </div>
    </div>
  );
}
