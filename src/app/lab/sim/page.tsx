"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

// =====================================
// Enkel labbsida du kan lägga i din repo
// Spara denna fil som: src/app/lab/sim/page.tsx
// Starta: npm run dev
// Öppna: http://localhost:3000/lab/sim
// =====================================

// ========= Typer =========
type Person = { id: string; name: string; color: string; emoji: string };
type Event = {
  id: string;
  personId: string;
  start: string; // ISO start
  end: string;   // ISO slut (används bara som fallback)
  title: string;
  minDurationMin?: number; // röd zon-demonstration (frivillig)
  meta?: { synthetic?: boolean };
};
type Row = { time: number; cells: Map<string, Event> };

// ========= Helpers =========
const day = "2025-08-11"; // godtycklig testdag
const t = (h: number, m: number = 0) => `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
const HHMM = (msOrDate: number | Date) => {
  const d = typeof msOrDate === "number" ? new Date(msOrDate) : msOrDate;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const humanDelta = (ms: number) => {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

// ========= Personer =========
const persons: Person[] = [
  { id: "maria", name: "Maria", color: "from-rose-500 to-rose-700", emoji: "👩" },
  { id: "leia", name: "Leia", color: "from-emerald-500 to-teal-600", emoji: "👧" },
  { id: "gabriel", name: "Gabriel", color: "from-amber-500 to-orange-600", emoji: "🧒" },
];

// ========= Ikoner (emoji) =========
const activityIcon: Array<[RegExp, string]> = [
  [/\bSover\b/i, "😴"],
  [/\bMorgonrutin\b/i, "☀️"],
  [/\bBorsta tänder\b/i, "🦷"],
  [/\bBorsta hår\b/i, "💇"],
  [/\bFrukost|Äta/i, "🥣"],
  [/\bVitaminer/i, "💊"],
  [/\bKlä på/i, "👕"],
  [/\bPacka/i, "🎒"],
  [/\bJobb|Arbete/i, "💻"],
  [/\bSkola/i, "🏫"],
  [/\bFritids/i, "🧩"],
  [/\bHämtar|Blir hämtad/i, "🚗"],
  [/\bMiddag/i, "🍽️"],
  [/\bKvällsrutin/i, "🌙"],
];
const iconFor = (title: string) => {
  for (const [re, ico] of activityIcon) if (re.test(title)) return ico;
  return "📌";
};

// ========= Testevents =========
// 07–08: Maria=1, Leia=7, Gabriel=3 (dina regler)
const mariaEvents: Event[] = [
  { id: "maria-06-07", personId: "maria", start: t(6), end: t(7), title: "Vaknar & kaffe", minDurationMin: 10 },
  { id: "maria-07-08", personId: "maria", start: t(7), end: t(8), title: "Morgonrutin", minDurationMin: 15 },
  { id: "maria-08-12", personId: "maria", start: t(8), end: t(12), title: "Jobb (förmiddag)" },
  { id: "maria-12-13", personId: "maria", start: t(12), end: t(13), title: "Lunch", minDurationMin: 20 },
  { id: "maria-13-16", personId: "maria", start: t(13), end: t(16), title: "Jobb (eftermiddag)" },
  { id: "maria-16-17", personId: "maria", start: `${day}T16:30:00`, end: t(17), title: "Hämtar Leia (fritids)" },
  { id: "maria-18-19", personId: "maria", start: t(18), end: t(19), title: "Middag", minDurationMin: 20 },
];

const leia07_08: Event[] = [
  { id: "leia-07-00", personId: "leia", start: t(7, 0), end: t(7, 8), title: "Vakna", minDurationMin: 2 },
  { id: "leia-07-08", personId: "leia", start: t(7, 8), end: t(7, 16), title: "Borsta tänder", minDurationMin: 2 },
  { id: "leia-07-16", personId: "leia", start: t(7, 16), end: t(7, 24), title: "Äta frukost", minDurationMin: 5 },
  { id: "leia-07-24", personId: "leia", start: t(7, 24), end: t(7, 32), title: "Ta vitaminer", minDurationMin: 1 },
  { id: "leia-07-32", personId: "leia", start: t(7, 32), end: t(7, 40), title: "Borsta hår", minDurationMin: 2 },
  { id: "leia-07-40", personId: "leia", start: t(7, 40), end: t(7, 48), title: "Klä på sig", minDurationMin: 4 },
  { id: "leia-07-48", personId: "leia", start: t(7, 48), end: t(8, 0), title: "Packa väska & skor", minDurationMin: 4 },
];

const leiaEvents: Event[] = [
  ...leia07_08,
  { id: "leia-08-13", personId: "leia", start: t(8), end: t(13), title: "Skola" },
  { id: "leia-13-1630", personId: "leia", start: t(13), end: `${day}T16:30:00`, title: "Fritids" },
  { id: "leia-1630-17", personId: "leia", start: `${day}T16:30:00`, end: t(17), title: "Blir hämtad (fritids)", minDurationMin: 5 },
  { id: "leia-18-19", personId: "leia", start: t(18), end: t(19), title: "Middag", minDurationMin: 20 },
];

const gabriel07_08: Event[] = [
  { id: "gab-07-00", personId: "gabriel", start: t(7, 0), end: t(7, 20), title: "Vakna & påklädning", minDurationMin: 6 },
  { id: "gab-07-20", personId: "gabriel", start: t(7, 20), end: t(7, 40), title: "Frukost", minDurationMin: 8 },
  { id: "gab-07-40", personId: "gabriel", start: t(7, 40), end: t(8, 0), title: "Tänder & skor", minDurationMin: 4 },
];

const gabrielEvents: Event[] = [
  ...gabriel07_08,
  { id: "gab-08-13", personId: "gabriel", start: t(8), end: t(13), title: "Förskola" },
  { id: "gab-13-16", personId: "gabriel", start: t(13), end: t(16), title: "Lek & mellis" },
  { id: "gab-18-19", personId: "gabriel", start: t(18), end: t(19), title: "Middag", minDurationMin: 15 },
];

const baseEvents: Event[] = [...mariaEvents, ...leiaEvents, ...gabrielEvents];

// ========= Gridlogik (event-buckets) =========
const SLOTS = 5; // visar alltid 5 rader (händelsebaserat, ej varaktighet)
const EPSILON_MS = 0; // "samtidigt" = exakt samma start

const groupByPerson = (events: Event[]) => {
  const map = new Map<string, Event[]>();
  for (const e of events) { if (!map.has(e.personId)) map.set(e.personId, []); map.get(e.personId)!.push(e); }
  for (const [, list] of map) list.sort((a,b) => +new Date(a.start) - +new Date(b.start));
  return map;
};

function buildRows(allEvents: Event[], selected: Person[]): Row[] {
  const byP = groupByPerson(allEvents.filter(e => selected.some(p => p.id === e.personId)));
  const cursors = new Map(selected.map(p => [p.id, 0] as const));
  const rows: Row[] = [];
  while (true) {
    let next: { pid: string; ev: Event } | null = null;
    for (const p of selected) {
      const list = byP.get(p.id) || [];
      const i = cursors.get(p.id)!;
      if (i < list.length) {
        const ev = list[i];
        if (!next || +new Date(ev.start) < +new Date(next.ev.start)) next = { pid: p.id, ev };
      }
    }
    if (!next) break;
    const t0 = +new Date(next.ev.start);
    const row: Row = { time: t0, cells: new Map() };
    for (const p of selected) {
      const list = byP.get(p.id) || [];
      const i = cursors.get(p.id)!;
      if (i < list.length) {
        const ev = list[i];
        if (Math.abs(+new Date(ev.start) - t0) <= EPSILON_MS) { row.cells.set(p.id, ev); cursors.set(p.id, i + 1); }
      }
    }
    rows.push(row);
  }
  return rows;
}

function isOngoing(ev: Event, atMs: number) {
  const s = +new Date(ev.start), e = +new Date(ev.end);
  return s <= atMs && atMs < e;
}

function toOngoingTitle(title: string) {
  if (/^Hämtar/i.test(title)) return `${title} (pågår)`;
  if (/^Blir hämtad/i.test(title)) return `Väntar (pågår)`;
  if (/^Äta|Frukost/i.test(title)) return `${title} (pågår)`;
  return `${title} (pågår)`;
}

function currentAndNextForPerson(personId: string, nowMs: number) {
  const list = baseEvents
    .filter(e => e.personId === personId)
    .sort((a,b) => +new Date(a.start) - +new Date(b.start));
  let current: Event | null = null;
  let next: Event | null = null;
  for (let i = 0; i < list.length; i++) {
    const s = +new Date(list[i].start);
    const e = +new Date(list[i].end);
    if (s <= nowMs && nowMs < e) {
      current = list[i];
      next = list[i+1] ?? null;
      break;
    }
    if (nowMs < s) { next = list[i]; break; }
  }
  return { current, next };
}

// ========= Hastighets-emoji =========
function speedEmojiByTotal(totalMs: number): string {
  const mins = totalMs / 60000;
  if (mins < 2) return "🏎️";
  if (mins < 5) return "🐆";
  if (mins < 10) return "🐎";
  if (mins < 20) return "🦏";
  if (mins < 40) return "🐖";
  if (mins < 90) return "🚶‍♂️";
  if (mins < 180) return "🐢";
  if (mins < 300) return "🦀";
  return "🐌";
}

// ========= Komponent =========
export default function LabSimPage() {
  // Val och simtid
  const [selectedIds, setSelectedIds] = useState<string[]>(persons.map(p=>p.id));
  const [showAllProgress, setShowAllProgress] = useState(false);

  const [speed, setSpeed] = useState<number>(5);     // 1h = 5s IRL
  const [playing, setPlaying] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(+new Date(t(7, 0))); // start 07:00
  const startOfDay = +new Date(t(6,0));
  const endOfDay = +new Date(t(24,0));
  const rafId = useRef<number | null>(null);
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    function step(ts: number) {
      const prev = lastTs.current ?? ts;
      const dt = ts - prev;
      lastTs.current = ts;
      const factor = 3600000 / (speed * 1000); // kalender-ms per IRL-ms
      setNowMs(v => {
        const nv = v + dt * factor;
        return nv >= endOfDay ? startOfDay : nv;
      });
      rafId.current = requestAnimationFrame(step);
    }
    if (playing) rafId.current = requestAnimationFrame(step);
    return () => { if (rafId.current != null) cancelAnimationFrame(rafId.current); rafId.current = null; lastTs.current = null; };
  }, [playing, speed]);

  // Härleda rader
  const selected = useMemo(() => persons.filter(p => selectedIds.includes(p.id)), [selectedIds]);
  const rows = useMemo(() => buildRows(baseEvents, selected.length ? selected : persons), [selected]);

  // Centrera NU (slot 3 av 5)
  const S = SLOTS;
  const centerIndex = Math.floor(S / 2);
  const currentRowIndex = useMemo(() => {
    const idx = rows.findIndex(r => r.time >= nowMs);
    return idx === -1 ? rows.length - 1 : idx;
  }, [rows, nowMs]);
  const startIndex = clamp(currentRowIndex - centerIndex, 0, Math.max(0, rows.length - S));
  const visibleRows = rows.slice(startIndex, startIndex + S);

  // Till middag (demo)
  const nextDinner = useMemo(() => {
    const ids = new Set(selected.map(p => p.id));
    const upcoming = baseEvents
      .filter(e => ids.has(e.personId) && /\bMiddag\b/i.test(e.title) && +new Date(e.start) >= nowMs)
      .sort((a,b) => +new Date(a.start) - +new Date(b.start))[0];
    return upcoming || null;
  }, [selected, nowMs]);
  const tillMiddag = nextDinner ? humanDelta(+new Date(nextDinner.start) - nowMs) : null;

  // Cellhelpers (titel & tid enligt din regel)
  function presentTitle(pId: string, row: Row): { title: string; repeat: boolean } {
    const ev = row.cells.get(pId) || null;
    if (ev) return { title: ev.title, repeat: false };
    const list = baseEvents.filter(e => e.personId === pId).sort((a,b) => +new Date(a.start) - +new Date(b.start));
    const idx = list.findIndex(e => +new Date(e.start) >= row.time);
    const prev = idx === -1 ? list[list.length-1] : list[Math.max(0, idx-1)];
    if (prev && isOngoing(prev, row.time)) return { title: toOngoingTitle(prev.title), repeat: true };
    return { title: "—", repeat: false };
  }
  function cellTimeLabel(pId: string, row: Row): string {
    const ev = row.cells.get(pId) || null;
    if (ev) return HHMM(new Date(ev.start));
    return HHMM(row.time);
  }

  // ========= Progress-spår (höger→vänster) =========
  function ProgressTicker({ personId }: { personId: string }) {
    const { current, next } = currentAndNextForPerson(personId, nowMs);
    if (!current || !next) return null;
    const start = +new Date(current.start);
    const target = +new Date(next.start);
    if (!(start <= nowMs && nowMs <= target)) return null;

    const total = Math.max(1, target - start);
    const remaining = Math.max(0, target - nowMs);
    const progress = clamp((nowMs - start) / total, 0, 1);
    const runner = speedEmojiByTotal(total);

    const minMs = (current.minDurationMin ?? 0) * 60000;
    const redPct = clamp(minMs / total, 0, 1) * 100;

    const posStyle = { right: `calc(${progress * 100}% - 10px)` }; // RTL: löparen går höger→vänster

    return (
      <div className="mt-2 w-full">
        <div className="relative h-6">
          <div className="absolute inset-0 rounded-full bg-neutral-800/60 overflow-hidden">
            {/* Fylld del */}
            <div className={`absolute inset-y-0 right-0 bg-neutral-700/40`} style={{ width: `${progress*100}%` }} />
            {/* Röd zon (sista minDuration fram till hålet) */}
            <div className="absolute inset-y-0 left-0 bg-red-500/25" style={{ width: `${redPct}%` }} />
          </div>
          {/* Hål (mål) */}
          <div className="absolute inset-y-0 left-0 w-4 grid place-items-center">
            <div className="text-lg" aria-hidden="true">🕳️</div>
          </div>
          {/* Emoji-löpare */}
          <div className="absolute -top-1 text-lg select-none" style={posStyle} aria-label="progress-emoji">{runner}</div>
          {/* Återstående */}
          <div className="absolute -bottom-4 text-[10px] text-neutral-300" style={{ right: `calc(${progress*100}% - 14px)` }}>{humanDelta(remaining)}</div>
        </div>
      </div>
    );
  }

  // Hoppa i tiden (demo-knappar)
  const jumpTo = (h: number, m: number = 0) => setNowMs(+new Date(t(h, m)));

  return (
    <div className="w-full min-h-screen bg-neutral-950 text-neutral-50 p-3">
      {/* Kontroller */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        {persons.map((p) => (
          <button key={p.id} onClick={() => setSelectedIds(prev => prev.includes(p.id)? prev.filter(x=>x!==p.id): [...prev, p.id])} className={`px-3 py-1 rounded-2xl text-sm border ${selectedIds.includes(p.id)?"bg-neutral-800 border-neutral-700":"bg-neutral-900 border-neutral-800"}`}>
            <span className="mr-1">{p.emoji}</span>{p.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button onClick={() => setPlaying(p => !p)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">{playing?"Paus":"Spela"}</button>
          <label className="flex items-center gap-2">
            Hastighet
            <select value={speed} onChange={(e)=> setSpeed(Number(e.target.value))} className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1">
              <option value={2}>2 s/timme</option>
              <option value={5}>5 s/timme</option>
              <option value={10}>10 s/timme</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showAllProgress} onChange={(e)=> setShowAllProgress(e.target.checked)} />
            Progress på alla rader
          </label>
          <button onClick={() => jumpTo(7,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">07:00</button>
          <button onClick={() => jumpTo(12,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">12:00</button>
          <button onClick={() => jumpTo(18,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">18:00</button>
        </div>
      </div>

      {/* Nu-info */}
      <div className="mb-3 text-xs text-neutral-300 flex items-center gap-3">
        <div className="px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800">Nu (sim): {HHMM(nowMs)}</div>
        {tillMiddag && (
          <div className="px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800">Till Middag: {tillMiddag}</div>
        )}
      </div>

      {/* GRID 5 rader med NU i mitten */}
      <div className="rounded-2xl overflow-hidden border border-neutral-800">
        {/* Kolumnhuvuden */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${selected.length || persons.length}, minmax(0, 1fr))` }}>
          {(selected.length ? selected : persons).map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800">
              <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${p.color} grid place-items-center text-sm`}>{p.emoji}</div>
              <div className="text-sm font-medium truncate">{p.name}</div>
            </div>
          ))}
        </div>

        {/* Rader */}
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${selected.length || persons.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${S}, 112px)` }}>
          {/* NU-markering över mittenraden */}
          <div className="pointer-events-none absolute inset-x-0" style={{ top: `calc(${centerIndex} * 112px)` }}>
            <div className="h-[112px] border-y border-fuchsia-500/40 bg-fuchsia-500/5 grid place-items-center">
              <div className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-600/20 border border-fuchsia-500/40 text-fuchsia-300">NU</div>
            </div>
          </div>

          {visibleRows.map((row, rIdx) => (
            <React.Fragment key={row.time+"-"+rIdx}>
              {(selected.length ? selected : persons).map((p) => {
                const { title, repeat } = presentTitle(p.id, row);
                const timeLabel = cellTimeLabel(p.id, row);
                const ico = iconFor(title.replace(/\s*\(pågår\)$/i, ""));
                const isCenterRow = rIdx === centerIndex;
                return (
                  <div key={p.id+"-"+rIdx} className={`px-2 py-2 flex flex-col justify-center gap-2 border-b border-neutral-800 border-r last:border-r-0 ${isCenterRow?"bg-neutral-900/40":"bg-neutral-950"}`}>
                    <div className="flex items-center gap-3">
                      {/* Bildruta */}
                      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 grid place-items-center shrink-0">
                        <div className={`w-18 h-18 rounded-lg bg-gradient-to-br ${p.color} grid place-items-center text-2xl`}>{ico}</div>
                      </div>
                      {/* Text */}
                      <div className="min-w-0">
                        <div className="text-[11px] text-neutral-400 mb-0.5">{timeLabel}</div>
                        <div className="truncate text-sm">
                          {title}
                          {repeat && <span className="ml-1 text-[10px] text-neutral-400 align-middle">↻</span>}
                        </div>
                      </div>
                    </div>

                    {/* Progress-linje */}
                    {(isCenterRow || showAllProgress) && <ProgressTicker personId={p.id} />}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="mt-4 text-xs text-neutral-400 leading-relaxed">
        <p><span className="text-neutral-300">Event-baserad vy:</span> 5 rader visas oavsett varaktighet. Starttiden för raden styr, bildyta är konstant.</p>
        <p className="mt-1"><span className="text-neutral-300">Pågående-regel:</span> om en kolumn fortsätter ett pågående block när en annan startar nytt, visas <strong>radens tid</strong> (inte original-start). Ex: 07:08 visar Maria "Morgonrutin" med tidslabel 07:08 när Leia startar "Borsta tänder".</p>
        <p className="mt-1"><span className="text-neutral-300">Simtid:</span> 1 timme i kalendern = <strong>{speed}</strong> s IRL. NU hålls centrerad. Snabbknappar: 07/12/18.</p>
        <p className="mt-1"><span className="text-neutral-300">Progress höger→vänster:</span> emoji (🏎️, 🐆, 🐎, 🦏, 🐖, 🚶‍♂️, 🐢, 🦀, 🐌) väljs efter <strong>totalen</strong> mellan två händelser. Röd zon = sista <em>minDuration</em> av segmentet.</p>
      </div>
    </div>
  );
}
