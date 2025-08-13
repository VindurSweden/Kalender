import React, {useEffect, useMemo, useRef, useState} from "react";
import {useColumnScrollback} from "./hooks/useColumnScrollback";

export type GridEvent = {
  id: string; personId: string; title: string;
  start: string; end: string;
  minDurationMin?: number;
  fixedStart?: boolean; fixedEnd?: boolean;
  dependsOn?: string[];
  involved?: { personId: string; role: "required" | "helper" }[];
  resource?: string; location?: string; cluster?: string;
  meta?: { templateKey?: string; dayType?: "SchoolDay" | "OffDay" | "FritidsDay" };
};

export type Props = {
  events: GridEvent[];
  people: { id: string; name: string; color: string; emoji: string }[];
  nowMs: number;
  options?: {
    showMeta?: boolean;
    showAllProgress?: boolean;
    rowCount?: number;
    rowHeight?: number;
  };
  onAction?: (action:
    | { type: "klar"; eventId: string }
    | { type: "klarSent"; eventId: string }
    | { type: "ejKlar"; eventId: string }
  ) => void;
};

type Row = { startMs: number; events: Record<string, GridEvent | undefined> };

function buildRows(events: GridEvent[], people: Props["people"]): Row[] {
  const map = new Map<number, Row>();
  for (const ev of events) {
    const ms = Date.parse(ev.start);
    if (!map.has(ms)) map.set(ms, { startMs: ms, events: {} });
    map.get(ms)!.events[ev.personId] = ev;
  }
  return Array.from(map.values()).sort((a, b) => a.startMs - b.startMs);
}

function useRowRetain(rows: Row[], nowMs: number, count: number) {
  const [start, setStart] = useState(0);
  const retained = useRef<Row[]>([]);
  useEffect(() => {
    const idx = rows.findIndex(r => r.startMs > nowMs);
    const center = idx === -1 ? rows.length : idx;
    const desiredStart = Math.max(0, center - 2);
    if (desiredStart > start) {
      const passed = rows.slice(start, desiredStart);
      retained.current.push(...passed);
      if (retained.current.length > 2) retained.current.splice(0, retained.current.length - 2);
    } else if (desiredStart < start) {
      retained.current = [];
    }
    setStart(desiredStart);
  }, [rows, nowMs, start]);
  const baseCount = count - retained.current.length;
  const base = rows.slice(start, start + baseCount);
  return [...base, ...retained.current];
}

export function EventGrid({events, people, nowMs, options, onAction}: Props) {
  const rowCount = options?.rowCount ?? 5;
  const rowHeight = options?.rowHeight ?? 112;
  const rows = useMemo(() => buildRows(events, people), [events, people]);
  const visible = useRowRetain(rows, nowMs, rowCount);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(0);

  useEffect(() => {
    const idx = rows.findIndex(r => r.startMs > nowMs);
    const center = idx === -1 ? rows.length : idx;
    const desiredStart = Math.max(0, center - 2);
    if (desiredStart !== startRef.current) {
      const diff = (desiredStart - startRef.current) * rowHeight;
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = `translateY(${diff}px)`;
        requestAnimationFrame(() => {
          if (wrapperRef.current) wrapperRef.current.style.transform = "translateY(0)";
        });
      }
      startRef.current = desiredStart;
    }
  }, [rows, nowMs, rowHeight]);

  const {scrollPerson, open, close, touch} = useColumnScrollback();
  const history = useMemo(() => {
    if (!scrollPerson) return [];
    return rows.filter(r => r.startMs < nowMs).slice(-30).reverse();
  }, [rows, nowMs, scrollPerson]);

  return (
    <div className="relative">
      <div className="overflow-hidden" style={{height: rowCount * rowHeight}}>
        <div ref={wrapperRef} className="grid-clip-animate">
          {visible.map(row => (
            <div key={row.startMs} className="flex border-b" style={{height: rowHeight}}>
              {people.map(p => (
                <div key={p.id} className="flex-1 px-2 py-1" onMouseDown={() => open(p.id)}>
                  {row.events[p.id]?.title || ""}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {scrollPerson && (
        <div className="absolute inset-0 bg-black/40 flex" onMouseMove={touch} onClick={close}>
          {people.map(p => (
            <div key={p.id} className="flex-1 overflow-y-auto" style={{opacity: p.id===scrollPerson ? 1 : 0.2}}>
              {p.id===scrollPerson && history.map(h => (
                <div key={h.startMs} className="h-8 border-b px-2 text-sm flex items-center">
                  {h.events[p.id]?.title || ""}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
