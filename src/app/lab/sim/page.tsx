
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ProgressTrackRtl from "@/components/ProgressTrackRtl";
import { humanDelta, speedEmojiByTotal } from "@/lib/progress";
import type { Event, Person, DayType } from "@/types/event";
import { expandDay, expandProfileForDate, RULES, PROFILES, classifyDay } from "@/lib/recurrence";
import { GridCell } from "@/components/calendar/GridCell";
import { cn } from "@/lib/utils";


// ========= Typer =========
type Override = { startMs?: number; plannedMs?: number };


// ========= Helpers =========
const day = "2025-08-11"; // godtycklig testdag
const t = (h: number, m: number = 0) => `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ========= Personer =========
const persons: Person[] = [
  { id: "maria", name: "Maria", color: "#C9A7FF", bg: "bg-purple-600/40", emoji: "👩" },
  { id: "leia", name: "Leia", color: "#F28CB2", bg: "bg-pink-600/40", emoji: "👧" },
  { id: "gabriel", name: "Gabriel", color: "#5B9BFF", bg: "bg-blue-600/40", emoji: "🧒" },
  { id: "antony", name: "Antony", color: "#8AE68C", bg: "bg-green-600/40", emoji: "👨‍🦱" },
];


// ========================= Grid Imports =========================
import {
  buildRows,
  applyOverrides,
  synthesizeDayFill,
  previewReplanProportional,
  whyBlocked,
  plannedEndMsForEvent,
} from "@/lib/grid-utils";

// ========= Komponent =========
export default function LabSimPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>(persons.map(p=>p.id));
  const [showMeta, setShowMeta] = useState(false);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [completedUpTo, setCompletedUpTo] = useState<Map<string, number>>(new Map());

  const [speed, setSpeed] = useState<number>(5);
  const [playing, setPlaying] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(() => +new Date(t(6, 0)));
  const startOfDay = +new Date(t(0,0));
  const endOfDay = +new Date(t(24,0));
  const rafId = useRef<number | null>(null);
  const lastTs = useRef<number | null>(null);
  
  const [baseEvents, setBaseEvents] = useState<Event[]>([]);
  const [labDate, setLabDate] = useState(day);
  const [autoDayType, setAutoDayType] = useState(true);
  const [manualDayType, setManualDayType] = useState<DayType>("SchoolDay");

  const [flash, setFlash] = useState<null | { kind: "klar" | "late"; at: number }>(null);

  // Inställningspanel
  const [showSettings, setShowSettings] = useState(false);
  const [editEventId, setEditEventId] = useState<string | null>(null);

  // "Ej klar" ack per event (UI-status, ingen planeringspåverkan)
  const [lateAck, setLateAck] = useState<Set<string>>(new Set());

  function handleEjKlar(eventId: string) {
    setLateAck(prev => {
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
  }

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
  }, [playing, speed]);
  
  useEffect(() => {
    handleGenerateDay();
  }, [labDate, autoDayType, manualDayType]);

  const visEvents = useMemo(() => {
      const filled = synthesizeDayFill(baseEvents, 'leia', new Date(labDate)); // Example person
      return applyOverrides(filled, overrides);
  }, [baseEvents, overrides, labDate]);

  const selected = useMemo(() => persons.filter(p => selectedIds.includes(p.id)), [selectedIds]);
  const rows = useMemo(() => buildRows(visEvents, selected.length ? selected : persons), [visEvents, selected]);

  const currentRowIndex = useMemo(() => {
    const idx = rows.findIndex(r => r.time > nowMs);
    return Math.max(0, idx === -1 ? rows.length -1 : idx - 1);
  }, [rows, nowMs]);
  
  const SLOTS = 5;
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
  
  const jumpTo = (h: number, m: number = 0) => setNowMs(+new Date(t(h, m)));

  function handleGenerateDay() {
    const type = autoDayType ? classifyDay(labDate, RULES) : manualDayType;
    const tomorrowType = classifyDay(new Date(new Date(labDate).getTime() + 86400000).toISOString().slice(0, 10), RULES);
    const events = expandProfileForDate(labDate, PROFILES[type], tomorrowType);
    setBaseEvents(events);
  }

  return (
    <div className="w-full min-h-screen bg-neutral-950 text-neutral-50 p-3">
      {/* Kontroller */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        {persons.map((p) => (
          <button key={p.id} onClick={() => setSelectedIds(prev => prev.includes(p.id)? prev.filter(x=>x!==p.id): [...prev, p.id])} className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedIds.includes(p.id)?`border-white/60`:`border-white/10`}`} style={{backgroundColor: selectedIds.includes(p.id) ? `${p.color}33`: 'transparent'}}>
            <span className="mr-1.5">{p.emoji}</span>{p.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button onClick={() => setPlaying(p => !p)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">{playing?"Paus":"Spela"}</button>
          <select value={speed} onChange={(e)=> setSpeed(Number(e.target.value))} className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1">
            <option value={2}>2 s/timme</option>
            <option value={5}>5 s/timme</option>
            <option value={10}>10 s/timme</option>
            <option value={60}>60 s/timme</option>
          </select>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} />
            Visa metadata
          </label>
          <button onClick={() => jumpTo(7,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">07:00</button>
          <button
            onClick={() => { setEditEventId(null); setShowSettings(true); }}
            className="px-2 py-1 rounded-2xl border bg-neutral-900 border-neutral-800"
            title="Inställningar"
          >
            ⚙️
          </button>
        </div>
      </div>
      
      {/* Labb-kontroller */}
       <div className="my-3 p-3 rounded-lg border border-neutral-800 bg-neutral-900 flex items-center gap-4">
            <label className="flex items-center gap-2">
                Datum:
                <input type="date" value={labDate} onChange={e => setLabDate(e.target.value)} className="bg-neutral-800 border-neutral-700 rounded-md px-2 py-1 text-sm"/>
            </label>
            <label className="flex items-center gap-2">
                <input type="checkbox" checked={autoDayType} onChange={e => setAutoDayType(e.target.checked)} />
                Auto-dagstyp
            </label>
            <select value={manualDayType} onChange={e => setManualDayType(e.target.value as DayType)} disabled={autoDayType} className="bg-neutral-800 border-neutral-700 rounded-md px-2 py-1 text-sm disabled:opacity-50">
                <option value="SchoolDay">Skoldag</option>
                <option value="OffDay">Fridag/Lov</option>
                <option value="FritidsDay">Fritidsdag</option>
            </select>
            <button onClick={handleGenerateDay} className="px-3 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700">Generera dag</button>
      </div>

      {/* Nu-info */}
      <div className="mb-3 text-xs text-neutral-300 flex items-center gap-3">
        <div className="px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800">Nu (sim): {new Date(nowMs).toLocaleTimeString("sv-SE", {hour: '2-digit', minute: '2-digit'})}</div>
      </div>

      {/* GRID 5 rader med NU i mitten */}
      <div className="rounded-2xl overflow-hidden border border-neutral-800">
        {/* Kolumnhuvuden */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${selected.length || persons.length}, minmax(0, 1fr))` }}>
          {(selected.length ? selected : persons).map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 border-r last:border-r-0">
               <div className={cn("w-7 h-7 rounded-xl grid place-items-center text-sm", p.bg.replace('bg-','bg-gradient-to-br from-').replace('/40','/80'))}>{p.emoji}</div>
              <div className="text-sm font-medium truncate">{p.name}</div>
            </div>
          ))}
        </div>

        {/* Rader */}
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${selected.length || persons.length}, minmax(0, 1fr))`, gridAutoRows: 'min-content' }}>
          <div className="pointer-events-none absolute z-20 top-1/2 -translate-y-1/2 inset-x-0 h-[1px]">
             <div className="h-full border-t border-fuchsia-500/40 bg-fuchsia-500/5 flex items-center justify-center">
                 <div className="text-[10px] -translate-y-1/2 px-2 py-0.5 rounded-full bg-fuchsia-600/20 border border-fuchsia-500/40 text-fuchsia-300">NU {new Date(nowMs).toLocaleTimeString("sv-SE", {hour: '2-digit', minute: '2-digit'})}</div>
             </div>
          </div>
          
          {visibleRows.map((row, rIdx) => (
            <React.Fragment key={row.time+"-"+rIdx}>
              {(selected.length ? selected : persons).map((p) => {
                return (
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
                        allPeople={persons}
                        completedUpTo={completedUpTo.get(p.id)}
                        showMeta={showMeta}
                        onKlar={handleKlar}
                        onKlarSent={handleKlarSent}
                        onEdit={(ev) => { setEditEventId(ev.id); setShowSettings(true);}}
                        onGenerateImage={(ev) => console.log("Generera bild (labb):", ev.title)}
                        onDelete={(id) => console.log("Ta bort (labb):", id)}
                    />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

       <SettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
        event={(editEventId ? visEvents.find(e => e.id === editEventId) : null)}
        onSave={(patch) => {
          if (!editEventId) return;
          console.log("SAVE meta patch for", editEventId, patch);
        }}
      />
    </div>
  );
}


function SettingsDrawer({
  open,
  onClose,
  event,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  event: Event | null;
  onSave: (patch: Partial<Event>) => void;
}) {
  const [form, setForm] = React.useState<Partial<Event>>({});

  useEffect(() => {
    if (!event) { setForm({}); return; }
    setForm({
      title: event.title,
      location: event.location,
      resource: event.resource,
      minDurationMin: event.minDurationMin,
      fixedStart: !!event.fixedStart,
      dependsOn: event.dependsOn,
    });
  }, [event]);

  if (!open) return null;

  const dependsCsv = (form.dependsOn ?? []).join(",");

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[360px] bg-neutral-950 border-l border-neutral-800 p-4 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Inställningar</div>
          <button className="text-neutral-400" onClick={onClose}>✕</button>
        </div>

        {event ? (
          <>
            <div className="text-xs text-neutral-400 mb-2">Event ID: {event.id}</div>

            <label className="block text-sm mb-1">Titel</label>
            <input
              className="w-full mb-3 px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
              value={form.title ?? ""}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />

            <label className="block text-sm mb-1">Minsta tid (min)</label>
            <input
              type="number"
              className="w-full mb-3 px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
              value={form.minDurationMin ?? 0}
              onChange={e => setForm(f => ({ ...f, minDurationMin: Number(e.target.value || 0) }))}
            />

            <div className="flex items-center gap-2 mb-3">
              <input
                id="fixedStart"
                type="checkbox"
                checked={!!form.fixedStart}
                onChange={e => setForm(f => ({ ...f, fixedStart: e.target.checked }))}
              />
              <label htmlFor="fixedStart" className="text-sm">Fixed start</label>
            </div>

            <label className="block text-sm mb-1">Resurs</label>
            <select
              className="w-full mb-3 px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
              value={form.resource ?? ""}
              onChange={e => setForm(f => ({ ...f, resource: e.target.value || undefined }))}
            >
              <option value="">—</option>
              <option value="bathroom">bathroom</option>
              <option value="car">car</option>
            </select>

            <label className="block text-sm mb-1">Plats</label>
            <select
              className="w-full mb-3 px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
              value={form.location ?? ""}
              onChange={e => setForm(f => ({ ...f, location: e.target.value || undefined }))}
            >
              <option value="">—</option>
              <option value="home">home</option>
              <option value="school">school</option>
              <option value="work">work</option>
            </select>

            <label className="block text-sm mb-1">dependsOn (CSV med event-ID)</label>
            <input
              className="w-full mb-3 px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
              value={dependsCsv}
              onChange={e => setForm(f => ({ ...f, dependsOn: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
              placeholder="ex: maria-06-07,ant-foo-01"
            />

            <div className="mt-4 flex gap-2">
              <button
                className="px-3 py-1 rounded-md border border-neutral-700 bg-neutral-900"
                onClick={() => { onSave(form); onClose(); }}
              >
                Spara
              </button>
              <button className="px-3 py-1 rounded-md border border-neutral-800 bg-neutral-900/40" onClick={onClose}>
                Avbryt
              </button>
            </div>
          </>
        ) : (
          <div className="text-neutral-400 text-sm">
            Ingen specifik händelse vald. Klicka ✎ på en cell för att redigera ett event,
            eller stäng och välj ett event i griden.
          </div>
        )}
      </div>
    </div>
  );
}

    

    