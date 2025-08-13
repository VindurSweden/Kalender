


import type { Event, Person, Row, RuleSet } from '@/types/event';

// ========================= Resources (kapaciteter) =========================
export const RESOURCES: Record<string, { id: string; capacity: number }> = {
  car: { id: "car", capacity: 1 },
  bathroom: { id: "bathroom", capacity: 1 },
};

// ========================= Blockering/beroenden =========================
function unmetFinishToStart(e: Event, atMs: number, events: Event[], persons: Person[]): string | null {
  if (!e.dependsOn?.length) return null;
  for (const id of e.dependsOn) {
    const dep = events.find(x => x.id === id);
    if (!dep) continue;
    // Use plannedEndMsForEvent to correctly find the dependency's end time.
    const depEnd = plannedEndMsForEvent(dep, events);
    if (atMs < depEnd) {
      const who = persons.find(p => p.id === dep.personId)?.name ?? "någon";
      return `Väntar på ${who} (${dep.title})`;
    }
  }
  return null;
}

function unmetRequiredPresence(e: Event, atMs: number, events: Event[], persons: Person[]): string | null {
  if (!e.involved?.length) return null;
  const required = e.involved.filter(i => i.role === "required");
  for (const r of required) {
    const busy = events.some(x =>
      x.personId === r.personId &&
      +new Date(x.start) <= atMs && atMs < +new Date(x.end) &&
      x.id !== e.id
    );
    if (busy) {
      if (!persons) {
          console.warn("persons array is missing in unmetRequiredPresence");
          return `Väntar på någon`;
      }
      const who = persons.find(p => p.id === r.personId)?.name ?? "någon";
      return `Väntar på ${who}`;
    }
  }
  return null;
}

function unmetResource(e: Event, atMs: number, events: Event[]): string | null {
  if (!e.resource) return null;
  const res = RESOURCES[e.resource];
  if (!res) return null;
  const using = events.filter(x => x.resource === e.resource && +new Date(x.start) <= atMs && atMs < +new Date(x.end)).length;
  if (using >= res.capacity) {
    return e.resource === "bathroom" ? "Väntar på ledigt badrum"
         : e.resource === "car"      ? "Väntar på bilen"
         : `Väntar på resurs: ${e.resource}`;
  }
  return null;
}

function unmetCoLocation(e: Event, atMs: number, events: Event[], persons: Person[]): string | null {
  if (!e.involved?.length || !e.location) return null;
  const required = e.involved.filter(i => i.role === "required");
  for (const r of required) {
    const cur = events.find(x => x.personId === r.personId && +new Date(x.start) <= atMs && atMs < +new Date(x.end));
    if (cur && cur.location && cur.location !== e.location) {
      const who = persons.find(p => p.id === r.personId)?.name ?? "någon";
      return `Väntar på att ${who} kommer till ${e.location}`;
    }
  }
  return null;
}

export function whyBlocked(e: Event, atMs: number, events: Event[], persons: Person[]): string | null {
  return unmetFinishToStart(e, atMs, events, persons)
      ?? unmetRequiredPresence(e, atMs, events, persons)
      ?? unmetResource(e, atMs, events)
      ?? unmetCoLocation(e, atMs, events, persons);
}


// ========================= Grid/Row Building =========================
const groupByPerson = (events: Event[]) => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      if (!map.has(e.personId)) map.set(e.personId, []);
      map.get(e.personId)!.push(e);
    }
    for (const [, list] of map) list.sort((a,b) => +new Date(a.start) - +new Date(b.start));
    return map;
};

export function buildRows(allEvents: Event[], selectedPeople: Person[]): Row[] {
    const byP = groupByPerson(allEvents.filter(e => selectedPeople.some(p => p.id === e.personId)));
    const allTimes = [...new Set(allEvents.map(e => +new Date(e.start)))].sort((a,b) => a-b);
    
    const rows: Row[] = [];
    
    for (const t0 of allTimes) {
        const row: Row = { time: t0, cells: new Map() };
        let hasContent = false;
        for (const p of selectedPeople) {
            const list = byP.get(p.id) || [];
            const event = list.find(ev => +new Date(ev.start) === t0);
            if(event) {
              row.cells.set(p.id, event);
              hasContent = true;
            }
        }
        if (hasContent) rows.push(row);
    }
    return rows;
}

function isOngoing(ev: Event, atMs: number) {
  const s = +new Date(ev.start), e = +new Date(ev.end);
  return s <= atMs && atMs < e;
}

export function getSourceEventForCell(pId: string, row: Row, allEvents: Event[]): Event | null {
    const direct = row.cells.get(pId) || null;
    if (direct) return direct;
  
    const list = allEvents.filter(e => e.personId === pId).sort((a,b) => +new Date(a.start) - +new Date(b.start));
    const idx = list.findIndex(e => +new Date(e.start) > row.time);
    const prev = idx === -1 ? list[list.length - 1] : list[Math.max(0, idx - 1)];
    
    if (prev && isOngoing(prev, row.time)) {
        return prev;
    }
    
    return null;
}

const toOngoingTitle = (title: string, past: boolean) => {
    const suffix = past ? "(pågick)" : "(pågår)";
    if (/^Hämtar/i.test(title)) return `${title} ${suffix}`;
    if (/^Blir hämtad/i.test(title)) return past ? `Väntade ${suffix}` : `Väntar ${suffix}`;
    if (/^Äta|Frukost/i.test(title)) return `${title} ${suffix}`;
    return `${title} ${suffix}`;
};

export function presentTitleForCell(pId: string, row: Row, allEvents: Event[], isPastRow: boolean, completedCut?: number, blockedReason?: string | null): { title: string; repeat: boolean; sourceEventId: string | null } {
    if (completedCut && row.time < completedCut) {
        return { title: '✓ Klar', repeat: false, sourceEventId: null };
    }
  
    const ev = row.cells.get(pId) || null;
    if (ev) {
        if (blockedReason) return { title: toOngoingTitle(blockedReason, isPastRow), repeat: true, sourceEventId: ev.id };
        return { title: ev.title, repeat: false, sourceEventId: ev.id };
    }
  
    const sourceEv = getSourceEventForCell(pId, row, allEvents);
    
    if (sourceEv) {
        if (completedCut && +new Date(sourceEv.start) < completedCut) {
             return { title: '✓ Klar', repeat: false, sourceEventId: null };
        }
        if (sourceEv.meta?.synthetic) {
            return { title: sourceEv.title, repeat: true, sourceEventId: sourceEv.id };
        }
        return { title: toOngoingTitle(sourceEv.title, isPastRow), repeat: true, sourceEventId: sourceEv.id };
    }
    
    return { title: "—", repeat: false, sourceEventId: null };
}

// ========================= Replanning Logic =========================
type Override = { startMs?: number; plannedMs?: number };

export function applyOverrides(all: Event[], ov: Map<string, Override>): Event[] {
  return all.map(e => {
    const o = ov.get(e.id);
    if (!o) return e;
    const startMs = o.startMs ?? +new Date(e.start);
    const durMs = o.plannedMs ?? (+new Date(e.end) - +new Date(e.start));
    return { ...e, start: new Date(startMs).toISOString(), end: new Date(startMs + durMs).toISOString() };
  });
}

export function plannedEndMsForEvent(ev: Event, all: Event[]): number {
    const tl = all.filter(e => e.personId === ev.personId).sort((a,b) => +new Date(a.start) - +new Date(b.start));
    const i = tl.findIndex(e => e.id === ev.id);
    const next = tl[i+1];
    return next ? +new Date(next.start) : +new Date(ev.end);
}

const makeSyntheticEvent = (start: Date, end: Date, personId: string, mode: "sleep_idle" | "unknown" = "sleep_idle"): Event => {
    const isNightTime = start.getHours() >= 22 || start.getHours() < 6;
    const title = (isNightTime) ? "Sover" : "Tillgänglig";
    return {
        id: `syn-${personId}-${start.toISOString()}`,
        personId,
        start: start.toISOString(),
        end: end.toISOString(),
        title,
        meta: { synthetic: true, source: "system" }
    };
};

export const synthesizeDayFill = (personEvents: Event[], personId: string, day: Date): Event[] => {
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1); dayEnd.setHours(0,0,0,0);
    
    const out: Event[] = [...(personEvents || [])];
    if (out.length === 0) { // If there are no events, fill the whole day
        out.push(makeSyntheticEvent(dayStart, dayEnd, personId));
        return out;
    }

    const sorted = out.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    let cursor = dayStart.getTime();

    for (const ev of sorted) {
        const startTs = +new Date(ev.start);
        const endTs = +new Date(ev.end);

        if (cursor < startTs) {
            out.push(makeSyntheticEvent(new Date(cursor), new Date(startTs), personId));
        }
        cursor = Math.max(cursor, endTs);
    }

    if (cursor < dayEnd.getTime()) {
        out.push(makeSyntheticEvent(new Date(cursor), dayEnd, personId));
    }
    return out.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
};


// Proportional Replan Preview
const toMs = (iso: string) => +new Date(iso);
const ms = (min: number) => min * 60_000;

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
  return fixed.length ? toMs(fixed[0].start) : toMs(new Date(nowMs).toISOString().split('T')[0] + 'T24:00:00');
}

type PreviewPatch = { eventId: string; newStartMs: number; minDurationMs?: number; plannedMs?: number; newPlannedMs?: number; };
type PreviewResult =
  | { status: "ok"; requiredSavingMs: number; totalFlexMs: number; lambda: number; horizonMs: number; patches: PreviewPatch[]; }
  | { status: "insufficientFlex"; requiredSavingMs: number; totalFlexMs: number; missingMs: number; horizonMs: number; patches: PreviewPatch[]; };

export function previewReplanProportional(seedEventId: string, nowMs: number, all: Event[]): PreviewResult {
  const seed = all.find(e => e.id === seedEventId);
  if (!seed) throw new Error("seedEvent not found");
  const tl = personTimeline(all, seed.personId);
  const i = findEventIndex(tl, seed.id);
  if (i === -1) throw new Error("seed event not found in timeline");

  const seedNextStart = nextStartForPerson(all, seed.personId, i);
  const plannedEnd = seedNextStart ?? toMs(seed.end);
  const requiredSaving = Math.max(0, nowMs - plannedEnd);

  const horizon = findHorizonNextFixed(all, nowMs);

  const window: Event[] = [];
  for (let k = i+1; k < tl.length; k++) {
    const e = tl[k];
    if (toMs(e.start) >= horizon) break;
    if(e.meta?.synthetic) continue; // Don't shrink synthetic events
    window.push(e);
  }

  let totalFlex = 0;
  const planned: { e: Event; start: number; end: number; plannedMs: number; minMs: number; }[] = [];

  for (let k = 0; k < window.length; k++) {
    const e = window[k];
    const start = toMs(e.start);
    const next = (k < window.length-1) ? toMs(window[k+1].start) : Math.min(horizon, plannedEndMsForEvent(e, all));
    const plannedMs = Math.max(1, next - start);
    const minMs = ms(e.minDurationMin ?? 0);
    totalFlex += Math.max(0, plannedMs - minMs);
    planned.push({ e, start, end: next, plannedMs, minMs });
  }

  if (requiredSaving === 0 || window.length === 0) {
    return { status: "ok", requiredSavingMs: requiredSaving, totalFlexMs: totalFlex, lambda: 0, horizonMs: horizon, patches: [] };
  }

  if (totalFlex <= 0) {
    return { status: "insufficientFlex", requiredSavingMs: requiredSaving, totalFlexMs: 0, missingMs: requiredSaving, horizonMs: horizon, patches: [] };
  }

  const lambda = Math.min(1, requiredSaving / totalFlex);
  const patches: PreviewPatch[] = [];
  let cursor = nowMs;

  for (const item of planned) {
    const flex = Math.max(0, item.plannedMs - item.minMs);
    const newMs = Math.max(item.minMs, Math.round(item.plannedMs - lambda * flex));
    patches.push({ eventId: item.e.id, newStartMs: cursor, minDurationMs: item.minMs, plannedMs: item.plannedMs, newPlannedMs: newMs });
    cursor += newMs;
  }

  if (cursor > horizon) {
    const missing = cursor - horizon;
    return { status: "insufficientFlex", requiredSavingMs: requiredSaving, totalFlexMs: totalFlex, missingMs: missing, horizonMs: horizon, patches: patches };
  }

  return { status: "ok", requiredSavingMs: requiredSaving, totalFlexMs: totalFlex, lambda, horizonMs: horizon, patches: patches };
}
