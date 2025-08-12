
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Event, Person, Row, Override } from "@/types/event";
import { buildRows, applyOverrides, synthesizeDayFill, RESOURCES, whyBlocked, plannedEndMsForEvent, previewReplanProportional } from "@/lib/grid-utils";
import { GridCell } from './GridCell';

const t = (h: number, m: number = 0) => {
    const day = "2025-08-11";
    return `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}
const HHMM = (msOrDate: number | Date) => {
  const d = typeof msOrDate === "number" ? new Date(msOrDate) : msOrDate;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

const SLOTS = 5;

interface CalendarGridProps {
    people: Person[];
    events: Event[];
    onEventUpdate: (event: Event) => void;
    onEventDelete: (id: string) => void;
    onGenerateImage: (event: Event) => void;
}

export function CalendarGrid({ people, events, onEventUpdate, onEventDelete, onGenerateImage }: CalendarGridProps) {
    const [nowMs, setNowMs] = useState<number>(() => {
        const d = new Date();
        d.setHours(6, 0, 0, 0);
        return d.getTime();
    });
    const [playing, setPlaying] = useState<boolean>(true);
    const [speed, setSpeed] = useState<number>(60);
    const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
    const [completedUpTo, setCompletedUpTo] = useState<Map<string, number>>(new Map());
    const [showMeta, setShowMeta] = useState(false);
    const [flash, setFlash] = useState<null | { kind: "klar" | "late"; at: number }>(null);

    const rafId = useRef<number | null>(null);
    const lastTs = useRef<number | null>(null);
    
    const startOfDay = useMemo(() => {
        const d = new Date(nowMs);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }, [nowMs]);
    
    const endOfDay = useMemo(() => {
         const d = new Date(nowMs);
        d.setHours(23, 59, 59, 999);
        return d.getTime();
    }, [nowMs]);

    useEffect(() => {
        function step(ts: number) {
          const prev = lastTs.current ?? ts;
          const dt = ts - prev;
          lastTs.current = ts;
          const factor = 3600000 / (speed * 1000); 
          setNowMs(v => {
            const nv = v + dt * factor;
            return nv >= endOfDay ? startOfDay : nv;
          });
          rafId.current = requestAnimationFrame(step);
        }
        if (playing) rafId.current = requestAnimationFrame(step);
        return () => { if (rafId.current != null) cancelAnimationFrame(rafId.current); rafId.current = null; lastTs.current = null; };
    }, [playing, speed, startOfDay, endOfDay]);

    const filledEvents = useMemo(() => {
        let allFilled: Event[] = [];
        for (const p of people) {
            const personEvents = events.filter(e => e.personId === p.id);
            const filled = synthesizeDayFill(personEvents, p.id, new Date(nowMs));
            allFilled.push(...filled);
        }
        return allFilled;
    }, [events, people, nowMs]);
    
    const visEvents = useMemo(() => applyOverrides(filledEvents, overrides), [filledEvents, overrides]);
    const rows = useMemo(() => buildRows(visEvents, people), [visEvents, people]);

    const currentRowIndex = useMemo(() => {
        const idx = rows.findIndex(r => r.time > nowMs);
        if (idx === -1) return rows.length > 0 ? rows.length - 1 : 0;
        return Math.max(0, idx - 1);
    }, [rows, nowMs]);
    
    const centerIndex = Math.floor(SLOTS / 2);
    const startIndex = clamp(currentRowIndex - centerIndex, 0, Math.max(0, rows.length - SLOTS));
    const visibleRows = rows.slice(startIndex, startIndex + SLOTS);

    function setPersonCompleted(pId: string, upToMs: number) {
        setCompletedUpTo(prev => {
          const m = new Map(prev);
          m.set(pId, Math.max(upToMs, m.get(pId) ?? 0));
          return m;
        });
    }

    function handleKlar(eventId: string | null) {
      if (!eventId) return;
      const ev = visEvents.find(e => e.id === eventId);
      if (!ev) return;
      setPersonCompleted(ev.personId, nowMs);
      setFlash({ kind: "klar", at: Date.now() });
      setTimeout(() => setFlash(null), 800);
    }
  
    function handleKlarSent(eventId: string | null) {
      if (!eventId) return;
  
      const preview = previewReplanProportional(eventId, nowMs, visEvents);
  
      if ("patches" in preview) {
        setOverrides(prev => {
          const map = new Map(prev);
          for (const p of preview.patches) {
            const o = map.get(p.eventId) ?? {};
            o.startMs = p.newStartMs;
            if (p.newPlannedMs != null) o.plannedMs = p.newPlannedMs;
            map.set(p.eventId, o);
          }
          return map;
        });
      }
  
      const seed = visEvents.find(e => e.id === eventId);
      if (seed) setPersonCompleted(seed.personId, nowMs);
  
      if (preview.status === "insufficientFlex") {
        console.warn("Insufficient flex", {
          missingMin: Math.round((preview as any).missingMs/60000),
        });
      }
      setFlash({ kind: "late", at: Date.now() });
      setTimeout(() => setFlash(null), 1200);
    }
    
    const jumpTo = (h: number, m: number = 0) => {
        const d = new Date();
        d.setHours(h,m,0,0);
        setNowMs(d.getTime());
    }

    return (
        <div>
            {/* Controls */}
             <div className="mb-3 flex flex-wrap gap-2 items-center text-xs text-neutral-300">
                <button onClick={() => setPlaying(p => !p)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">{playing?"Paus":"Spela"}</button>
                <label className="flex items-center gap-2">
                    <select value={speed} onChange={(e)=> setSpeed(Number(e.target.value))} className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1">
                        <option value={2}>2 s/timme</option>
                        <option value={5}>5 s/timme</option>
                        <option value={10}>10 s/timme</option>
                        <option value={60}>60 s/timme</option>
                        <option value={180}>180 s/timme</option>
                    </select>
                </label>
                 <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} /> Visa metadata
                </label>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => jumpTo(7,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">07:00</button>
                    <button onClick={() => jumpTo(12,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">12:00</button>
                    <button onClick={() => jumpTo(18,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">18:00</button>
                </div>
            </div>

            {/* Grid */}
            <div className="rounded-2xl overflow-hidden border border-neutral-800">
                {/* Headers */}
                <div className="grid" style={{ gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))` }}>
                    {people.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 border-r last:border-r-0">
                            <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${p.bg.replace('bg-','from-').replace('/40','/80')} grid place-items-center text-sm`}>{p.emoji}</div>
                            <div className="text-sm font-medium truncate">{p.name}</div>
                        </div>
                    ))}
                </div>

                {/* Rows */}
                <div className="relative grid" style={{ gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))`, gridAutoRows: 'min-content' }}>
                    <div className="pointer-events-none absolute z-10 top-1/2 -translate-y-1/2 inset-x-0 h-[1px]">
                        <div className="h-full border-t border-fuchsia-500/40 bg-fuchsia-500/5 flex items-center justify-center">
                            <div className="text-[10px] -translate-y-1/2 px-2 py-0.5 rounded-full bg-fuchsia-600/20 border border-fuchsia-500/40 text-fuchsia-300">NU {HHMM(nowMs)}</div>
                        </div>
                    </div>

                    {visibleRows.map((row, rIdx) => (
                        <React.Fragment key={row.time + "-" + rIdx}>
                            {people.map(p => (
                                <GridCell 
                                    key={p.id + "-" + row.time}
                                    person={p}
                                    row={row}
                                    rIdx={rIdx}
                                    nowMs={nowMs}
                                    centerIndex={centerIndex}
                                    currentRowIndex={currentRowIndex}
                                    startIndex={startIndex}
                                    allEvents={visEvents}
                                    completedUpTo={completedUpTo.get(p.id)}
                                    showMeta={showMeta}
                                    onKlar={handleKlar}
                                    onKlarSent={handleKlarSent}
                                    onDelete={onEventDelete}
                                    onGenerateImage={onGenerateImage}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>
             {flash && (
                <div className="fixed right-4 bottom-4 z-50">
                <AnimatePresence>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                        <div className={`px-3 py-2 rounded-lg border ${flash.kind === "klar" ? "border-emerald-400/40 bg-emerald-600/15" : "border-amber-400/40 bg-amber-600/15"}`}>
                        {flash.kind === "klar" ? "✔️ Klart!" : "⏱️ Klar sent – omplanerar..."}
                        </div>
                    </motion.div>
                </AnimatePresence>
                </div>
            )}
        </div>
    );
}

