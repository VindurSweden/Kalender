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
type Role = "required" | "helper";
type Involved = { personId: string; role: Role };

type Event = {
  id: string;
  personId: string;
  start: string;
  end: string;
  title: string;

  // === metadata för planering/visning (alla valfria) ===
  minDurationMin?: number;  // minsta möjliga tid (visar röd zon)
  fixedStart?: boolean;     // start är en hålltid (”fixed time”)
  fixedEnd?: boolean;       // ev. fast slut (sällsynt)
  dependsOn?: string[];     // eventIds som måste vara klara före detta
  involved?: { personId: string; role: "required" | "helper" }[];
  allowAlone?: boolean;     // om ägaren kan fortsätta utan hjälpare
  resource?: string;        // t.ex. "car", "kitchen"
  location?: string;        // t.ex. "home", "school", "work"
  cluster?: string;         // t.ex. "morning", "evening"

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
  { id: "antony", name: "Antony", color: "from-sky-500 to-indigo-600", emoji: "👨‍🦱" },
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
  [/\bTillgänglig/i, "✅"]
];
const iconFor = (title: string) => {
  for (const [re, ico] of activityIcon) if (re.test(title)) return ico;
  return "📌";
};


// ========= Syntetisk fyllnad =========
const makeSyntheticEvent = (start: Date, end: Date, personId: string, mode: "sleep_idle" | "unknown" = "sleep_idle"): Event => {
    const isNightTime = start.getHours() >= 20 || start.getHours() < 6;
    const title = (mode === "sleep_idle" && isNightTime) ? "Sover" : (mode === "sleep_idle" ? "Tillgänglig" : "Okänt");
    return {
        id: `syn-${personId}-${start.toISOString()}`,
        personId,
        start: start.toISOString(),
        end: end.toISOString(),
        title,
        meta: { synthetic: true }
    };
};

const synthesizeDayFill = (personEvents: Event[], personId: string, day: Date): Event[] => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dayEnd.setHours(0,0,0,0);
    
    const out: Event[] = [];
    const sorted = [...personEvents].sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    let cursor = dayStart.getTime();

    for (const ev of sorted) {
        const startTs = new Date(ev.start).getTime();
        const endTs = new Date(ev.end).getTime();

        if (cursor < startTs) {
            out.push(makeSyntheticEvent(new Date(cursor), new Date(startTs), personId));
        }
        out.push(ev);
        cursor = Math.max(cursor, endTs);
    }

    if (cursor < dayEnd.getTime()) {
        out.push(makeSyntheticEvent(new Date(cursor), dayEnd, personId));
    }

    return out;
};


// ========= Testevents =========
const mariaEvents: Event[] = [
  { id: "maria-sleep-00", personId: "maria", start: t(0), end: t(6), title: "Sover", meta: { synthetic: true }, location: "home" },
  { id: "maria-06-07", personId: "maria", start: t(6), end: t(7), title: "Vaknar & kaffe", minDurationMin: 5, location: "home", cluster: "morning" },
  { id: "maria-07-08", personId: "maria", start: t(7), end: t(8), title: "Morgonrutin", minDurationMin: 15, location: "home", cluster: "morning" },
  { id: "maria-jobb-am", personId: "maria", start: t(8), end: t(12), title: "Jobb (förmiddag)", location: "work" },
  { id: "maria-lunch-12", personId: "maria", start: t(12), end: t(13), title: "Lunch", minDurationMin: 15, location: "work" },
  { id: "maria-jobb-em", personId: "maria", start: t(13), end: t(16), title: "Jobb (eftermiddag)", location: "work" },
  { id: "maria-1630", personId: "maria", start: `${day}T16:30:00`, end: t(17), title: "Hämtar Leia (fritids)", fixedStart: true, involved: [{personId:"leia", role:"required"}], resource: "car", location: "city" },
  { id: "maria-18", personId: "maria", start: t(18), end: t(19), title: "Middag", minDurationMin: 20, involved: [{personId:"antony", role:"required"}, {personId:"leia", role:"required"}, {personId:"gabriel", role:"required"}], location: "home", cluster: "evening" },
  { id: "maria-21", personId: "maria", start: t(21), end: t(22), title: "Kvällsrutin", minDurationMin: 10, location: "home", cluster: "evening" },
  { id: "maria-sleep-22", personId: "maria", start: t(22), end: t(24), title: "Sover", meta: { synthetic: true }, location: "home" },
];

const leia07_08: Event[] = [
  { id: "leia-07-00", personId: "leia", start: t(7, 0),  end: t(7, 8),  title: "Vakna",           minDurationMin: 3, location: "home", cluster: "morning" },
  { id: "leia-07-08", personId: "leia", start: t(7, 8),  end: t(7, 16), title: "Borsta tänder",   minDurationMin: 2, location: "home", cluster: "morning" },
  { id: "leia-07-16", personId: "leia", start: t(7, 16), end: t(7, 24), title: "Äta frukost",     minDurationMin: 10, dependsOn: ["ant-07-00-10"], involved: [{personId:"antony", role:"required"}], location: "home", cluster: "morning" },
  { id: "leia-07-24", personId: "leia", start: t(7, 24), end: t(7, 32), title: "Ta vitaminer",    minDurationMin: 1, dependsOn: ["leia-07-16"], allowAlone: true, location: "home", cluster: "morning" },
  { id: "leia-07-32", personId: "leia", start: t(7, 32), end: t(7, 40), title: "Borsta hår",      minDurationMin: 2, allowAlone: true, location: "home", cluster: "morning" },
  { id: "leia-07-40", personId: "leia", start: t(7, 40), end: t(7, 48), title: "Klä på sig",      minDurationMin: 4, allowAlone: true, location: "home", cluster: "morning" },
  { id: "leia-07-48", personId: "leia", start: t(7, 48), end: t(8, 0),  title: "Packa väska & skor", minDurationMin: 5, allowAlone: true, location: "home", cluster: "morning" },
];

const leiaEvents: Event[] = [
  { id: "leia-sleep-00", personId: "leia", start: t(0), end: t(6), title: "Sover", meta: { synthetic: true }, location: "home" },
  { id: "leia-06-07", personId: "leia", start: t(6), end: t(7), title: "Vaknar långsamt", minDurationMin: 10, location: "home", cluster: "morning" },
  ...leia07_08,
  { id: "leia-skola-08", personId: "leia", start: t(8), end: t(13), title: "Skola", fixedStart: true, location: "school" },
  { id: "leia-fritids-13", personId: "leia", start: t(13), end: `${day}T16:30:00`, title: "Fritids", location: "school" },
  { id: "leia-1630", personId: "leia", start: `${day}T16:30:00`, end: t(17), title: "Blir hämtad (fritids)", dependsOn: ["maria-1630"], involved: [{personId:"maria", role:"required"}], location: "school", resource: "car" },
  { id: "leia-18", personId: "leia", start: t(18), end: t(19), title: "Middag", minDurationMin: 20, involved: [{personId:"maria", role:"required"}, {personId:"antony", role:"required"}, {personId:"gabriel", role:"helper"}], location: "home", cluster: "evening" },
  { id: "leia-19", personId: "leia", start: t(19), end: t(20), title: "Läxor", minDurationMin: 15, location: "home" },
  { id: "leia-20", personId: "leia", start: t(20), end: t(21), title: "Spel / lugn", minDurationMin: 5, location: "home" },
  { id: "leia-21", personId: "leia", start: t(21), end: t(22), title: "Kvällsrutin", minDurationMin: 10, location: "home", cluster: "evening" },
  { id: "leia-sleep-22", personId: "leia", start: t(22), end: t(24), title: "Sover", meta: { synthetic: true }, location: "home" },
];

const gabriel07_08: Event[] = [
  { id: "gab-07-00", personId: "gabriel", start: t(7, 0),  end: t(7, 20), title: "Vakna & påklädning", minDurationMin: 8, location: "home", cluster: "morning" },
  { id: "gab-07-20", personId: "gabriel", start: t(7, 20), end: t(7, 40), title: "Frukost",         minDurationMin: 8, dependsOn: ["ant-07-00-10"], involved: [{personId:"antony", role:"required"}], location: "home", cluster: "morning" },
  { id: "gab-07-40", personId: "gabriel", start: t(7, 40), end: t(8, 0),  title: "Tänder & skor",   minDurationMin: 4, allowAlone: false, location: "home", cluster: "morning" },
];

const gabrielEvents: Event[] = [
  { id: "gab-sleep-00", personId: "gabriel", start: t(0), end: t(6), title: "Sover", meta: { synthetic: true }, location: "home" },
  { id: "gab-06-07", personId: "gabriel", start: t(6), end: t(7), title: "Morgonmys", minDurationMin: 5, location: "home" },
  ...gabriel07_08,
  { id: "gab-08-13", personId: "gabriel", start: t(8), end: t(13), title: "Förskola", fixedStart: true, location: "school" },
  { id: "gab-13-16", personId: "gabriel", start: t(13), end: t(16), title: "Lek & mellis", minDurationMin: 20, location: "home" },
  { id: "gab-18", personId: "gabriel", start: t(18), end: t(19), title: "Middag", minDurationMin: 20, involved: [{personId:"maria", role:"required"}, {personId:"antony", role:"required"}, {personId:"leia", role:"helper"}], location: "home", cluster: "evening" },
  { id: "gab-19-20", personId: "gabriel", start: t(19), end: t(20), title: "Lego", minDurationMin: 5, location: "home" },
  { id: "gab-21-22", personId: "gabriel", start: t(21), end: t(22), title: "Kvällsrutin", minDurationMin: 10, location: "home", cluster: "evening" },
  { id: "gab-sleep-22", personId: "gabriel", start: t(22), end: t(24), title: "Sover", meta: { synthetic: true }, location: "home" },
];

// Antony (pappa) 07:00–08:00 + jobb/lunch
const antonyEvents: Event[] = [
  { id: "ant-07-00-10", personId: "antony", start: t(7,0),  end: t(7,10), title: "Fixa frukost", minDurationMin: 6, location: "home", resource: "kitchen", cluster: "morning" },
  { id: "ant-07-10-30", personId: "antony", start: t(7,10), end: t(7,30), title: "Äta frukost (med barnen)", minDurationMin: 10, involved: [{personId:"leia", role:"required"}, {personId:"gabriel", role:"required"}], location: "home", cluster: "morning" },
  { id: "ant-07-30-40", personId: "antony", start: t(7,30), end: t(7,40), title: "Göra sig klar", minDurationMin: 6, location: "home", cluster: "morning" },
  { id: "ant-07-40-50", personId: "antony", start: t(7,40), end: t(7,50), title: "Hjälpa Leia bli klar", minDurationMin: 8, involved: [{personId:"leia", role:"required"}], location: "home", cluster: "morning" },
  { id: "ant-07-50-55", personId: "antony", start: t(7,50), end: t(7,55), title: "Hjälpa Gabriel med väskan", minDurationMin: 3, involved: [{personId:"gabriel", role:"required"}], location: "home", cluster: "morning" },
  { id: "ant-07-55-08", personId: "antony", start: t(7,55), end: t(8,0),  title: "Gå med Leia", minDurationMin: 5, involved: [{personId:"leia", role:"required"}], location: "street", cluster: "morning" },
  { id: "ant-08-12",    personId: "antony", start: t(8),    end: t(12),   title: "Jobb (hemma)", location: "home" },
  { id: "ant-12-13",    personId: "antony", start: t(12),   end: t(13),   title: "Lunch", minDurationMin: 15, location: "home" },
  { id: "ant-13-16",    personId: "antony", start: t(13),   end: t(16),   title: "Jobb (hemma)", location: "home" },
  { id: "ant-18-19",    personId: "antony", start: t(18),   end: t(19),   title: "Middag", minDurationMin: 20, involved: [{personId:"maria", role:"required"}, {personId:"leia", role:"required"}, {personId:"gabriel", role:"required"}], location: "home", cluster: "evening" },
];

const baseEvents: Event[] = [...mariaEvents, ...leiaEvents, ...gabrielEvents, ...antonyEvents];


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

function toOngoingTitle(title: string, past: boolean) {
  const suffix = past ? "(pågick)" : "(pågår)";
  if (/^Hämtar/i.test(title)) return `${title} ${suffix}`;
  if (/^Blir hämtad/i.test(title)) return past ? `Väntade ${suffix}` : `Väntar ${suffix}`;
  if (/^Äta|Frukost/i.test(title)) return `${title} ${suffix}`;
  return `${title} ${suffix}`;
}

function applyOverrides(all: Event[], ov: Map<string, Override>): Event[] {
  // Kopiera (immutabelt) och ersätt start/end där override finns.
  return all.map(e => {
    const o = ov.get(e.id);
    if (!o) return e;
    const startMs = o.startMs ?? +new Date(e.start);
    const durMs = o.plannedMs ?? (+new Date(e.end) - +new Date(e.start));
    return {
      ...e,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + durMs).toISOString(),
    };
  });
}

// ========= Replanning Logic & Helpers =========
function toMs(iso: string) { return +new Date(iso); }
function ms(min: number) { return min * 60_000; }

function nextStartForPerson(all: Event[], personId: string, evIndex: number): number | null {
  const list = all.filter(e => e.personId === personId).sort((a,b)=>toMs(a.start)-toMs(b.start));
  const next = list[evIndex+1];
  return next ? toMs(next.start) : null;
}

function personTimeline(all: Event[], personId: string) {
  return all.filter(e => e.personId === personId).sort((a,b)=>toMs(a.start)-toMs(b.start));
}

function findEventIndex(tl: Event[], id: string) {
  return tl.findIndex(e => e.id === id);
}

function findHorizonNextFixed(all: Event[], nowMs: number): number {
  const fixed = all.filter(e => e.fixedStart && toMs(e.start) >= nowMs).sort((a,b)=>toMs(a.start)-toMs(b.start));
  return fixed.length ? toMs(fixed[0].start) : toMs(`${day}T24:00:00`);
}

type PreviewPatch = { eventId: string; newStartMs: number; minDurationMs?: number; plannedMs?: number; newPlannedMs?: number; };
type PreviewResult =
  | { status: "ok"; requiredSavingMs: number; totalFlexMs: number; lambda: number; horizonMs: number; patches: PreviewPatch[]; emojiHints: { eventId: string; totalMs: number }[]; }
  | { status: "insufficientFlex"; requiredSavingMs: number; totalFlexMs: number; missingMs: number; horizonMs: number; patches: PreviewPatch[]; };

function previewReplanProportional(seedEventId: string, nowMs: number, all: Event[]): PreviewResult {
  // 1) seed & person
  const seed = all.find(e => e.id === seedEventId);
  if (!seed) throw new Error("seedEvent not found");
  const tl = personTimeline(all, seed.personId);
  const i = findEventIndex(tl, seed.id);
  if (i === -1) throw new Error("seed event not found in timeline");

  // 2) planned end (seed’s segment slutar vid nästa start för samma person)
  const seedNextStart = nextStartForPerson(all, seed.personId, i);
  const plannedEnd = seedNextStart ?? toMs(seed.end);
  const requiredSaving = Math.max(0, nowMs - plannedEnd);

  const horizon = findHorizonNextFixed(all, nowMs);

  // 3) fönster: efterföljande events för samma person fram till horizon
  const window: Event[] = [];
  for (let k = i+1; k < tl.length; k++) {
    const e = tl[k];
    if (toMs(e.start) >= horizon) break;
    window.push(e);
  }

  // 4) beräkna planerade tider & flex
  let totalFlex = 0;
  const planned: { e: Event; start: number; end: number; plannedMs: number; minMs: number; }[] = [];

  for (let k = 0; k < window.length; k++) {
    const e = window[k];
    const start = toMs(e.start);
    const next = (k < window.length-1) ? toMs(window[k+1].start) : Math.min(horizon, toMs(e.end)); // sista event i fönstret slutar senast vid horizon
    const plannedMs = Math.max(1, next - start);
    const minMs = ms(e.minDurationMin ?? 0);
    totalFlex += Math.max(0, plannedMs - minMs);
    planned.push({ e, start, end: next, plannedMs, minMs });
  }

  if (requiredSaving === 0 || window.length === 0) {
    return { status: "ok", requiredSavingMs: requiredSaving, totalFlexMs: totalFlex, lambda: 0, horizonMs: horizon, patches: [], emojiHints: [] };
  }

  if (totalFlex <= 0) {
    return { status: "insufficientFlex", requiredSavingMs: requiredSaving, totalFlexMs: 0, missingMs: requiredSaving, horizonMs: horizon, patches: [] };
  }

  // 5) lambda och nya varaktigheter
  const lambda = Math.min(1, requiredSaving / totalFlex);
  const patched: PreviewPatch[] = [];
  const hints: { eventId: string; totalMs: number }[] = [];

  // ny kedja startar vid nowMs
  let cursor = nowMs;

  for (const item of planned) {
    const flex = Math.max(0, item.plannedMs - item.minMs);
    const newMs = Math.max(item.minMs, Math.round(item.plannedMs - lambda * flex));
    patched.push({ eventId: item.e.id, newStartMs: cursor, minDurationMs: item.minMs, plannedMs: item.plannedMs, newPlannedMs: newMs });
    cursor += newMs;

    // emoji-hint = totalMs för segmentet efter trim (för att byta djur)
    hints.push({ eventId: item.e.id, totalMs: newMs });
  }

  if (cursor > horizon) {
    const missing = cursor - horizon;
    return { status: "insufficientFlex", requiredSavingMs: requiredSaving, totalFlexMs: totalFlex, missingMs: missing, horizonMs: horizon, patches: patched };
  }

  return { status: "ok", requiredSavingMs: requiredSaving, totalFlexMs: totalFlex, lambda, horizonMs: horizon, patches: patched, emojiHints: hints };
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
  const [showMeta, setShowMeta] = useState(false);
  type Override = { startMs?: number; plannedMs?: number };
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());

  const [speed, setSpeed] = useState<number>(5);     // 1h = 5s IRL
  const [playing, setPlaying] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(+new Date(t(6, 0))); // start 06:00
  const startOfDay = +new Date(t(0,0));
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
        // Reset to the start of the *same* day if it loops
        return nv >= endOfDay ? startOfDay : nv;
      });
      rafId.current = requestAnimationFrame(step);
    }
    if (playing) rafId.current = requestAnimationFrame(step);
    return () => { if (rafId.current != null) cancelAnimationFrame(rafId.current); rafId.current = null; lastTs.current = null; };
  }, [playing, speed]);

  const visEvents = useMemo(() => applyOverrides(baseEvents, overrides), [overrides]);

  // Härleda rader
  const selected = useMemo(() => persons.filter(p => selectedIds.includes(p.id)), [selectedIds]);
  const rows = useMemo(() => buildRows(visEvents, selected.length ? selected : persons), [visEvents, selected]);

  // Centrera NU (slot 3 av 5)
  const S = SLOTS;
  const centerIndex = Math.floor(S / 2);
  const currentRowIndex = useMemo(() => {
    // Find the last event that has started
    const idx = rows.findIndex(r => r.time > nowMs);
    if (idx === -1) return rows.length - 1; // After last event
    return Math.max(0, idx - 1);
  }, [rows, nowMs]);
  const startIndex = clamp(currentRowIndex - centerIndex, 0, Math.max(0, rows.length - S));
  const visibleRows = rows.slice(startIndex, startIndex + S);

  // Till middag (demo)
  const nextDinner = useMemo(() => {
    const ids = new Set(selected.map(p => p.id));
    const upcoming = visEvents
      .filter(e => ids.has(e.personId) && /\bMiddag\b/i.test(e.title) && +new Date(e.start) >= nowMs)
      .sort((a,b) => +new Date(a.start) - +new Date(b.start))[0];
    return upcoming || null;
  }, [selected, nowMs, visEvents]);
  const tillMiddag = nextDinner ? humanDelta(+new Date(nextDinner.start) - nowMs) : null;

  function currentAndNextForPerson(personId: string, nowMs: number) {
    const list = visEvents
      .filter(e => e.personId === personId)
      .sort((a,b) => +new Date(a.start) - +new Date(b.start));
    let current: Event | null = null;
    let next: Event | null = null;
    for (let i = 0; i < list.length; i++) {
      const s = +new Date(list[i].start);
      const e = +new Date(list[i].end);
      if (s <= nowMs && nowMs < e) { current = list[i]; next = list[i+1] ?? null; break; }
      if (nowMs < s) { next = list[i]; break; }
    }
    return { current, next };
  }

  // Cellhelpers (titel & tid enligt din regel)
  function presentTitle(pId: string, row: Row, isPastRow: boolean): { title: string; repeat: boolean; sourceEventId: string | null } {
    const ev = row.cells.get(pId) || null;
    if (ev) return { title: ev.title, repeat: false, sourceEventId: ev.id };
    const list = visEvents.filter(e => e.personId === pId).sort((a,b) => +new Date(a.start) - +new Date(b.start));
    const idx = list.findIndex(e => +new Date(e.start) > row.time);
    const prev = idx === -1 ? list[list.length-1] : list[Math.max(0, idx-1)];
    
    if (prev && isOngoing(prev, row.time)) {
        return { title: toOngoingTitle(prev.title, isPastRow), repeat: true, sourceEventId: prev.id };
    }
    
    return { title: "—", repeat: false, sourceEventId: null };
  }
  function cellTimeLabel(pId: string, row: Row, _isPastRow: boolean): string {
    const ev = row.cells.get(pId) || null;
    const label = ev ? HHMM(new Date(ev.start)) : HHMM(row.time);
    return label;
  }
  function sourceEventForCell(pId: string, row: Row): Event | null {
    // 1) Finns ett event som startar exakt på radens tid?
    const direct = row.cells.get(pId) || null;
    if (direct) return direct;
  
    // 2) Annars: vilket var föregående event för personen, och är det pågående vid radens tid?
    const list = visEvents
      .filter(e => e.personId === pId)
      .sort((a,b) => +new Date(a.start) - +new Date(b.start));
  
    const idx = list.findIndex(e => +new Date(e.start) >= row.time);
    const prev = idx === -1 ? list[list.length - 1] : list[Math.max(0, idx - 1)];
    if (prev && isOngoing(prev, row.time)) return prev;
  
    return null;
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

  const [flash, setFlash] = useState<null | { kind: "klar" | "late"; at: number }>(null);

  function handleKlar(eventId: string | null) {
    if (!eventId) return;
    // Inga overrides. Vi hoppar bara NU till nästa start för samma person.
    const seed = visEvents.find(e => e.id === eventId);
    if (!seed) return;
    const tl = visEvents
      .filter(e => e.personId === seed.personId)
      .sort((a,b)=>+new Date(a.start)-+new Date(b.start));
    const idx = tl.findIndex(e => e.id === eventId);
    const nextEv = tl[idx + 1];
    if (nextEv) setNowMs(+new Date(nextEv.start));
    setFlash({ kind: "klar", at: Date.now() });
    setTimeout(() => setFlash(null), 800);
  }
  
  function handleKlarSent(eventId: string | null) {
    if (!eventId) return;

    // 1) Kör proportionell preview mot VISNINGsdata (innan overrides uppdateras)
    const preview = previewReplanProportional(eventId, nowMs, visEvents);

    // 2) Applicera patchar som overrides (även om flex är otillräcklig – vi visar ändå “bästa möjliga”)
    if ("patches" in preview && preview.patches.length) {
      setOverrides(prev => {
        const next = new Map(prev);
        for (const p of preview.patches) {
          const o = next.get(p.eventId) ?? {};
          o.startMs = p.newStartMs;
          if (p.newPlannedMs != null) o.plannedMs = p.newPlannedMs;
          next.set(p.eventId, o);
        }
        return next;
      });
    }

    // 3) Hitta “nästa steg” för samma person efter NU i den NYA visningen och lägg NU där
    //    (gör nästa render först, sedan hoppa tiden — liten delay för att visEvents ska hinna uppdateras)
    setTimeout(() => {
      const seed = visEvents.find(e => e.id === eventId);
      if (!seed) return;
      const tl = visEvents
        .filter(e => e.personId === seed.personId)
        .sort((a,b)=>+new Date(a.start)-+new Date(b.start));
      const idx = tl.findIndex(e => e.id === eventId);
      const nextEv = tl[idx + 1];
      if (nextEv) {
        setNowMs(+new Date(nextEv.start)); // NU hamnar i mitten vid nästa steg
      }
    }, 0);

    // 4) Flagga (konfetti / feedback) – valfritt
    setFlash({ kind: "late", at: Date.now() });
    setTimeout(() => setFlash(null), 1200);

    // 5) Konsol-info kvar för debug
    console.log("=== Replan applied (demo) ===", {
      status: (preview as any).status,
      requiredSavingMin: Math.round(preview.requiredSavingMs/60000),
      totalFlexMin: Math.round(preview.totalFlexMs/60000),
      horizon: new Date(preview.horizonMs).toLocaleTimeString(),
    });
  }

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
              <option value={60}>60 s/timme</option>
              <option value={180}>180 sekunder/timma</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showAllProgress} onChange={(e)=> setShowAllProgress(e.target.checked)} />
            Progress på alla rader
          </label>
           <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showMeta}
              onChange={(e) => setShowMeta(e.target.checked)}
            />
            Visa metadata
          </label>
          <button onClick={() => jumpTo(7,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">07:00</button>
          <button onClick={() => jumpTo(12,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">12:00</button>
          <button onClick={() => jumpTo(18,0)} className="px-3 py-1 rounded-2xl border bg-neutral-900 border-neutral-800">18:00</button>
        </div>
      </div>

      {/* Flash (enkel demo) */}
      {flash && (
        <div className="fixed right-4 bottom-4 z-50">
          <div className={`px-3 py-2 rounded-lg border ${flash.kind === "klar" ? "border-emerald-400/40 bg-emerald-600/15" : "border-amber-400/40 bg-amber-600/15"}`}>
            {flash.kind === "klar" ? "✔️ Klart (demo)" : "⏱️ Klar sent – skulle trigga replan (demo)"}
          </div>
        </div>
      )}

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
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${selected.length || persons.length}, minmax(0, 1fr))`, gridAutoRows: 'min-content' }}>
          {/* NU-markering över mittenraden */}
          <div className="pointer-events-none absolute z-10 top-1/2 -translate-y-1/2 inset-x-0 h-[1px]">
             <div className="h-full border-t border-fuchsia-500/40 bg-fuchsia-500/5 flex items-center justify-center">
                 <div className="text-[10px] -translate-y-1/2 px-2 py-0.5 rounded-full bg-fuchsia-600/20 border border-fuchsia-500/40 text-fuchsia-300">NU {HHMM(nowMs)}</div>
             </div>
          </div>
          

          {visibleRows.map((row, rIdx) => (
            <React.Fragment key={row.time+"-"+rIdx}>
              {(selected.length ? selected : persons).map((p) => {
                const isCenterRow = rIdx === centerIndex;
                const isPastRow   = rIdx < centerIndex;
                const { title, repeat, sourceEventId } = presentTitle(p.id, row, isPastRow);
                const timeLabel = cellTimeLabel(p.id, row, isPastRow);
                const ico = iconFor(title.replace(/\s*\((pågår|pågick)\)$/i, ""));
                
                const sourceEv = sourceEventForCell(p.id, row);
                const metaBadges: string[] = [];
                if (sourceEv) {
                  if (sourceEv.fixedStart) metaBadges.push("FixStart");
                  if (sourceEv.fixedEnd) metaBadges.push("FixEnd");
                  if (typeof sourceEv.minDurationMin === "number") metaBadges.push(`min:${sourceEv.minDurationMin}m`);
                  if (sourceEv.dependsOn?.length) metaBadges.push(`dep:${sourceEv.dependsOn.length}`);
                  if (sourceEv.involved?.length) {
                    const req = sourceEv.involved.filter(i => i.role === "required").length;
                    const hlp = sourceEv.involved.length - req;
                    metaBadges.push(`inv:${req}${hlp ? `+${hlp}h` : ""}`);
                  }
                  if (sourceEv.allowAlone === true) metaBadges.push("självOK");
                  if (sourceEv.resource) metaBadges.push(`res:${sourceEv.resource}`);
                  if (sourceEv.location) metaBadges.push(`loc:${sourceEv.location}`);
                  if (sourceEv.cluster) metaBadges.push(`cluster:${sourceEv.cluster}`);
                }

                return (
                  <div key={p.id+"-"+rIdx} className={`px-2 py-2 flex flex-col justify-center gap-1 border-b border-neutral-800 border-r last:border-r-0 ${isCenterRow?"bg-neutral-900/40":"bg-neutral-950"} ${p.id.startsWith('syn-') ? 'border-dashed' : ''} relative`}>
                    
                    {rIdx === centerIndex && <div className="absolute inset-0 border-y border-fuchsia-500/40 bg-fuchsia-500/5 pointer-events-none" />}

                    <div className="flex items-center gap-3">
                      {/* Bildruta */}
                      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 grid place-items-center shrink-0">
                        <div className={`w-18 h-18 rounded-lg bg-gradient-to-br ${p.color} grid place-items-center text-2xl`}>{ico}</div>
                      </div>
                      {/* Text */}
                      <div className="min-w-0">
                        <div className={`text-[11px] mb-0.5 ${isPastRow ? "text-neutral-500" : "text-neutral-400"}`}>{timeLabel}</div>
                        <div className="truncate text-sm">
                          {title}
                          {repeat && <span className="ml-1 text-[10px] text-neutral-400 align-middle">↻</span>}
                        </div>
                      </div>
                    </div>
                    
                    {/* Meta badges */}
                    {showMeta && sourceEv && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {metaBadges.map((b, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded-md border border-neutral-700 bg-neutral-900/60 text-neutral-300"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Progress-linje */}
                    {(isCenterRow || showAllProgress) && <ProgressTicker personId={p.id} />}
                    {/* Actions */}
                    <div className="mt-1">
                      {isCenterRow && (
                        <button onClick={() => handleKlar(sourceEventId)} className="px-2 py-1 text-xs rounded-md border bg-neutral-900 border-neutral-800">Klar</button>
                      )}
                      {isPastRow && (
                        <button onClick={() => handleKlarSent(sourceEventId)} className="px-2 py-1 text-xs rounded-md border bg-neutral-900 border-neutral-800">Klar sent</button>
                      )}
                    </div>
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
