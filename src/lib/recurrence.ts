
import type { DayType, Role, TemplateStep, DayProfile, Event, RuleSet } from '@/types/event';

// ——— helpers ———
const hhmmToMs = (dateISO: string, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(dateISO);
    d.setUTCHours(h, m, 0, 0); // Use UTC hours to avoid timezone shifts from local
    return d.getTime();
};
const atISO = (dateISO: string, hhmm: string) => new Date(hhmmToMs(dateISO, hhmm)).toISOString();
const plusDaysISO = (dateISO: string, days: number) => {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const wd = (d: Date): "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA" => {
    const dayIndex = d.getUTCDay(); // Use getUTCDay to be consistent
    return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][dayIndex] as "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";
};
const inRange = (dateISO: string, start: string, end: string) => {
  const d0 = new Date(dateISO); d0.setHours(0, 0, 0, 0);
  const a = new Date(start); a.setHours(0, 0, 0, 0);
  const b = new Date(end); b.setHours(0, 0, 0, 0);
  return +a <= +d0 && +d0 < +b;
};

// ——— regler ———
export const RULES: RuleSet = {
  weekdaysSchool: ["MO", "TU", "WE", "TH", "FR"],
  weekendIsOff: true,
  breaks: [],
  perDateOverrides: {},
  fritidsDates: [],
};

export function classifyDay(dateISO: string, rules: RuleSet): DayType {
  if (rules.perDateOverrides[dateISO]) return rules.perDateOverrides[dateISO].profileId;
  for (const br of rules.breaks) if (inRange(dateISO, br.start, br.end)) return br.profileId ?? "OffDay";
  if (rules.fritidsDates.includes(dateISO)) return "FritidsDay";
  const d = new Date(dateISO + 'T12:00:00Z'); // Use midday to avoid timezone boundary issues
  const code = wd(d);
  if (rules.weekdaysSchool.includes(code as any)) return "SchoolDay";
  return rules.weekendIsOff ? "OffDay" : "OffDay";
}

// ——— profiler (fyll på dina steg) ———
// Reverse-engineered from the old DEFAULT_EVENTS
const schoolDaySteps: TemplateStep[] = [
    // Pre-morning sleep events to ensure grid has rows to scroll up from
    { key: "sleep-1", personId: "maria", title: "Sover", at: "00:00", location: "home", cluster: "morning" },
    { key: "sleep-1", personId: "leia", title: "Sover", at: "00:00", location: "home", cluster: "morning" },
    { key: "sleep-1", personId: "gabriel", title: "Sover", at: "00:00", location: "home", cluster: "morning" },
    { key: "sleep-1", personId: "antony", title: "Sover", at: "00:00", location: "home", cluster: "morning" },
    { key: "sleep-2", personId: "maria", title: "Sover", at: "02:00", location: "home", cluster: "morning" },
    { key: "sleep-2", personId: "leia", title: "Sover", at: "02:00", location: "home", cluster: "morning" },
    { key: "sleep-2", personId: "gabriel", title: "Sover", at: "02:00", location: "home", cluster: "morning" },
    { key: "sleep-2", personId: "antony", title: "Sover", at: "02:00", location: "home", cluster: "morning" },
    { key: "sleep-3", personId: "maria", title: "Sover", at: "04:00", location: "home", cluster: "morning" },
    { key: "sleep-3", personId: "leia", title: "Sover", at: "04:00", location: "home", cluster: "morning" },
    { key: "sleep-3", personId: "gabriel", title: "Sover", at: "04:00", location: "home", cluster: "morning" },
    { key: "sleep-3", personId: "antony", title: "Sover", at: "04:00", location: "home", cluster: "morning" },

    { key: "maria-wakeup", personId: "maria", title: "Vaknar & kaffe", at: "06:00", minDurationMin: 5, location: "home", cluster: "morning" },
    { key: "maria-morning", personId: "maria", title: "Morgonrutin", at: "07:00", minDurationMin: 15, location: "home", cluster: "morning" },
    { key: "maria-work-am", personId: "maria", title: "Jobb (förmiddag)", at: "08:00", location: "work" },
    { key: "maria-lunch", personId: "maria", title: "Lunch", at: "12:00", minDurationMin: 15, location: "work" },
    { key: "maria-work-pm", personId: "maria", title: "Jobb (eftermiddag)", at: "13:00", location: "work" },
    { key: "maria-pickup", personId: "maria", title: "Hämtar Leia (fritids)", at: "16:30", fixedStart: true, involved: [{ personId: "leia", role: "required" }], resource: "car", location: "city" },
    { key: "family-dinner", personId: "maria", title: "Middag", at: "18:00", minDurationMin: 20, bestDurationMin: 30, involved: [{ personId: "antony", role: "required" }, { personId: "leia", role: "required" }, { personId: "gabriel", role: "required" }], location: "home", cluster: "evening", dependsOnKeys: ["maria-pickup", "leia-pickup", "antony-finish-work", "gabriel-afternoon-play"] },
    { key: "maria-evening", personId: "maria", title: "Kvällsrutin", at: "21:00", minDurationMin: 10, location: "home", cluster: "evening" },

    { key: "leia-wakeup", personId: "leia", title: "Vaknar långsamt", at: "06:00", minDurationMin: 10, location: "home", cluster: "morning" },
    { key: "leia-get-ready", personId: "leia", title: "Vakna", at: "07:00", minDurationMin: 3, location: "home", cluster: "morning" },
    { key: "leia-teeth", personId: "leia", title: "Borsta tänder", at: "07:08", minDurationMin: 2, bestDurationMin: 3, location: "home", cluster: "morning" },
    { key: "leia-breakfast", personId: "leia", title: "Äta frukost", at: "07:16", minDurationMin: 10, bestDurationMin: 15, dependsOnKeys: ["antony-prep-breakfast"], involved: [{ personId: "antony", role: "required" }], location: "home", cluster: "morning" },
    { key: "leia-vitamins", personId: "leia", title: "Ta vitaminer", at: "07:24", minDurationMin: 1, bestDurationMin: 1, dependsOnKeys: ["leia-breakfast"], location: "home", cluster: "morning" },
    { key: "leia-hair", personId: "leia", title: "Borsta hår", at: "07:32", minDurationMin: 2, location: "home", cluster: "morning" },
    { key: "leia-clothes", personId: "leia", title: "Klä på sig", at: "07:40", minDurationMin: 4, bestDurationMin: 6, location: "home", cluster: "morning" },
    { key: "leia-pack", personId: "leia", title: "Packa väska & skor", at: "07:48", minDurationMin: 5, location: "home", cluster: "morning" },
    { key: "leia-school", personId: "leia", title: "Skola", at: "08:00", fixedStart: true, location: "school" },
    { key: "leia-afterschool", personId: "leia", title: "Fritids", at: "13:30", location: "school" },
    { key: "leia-pickup", personId: "leia", title: "Blir hämtad (fritids)", at: "16:30", dependsOnKeys: ["maria-pickup"], involved: [{ personId: "maria", role: "required" }], location: "school", resource: "car" },
    { key: "leia-dinner", personId: "leia", title: "Middag", at: "18:00", minDurationMin: 20, involved: [{ personId: "maria", role: "required" }, { personId: "antony", role: "required" }, { personId: "gabriel", role: "helper" }], location: "home", cluster: "evening", dependsOnKeys: ["family-dinner"] },
    { key: "leia-homework", personId: "leia", title: "Läxor", at: "19:00", minDurationMin: 15, bestDurationMin: 20, location: "home" },
    { key: "leia-play", personId: "leia", title: "Spel / lugn", at: "20:00", minDurationMin: 5, location: "home" },
    { key: "leia-evening", personId: "leia", title: "Kvällsrutin", at: "21:00", minDurationMin: 10, location: "home", cluster: "evening" },
    
    { key: "gabriel-wakeup", personId: "gabriel", title: "Morgonmys", at: "06:00", minDurationMin: 5, location: "home" },
    { key: "gabriel-get-ready", personId: "gabriel", title: "Vakna & påklädning", at: "07:00", minDurationMin: 8, location: "home", cluster: "morning" },
    { key: "gabriel-breakfast", personId: "gabriel", title: "Frukost", at: "07:20", minDurationMin: 8, dependsOnKeys: ["antony-prep-breakfast"], involved: [{ personId: "antony", role: "required" }], location: "home", cluster: "morning" },
    { key: "gabriel-teeth-shoes", personId: "gabriel", title: "Tänder & skor", at: "07:40", minDurationMin: 4, location: "home", cluster: "morning" },
    { key: "gabriel-preschool", personId: "gabriel", title: "Förskola", at: "08:00", fixedStart: true, location: "school" },
    { key: "gabriel-afternoon-play", personId: "gabriel", title: "Lek & mellis", at: "13:00", minDurationMin: 20, location: "home" },
    { key: "gabriel-dinner", personId: "gabriel", title: "Middag", at: "18:00", minDurationMin: 20, involved: [{ personId: "maria", role: "required" }, { personId: "antony", role: "required" }, { personId: "leia", role: "helper" }], location: "home", cluster: "evening", dependsOnKeys: ["family-dinner"] },
    { key: "gabriel-lego", personId: "gabriel", title: "Lego", at: "19:00", minDurationMin: 5, location: "home" },
    { key: "gabriel-evening", personId: "gabriel", title: "Kvällsrutin", at: "21:00", minDurationMin: 10, location: "home", cluster: "evening" },

    { key: "antony-prep-breakfast", personId: "antony", title: "Fixa frukost", at: "07:00", minDurationMin: 6, location: "home", resource: "kitchen", cluster: "morning" },
    { key: "antony-breakfast", personId: "antony", title: "Äta frukost (med barnen)", at: "07:10", minDurationMin: 10, involved: [{ personId: "leia", role: "required" }, { personId: "gabriel", role: "required" }], location: "home", cluster: "morning" },
    { key: "antony-get-ready", personId: "antony", title: "Göra sig klar", at: "07:30", minDurationMin: 6, location: "home", cluster: "morning" },
    { key: "antony-help-leia", personId: "antony", title: "Hjälpa Leia bli klar", at: "07:40", minDurationMin: 8, involved: [{ personId: "leia", role: "required" }], location: "home", cluster: "morning" },
    { key: "antony-help-gabriel", personId: "antony", title: "Hjälpa Gabriel med väskan", at: "07:50", minDurationMin: 3, involved: [{ personId: "gabriel", role: "required" }], location: "home", cluster: "morning" },
    { key: "antony-walk-leia", personId: "antony", title: "Gå med Leia", at: "07:55", minDurationMin: 5, involved: [{ personId: "leia", role: "required" }], location: "street", cluster: "morning" },
    { key: "antony-work-am", personId: "antony", title: "Jobb (hemma)", at: "08:00", location: "home" },
    { key: "antony-lunch", personId: "antony", title: "Lunch", at: "12:00", minDurationMin: 15, location: "home" },
    { key: "antony-finish-work", personId: "antony", title: "Jobb (hemma)", at: "13:00", location: "home" },
    { key: "antony-dinner", personId: "antony", title: "Middag", at: "18:00", minDurationMin: 20, involved: [{ personId: "maria", role: "required" }, { personId: "leia", role: "required" }, { personId: "gabriel", role: "required" }], location: "home", cluster: "evening", dependsOnKeys: ["family-dinner"] },
];

export const PROFILES: Record<DayType, DayProfile> = {
  SchoolDay: { id: "SchoolDay", label: "Skoldag", steps: schoolDaySteps },
  OffDay: { id: "OffDay", label: "Fridag/Lov", steps: [] },
  FritidsDay: { id: "FritidsDay", label: "Fritidsdag", steps: [] },
};

// kvällsregler använder “i morgon” för vissa steg (atByNextDayType)
function resolveAt(step: TemplateStep, dateISO: string, nextDayType: DayType | null) {
  if (step.cluster === "evening" && nextDayType && step.atByNextDayType?.[nextDayType]) {
    return step.atByNextDayType[nextDayType]!;
  }
  if (step.at) return step.at;
  const off = step.offsetMin ?? 0, h = String(Math.floor(off / 60)).padStart(2, "0"), m = String(off % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function expandProfileForDate(dateISO: string, profile: DayProfile, nextDayType: DayType | null): Event[] {
  const tmp = profile.steps.map(s => {
    const hhmm = resolveAt(s, dateISO, nextDayType);
    const startMs = hhmmToMs(dateISO, hhmm);
    return { s, startMs, hhmm };
  }).sort((a, b) => a.startMs - b.startMs || a.s.personId.localeCompare(b.s.personId) || a.s.key.localeCompare(b.s.key));

  const idOfKey = new Map<string, string>();
  const evs: Event[] = tmp.map(({ s, startMs }) => {
    const id = `${s.personId}-${s.key}-${dateISO}`;
    idOfKey.set(s.key, id);
    return {
      id, personId: s.personId, title: s.title,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + 60_000).toISOString(), // justeras strax
      minDurationMin: s.minDurationMin,
      bestDurationMin: s.bestDurationMin,
      fixedStart: s.fixedStart,
      allowPreemption: s.allowPreemption,
      involved: s.involved, resource: s.resource, location: s.location, cluster: s.cluster,
      meta: { templateKey: s.key, dayType: profile.id, source: 'template' },
    };
  });

  // end = nästa start för samma person (annars minDuration eller +10min)
  const persons = Array.from(new Set(tmp.map(x => x.s.personId)));
  for (const pid of persons) {
    const personEventsIndices = tmp.map((x, i) => ({ i, x })).filter(xx => xx.x.s.personId === pid);
    for (let k = 0; k < personEventsIndices.length; k++) {
      const curIdx = personEventsIndices[k].i;
      const nextEventStartMs = personEventsIndices[k + 1]?.x.startMs;
      const currentEvent = evs[curIdx];
      const durationMin = currentEvent.bestDurationMin ?? currentEvent.minDurationMin ?? 10;
      const endMs = nextEventStartMs ?? (+new Date(currentEvent.start) + (durationMin * 60_000));
      currentEvent.end = new Date(endMs).toISOString();
    }
  }

  // dependsOnKeys → dependsOn
  for (const e of evs) {
    const key = e.meta?.templateKey;
    if (!key) continue;
    const tmpl = profile.steps.find(s => s.key === key);
    const deps = tmpl?.dependsOnKeys ?? [];
    e.dependsOn = deps.map(k => idOfKey.get(k)!).filter(Boolean);
  }
  return evs;
}

export function expandDay(dateISO: string, rules = RULES) {
  const todayType = classifyDay(dateISO, rules);
  const tomorrow = plusDaysISO(dateISO, 1);
  const tomorrowType = classifyDay(tomorrow, rules);
  const profile = PROFILES[todayType];
  const events = expandProfileForDate(dateISO, profile, tomorrowType);
  return { todayType, tomorrowType, events };
}

// Sanity-check (can be run in a useEffect hook for testing)
export function sanityCheck() {
    const d = "2025-09-06"; // lördag
    const { todayType } = expandDay(d, RULES);
    console.assert(todayType === "OffDay", `Helg ska klassas som OffDay, fick ${todayType}`);
  
    const rules2 = { ...RULES, fritidsDates: ["2025-09-10"] };
    const { todayType: t2 } = expandDay("2025-09-10", rules2);
    console.assert(t2 === "FritidsDay", `Fritidsdatum ska ge FritidsDay, fick ${t2}`);
    console.log("Sanity check passed.");
}
