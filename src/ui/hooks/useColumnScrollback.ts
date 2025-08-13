import { useEffect, useState } from "react";

export function useColumnScrollback(autoSnapSec = 10) {
  const [state, setState] = useState<{personId: string | null; lastAt: number}>({personId: null, lastAt: 0});

  useEffect(() => {
    if (!state.personId) return;
    const id = setInterval(() => {
      if (Date.now() - state.lastAt > autoSnapSec * 1000) {
        setState({personId: null, lastAt: 0});
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state, autoSnapSec]);

  return {
    scrollPerson: state.personId,
    open: (personId: string) => setState({personId, lastAt: Date.now()}),
    close: () => setState({personId: null, lastAt: 0}),
    touch: () => setState(s => (s.personId ? {personId: s.personId, lastAt: Date.now()} : s)),
  };
}
