
"use client";
import React, { useEffect, useRef, useState } from "react";
import ProgressTrack from "@/components/ProgressTrackRtl";

const day = "2025-08-11";
const t = (h: number, m: number = 0) => `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

type Segment = {
  id: string;
  title: string;
  start: string;     // ISO
  nextStart: string; // ISO
  minDurationMin?: number;
};

const segments: Segment[] = [
  { id: "maria-0700", title: "Morgonrutin (Maria)", start: t(7,0), nextStart: t(8,0), minDurationMin: 15 },
  { id: "leia-0708", title: "Borsta tänder (Leia)", start: t(7,8), nextStart: t(7,16), minDurationMin: 2 },
  { id: "gab-0720", title: "Frukost (Gabriel)", start: t(7,20), nextStart: t(7,40), minDurationMin: 5 },
  { id: "fam-1800", title: "Middag (Familj)", start: t(18,0), nextStart: t(19,0), minDurationMin: 20 },
];

const toMs = (iso: string) => +new Date(iso);

export default function RtlProgressLab() {
  // Simulerad klocka: 1h = 5s IRL
  const [speedSecPerHour, setSpeed] = useState(5);
  const [playing, setPlaying] = useState(true);
  const [nowMs, setNowMs] = useState(+new Date(t(6,0)));
  const [displayTime, setDisplayTime] = useState("");
  const startOfDay = +new Date(t(0,0));
  const endOfDay = +new Date(t(24,0));
  const rafId = useRef<number | null>(null);
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    function step(ts: number) {
      const prev = lastTs.current ?? ts;
      const dt = ts - prev;
      lastTs.current = ts;
      const factor = 3600000 / (speedSecPerHour * 1000); // kalender-ms per IRL-ms
      setNowMs((v) => {
        const nv = v + dt * factor;
        return nv >= endOfDay ? startOfDay : nv;
      });
      rafId.current = requestAnimationFrame(step);
    }
    if (playing) rafId.current = requestAnimationFrame(step);
    return () => { if (rafId.current != null) cancelAnimationFrame(rafId.current); rafId.current = null; lastTs.current = null; };
  }, [playing, speedSecPerHour, endOfDay, startOfDay]);

  useEffect(() => {
    // Format time on client to avoid hydration mismatch
    setDisplayTime(new Date(nowMs).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}));
  }, [nowMs]);

  return (
    <div className="w-full min-h-screen bg-neutral-950 text-neutral-50 p-4">
      <div className="mb-4 flex gap-2 items-center">
        <button className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800" onClick={()=>setPlaying(p=>!p)}>{playing?"Paus":"Spela"}</button>
        <label className="flex items-center gap-2">
          Hastighet
          <select value={speedSecPerHour} onChange={(e)=>setSpeed(Number(e.target.value))} className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1">
            <option value={2}>2 s/timme</option>
            <option value={5}>5 s/timme</option>
            <option value={10}>10 s/timme</option>
            <option value={60}>60 s/timme</option>
          </select>
        </label>
        <div className="ml-auto text-xs text-neutral-300">Nu (sim): {displayTime}</div>
      </div>

      <div className="space-y-6">
        {segments.map(seg => (
          <div key={seg.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900/30">
            <div className="text-xs text-neutral-400 mb-1">{new Date(seg.start).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} → {new Date(seg.nextStart).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</div>
            <div className="text-sm mb-2">{seg.title}</div>
            <ProgressTrack
              startMs={toMs(seg.start)}
              targetMs={toMs(seg.nextStart)}
              nowMs={nowMs}
              minDurationMs={(seg.minDurationMin ?? 0) * 60000}
              direction="horizontal"
            />
          </div>
        ))}
      </div>

      <div className="mt-6 text-xs text-neutral-400">
        <p>Spåret fylls från <strong>höger → vänster</strong>. 🕳️ i vänsterkanten är nästa event. Röd zon visar sista <em>minsta möjliga</em> tid för att hinna.</p>
      </div>
    </div>
  );
}
