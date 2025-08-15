
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ProgressTrack from "@/components/ProgressTrackRtl";
import { humanDelta, speedEmojiByTotal } from "@/lib/progress";
import type { Event, Person, DayType, Role } from "@/types/event";
import { expandProfileForDate, RULES, PROFILES, classifyDay } from "@/lib/recurrence";
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
  const [autoDayType, setAutoDayType] = useState(false);
  const [manualDayType, setManualDayType] = useState<DayType>("SchoolDay");
  const currentDayType: DayType = autoDayType ? classifyDay(labDate, RULES) : manualDayType;


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

  const filledEvents = useMemo(() => {
      let allFilled: Event[] = [];
      const selected = persons.filter(p => selectedIds.includes(p.id));
      for (const p of (selected.length ? selected : persons)) {
          const personEvents = baseEvents.filter(e => e.personId === p.id);
          const filled = synthesizeDayFill(personEvents, p.id, new Date(labDate));
          allFilled.push(...filled);
      }
      return allFilled;
  }, [baseEvents, selectedIds, labDate]);

  const visEvents = useMemo(() => {
      return applyOverrides(filledEvents, overrides);
  }, [filledEvents, overrides]);

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
             <div className="text-xs space-x-2">
                <span className="px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700">Dagstyp: {currentDayType}</span>
                <span className="px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700">Events: {baseEvents.length}</span>
            </div>
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
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${selected.length || persons.length}, minmax(0, 1fr))`, transform: `translateY(-${(startIndex / (rows.length || 1)) * 100}%)`, gridAutoRows: 'min-content' }}>
          <div className="pointer-events-none absolute z-20 top-1/2 -translate-y-1/2 inset-x-0 h-[1px]">
             <div className="h-full border-t border-fuchsia-500/40 bg-fuchsia-500/5 flex items-center justify-center">
                 <div className="text-[10px] -translate-y-1/2 px-2 py-0.5 rounded-full bg-fuchsia-600/20 border border-fuchsia-500/40 text-fuchsia-300">NU {new Date(nowMs).toLocaleTimeString("sv-SE", {hour: '2-digit', minute: '2-digit'})}</div>
             </div>
          </div>
          
          {visibleRows.map((row, rIdx) => (
            <React.Fragment key={row.time+"-"+rIdx}>
              {(selected.length ? selected : persons).map((p) => {
                const isCenterRow = (startIndex + rIdx) === currentRowIndex;
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
        ...event,
        // Make sure array fields are handled correctly
        dependsOn: event.dependsOn ?? [],
        involved: event.involved ?? [],
    });
  }, [event]);

  if (!open) return null;

  const handleInvolvedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {value} = e.target;
    // Super-simple parsing for now: "person1:required,person2:helper"
    const involved = value.split(',').map(s => s.trim()).filter(Boolean).map(part => {
        const [personId, role = 'required'] = part.split(':');
        return { personId, role: role as Role };
    });
    setForm(f => ({ ...f, involved }));
  };

  const dependsCsv = (form.dependsOn ?? []).join(",");
  const involvedCsv = (form.involved ?? []).map(i => `${i.personId}:${i.role}`).join(", ");

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[380px] bg-neutral-950 border-l border-neutral-800 p-4 overflow-auto text-sm space-y-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Redigera Egenskaper</div>
          <button className="text-neutral-400" onClick={onClose}>✕</button>
        </div>

        {event ? (
          <>
            <div className="text-xs text-neutral-400 mb-2">Event ID: {event.id}</div>
            
            {/* Sektion 1: Grundinfo */}
            <div className="space-y-3 p-3 rounded-lg border border-neutral-800">
                <h4 className="font-medium text-neutral-200 text-xs uppercase tracking-wider">Grundinfo</h4>
                <div>
                  <label className="block mb-1 text-neutral-300">Vad heter händelsen?</label>
                  <input
                    className="w-full px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
                    value={form.title ?? ""}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block mb-1 text-neutral-300">Tillhör den en rutin (cluster)?</label>
                  <input
                    className="w-full px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
                    value={form.cluster ?? ""}
                    onChange={e => setForm(f => ({ ...f, cluster: e.target.value }))}
                    placeholder="T.ex. 'morgonrutin'"
                  />
                </div>
            </div>


            {/* Sektion 2: Tid & Typ */}
            <div className="space-y-3 p-3 rounded-lg border border-neutral-800">
                <h4 className="font-medium text-neutral-200 text-xs uppercase tracking-wider">Tid & Typ</h4>
                <div>
                    <label className="block mb-1 text-neutral-300">Hur många minuter tar detta som minst?</label>
                    <input
                    type="number"
                    className="w-full px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
                    value={form.minDurationMin ?? 0}
                    onChange={e => setForm(f => ({ ...f, minDurationMin: Number(e.target.value || 0) }))}
                    />
                </div>
                <div className="flex items-center gap-2">
                  <input id="fixedStart" type="checkbox" className="w-4 h-4" checked={!!form.fixedStart} onChange={e => setForm(f => ({ ...f, fixedStart: e.target.checked }))} />
                  <label htmlFor="fixedStart" className="text-neutral-300">Är starttiden helt fast?</label>
                </div>
                <div className="flex items-center gap-2">
                  <input id="fixedEnd" type="checkbox" className="w-4 h-4" checked={!!form.fixedEnd} onChange={e => setForm(f => ({ ...f, fixedEnd: e.target.checked }))} />
                  <label htmlFor="fixedEnd" className="text-neutral-300">Är sluttiden helt fast?</label>
                </div>
            </div>

            {/* Sektion 3: Beroenden & Resurser */}
            <div className="space-y-3 p-3 rounded-lg border border-neutral-800">
                <h4 className="font-medium text-neutral-200 text-xs uppercase tracking-wider">Beroenden & Resurser</h4>
                <div>
                    <label className="block mb-1 text-neutral-300">Kräver händelsen en speciell resurs?</label>
                    <select
                    className="w-full px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
                    value={form.resource ?? ""}
                    onChange={e => setForm(f => ({ ...f, resource: e.target.value || undefined }))}>
                    <option value="">Ingen</option>
                    <option value="bathroom">Badrummet</option>
                    <option value="car">Bilen</option>
                    <option value="kitchen">Köket</option>
                    </select>
                </div>
                 <div>
                    <label className="block mb-1 text-neutral-300">Var äger händelsen rum?</label>
                    <select
                    className="w-full px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
                    value={form.location ?? ""}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value || undefined }))}>
                    <option value="">Okänd</option>
                    <option value="home">Hemma</option>
                    <option value="school">Skola/Förskola</option>
                    <option value="work">Jobbet</option>
                    </select>
                </div>
                <div>
                    <label className="block mb-1 text-neutral-300">Måste andra händelser vara klara först? (IDs)</label>
                    <input
                    className="w-full px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
                    value={dependsCsv}
                    onChange={e => setForm(f => ({ ...f, dependsOn: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                    placeholder="Ange event-ID, separerade med kommatecken" />
                     <p className="text-xs text-neutral-500 mt-1">Ex: maria-morning-...,antony-prep-breakfast-...</p>
                </div>
            </div>

            {/* Sektion 4: Roller */}
             <div className="space-y-3 p-3 rounded-lg border border-neutral-800">
                <h4 className="font-medium text-neutral-200 text-xs uppercase tracking-wider">Roller & Involverade</h4>
                 <div className="flex items-center gap-2">
                  <input id="allowAlone" type="checkbox" className="w-4 h-4" checked={!!form.allowAlone} onChange={e => setForm(f => ({ ...f, allowAlone: e.target.checked }))} />
                  <label htmlFor="allowAlone" className="text-neutral-300">Kan detta göras ensam?</label>
                </div>
                 <div>
                    <label className="block mb-1 text-neutral-300">Vilka personer behövs (och vilken roll)?</label>
                    <input
                        className="w-full px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800"
                        value={involvedCsv}
                        onChange={handleInvolvedChange}
                        placeholder="Ex: 'antony:required, leia:helper'"
                    />
                     <p className="text-xs text-neutral-500 mt-1">Format: personId:roll. Roller är 'required' eller 'helper'.</p>
                </div>
            </div>

           
            <div className="mt-4 flex gap-2">
              <button
                className="px-3 py-1 rounded-md border border-neutral-700 bg-neutral-900 hover:bg-neutral-800"
                onClick={() => { onSave(form); onClose(); }}
              >
                Spara
              </button>
              <button className="px-3 py-1 rounded-md border border-transparent hover:bg-neutral-800/50" onClick={onClose}>
                Avbryt
              </button>
            </div>
          </>
        ) : (
          <div className="text-neutral-400 text-sm">
            <p>Ingen specifik händelse är vald för redigering.</p>
            <p className="mt-2">Klicka på en penna ✎ i rutnätet för att redigera en händelse.</p>
          </div>
        )}
      </div>
    </div>
  );
}
