import React, {createContext, useContext, useEffect, useRef, useState} from "react";

type Mode = "system" | "simulated";

type TimeControls = {
  play: () => void;
  pause: () => void;
  setSpeed: (secondsPerHour: number) => void;
  jumpTo: (dateOrMs: number | Date | string) => void;
};

type TimeContext = {
  nowMs: number;
  mode: Mode;
} & TimeControls;

const Ctx = createContext<TimeContext | null>(null);

export function TimeProvider(
  {mode, children, initialMs}: {mode: Mode; children: React.ReactNode; initialMs?: number}
) {
  const [nowMs, setNowMs] = useState(() => initialMs ?? Date.now());
  const [speed, setSpeedState] = useState(5); // seconds per simulated hour
  const [playing, setPlaying] = useState(true);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (mode === "system") {
      const id = setInterval(() => setNowMs(Date.now()), 1000);
      return () => clearInterval(id);
    }
    if (!playing) return;
    const simFactor = 3600000 / (speed * 1000); // sim ms per real ms
    let prev: number;
    const step = (ts: number) => {
      if (prev == null) prev = ts;
      const delta = ts - prev;
      prev = ts;
      setNowMs(n => n + delta * simFactor);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, playing, speed]);

  const controls: TimeControls = {
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    setSpeed: (s) => setSpeedState(s),
    jumpTo: (d) => {
      const ms = d instanceof Date ? d.getTime() : typeof d === "number" ? d : Date.parse(d);
      setNowMs(ms);
    }
  };

  return <Ctx.Provider value={{nowMs, mode, ...controls}}>{children}</Ctx.Provider>;
}

export function useNowMs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNowMs must be used within TimeProvider");
  return ctx.nowMs;
}

export function useTimeControls() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTimeControls must be used within TimeProvider");
  const {play, pause, setSpeed, jumpTo, mode, nowMs} = ctx;
  return {play, pause, setSpeed, jumpTo, mode, nowMs};
}

export type {Mode as TimeMode};
