
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
  Clock3,
  Bot,
  User,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { format as formatDateFns } from 'date-fns';

// AI Integration
import { interpretUserInstruction } from '@/ai/flows/natural-language-event-creation';
import { formatPlan } from '@/ai/flows/format-plan-flow';
import { generateEventImage } from '@/ai/flows/generate-event-image';
import type { EventItem, Person, ConversationMessage, TolkAIOutput, FormatPlanOutput, TolkAIInput, AiEvent } from '@/types/event';
import { parseFlexibleSwedishDateString, parseFlexibleSwedishTimeString, formatInputDate, formatInputTime, isSameDay } from '@/lib/date-utils';


// ======= Helper Functions =======
const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
const INCR = 20; // standard 20-minute increment

function loadLS(key: string, fallback: any) {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, value: any) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

async function boom() {
  try {
    const confetti = (await import("canvas-confetti")).default;
    confetti({ particleCount: 200, spread: 75, origin: { y: 0.7 } });
  } catch {}
}

// ======= Mock Data =======
const DEFAULT_PEOPLE: Person[] = [
  { id: "gabriel", name: "Gabriel", color: "#5B9BFF", bg: "bg-blue-600/40", speak: true },
  { id: "leia", name: "Leia", color: "#F28CB2", bg: "bg-pink-600/40", speak: true },
  { id: "pappa", name: "Pappa", color: "#8AE68C", bg: "bg-green-600/40" },
  { id: "mamma", name: "Mamma", color: "#C9A7FF", bg: "bg-purple-600/40" },
];

const DEFAULT_EVENTS: EventItem[] = [
  { id: uid(), title: "Skola", personId: "gabriel", start: `${todayISO()}T08:00:00`, end: `${todayISO()}T13:30:00`, imageUrl: "", recurrence: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { id: uid(), title: "Borsta tänderna", personId: "gabriel", start: `${todayISO()}T07:20:00`, end: `${todayISO()}T07:40:00`, challenge: "Klar innan timern tar slut" },
  { id: uid(), title: "Middag (Familj)", personId: "family", start: `${todayISO()}T17:30:00`, end: `${todayISO()}T18:00:00`, isFamily: true, recurrence: "FREQ=DAILY" },
  { id: uid(), title: "Läsläxa", personId: "leia", start: `${todayISO()}T19:00:00`, end: `${todayISO()}T19:20:00` },
];


// ======= Main Component =======
export default function NPFScheduleApp() {
  const [people, setPeople] = useState<Person[]>(() => loadLS("npf.people", DEFAULT_PEOPLE));
  const [events, setEvents] = useState<EventItem[]>(() => loadLS("npf.events", DEFAULT_EVENTS));
  const [view, setView] = useState("day"); // 'day' | 'week' | 'all'
  const [date, setDate] = useState(() => new Date());
  const [showFor, setShowFor] = useState<string[]>(() => people.map(p => p.id));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dark, setDark] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { toast } = useToast();

  useEffect(() => saveLS("npf.people", people), [people]);
  useEffect(() => saveLS("npf.events", events), [events]);

  // Global clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const orderedShowFor = useMemo(() => {
    const order = new Map(people.map((p, i) => [p.id, i]));
    return [...showFor].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }, [showFor, people]);

  const dayKey = date.toISOString().slice(0, 10);

  const grouped = useMemo(() => {
    const byPerson = new Map<string, EventItem[]>();
    people.forEach(p => byPerson.set(p.id, []));
    events.forEach(ev => {
      if (ev.isFamily) {
        people.forEach(p => byPerson.get(p.id)?.push(ev));
      } else {
        byPerson.get(ev.personId)?.push(ev);
      }
    });
    for (const arr of byPerson.values()) {
      arr.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    }
    return byPerson;
  }, [events, people]);

  const tickRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!runningId) return;
    const ev = events.find(e => e.id === runningId);
    if (!ev) return;
    const compute = () => setProgress(progressForEvent(ev, Date.now()));
    compute();
    tickRef.current = setInterval(compute, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [runningId, events]);

  // ======= AI Handlers =======
  const findEventToModifyOrDelete = (identifier: any): EventItem | null => {
      if (!identifier || !identifier.title) return null;
  
      let potentialEvents = events.filter(e => e.title.toLowerCase().includes(identifier.title.toLowerCase()));
      if (potentialEvents.length === 0) return null;
  
      if (identifier.dateQuery) {
          const refDate = parseFlexibleSwedishDateString(identifier.dateQuery, new Date());
          if (refDate) {
              potentialEvents = potentialEvents.filter(e => isSameDay(new Date(e.start), refDate));
          }
      }
      if (potentialEvents.length === 0) return null;

      if (identifier.timeQuery) {
          const refTime = parseFlexibleSwedishTimeString(identifier.timeQuery, new Date());
          if(refTime) {
            const timeStr = formatInputTime(refTime);
            potentialEvents = potentialEvents.filter(e => formatInputTime(new Date(e.start)) === timeStr);
          }
      }
      if (potentialEvents.length > 1) {
        toast({ title: "AI Assistent", description: "Flera händelser matchade, var mer specifik.", variant: "destructive" });
        return null;
      }
      return potentialEvents[0] || null;
  };
  
  const handleAiCreateEvent = async (eventDetails: any, imageHint?: string): Promise<EventItem | null> => {
    try {
      const title = eventDetails.title || 'AI Händelse';
      const referenceDate = new Date();
      let parsedDate = referenceDate;
      if (eventDetails.dateQuery) {
        const tempDate = parseFlexibleSwedishDateString(eventDetails.dateQuery, referenceDate);
        if (tempDate) parsedDate = tempDate;
      }

      let parsedTime = new Date(parsedDate);
      parsedTime.setHours(9, 0, 0, 0); // Default 09:00
      if (eventDetails.timeQuery) {
        const tempTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery, parsedDate);
        if (tempTime) parsedTime = tempTime;
      }

      const start = parsedTime.toISOString();
      const end = new Date(parsedTime.getTime() + INCR * 60 * 1000).toISOString();
      
      const personId = people.find(p => p.name.toLowerCase() === (eventDetails.person?.toLowerCase() || ''))?.id || people[0].id;

      let imageUrl: string | undefined = undefined;
      if (title) {
        try {
          const imageResult = await generateEventImage({ eventTitle: title, imageHint });
          imageUrl = imageResult.imageUrl;
        } catch (err) { console.error("Image generation failed", err) }
      }

      const newEvent: EventItem = {
        id: uid(),
        title,
        personId,
        start,
        end,
        imageUrl,
        challenge: eventDetails.description,
      };
      
      setEvents(prev => [...prev, newEvent]);
      return newEvent;

    } catch (e) {
      console.error("[AI Create] Error:", e);
      toast({ title: "Internt Fel", description: "Kunde inte skapa händelse från AI instruktion.", variant: "destructive" });
      return null;
    }
  };

  const handleAiModifyEvent = async (eventIdentifier: any, eventDetails: any, imageHint?: string): Promise<EventItem | null> => {
    const eventToModify = findEventToModifyOrDelete(eventIdentifier);
    if (!eventToModify) {
      toast({ title: "AI Fel", description: "Kunde inte hitta händelsen att ändra.", variant: "destructive" });
      return null;
    }
    
    let updatedEvent = { ...eventToModify };

    if (eventDetails.title) updatedEvent.title = eventDetails.title;

    const refDate = new Date();
    let newDate = new Date(updatedEvent.start);

    if (eventDetails.dateQuery) {
      const parsed = parseFlexibleSwedishDateString(eventDetails.dateQuery, refDate);
      if(parsed) newDate = parsed;
    }
    if (eventDetails.timeQuery) {
      const parsed = parseFlexibleSwedishTimeString(eventDetails.timeQuery, newDate);
      if (parsed) newDate = parsed;
    }

    const originalDuration = new Date(eventToModify.end).getTime() - new Date(eventToModify.start).getTime();
    updatedEvent.start = newDate.toISOString();
    updatedEvent.end = new Date(newDate.getTime() + originalDuration).toISOString();
    
    if (typeof eventDetails.description === 'string') updatedEvent.challenge = eventDetails.description;
    
    const shouldRegenImage = (eventDetails.title && eventDetails.title !== eventToModify.title) || imageHint;
    if(shouldRegenImage) {
        try {
          const imageResult = await generateEventImage({ eventTitle: updatedEvent.title, imageHint });
          updatedEvent.imageUrl = imageResult.imageUrl;
        } catch (err) { console.error("Image regeneration failed", err) }
    }

    setEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));
    return updatedEvent;
  };
  
  const handleAiDeleteEvent = async (eventIdentifier: any): Promise<string | null> => {
    const eventToDelete = findEventToModifyOrDelete(eventIdentifier);
    if (!eventToDelete) {
      toast({ title: "AI Fel", description: "Kunde inte hitta händelsen att radera.", variant: "destructive" });
      return null;
    }
    setEvents(prev => prev.filter(e => e.id !== eventToDelete.id));
    return eventToDelete.id;
  };

  async function ensureImage(ev: EventItem) {
    if (ev.imageUrl) return ev.imageUrl;
    try {
      const imageResult = await generateEventImage({ eventTitle: ev.title });
      if (imageResult.imageUrl) {
        setEvents(e => e.map(x => (x.id === ev.id ? { ...x, imageUrl: imageResult.imageUrl } : x)));
        return imageResult.imageUrl;
      }
    } catch(err) {
      console.error("ensureImage failed", err);
      toast({ title: "Bild-AI Fel", description: "Kunde inte generera bild.", variant: "destructive" });
    }
    return "";
  }

  function deleteEvent(id: string) {
    setEvents(prev => prev.filter(ev => ev.id !== id));
  }

  function toggleComplete(id: string) {
    setEvents(prev => prev.map(ev => (ev.id === id ? { ...ev, completed: !ev.completed } : ev)));
    boom();
  }

  function longPressFilter(personId: string) {
    setShowFor([personId]);
  }
  
  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [dark]);

  // Determine the day's time range for vertical sync
  const dayTimeRange = useMemo(() => {
    const todaysEvents = orderedShowFor.flatMap(pid => {
      const personEvents = grouped.get(pid) || [];
      return personEvents.filter(ev => inView(ev, date, 'day'));
    });

    if (todaysEvents.length === 0) {
      const startOfDay = new Date(date);
      startOfDay.setHours(8, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(20, 0, 0, 0);
      return { start: startOfDay.getTime(), end: endOfDay.getTime() };
    }

    const startTimes = todaysEvents.map(ev => new Date(ev.start).getTime());
    const endTimes = todaysEvents.map(ev => new Date(ev.end).getTime());
    
    const minTime = Math.min(...startTimes);
    const maxTime = Math.max(...endTimes);

    return { start: minTime, end: maxTime };
  }, [orderedShowFor, grouped, date]);


  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 antialiased">
      <Header
        date={date}
        shift={(d) => setDate(new Date(date.setDate(date.getDate() + d)))}
        dark={dark} setDark={setDark}
        assistantOpen={assistantOpen} setAssistantOpen={setAssistantOpen}
      />
      <main className="p-3 md:p-6 max-w-[1600px] mx-auto">
        <Toolbar people={people} showFor={showFor} setShowFor={setShowFor} />
        <NowIndicator now={now} />
        <div 
          className="grid gap-4 mt-3"
          style={{
              gridTemplateColumns: `repeat(${orderedShowFor.length > 2 ? 2 : orderedShowFor.length > 0 ? orderedShowFor.length : 1}, minmax(0, 1fr))`
          }}
        >
          {orderedShowFor.map(pid => {
            const person = people.find(p => p.id === pid);
            if (!person) return null;
            const list = grouped.get(pid) || [];
            return (
              <Column key={pid} person={person} events={list}
                onGenerate={ensureImage} onDelete={deleteEvent} onComplete={toggleComplete} onPickTimer={setRunningId}
                selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} runningId={runningId} now={now}
                onLongPress={longPressFilter}
                showSimple={orderedShowFor.length > 1}
                dayTimeRange={dayTimeRange}
                currentDate={date}
              />
            );
          })}
           {orderedShowFor.length === 0 && (
            <div className="col-span-full text-center p-10 bg-neutral-900/50 rounded-2xl">
              <p className="text-neutral-400">Välj en eller flera personer i verktygsfältet för att se deras scheman.</p>
            </div>
          )}
        </div>
      </main>

      {runningId && (
        <div className="fixed bottom-3 left-0 right-0 px-3 md:px-6 pointer-events-none">
          <Card className="bg-neutral-900/80 border-neutral-800">
            <CardContent className="py-2 text-sm opacity-80 flex items-center gap-2 justify-center">
              <TimerIcon className="w-4 h-4" /> Timer aktiv … {Math.round(progress * 100)}%
            </CardContent>
          </Card>
        </div>
      )}

      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        people={people}
        events={events}
        onAiCreateEvent={handleAiCreateEvent}
        onAiModifyEvent={handleAiModifyEvent}
        onAiDeleteEvent={handleAiDeleteEvent}
      />
    </div>
  );
}


// ======= Subcomponents =======
function Header({ date, shift, dark, setDark, assistantOpen, setAssistantOpen }: any) {
  const dstr = date.toLocaleDateString("sv-SE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return (
    <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur border-b border-neutral-800">
      <div className="max-w-[1600px] mx-auto flex items-center gap-2 p-3 md:p-4">
        <CalendarIcon className="w-6 h-6" />
        <h1 className="font-semibold tracking-tight">NPF‑kalender</h1>
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
                  <p>Här kommer inställningar för Google-synk, notiser och annat.</p>
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

function Column({ person, events, onGenerate, onDelete, onComplete, onPickTimer, selectedEventId, setSelectedEventId, runningId, now, onLongPress, showSimple, dayTimeRange, currentDate }: any) {
  const downRef = useRef<NodeJS.Timeout | null>(null);
  const onHeaderPointerDown = () => { downRef.current = setTimeout(() => onLongPress(person.id), 600); };
  const cancelLP = () => { if(downRef.current) clearTimeout(downRef.current); };

  const inDay = events.filter((ev: EventItem) => inView(ev, currentDate, "day"));

  const totalDayDuration = dayTimeRange.end - dayTimeRange.start;

  return (
    <div className={`rounded-2xl p-1 md:p-2 border-t border-neutral-800 ${person.bg}`}>
       <div className="flex items-center gap-2 mb-2 select-none sticky top-[70px] bg-neutral-950/80 backdrop-blur-sm p-2 rounded-lg z-10" onPointerDown={onHeaderPointerDown} onPointerUp={cancelLP} onPointerLeave={cancelLP}>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: person.color }} />
        <div className="font-semibold">{person.name}</div>
      </div>

      <div className="relative" style={{ height: '150vh' }}>
         {inDay.map((ev: EventItem) => {
           const eventStart = new Date(ev.start).getTime();
           const eventEnd = new Date(ev.end).getTime();

           const top = ((eventStart - dayTimeRange.start) / totalDayDuration) * 100;
           const height = ((eventEnd - eventStart) / totalDayDuration) * 100;
           
           return (
             <div key={ev.id} className="absolute w-full" style={{ top: `${top}%`, height: `${height}%`, padding: '2px' }}>
                <EventCard 
                    person={person} 
                    ev={ev} 
                    {...{ onGenerate, onDelete, onComplete, onPickTimer, selectedEventId, setSelectedEventId, runningId, now, showSimple }}
                />
             </div>
           )
         })}
      </div>
      
      <Button size="sm" variant="secondary" className="bg-neutral-900/60 hover:bg-neutral-800 w-full mt-3">
        <Plus className="w-4 h-4 mr-2" />Lägg till (TBD)
      </Button>
    </div>
  );
}


function EventCard({ person, ev, onGenerate, onDelete, onComplete, onPickTimer, selected, onSelect, running, now, showSimple }: any) {
  const from = fmtTime(ev.start);
  const to = fmtTime(ev.end);
  const activeNow = isNowWithin(ev, now);
  const p = progressForEvent(ev, now);
  const remaining = remainingTime(ev, now);

  return (
    <motion.div 
      layout 
      initial={{ opacity: 0, y: 6 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -6 }}
      className="h-full"
      >
      <div onClick={onSelect} className={`group rounded-xl overflow-hidden border bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-white/20 h-full flex flex-col ${selected ? "ring-2 ring-white/30" : ""} ${activeNow ? "border-amber-500/70" : "border-neutral-800"}`}>
        <div className="relative flex-grow">
          <div className="absolute inset-0 w-full h-full bg-neutral-800">
            {ev.imageUrl ? <img src={ev.imageUrl} alt={ev.title} className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center">
                <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={async (e) => { e.stopPropagation(); await onGenerate(ev); }}>Skapa bild</Button>
              </div>}
          </div>
           <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent p-3 flex flex-col justify-end">
               <div className="flex items-start gap-2">
                 <div className="w-1.5 h-6 rounded-full mt-1" style={{ backgroundColor: person.color }} />
                 <div className="font-semibold text-lg text-white" style={{textShadow: '1px 1px 3px rgba(0,0,0,0.7)'}}>{ev.title}</div>
               </div>
           </div>
           {(running || activeNow) && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="rounded-full bg-black/40 p-3 backdrop-blur">
                  <svg width="84" height="84" viewBox="0 0 100 100" className="block"><circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.2)" strokeWidth="8" fill="none" /><circle cx="50" cy="50" r="42" stroke="white" strokeWidth="8" fill="none" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={(1 - p) * (2 * Math.PI * 42)} strokeLinecap="round" /></svg>
                  <div className="-mt-16 text-center"><div className="text-xs opacity-80">{activeNow ? "Pågår" : "Timer"}</div><div className="text-lg font-semibold">{remaining}</div></div>
                </div>
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
              <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={(e) => { e.stopPropagation(); onPickTimer(ev.id); }}><TimerIcon className="w-4 h-4 mr-2" />Starta timer</Button>
              <Button size="sm" className="bg-green-700 hover:bg-green-600" onClick={(e) => { e.stopPropagation(); onComplete(ev.id); }}><Play className="w-4 h-4 mr-2" />Markera klart</Button>
            </div>
          )}
          <Button size="icon" variant="secondary" className="ml-auto bg-neutral-800 hover:bg-neutral-700 absolute right-2 bottom-2" onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </motion.div>
  );
}

function NowIndicator({ now }: any) {
  const t = new Date(now).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return <div className="mt-2 text-xs opacity-60 flex items-center gap-2"><Clock3 className="w-3 h-3" /> Nu: {t}</div>;
}

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  people: Person[];
  events: EventItem[];
  onAiCreateEvent: (eventDetails: any, imageHint?: string) => Promise<EventItem | null>;
  onAiModifyEvent: (eventIdentifier: any, eventDetails: any, imageHint?: string) => Promise<EventItem | null>;
  onAiDeleteEvent: (eventIdentifier: any) => Promise<string | null>;
}

const AI_PROCESS_TIMEOUT = 30000; // 30 seconds

const AssistantPanel: FC<AssistantPanelProps> = ({ open, onClose, people, events, onAiCreateEvent, onAiModifyEvent, onAiDeleteEvent }) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

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
      const simplifiedEventsForAIContext: AiEvent[] = events.map(e => ({
        title: e.title,
        date: e.start.slice(0, 10),
        startTime: e.start.slice(11, 16),
      }));

      const conversationHistoryForAI: { sender: 'user' | 'ai'; text: string }[] = messages
        .filter(msg => msg.id !== thinkingMessageId && (msg.sender === 'user' || msg.sender === 'ai'))
        .map(msg => ({ sender: msg.sender as 'user' | 'ai', text: msg.text }))
        .slice(-10);

      const tolkInput: TolkAIInput = {
        instruction: userMessageText,
        currentDate: formatDateFns(new Date(), 'yyyy-MM-dd HH:mm'),
        allCalendarEvents: simplifiedEventsForAIContext,
        conversationHistory: conversationHistoryForAI,
      };
      
      const tolkResponse: TolkAIOutput = await interpretUserInstruction(tolkInput);
      
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId));

      if (tolkResponse.userFeedbackMessage) {
        addMessage('ai', tolkResponse.userFeedbackMessage);
      }

      if (tolkResponse.requiresClarification && tolkResponse.clarificationQuestion) {
        if (!tolkResponse.userFeedbackMessage?.includes(tolkResponse.clarificationQuestion)) {
          addMessage('ai', tolkResponse.clarificationQuestion, { isError: true });
        }
      } else if (tolkResponse.planDescription) {
        addMessage('planStep', `Bearbetar plan...`, { isProcessing: true });
        
        const formatterResponse: FormatPlanOutput = await formatPlan({ planDescription: tolkResponse.planDescription, currentDate: formatDateFns(new Date(), 'yyyy-MM-dd') });
        setMessages(prev => prev.filter(msg => !(msg.sender === 'planStep' && msg.isProcessing)));

        if (formatterResponse.operations && formatterResponse.operations.length > 0) {
          addMessage('systemInfo', "Startar exekvering av plan...");
          const operation = formatterResponse.operations[0];
          
          if (formatterResponse.operations.length > 1) {
            addMessage('systemInfo', `ℹ️ Notis: AI:n föreslog ${formatterResponse.operations.length} åtgärder. Jag utför endast den första.`);
          }

          let outcomeMessage = "";
          let success = false;

          switch (operation.commandType.toUpperCase()) {
            case 'CREATE':
              if (operation.eventDetails) {
                const created = await onAiCreateEvent(operation.eventDetails, tolkResponse.imageHint);
                if(created) { outcomeMessage = `✅ Händelse "${created.title}" skapad.`; success = true; boom(); } 
                else { outcomeMessage = `⚠️ Misslyckades skapa händelse.` }
              }
              break;
            case 'MODIFY':
              if (operation.eventIdentifier && operation.eventDetails) {
                const modified = await onAiModifyEvent(operation.eventIdentifier, operation.eventDetails, tolkResponse.imageHint);
                if(modified) { outcomeMessage = `✅ Händelse "${modified.title}" ändrad.`; success = true; }
                else { outcomeMessage = `⚠️ Kunde inte hitta/ändra händelse.`}
              }
              break;
            case 'DELETE':
               if (operation.eventIdentifier) {
                const deletedId = await onAiDeleteEvent(operation.eventIdentifier);
                if(deletedId) { outcomeMessage = `✅ Händelse borttagen.`; success = true; }
                else { outcomeMessage = `⚠️ Kunde inte hitta/ta bort händelse.`}
               }
              break;
             case 'QUERY':
                // Query results are handled by Tolk-AI's userFeedbackMessage, so no action needed here.
                outcomeMessage = `✅ Svar levererat.`;
                success = true;
                break;
             default:
                outcomeMessage = `⚠️ Okänd åtgärd från AI: ${operation.commandType}`;
                break;
          }
          if(outcomeMessage) addMessage('systemInfo', outcomeMessage, { isError: !success });
        } else {
            addMessage('systemInfo', "⚠️ AI:n kunde inte skapa några åtgärder från planen.", {isError: true});
        }
      }
    };
    
    try {
        await Promise.race([
            mainLogic(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), AI_PROCESS_TIMEOUT))
        ]);
    } catch (error: any) {
        setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId));
        addMessage('ai', `Ett fel uppstod: ${error.message}`, { isError: true });
    } finally {
        setIsProcessing(false);
    }
  };


  return (
    <AnimatePresence>
      {open && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          exit={{ opacity: 0, y: 20 }} 
          transition={{ ease: "easeInOut", duration: 0.3 }}
          className="fixed bottom-0 left-0 right-0 z-50 md:bottom-4 md:right-4 md:left-auto md:w-[380px] md:max-w-[92vw]"
        >
          <Card className="bg-neutral-900/90 backdrop-blur-lg border-neutral-800 shadow-xl flex flex-col h-[85vh] md:h-[60vh] rounded-b-none md:rounded-b-lg">
            <CardHeader className="pb-2 flex-shrink-0">
              <CardTitle className="text-sm tracking-tight flex items-center gap-2"><Bot className="w-5 h-5" /> Assistent</CardTitle>
            </CardHeader>
            <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                    {msg.sender === 'ai' && <Bot className="h-6 w-6 text-primary flex-shrink-0 mt-1" />}
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        msg.sender === 'user' ? 'bg-blue-600 text-white' : 
                        msg.sender === 'ai' ? (msg.isError ? 'bg-red-900/50' : 'bg-neutral-800') :
                        'bg-transparent italic text-neutral-400 text-xs text-center w-full'
                      }`}
                    >
                      {msg.text}
                      {msg.isProcessing && <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />}
                    </div>
                    {msg.sender === 'user' && <User className="h-6 w-6 text-neutral-400 flex-shrink-0 mt-1" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-neutral-800 flex-shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex w-full items-center space-x-2">
                <Input
                  type="text"
                  placeholder="Skriv till assistenten..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isProcessing}
                  className="flex-1 bg-neutral-800 border-neutral-700 text-sm md:text-base"
                />
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

// ======= Utils =======
function fmtTime(iso: string | undefined) { if (!iso) return ""; try { const d = new Date(iso); return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function inView(ev: EventItem, currentDate: Date, view: 'day' | 'week' | 'all') { if (view === 'all') return true; const d = new Date(ev.start || Date.now()); if (view === 'day') return sameDayFn(d, currentDate); if (view === 'week') return sameWeekFn(d, currentDate); return true; }
function sameDayFn(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function sameWeekFn(a: Date, b: Date) { const da = new Date(a); da.setHours(0, 0, 0, 0); const db = new Date(b); db.setHours(0, 0, 0, 0); const day = db.getDay() || 7; const monday = new Date(db); monday.setDate(db.getDate() - (day - 1)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); return da >= monday && da <= sunday; }
function getWeekDays(date: Date) { const db = new Date(date); const day = db.getDay() || 7; const monday = new Date(db); monday.setDate(db.getDate() - (day - 1)); return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; }); }
function isToday(d: Date) { const t = new Date(); return sameDayFn(d, t); }
function isNowWithin(ev: EventItem, nowTs: number) { const s = new Date(ev.start).getTime(); const e = new Date(ev.end).getTime(); return nowTs >= s && nowTs <= e; }
function progressForEvent(ev: EventItem, nowTs: number) { const s = new Date(ev.start).getTime(); const e = new Date(ev.end).getTime(); if (!isFinite(s) || !isFinite(e) || e <= s) return 0; const p = (nowTs - s) / (e - s); return Math.max(0, Math.min(1, p)); }
function remainingTime(ev: EventItem, nowTs: number) { const e = new Date(ev.end).getTime(); const diff = Math.max(0, e - nowTs); const m = Math.floor(diff / 60000); const s = Math.floor((diff % 60000) / 1000); return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }


    