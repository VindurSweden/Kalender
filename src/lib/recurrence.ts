
import type { DayType, Role, TemplateStep, DayProfile, Event, RuleSet } from '@/types/event';

// ——— helpers ———
const hhmmToMs = (dateISO: string, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(dateISO);
    d.setHours(h, m, 0, 0); // Use local hours to match template time
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


// =================================================================
// GRUNDMALL FÖR SKOLDAGAR (baserad på detaljerad JSON)
// =================================================================
const schoolDaySteps: TemplateStep[] = [
    // --- Söndag kväll (förberedelser) ---
    { key: "evening-prep-clothes", personId: "maria", title: "Lägga fram kläder", at: "19:00", minDurationMin: 10, cluster: 'evening', location: 'home' },
    { key: "evening-snack", personId: "antony", title: "Kvällsfika", at: "19:15", minDurationMin: 10, involved: [{personId: 'leia', role: 'required'}, {personId: 'gabriel', role: 'required'}], cluster: 'evening', location: 'home', resource: 'kitchen' },
    { key: "evening-melatonin", personId: "maria", title: "Melatonin", at: "19:30", minDurationMin: 2, dependsOnKeys: ['evening-snack'], involved: [{personId: 'leia', role: 'required'}, {personId: 'gabriel', role: 'required'}], cluster: 'evening', location: 'home' },
    { key: "evening-teeth-leia", personId: "maria", title: "Tandborstning Leia (kväll)", at: "20:00", minDurationMin: 3, bestDurationMin: 5, dependsOnKeys: ['evening-melatonin'], involved: [{personId: 'leia', role: 'required'}], allowAlone: false, cluster: 'evening', location: 'home', resource: 'bathroom' },
    { key: "evening-teeth-gabriel", personId: "antony", title: "Tandborstning Gabriel (kväll)", at: "20:00", minDurationMin: 3, bestDurationMin: 5, dependsOnKeys: ['evening-melatonin'], involved: [{personId: 'gabriel', role: 'required'}], allowAlone: false, cluster: 'evening', location: 'home', resource: 'bathroom' },
    { key: "evening-bedtime-leia", personId: "maria", title: "Nattning Leia", at: "20:15", minDurationMin: 10, bestDurationMin: 15, dependsOnKeys: ['evening-teeth-leia'], involved: [{personId: 'leia', role: 'required'}], cluster: 'evening', location: 'home' },
    { key: "evening-bedtime-gabriel", personId: "antony", title: "Nattning Gabriel", at: "20:30", minDurationMin: 10, bestDurationMin: 15, dependsOnKeys: ['evening-teeth-gabriel'], involved: [{personId: 'gabriel', role: 'required'}], cluster: 'evening', location: 'home' },
    
    // --- Sömn ---
    { key: "sleep-antony", personId: "antony", title: "Sover", at: "22:00", minDurationMin: 480, cluster: 'evening', location: 'home' },
    { key: "sleep-maria", personId: "maria", title: "Sover", at: "22:00", minDurationMin: 450, cluster: 'evening', location: 'home' },
    { key: "sleep-leia", personId: "leia", title: "Sover", at: "20:30", minDurationMin: 600, dependsOnKeys: ['evening-bedtime-leia'], location: 'home' },
    { key: "sleep-gabriel", personId: "gabriel", title: "Sover", at: "20:45", minDurationMin: 585, dependsOnKeys: ['evening-bedtime-gabriel'], location: 'home' },

    // --- Måndag morgon ---
    { key: "maria-wake", personId: "maria", title: "Vakna & Gör dig klar", at: "05:30", minDurationMin: 30, cluster: 'morning', location: 'home', resource: 'bathroom', dependsOnKeys: ['sleep-maria'] },
    { key: "antony-wake", personId: "antony", title: "Vakna & Kaffe", at: "06:00", minDurationMin: 15, cluster: 'morning', location: 'home', resource: 'kitchen', dependsOnKeys: ['sleep-antony'] },
    { key: "antony-teeth-kitchen", personId: "antony", title: "Tänder & plocka kök", at: "06:15", minDurationMin: 15, dependsOnKeys: ['antony-wake'], cluster: 'morning', location: 'home' },
    { key: "gabriel-wake", personId: "antony", title: "Väck Gabriel", at: "06:30", minDurationMin: 5, cluster: 'morning', location: 'home', involved: [{personId: 'gabriel', role: 'required'}], dependsOnKeys: ['sleep-gabriel'] },
    { key: "gabriel-breakfast", personId: "gabriel", title: "Frukost", at: "06:35", minDurationMin: 10, bestDurationMin: 15, dependsOnKeys: ['gabriel-wake'], cluster: 'morning', location: 'home', resource: 'kitchen' },
    { key: "leia-wake", personId: "maria", title: "Väck Leia", at: "06:45", minDurationMin: 5, cluster: 'morning', location: 'home', involved: [{personId: 'leia', role: 'required'}], dependsOnKeys: ['sleep-leia'] },
    { key: "leia-breakfast", personId: "leia", title: "Frukost", at: "06:50", minDurationMin: 15, bestDurationMin: 20, dependsOnKeys: ['leia-wake'], cluster: 'morning', location: 'home', resource: 'kitchen' },
    
    { key: "vitamins-gabriel", personId: "antony", title: "Vitaminer Gabriel", at: "07:00", minDurationMin: 2, dependsOnKeys: ['gabriel-breakfast'], cluster: 'morning', location: 'home', involved: [{personId: 'gabriel', role: 'required'}] },
    { key: "vitamins-leia", personId: "antony", title: "Vitaminer Leia", at: "07:10", minDurationMin: 2, dependsOnKeys: ['leia-breakfast'], cluster: 'morning', location: 'home', involved: [{personId: 'leia', role: 'required'}] },

    { key: "gabriel-clothes", personId: "gabriel", title: "Klä på sig", at: "07:02", minDurationMin: 8, bestDurationMin: 10, dependsOnKeys: ['vitamins-gabriel'], cluster: 'morning', location: 'home' },
    { key: "leia-clothes", personId: "leia", title: "Klä på sig", at: "07:12", minDurationMin: 8, bestDurationMin: 10, dependsOnKeys: ['vitamins-leia'], cluster: 'morning', location: 'home' },
    
    { key: "leia-hair", personId: "maria", title: "Fixa Leias hår", at: "07:30", minDurationMin: 10, bestDurationMin: 10, dependsOnKeys: ['leia-clothes'], involved: [{personId: 'leia', role: 'required'}], cluster: 'morning', location: 'home' },
    
    { key: "gabriel-teeth", personId: "gabriel", title: "Borsta tänder", at: "07:20", minDurationMin: 3, bestDurationMin: 5, dependsOnKeys: ['gabriel-clothes'], cluster: 'morning', location: 'home', resource: 'bathroom' },
    { key: "leia-teeth", personId: "leia", title: "Borsta tänder", at: "07:40", minDurationMin: 3, bestDurationMin: 5, dependsOnKeys: ['leia-hair'], cluster: 'morning', location: 'home', resource: 'bathroom' },

    { key: "gabriel-departure", personId: "gabriel", title: "Avfärd skola", at: "07:40", minDurationMin: 10, fixedStart: false, dependsOnKeys: ['gabriel-teeth'], cluster: 'day', location: 'home' },
    { key: "antony-leia-departure", personId: "antony", title: "Lämna Leia på skolan", at: "07:50", minDurationMin: 10, dependsOnKeys: ['leia-teeth', 'gabriel-departure'], involved: [{personId: 'leia', role: 'required'}], cluster: 'day', location: 'home', resource: 'car' },
    { key: "leia-school-transport", personId: "leia", title: "Åker till skolan", at: "07:50", minDurationMin: 10, dependsOnKeys: ['antony-leia-departure'], involved: [{personId: 'antony', role: 'required'}], cluster: 'day', location: 'home', resource: 'car' },
    { key: "maria-work-departure", personId: "maria", title: "Åka till jobbet", at: "07:50", minDurationMin: 25, fixedStart: false, dependsOnKeys: ['leia-hair'], cluster: 'day', location: 'home', resource: 'car' },

    // --- Dagaktiviteter ---
    { key: "gabriel-school", personId: "gabriel", title: "Skola", at: "08:00", minDurationMin: 420, fixedStart: true, dependsOnKeys: ['gabriel-departure'], location: 'school' },
    { key: "leia-school", personId: "leia", title: "Skola", at: "08:00", minDurationMin: 420, fixedStart: true, dependsOnKeys: ['leia-school-transport'], location: 'school' },
    { key: "lunch-school", personId: "gabriel", title: "Lunch (Skolan)", at: "12:00", minDurationMin: 30, location: 'school', dependsOnKeys: ['gabriel-school'], involved: [{personId: 'leia', role: 'required'}] },
    { key: "gabriel-meds-school", personId: "gabriel", title: "Medicin (Skolan)", at: "12:30", minDurationMin: 5, location: 'school', dependsOnKeys: ['lunch-school'] },
    { key: "fika-school", personId: "gabriel", title: "Fika (Skolan)", at: "15:00", minDurationMin: 20, location: 'school', dependsOnKeys: ['gabriel-school'], involved: [{personId: 'leia', role: 'required'}]},
    { key: "maria-work", personId: "maria", title: "Jobb", at: "08:15", minDurationMin: 480, fixedStart: false, dependsOnKeys: ['maria-work-departure'], location: 'work' },
    { key: "antony-work", personId: "antony", title: "Jobb (hemma)", at: "08:00", minDurationMin: 420, dependsOnKeys: ['antony-leia-departure'], location: 'home' },
    { key: "leia-pickup", personId: "antony", title: "Hämta Leia", at: "15:00", minDurationMin: 30, location: 'school', resource: 'car', involved: [{personId: 'leia', role: 'required'}] },
];

// =================================================================
// AUTOMATISKT GENERERADE MALLAR
// =================================================================

// Helper function to shift HH:MM time by a given number of hours
const shiftTime = (time: string, hours: number): string => {
  const [h, m] = time.split(':').map(Number);
  const newH = (h + hours); // Don't wrap around 24h for simple shifts
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ** OFF DAY (Ledig dag) **
// Baseras på skoldag, men allt är förskjutet +1 timme och jobb/skol-relaterade saker är borttagna.
const offDaySteps: TemplateStep[] = schoolDaySteps
  .filter(step => !step.title.toLowerCase().includes('jobb') && !step.title.toLowerCase().includes('skola') && !step.title.toLowerCase().includes('(skolan)'))
  .map(step => {
    // Shift all 'at' times by 1 hour
    if (step.at) {
      return { ...step, at: shiftTime(step.at, 1) };
    }
    return step;
  })
  .concat([
      { key: "lunch-home", personId: "antony", title: "Lunch", at: "13:00", minDurationMin: 30, location: 'home', involved: [{personId: 'maria', role: 'helper'}, {personId: 'gabriel', role: 'required'}, {personId: 'leia', role: 'required'}] },
      { key: "gabriel-meds-12", personId: "maria", title: "Medicin Gabriel (12:00)", at: "13:30", minDurationMin: 5, location: 'home', dependsOnKeys: ['lunch-home'], involved: [{personId: 'antony', role: 'required'}, {personId: 'gabriel', role: 'required'}]},
      { key: "fika-home", personId: "antony", title: "Fika", at: "16:00", minDurationMin: 20, location: 'home', involved: [{personId: 'maria', role: 'helper'}, {personId: 'gabriel', role: 'required'}, {personId: 'leia', role: 'required'}] },
      { key: "gabriel-meds-15", personId: "antony", title: "Medicin Gabriel (15:00)", at: "16:20", minDurationMin: 5, location: 'home', dependsOnKeys: ['fika-home'], involved: [{personId: 'gabriel', role: 'required'}]},
  ]);


// ** FRITIDS DAY **
// Baseras på skoldag, men Gabriel är hemma.
const fritidsDaySteps: TemplateStep[] = schoolDaySteps
  .filter(step => {
    // Remove Gabriel's school and departure events, but keep school-lunch for Leia
    return !['gabriel-school', 'gabriel-departure'].includes(step.key);
  })
  .map(step => {
    if (step.key === 'lunch-school' || step.key === 'fika-school') {
        return {...step, involved: step.involved?.filter(p => p.personId !== 'gabriel')};
    }
    // Remove dependency on Gabriel's departure for Leia
    if (step.key === 'antony-leia-departure' || step.key === 'leia-school-transport') {
      const newDepends = step.dependsOnKeys?.filter(dep => dep !== 'gabriel-departure');
      return { ...step, dependsOnKeys: newDepends };
    }
    return step;
  }).concat([
      { key: "lunch-gabriel-home", personId: "antony", title: "Lunch Gabriel", at: "12:00", minDurationMin: 30, location: 'home', involved: [{personId: 'gabriel', role: 'required'}, {personId: 'maria', role: 'helper'}]},
      { key: "gabriel-meds-12-fritids", personId: "maria", title: "Medicin Gabriel (12:00)", at: "12:30", minDurationMin: 5, location: 'home', dependsOnKeys: ['lunch-gabriel-home'], involved: [{personId: 'antony', role: 'required'}, {personId: 'gabriel', role: 'required'}]},
      { key: "fika-gabriel-home", personId: "antony", title: "Fika Gabriel", at: "15:00", minDurationMin: 20, location: 'home', involved: [{personId: 'gabriel', role: 'required'}]},
      { key: "gabriel-meds-15-fritids", personId: "antony", title: "Medicin Gabriel (15:00)", at: "15:20", minDurationMin: 5, location: 'home', dependsOnKeys: ['fika-gabriel-home'], involved: [{personId: 'gabriel', role: 'required'}]},
  ]);


// =================================================================
// EXPORTERADE PROFILER
// =================================================================

export const PROFILES: Record<DayType, DayProfile> = {
  SchoolDay: { id: "SchoolDay", label: "Skoldag", steps: schoolDaySteps },
  OffDay: { id: "OffDay", label: "Ledig dag", steps: offDaySteps },
  FritidsDay: { id: "FritidsDay", label: "Fritidsdag", steps: fritidsDaySteps },
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
    // Use personId from the step, which should be 'antony' or 'maria' etc.
    const personId = s.personId;
    return { s, startMs, hhmm, personId };
  }).sort((a, b) => a.startMs - b.startMs || a.s.key.localeCompare(b.s.key));

  const idOfKey = new Map<string, string>();
  const evs: Event[] = tmp.map(({ s, startMs, personId }) => {
    const id = `${personId}-${s.key}-${dateISO}`;
    idOfKey.set(s.key, id);
    return {
      id, personId: personId, title: s.title,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + 60_000).toISOString(), // justeras strax
      minDurationMin: s.minDurationMin,
      bestDurationMin: s.bestDurationMin,
      fixedStart: s.fixedStart,
      allowPreemption: s.allowPreemption,
      involved: s.involved, 
      allowAlone: s.allowAlone,
      resource: s.resource, 
      location: s.location, 
      cluster: s.cluster,
      meta: { templateKey: s.key, dayType: profile.id, source: 'template' },
    };
  });

  // end = nästa start för samma person (annars minDuration eller +10min)
  const persons = Array.from(new Set(tmp.map(x => x.personId)));
  for (const pid of persons) {
    const personEventsIndices = tmp.map((x, i) => ({ i, x })).filter(xx => xx.x.personId === pid);
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
