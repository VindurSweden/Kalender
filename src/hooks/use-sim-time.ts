import { useEffect, useRef, useState } from "react";

interface Options {
  startMs: number;
  endMs: number;
  initialMs: number;
}

export function useSimTime(
  playing: boolean,
  speedSecPerHour: number,
  opts: Options
) {
  const { startMs, endMs, initialMs } = opts;
  const [nowMs, setNowMs] = useState<number>(initialMs);
  const rafRef = useRef<number>();
  const lastTsRef = useRef<number>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const step = (ts: number) => {
      const prev = lastTsRef.current ?? ts;
      const dt = ts - prev;
      lastTsRef.current = ts;
      const factor = 3600000 / (speedSecPerHour * 1000);
      if (mountedRef.current) {
        setNowMs((v) => {
          const nv = v + dt * factor;
          return nv >= endMs ? startMs : nv;
        });
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
      lastTsRef.current = undefined;
    };
  }, [playing, speedSecPerHour, startMs, endMs]);

  return [nowMs, setNowMs] as const;
}
