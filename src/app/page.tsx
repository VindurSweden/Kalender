
"use client";

import React, { useEffect, useMemo, useRef, useState, FC } from "react";
import { useToast } from "@/hooks/use-toast";
import { format as formatDateFns } from 'date-fns';

import { Header } from '@/components/calendar/Header';
import { Toolbar } from '@/components/calendar/Toolbar';
import { EventCard } from '@/components/calendar/EventCard';
import { AssistantPanel } from '@/components/calendar/AssistantPanel';

import { interpretUserInstruction } from '@/ai/flows/natural-language-event-creation';
import { formatPlan } from '@/ai/flows/format-plan-flow';
import { generateEventImage } from '@/ai/flows/generate-event-image';

import type { Event, Person, TolkAIInput, TolkAIOutput, FormatPlanOutput, SingleCalendarOperationType } from '@/types/event';
import { isSameDay, parseFlexibleSwedishDateString, parseFlexibleSwedishTimeString } from '@/lib/date-utils';

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

export const presentTitle = (ev: Event, viewConfig: { assistant: { enableLanguagePolish: boolean } }): string => {
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
  const [dark, setDark] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const { toast } = useToast();

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
  
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const orderedShowFor = useMemo(() => {
    const order = new Map(people.map((p, i) => [p.id, i]));
    return [...showFor].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }, [showFor, people]);

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

          // Fallback to first selected person if no person is specified in the instruction
          let personId;
          if (eventDetails.title) {
            const personNameMatch = eventDetails.title.match(/för\s+(\w+)/i);
            const personName = personNameMatch ? personNameMatch[1].toLowerCase() : undefined;
            personId = people.find(p => p.name.toLowerCase() === personName)?.id;
          }

          if (!personId && orderedShowFor.length > 0) {
              personId = orderedShowFor[0];
          } else if (!personId) {
              personId = people[0]?.id; // Fallback to the very first person if no one is selected
          }

          if (!personId) {
              toast({ title: "Ingen person vald", description: "Kan inte skapa en händelse utan att veta vem den är för.", variant: "destructive" });
              return null;
          }
          
          const conflict = events.some(e => e.personId === personId && new Date(e.start).getTime() === newStart.getTime());
          if (conflict) {
              const personName = people.find(p => p.id === personId)?.name || personId;
              toast({ title: "Konflikt!", description: `Det finns redan en händelse för ${personName} vid denna tid.`, variant: "destructive" });
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
            boom();
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
    return <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex items-center justify-center">Laddar...</div>;
  }

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 antialiased">
      <Header 
        date={date} 
        shiftDate={(d) => setDate(new Date(date.setDate(date.getDate() + d)))} 
        setDate={setDate}
        dark={dark} 
        setDark={setDark} 
        assistantOpen={assistantOpen} 
        setAssistantOpen={setAssistantOpen} 
      />
      <main className="p-3 md:p-6 max-w-[1600px] mx-auto">
        <Toolbar people={people} showFor={showFor} setShowFor={setShowFor} />
        
        <div 
          className="grid gap-4 mt-3" 
          style={{ gridTemplateColumns: `repeat(${orderedShowFor.length > 0 ? orderedShowFor.length : 1}, 1fr)` }}
        >
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
      <AssistantPanel 
        open={assistantOpen} 
        onClose={() => setAssistantOpen(false)} 
        events={events} 
        people={people}
        onAiAction={handleEventOperation} 
      />
    </div>
  );
}
