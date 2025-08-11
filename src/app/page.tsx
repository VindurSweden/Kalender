
"use client";

import React, { useEffect, useMemo, useRef, useState, FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon,
  Plus,
  Mic,
  Settings,
  Play,
  ChevronLeft,
  ChevronRight,
  Timer as TimerIcon,
  Trash2,
  Bot,
  User,
  Send,
  Loader2,
  Repeat,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { format as formatDateFns } from 'date-fns';
import { interpretUserInstruction } from '@/ai/flows/natural-language-event-creation';
import { formatPlan } from '@/ai/flows/format-plan-flow';
import { generateEventImage } from '@/ai/flows/generate-event-image';
import { Event, Person, ConversationMessage, TolkAIOutput, FormatPlanOutput, TolkAIInput, AiEventType as AiEvent, SingleCalendarOperationType } from '@/types/event';
import { parseFlexibleSwedishDateString, parseFlexibleSwedishTimeString, isSameDay } from '@/lib/date-utils';

const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
const INCR = 20;

function loadLS(key: string, fallback: any) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, value: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

async function boom() {
  if (typeof window === 'undefined') return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    confetti({ particleCount: 200, spread: 75, origin: { y: 0.7 } });
  } catch {}
}

const DEFAULT_PEOPLE: Person[] = [
  { id: "leia", name: "Leia", color: "#F28CB2", bg: "bg-pink-600/40", speak: true },
  { id: "gabriel", name: "Gabriel", color: "#5B9BFF", bg: "bg-blue-600/40", speak: true },
  { id: "pappa", name: "Pappa", color: "#8AE68C", bg: "bg-green-600/40" },
  { id: "mamma", name: "Mamma", color: "#C9A7FF", bg: "bg-purple-600/40" },
];

const DEFAULT_EVENTS: Event[] = [
    // Gabriel
    { id: uid(), title: "Skola", personId: "gabriel", start: `${todayISO()}T08:00:00`, end: `${todayISO()}T13:30:00`, recurrence: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
    { id: uid(), title: "Borsta tänderna", personId: "gabriel", start: `${todayISO()}T07:30:00`, end: `${todayISO()}T07:45:00`, challenge: "Klar innan timern tar slut" },
    
    // Leia's detailed morning
    { id: uid(), title: "Vakna & klä på dig", personId: "leia", start: `${todayISO()}T07:00:00`, end: `${todayISO()}T07:10:00` },
    { id: uid(), title: "Gå på toa", personId: "leia", start: `${todayISO()}T07:10:00`, end: `${todayISO()}T07:15:00` },
    { id: uid(), title: "Äta frukost", personId: "leia", start: `${todayISO()}T07:15:00`, end: `${todayISO()}T07:35:00` },
    { id: uid(), title: "Medicin", personId: "leia", start: `${todayISO()}T07:35:00`, end: `${todayISO()}T07:40:00` },
    { id: uid(), title: "Borsta tänderna", personId: "leia", start: `${todayISO()}T07:40:00`, end: `${todayISO()}T07:45:00` },
    { id: uid(), title: "Packa väskan", personId: "leia", start: `${todayISO()}T07:45:00`, end: `${todayISO()}T07:50:00` },
    { id: uid(), title: "Ta på skor & jacka", personId: "leia", start: `${todayISO()}T07:50:00`, end: `${todayISO()}T07:55:00` },
    { id: uid(), title: "Gå till skolan", personId: "leia", start: `${todayISO()}T07:55:00`, end: `${todayISO()}T08:00:00` },
    { id: uid(), title: "I skolan", personId: "leia", start: `${todayISO()}T08:00:00`, end: `${todayISO()}T13:30:00` },
    { id: uid(), title: "Åka till träning", personId: "leia", start: `${todayISO()}T16:00:00`, end: `${todayISO()}T17:30:00` },
    
    // Family
    { id: uid(), title: "Middag", personId: "family", start: `${todayISO()}T17:30:00`, end: `${todayISO()}T18:00:00`, isFamily: true, recurrence: "FREQ=DAILY" },
];


// --- Spec Implementation ---
const toOngoingTitle = (base: string): string => {
    const patterns: [RegExp, string][] = [
        [/^Åka till (.+)/i, 'Är på $1'],
        [/^Åker till (.+)/i, 'Är på $1'],
        [/^Gå till (.+)/i, 'Är på $1'],
    ];
    for (const [regex, replacement] of patterns) {
        const match = base.match(regex);
        if (match) return replacement.replace('$1', match[1]);
    }
    return `${base} (pågår)`;
};

const presentTitle = (ev: Event, viewConfig: { assistant: { enableLanguagePolish: boolean } }): string => {
    if (ev.meta?.isContinuation && viewConfig.assistant.enableLanguagePolish) {
        return toOngoingTitle(ev.title);
    }
    return ev.title;
};

const makeSyntheticEvent = (start: Date, end: Date, personId: string, mode: "sleep_idle" | "unknown" = "sleep_idle"): Event => {
    const isNightTime = start.getHours() >= 22 || start.getHours() < 6;
    const title = (mode === "sleep_idle" && isNightTime) ? "Sover" : (mode === "sleep_idle" ? "Tillgänglig" : "Okänt");
    return {
        id: `syn-${personId}-${start.toISOString()}`,
        personId,
        start: start.toISOString(),
        end: end.toISOString(),
        title,
        meta: { synthetic: true, source: "assistant" }
    };
};

const synthesizeDayFill = (personEvents: Event[], personId: string, day: Date, cfg: { assistant: { enableDayFill: boolean, dayStart: string, dayEnd: string, dayFillMode?: "sleep_idle" | "unknown" } }): Event[] => {
    if (!cfg.assistant.enableDayFill) return personEvents;

    const dayStart = new Date(day);
    const [startH, startM] = (cfg.assistant.dayStart || "00:00").split(':').map(Number);
    dayStart.setHours(startH, startM, 0, 0);

    const dayEnd = new Date(day);
    const [endH, endM] = (cfg.assistant.dayEnd || "24:00").split(':').map(Number);
    if(endH === 24) {
        dayEnd.setDate(dayEnd.getDate() + 1);
        dayEnd.setHours(0,0,0,0);
    } else {
        dayEnd.setHours(endH, endM, 0, 0);
    }
    
    const out: Event[] = [];
    const sorted = [...personEvents].sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    let cursor = dayStart.getTime();

    for (const ev of sorted) {
        const startTs = new Date(ev.start).getTime();
        const endTs = new Date(ev.end).getTime();

        if (cursor < startTs) {
            out.push(makeSyntheticEvent(new Date(cursor), new Date(startTs), personId, cfg.assistant.dayFillMode));
        }
        out.push(ev);
        cursor = Math.max(cursor, endTs);
    }

    if (cursor < dayEnd.getTime()) {
        out.push(makeSyntheticEvent(new Date(cursor), dayEnd, personId, cfg.assistant.dayFillMode));
    }

    return out;
};


// --- Main Component ---
export default function NPFScheduleApp() {
  const [isClient, setIsClient] = useState(false);
  const [people, setPeople] = useState<Person[]>(DEFAULT_PEOPLE);
  const [events, setEvents] = useState<Event[]>(DEFAULT_EVENTS);
  const [date, setDate] = useState(() => new Date());
  const [showFor, setShowFor] = useState<string[]>(DEFAULT_PEOPLE.slice(0, 2).map(p => p.id));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dark, setDark] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { toast } = useToast();

  // Hydration fix: Load from localStorage only on the client
  useEffect(() => {
    setIsClient(true);
    setPeople(loadLS("npf.people", DEFAULT_PEOPLE));
    setEvents(loadLS("npf.events", DEFAULT_EVENTS));
    setShowFor(loadLS("npf.showFor", DEFAULT_PEOPLE.slice(0, 2).map(p => p.id)));
  }, []);

  const viewConfig = useMemo(() => ({
    SLOTS: 5,
    fillPolicy: "repeat" as const,
    assistant: {
        enableLanguagePolish: true,
        enableDayFill: false, // Keep this off by default for now
        dayFillMode: "sleep_idle" as const,
        dayStart: "07:00",
        dayEnd: "22:00"
    }
  }), []);

  useEffect(() => { if (isClient) saveLS("npf.people", people)}, [people, isClient]);
  useEffect(() => { if (isClient) saveLS("npf.events", events)}, [events, isClient]);
  useEffect(() => { if (isClient) saveLS("npf.showFor", showFor)}, [showFor, isClient]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const orderedShowFor = useMemo(() => {
    const order = new Map(people.map((p, i) => [p.id, i]));
    return [...showFor].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }, [showFor, people]);

  const tickRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!runningId) return;
    const ev = events.find(e => e.id === runningId);
    if (!ev) return;
    const compute = () => setProgress(progressForEvent(ev, Date.now()));
    compute();
    tickRef.current = setInterval(compute, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [runningId, events]);

  // --- View Logic ---
  const columnsData = useMemo(() => {
    if (!isClient) return [];
    
    const allEventsForDay = events.filter(e => isSameDay(new Date(e.start), date) && (orderedShowFor.includes(e.personId) || (e.isFamily && orderedShowFor.length > 0)));

    const allTimeKeys = [...new Set(allEventsForDay.map(e => new Date(e.start).getTime()))].sort();
    
    const timeSlots = allTimeKeys.slice(0, viewConfig.SLOTS);
    
    return orderedShowFor.map(personId => {
      const person = people.find(p => p.id === personId)!;
      let personEventsToday = events.filter(e => isSameDay(new Date(e.start), date) && (e.personId === personId || (e.isFamily && e.personId === 'family' && orderedShowFor.includes(personId))));

      if (viewConfig.assistant.enableDayFill) {
          personEventsToday = synthesizeDayFill(personEventsToday, personId, date, viewConfig);
      }
      
      const eventGrid: (Event | null)[] = [];
      let lastRealEvent: Event | null = null;
      
      for(const timeKey of timeSlots) {
        const eventInSlot = personEventsToday.find(e => new Date(e.start).getTime() === timeKey);
        if (eventInSlot) {
            eventGrid.push(eventInSlot);
            lastRealEvent = eventInSlot;
        } else {
            const isSpannedByLastEvent = lastRealEvent && timeKey > new Date(lastRealEvent.start).getTime() && timeKey < new Date(lastRealEvent.end).getTime();
            if (viewConfig.fillPolicy === 'repeat' && isSpannedByLastEvent) {
                eventGrid.push({ ...lastRealEvent, meta: { ...lastRealEvent.meta, isContinuation: true } });
            } else {
                eventGrid.push(null);
            }
        }
      }
      
      while(eventGrid.length < viewConfig.SLOTS) {
        if(viewConfig.fillPolicy === 'repeat' && lastRealEvent && new Date(lastRealEvent.end) > (timeSlots.length > 0 ? new Date(timeSlots[timeSlots.length - 1] || 0) : new Date(0))) {
             eventGrid.push({ ...lastRealEvent, meta: { ...lastRealEvent.meta, isContinuation: true } });
        } else {
             eventGrid.push(null);
        }
      }

      return { person, eventGrid };
    });
  }, [date, events, orderedShowFor, people, viewConfig, isClient]);
  
  // --- Event Handlers ---
    const handleEventOperation = async (op: SingleCalendarOperationType, imageHint?: string): Promise<Event | null> => {
        const { commandType, eventIdentifier, eventDetails } = op;
        
        if (commandType.toUpperCase() === 'CREATE' && eventDetails) {
            const newStart = parseFlexibleSwedishDateString(eventDetails.dateQuery || '', new Date()) || date;
            const newTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery || '', newStart);
            if(newTime) {
                newStart.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);
            }

            const personId = people.find(p => p.name.toLowerCase() === (eventDetails.person?.toLowerCase() || ''))?.id || orderedShowFor[0] || people[0].id;
            
            const conflict = events.some(e => e.personId === personId && new Date(e.start).getTime() === newStart.getTime());
            if (conflict) {
                toast({ title: "Konflikt!", description: `Det finns redan en händelse för ${eventDetails.person || personId} vid denna tid.`, variant: "destructive" });
                return null;
            }
            
            try {
              const title = eventDetails.title || 'AI Händelse';
              const start = newStart.toISOString();
              const end = new Date(newStart.getTime() + INCR * 60 * 1000).toISOString();
              
              let imageUrl: string | undefined = undefined;
              if (title) {
                try {
                  const imageResult = await generateEventImage({ eventTitle: title, imageHint });
                  imageUrl = imageResult.imageUrl;
                } catch (err) { console.error("Image generation failed", err) }
              }

              const newEvent: Event = {
                id: uid(),
                title,
                personId,
                start,
                end,
                imageUrl,
                challenge: eventDetails.description,
                meta: { source: 'assistant' }
              };
              
              setEvents(prev => [...prev, newEvent].sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
              return newEvent;

            } catch (e) {
              console.error("[AI Create] Error:", e);
              toast({ title: "Internt Fel", description: "Kunde inte skapa händelse från AI instruktion.", variant: "destructive" });
              return null;
            }
        }
        // Lägg till MODIFY och DELETE här senare
        return null;
  };

  const handleGenerateImage = async (event: Event) => {
    if (!event) return;
    toast({ title: 'Bildgenerering', description: 'AI:n skapar en bild för din händelse...' });
    try {
      const result = await generateEventImage({ eventTitle: event.title, imageHint: '' });
      if (result.imageUrl) {
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, imageUrl: result.imageUrl } : e));
        toast({ title: 'Bild genererad!', description: 'Bilden har lagts till på din händelse.' });
      } else {
        throw new Error('Image URL was empty.');
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      toast({ variant: 'destructive', title: 'Fel vid bildgenerering', description: 'Kunde inte skapa bilden.' });
    }
  };
  
  function deleteEvent(id: string) { setEvents(prev => prev.filter(ev => ev.id !== id)); }
  function toggleComplete(id: string) { setEvents(prev => prev.map(ev => (ev.id === id ? { ...ev, completed: !ev.completed } : ev))); boom(); }
  function longPressFilter(personId: string) { setShowFor([personId]); }
  useEffect(() => { if (typeof window !== 'undefined') { if (dark) document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark"); } }, [dark]);

  if (!isClient) {
    return null; // Or a loading spinner
  }

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 antialiased">
      <Header date={date} shift={(d) => setDate(new Date(date.setDate(date.getDate() + d)))} dark={dark} setDark={setDark} assistantOpen={assistantOpen} setAssistantOpen={setAssistantOpen} />
      <main className="p-3 md:p-6 max-w-[1600px] mx-auto">
        <Toolbar people={people} showFor={showFor} setShowFor={setShowFor} />
        
        <div className={`grid gap-4 mt-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-${orderedShowFor.length > 0 ? Math.min(orderedShowFor.length, 3) : 1}`}>
          {columnsData.map(({ person, eventGrid }) => (
            <div key={person.id} className={`rounded-2xl p-1 md:p-2 border-t border-neutral-800 ${person.bg}`}>
              <div className="flex items-center gap-2 mb-2 select-none sticky top-[70px] bg-neutral-950/80 backdrop-blur-sm p-2 rounded-lg z-10" onPointerDown={()=>longPressFilter(person.id)}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: person.color }} />
                <div className="font-semibold">{person.name}</div>
              </div>
              <div className="space-y-3 relative">
                {eventGrid.map((eventOrNull, index) =>
                  eventOrNull ? (
                    <EventCard
                      key={`${eventOrNull.id}-${index}`}
                      person={person}
                      ev={eventOrNull}
                      onDelete={deleteEvent}
                      onComplete={toggleComplete}
                      onPickTimer={setRunningId}
                      onGenerate={handleGenerateImage}
                      runningId={runningId}
                      now={now}
                      showSimple={orderedShowFor.length > 1}
                      viewConfig={viewConfig}
                    />
                  ) : (
                    <div key={`empty-${person.id}-${index}`} className="h-40 rounded-xl bg-neutral-900/10" />
                  )
                )}
              </div>
            </div>
          ))}
           {orderedShowFor.length === 0 && (
            <div className="col-span-full text-center p-10 bg-neutral-900/50 rounded-2xl">
              <p className="text-neutral-400">Välj en eller flera personer i verktygsfältet för att se deras scheman.</p>
            </div>
          )}
        </div>
      </main>
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} events={events} onAiAction={handleEventOperation} />
    </div>
  );
}

function Header({ date, shift, dark, setDark, assistantOpen, setAssistantOpen }: any) {
  const dstr = date.toLocaleDateString("sv-SE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return (
    <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur border-b border-neutral-800">
      <div className="max-w-[1600px] mx-auto flex items-center gap-2 p-3 md:p-4">
        <CalendarIcon className="w-6 h-6" />
        <h1 className="font-semibold tracking-tight">VisuCal</h1>
        <div className="mx-2 opacity-60 hidden sm:block">{dstr}</div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="icon" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={() => shift(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="icon" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={() => shift(1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700 hidden sm:flex" onClick={() => setDate(new Date())}>Idag</Button>
          <div className="flex items-center gap-3 ml-2">
            <MoonToggle dark={dark} setDark={setDark} />
            <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={() => setAssistantOpen(!assistantOpen)}>Assistent</Button>
            <Dialog>
              <DialogTrigger asChild><Button size="icon" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700"><Settings className="w-4 h-4" /></Button></DialogTrigger>
              <DialogContent className="bg-neutral-900 text-neutral-100 border-neutral-700">
                <DialogHeader><DialogTitle>Inställningar</DialogTitle></DialogHeader>
                <div className="space-y-3 text-sm opacity-80">
                  <p>Här kommer inställningar för Kalenderassistenten.</p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
}

function Toolbar({ people, showFor, setShowFor }: any) {
  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardContent className="p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm opacity-70 mr-2">Visa kolumner:</div>
          {people.map((p: Person) => (
            <button key={p.id}
              onClick={() => setShowFor((s: string[]) => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])}
              className={`px-3 py-1 rounded-full border transition-colors ${showFor.includes(p.id) ? "border-white/60" : "border-white/10"}`}
              style={{ backgroundColor: showFor.includes(p.id) ? `${p.color}33` : "transparent" }}>
              <span className="inline-flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
            </button>
          ))}
          <Button size="sm" variant="secondary" className="ml-auto bg-neutral-800 hover:bg-neutral-700">
            <Mic className="w-4 h-4 mr-2" />Röst (TBD)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EventCard({ person, ev, onDelete, onComplete, onPickTimer, onGenerate, runningId, now, showSimple, viewConfig }: any) {
  const from = fmtTime(ev.start);
  const to = fmtTime(ev.end);
  const activeNow = isNowWithin(ev, now);
  const p = progressForEvent(ev, now);
  const remaining = remainingTime(ev, now);
  const isTimerRunning = runningId === ev.id;
  const displayTitle = presentTitle(ev, viewConfig);

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="h-full">
      <div className={`group rounded-xl overflow-hidden border bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-white/20 h-full flex flex-col ${activeNow ? "border-amber-500/70" : "border-neutral-800"} ${ev.meta?.synthetic ? "border-dashed border-neutral-700" : ""}`}>
        <div className="relative flex-grow h-40">
          <div className="absolute inset-0 w-full h-full bg-neutral-800" onClick={(e) => {
              // Only trigger image generation if there isn't an image already
              // and the event is not a synthetic one.
              if (!ev.imageUrl && !ev.meta?.synthetic) {
                e.stopPropagation();
                onGenerate(ev);
              }
            }}>
            {ev.imageUrl ? <img src={ev.imageUrl} alt={ev.title} className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center">
                {ev.meta?.synthetic ? (
                  <div className="text-neutral-500 text-sm">(Assistentfyllt)</div>
                ) : (
                  <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700 pointer-events-none">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Skapa bild
                  </Button>
                )}
              </div>
            }
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 flex flex-col justify-end">
            <div className={`font-semibold text-white ${showSimple ? 'text-base' : 'text-xl'}`} style={{textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>
              {displayTitle}
              {ev.meta?.isContinuation && <Repeat className="w-4 h-4 text-white/70 inline-block ml-1" title="Pågående aktivitet" />}
            </div>
          </div>
          {(isTimerRunning || activeNow) && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="rounded-full bg-black/40 p-3 backdrop-blur"><svg width="84" height="84" viewBox="0 0 100 100" className="block"><circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.2)" strokeWidth="8" fill="none" /><circle cx="50" cy="50" r="42" stroke="white" strokeWidth="8" fill="none" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={(1 - p) * (2 * Math.PI * 42)} strokeLinecap="round" /></svg><div className="-mt-16 text-center"><div className="text-xs opacity-80">{activeNow ? "Pågår" : "Timer"}</div><div className="text-lg font-semibold">{remaining}</div></div></div>
            </div>
          )}
        </div>
        <div className="p-3 bg-neutral-900 flex-shrink-0">
          <div className="flex items-center gap-3 text-sm opacity-80">
            <span>{from}–{to}</span>
            {ev.completed && <Badge className="ml-auto bg-green-700/80">Klart</Badge>}
            {ev.isFamily && <Badge className="ml-auto bg-amber-600/80">Familj</Badge>}
          </div>
          {ev.challenge && <div className="text-sm mt-1 opacity-80 px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 inline-block">Utmaning: {ev.challenge}</div>}
          
          {!showSimple && (
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={(e) => { e.stopPropagation(); onPickTimer(isTimerRunning ? null : ev.id); }}><TimerIcon className="w-4 h-4 mr-2" />{isTimerRunning ? "Stoppa" : "Starta"} timer</Button>
              <Button size="sm" className="bg-green-700 hover:bg-green-600" onClick={(e) => { e.stopPropagation(); onComplete(ev.id); }}><Play className="w-4 h-4 mr-2" />Markera klart</Button>
            </div>
          )}
          <Button size="icon" variant="secondary" className="ml-auto bg-neutral-800 hover:bg-neutral-700 absolute right-2 bottom-2" onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </motion.div>
  );
}

const AI_PROCESS_TIMEOUT = 30000;
const AssistantPanel: FC<{ open: boolean; onClose: () => void; events: Event[]; onAiAction: (op: SingleCalendarOperationType, imageHint?: string) => Promise<Event | null>; }> = ({ open, onClose, events, onAiAction }) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollAreaRef.current) { scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' }); } }, [messages]);

  const addMessage = (sender: ConversationMessage['sender'], text: string, options?: Partial<Omit<ConversationMessage, 'id' | 'sender' | 'text'>>) => {
    setMessages(prev => [...prev, { id: uid(), sender, text, ...options }]);
  };

  const handleSendMessage = async () => {
    if (input.trim() === '' || isProcessing) return;
    const userMessageText = input;
    addMessage('user', userMessageText);
    setInput('');
    setIsProcessing(true);

    const thinkingMessageId = uid();
    setMessages(prev => [...prev, { id: thinkingMessageId, sender: 'ai', text: "Assistenten tänker...", isProcessing: true }]);

    const mainLogic = async () => {
      const simplifiedEventsForAIContext: AiEvent[] = events.map(e => ({ title: e.title, date: e.start.slice(0, 10), startTime: e.start.slice(11, 16) }));
      const conversationHistoryForAI: { sender: 'user' | 'ai'; text: string }[] = messages.filter(msg => msg.id !== thinkingMessageId && (msg.sender === 'user' || msg.sender === 'ai')).map(msg => ({ sender: msg.sender as 'user' | 'ai', text: msg.text })).slice(-10);

      const tolkInput: TolkAIInput = {
        instruction: userMessageText,
        currentDate: formatDateFns(new Date(), 'yyyy-MM-dd HH:mm'),
        allCalendarEvents: simplifiedEventsForAIContext,
        conversationHistory: conversationHistoryForAI,
      };
      
      const tolkResponse: TolkAIOutput = await interpretUserInstruction(tolkInput);
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId));

      if (tolkResponse.userFeedbackMessage) addMessage('ai', tolkResponse.userFeedbackMessage);

      if (tolkResponse.requiresClarification && tolkResponse.clarificationQuestion) {
        if (!tolkResponse.userFeedbackMessage?.includes(tolkResponse.clarificationQuestion)) addMessage('ai', tolkResponse.clarificationQuestion, { isError: true });
      } else if (tolkResponse.planDescription) {
        addMessage('planStep', `Bearbetar plan...`, { isProcessing: true });
        const formatterResponse: FormatPlanOutput = await formatPlan({ planDescription: tolkResponse.planDescription, currentDate: formatDateFns(new Date(), 'yyyy-MM-dd') });
        setMessages(prev => prev.filter(m => m.sender !== 'planStep'));

        if (formatterResponse.operations && formatterResponse.operations.length > 0) {
          addMessage('systemInfo', `Startar exekvering av ${formatterResponse.operations.length} åtgärd(er)...`);
          for (const op of formatterResponse.operations) {
            const created = await onAiAction(op, tolkResponse.imageHint);
            if (created) { 
              addMessage('systemInfo', `✅ Händelse "${created.title}" skapad.`);
              boom();
            } else { 
              addMessage('systemInfo', `⚠️ Misslyckades med åtgärd: ${op.commandType}`, {isError: true});
            }
          }
        } else {
            addMessage('systemInfo', "⚠️ AI:n kunde inte skapa några åtgärder från planen.", {isError: true});
        }
      }
    };
    
    try { await Promise.race([mainLogic(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), AI_PROCESS_TIMEOUT))]); } 
    catch (error: any) { setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId)); addMessage('ai', `Ett fel uppstod: ${error.message}`, { isError: true }); } 
    finally { setIsProcessing(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ ease: "easeInOut", duration: 0.3 }} className="fixed bottom-0 left-0 right-0 z-50 md:bottom-4 md:right-4 md:left-auto w-full md:w-[380px] md:max-w-[92vw]">
          <Card className="bg-neutral-900/90 backdrop-blur-lg border-neutral-800 shadow-xl flex flex-col h-[85vh] md:h-[60vh] rounded-b-none md:rounded-b-lg">
            <CardHeader className="pb-2 flex-shrink-0"><CardTitle className="text-sm tracking-tight flex items-center gap-2"><Bot className="w-5 h-5" /> Assistent</CardTitle></CardHeader>
            <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                    {msg.sender === 'ai' && <Bot className="h-6 w-6 text-primary flex-shrink-0 mt-1" />}
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${ msg.sender === 'user' ? 'bg-blue-600 text-white' : msg.sender === 'ai' ? (msg.isError ? 'bg-red-900/50' : 'bg-neutral-800') : 'bg-transparent italic text-neutral-400 text-xs text-center w-full' }`}>
                      {msg.text} {msg.isProcessing && <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />}
                    </div>
                    {msg.sender === 'user' && <User className="h-6 w-6 text-neutral-400 flex-shrink-0 mt-1" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-neutral-800 flex-shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex w-full items-center space-x-2">
                <Textarea placeholder="Skriv till assistenten..." value={input} onChange={(e) => setInput(e.target.value)} disabled={isProcessing} className="flex-1 bg-neutral-800 border-neutral-700 text-sm md:text-base min-h-0" rows={1} />
                <Button type="submit" size="icon" disabled={isProcessing || input.trim() === ''}><Send className="h-4 w-4" /></Button>
              </form>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


function MoonToggle({ dark, setDark }: any) { return (<label className="flex items-center gap-2 text-sm cursor-pointer"><span className="opacity-70">Mörkt läge</span><Switch checked={dark} onCheckedChange={setDark} /></label>); }
function fmtTime(iso: string | number | undefined) { if (!iso) return ""; try { const d = new Date(iso); return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function isNowWithin(ev: Event, nowTs: number) { const s = new Date(ev.start).getTime(); const e = new Date(ev.end).getTime(); return nowTs >= s && nowTs <= e; }
function progressForEvent(ev: Event, nowTs: number) { const s = new Date(ev.start).getTime(); const e = new Date(ev.end).getTime(); if (!isFinite(s) || !isFinite(e) || e <= s) return 0; const p = (nowTs - s) / (e - s); return Math.max(0, Math.min(1, p)); }
function remainingTime(ev: Event, nowTs: number) { const e = new Date(ev.end).getTime(); const diff = Math.max(0, e - nowTs); const m = Math.floor(diff / 60000); const s = Math.floor((diff % 60000) / 1000); return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }

    

    

    