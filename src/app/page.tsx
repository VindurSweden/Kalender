
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

import { Header } from '@/components/calendar/Header';
import { Toolbar } from '@/components/calendar/Toolbar';
import { AssistantPanel } from '@/components/calendar/AssistantPanel';
import { CalendarGrid } from '@/components/calendar/CalendarGrid'; 
import { EditEventSheet } from '@/components/calendar/EditEventSheet';

import { interpretUserInstruction } from '@/ai/flows/natural-language-event-creation';
import { formatPlan } from '@/ai/flows/format-plan-flow';
import { generateEventImage } from '@/ai/flows/generate-event-image';

import { expandDay, RULES } from "@/lib/recurrence";
import type { Event, Person, TolkAIInput, TolkAIOutput, FormatPlanOutput, SingleCalendarOperationType, DayType } from '@/types/event';
import { isSameDay, parseFlexibleSwedishDateString, parseFlexibleSwedishTimeString } from '@/lib/date-utils';
import { synthesizeDayFill, applyOverrides, previewReplanProportional } from "@/lib/grid-utils";

const uid = () => Math.random().toString(36).slice(2, 9);
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
  { id: "leia", name: "Leia", color: "#F28CB2", bg: "bg-pink-600/40", emoji: "👧" },
  { id: "gabriel", name: "Gabriel", color: "#5B9BFF", bg: "bg-blue-600/40", emoji: "🧒" },
  { id: "maria", name: "Mamma", color: "#C9A7FF", bg: "bg-purple-600/40", emoji: "👩" },
  { id: "antony", name: "Pappa", color: "#8AE68C", bg: "bg-green-600/40", emoji: "👨‍🦱" },
];


// --- Main Component ---
export default function NPFScheduleApp() {
  const [isClient, setIsClient] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [sourceEvents, setSourceEvents] = useState<Event[]>([]);
  const [date, setDate] = useState(() => new Date());
  const [showFor, setShowFor] = useState<string[]>([]);
  const [dark, setDark] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const { toast } = useToast();
  
  const [todayType, setTodayType] = useState<DayType>("SchoolDay");
  const [tomorrowType, setTomorrowType] = useState<DayType>("SchoolDay");


  useEffect(() => {
    setIsClient(true);
    setPeople(loadLS("vcal.people", DEFAULT_PEOPLE));
    setShowFor(loadLS("vcal.showFor", DEFAULT_PEOPLE.slice(0, 2).map(p => p.id)));
  }, []);
  
  // Generate events based on date
  useEffect(() => {
    function generate(forDate: Date) {
      const forISO = forDate.toISOString().slice(0, 10);
      const { todayType, tomorrowType, events } = expandDay(forISO, RULES);
      setTodayType(todayType);
      setTomorrowType(tomorrowType);
      setSourceEvents(events);
    }
    generate(date);
  
    // Optional: Set up a timer to regenerate at midnight
    const timer = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        if (!isSameDay(now, date)) {
          setDate(now); // This will trigger the effect again
        } else {
          generate(now);
        }
      }
    }, 60000);
  
    return () => clearInterval(timer);
  }, [date]); // Re-run when date changes


  useEffect(() => { if (isClient) saveLS("vcal.people", people)}, [people, isClient]);
  useEffect(() => { if (isClient) saveLS("vcal.showFor", showFor)}, [showFor, isClient]);
  
  useEffect(() => { if (typeof window !== 'undefined') { if (dark) document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark"); } }, [dark]);

  const orderedShowFor = useMemo(() => {
    const order = new Map(people.map((p, i) => [p.id, i]));
    return [...showFor].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }, [showFor, people]);

  // --- Event Handlers ---
  const handleEventOperation = async (op: SingleCalendarOperationType, imageHint?: string): Promise<Event | null> => {
      const { commandType, eventIdentifier, eventDetails } = op;
      
      if (commandType.toUpperCase() === 'CREATE' && eventDetails) {
          const newStart = parseFlexibleSwedishDateString(eventDetails.dateQuery || '', new Date()) || date;
          const newTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery || '', newStart);
          if(newTime) {
              newStart.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);
          }

          let personId;
          if (eventDetails.title) {
            const personNameMatch = eventDetails.title.match(/för\s+(\w+)/i);
            const personName = personNameMatch ? personNameMatch[1].toLowerCase() : undefined;
            personId = people.find(p => p.name.toLowerCase() === personName)?.id;
          }

          if (!personId && orderedShowFor.length > 0) {
              personId = orderedShowFor[0];
          } else if (!personId) {
              personId = people[0]?.id;
          }

          if (!personId) {
              toast({ title: "Ingen person vald", description: "Kan inte skapa en händelse utan att veta vem den är för.", variant: "destructive" });
              return null;
          }
          
          const conflict = sourceEvents.some(e => e.personId === personId && new Date(e.start).getTime() === newStart.getTime());
          if (conflict) {
              const personName = people.find(p => p.id === personId)?.name || personId;
              toast({ title: "Konflikt!", description: `Det finns redan en händelse för ${personName} vid denna tid.`, variant: "destructive" });
              return null;
          }
          
          try {
            const title = eventDetails.title || 'AI Händelse';
            const start = newStart.toISOString();
            
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
              end: new Date(newStart.getTime() + INCR * 60 * 1000).toISOString(),
              imageUrl,
              challenge: eventDetails.description,
              meta: { source: 'assistant' }
            };
            
            setSourceEvents(prev => [...prev, newEvent].sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
            boom();
            return newEvent;

          } catch (e) {
            console.error("[AI Create] Error:", e);
            toast({ title: "Internt Fel", description: "Kunde inte skapa händelse från AI instruktion.", variant: "destructive" });
            return null;
          }
      }
      return null;
  };

  const handleGenerateImage = async (event: Event) => {
    if (!event) return;
    toast({ title: 'Bildgenerering', description: 'AI:n skapar en bild för din händelse...' });
    try {
      const result = await generateEventImage({ eventTitle: event.title, imageHint: '' });
      if (result.imageUrl) {
        setSourceEvents(prev => prev.map(e => e.id === event.id ? { ...e, imageUrl: result.imageUrl } : e));
        toast({ title: 'Bild genererad!', description: 'Bilden har lagts till på din händelse.' });
      } else {
        throw new Error('Image URL was empty.');
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      toast({ variant: 'destructive', title: 'Fel vid bildgenerering', description: 'Kunde inte skapa bilden.' });
    }
  };
  
  function deleteEvent(id: string) { 
    setSourceEvents(prev => prev.filter(ev => ev.id !== id)); 
    setEditingEvent(null);
  }
  
  function onEventUpdate(updatedEvent: Event) {
    setSourceEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));
    setEditingEvent(null);
  }

  function handleKlar(eventId: string | null) {
      if (!eventId) return;
      const ev = sourceEvents.find(e => e.id === eventId);
      if (!ev) return;
      // Here you could update the event status if you add that property
      boom();
  }
  
  function handleKlarSent(eventId: string | null) {
      if (!eventId) return;
       const ev = sourceEvents.find(e => e.id === eventId);
      if (!ev) return;
      // Here you would trigger the replanning logic
      boom();
  }

  function handleEditEvent(event: Event | null) {
    setEditingEvent(event);
  }


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
        
        <div className="mt-3">
            {orderedShowFor.length > 0 ? (
                <CalendarGrid 
                    people={people.filter(p => orderedShowFor.includes(p.id))}
                    events={sourceEvents}
                    onEventUpdate={onEventUpdate}
                    onEdit={handleEditEvent}
                    onGenerateImage={handleGenerateImage}
                    onKlar={handleKlar}
                    onKlarSent={handleKlarSent}
                    onDelete={deleteEvent}
                />
            ) : (
                <div className="col-span-full text-center p-10 bg-neutral-900/50 rounded-2xl">
                  <p className="text-neutral-400">Välj en eller flera personer i verktygsfältet för att se deras scheman.</p>
                </div>
            )}
        </div>
      </main>
      <AssistantPanel 
        open={assistantOpen} 
        onClose={() => setAssistantOpen(false)} 
        events={sourceEvents} 
        people={people}
        onAiAction={handleEventOperation} 
      />
      <EditEventSheet
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        event={editingEvent}
        onSave={onEventUpdate}
        onDelete={deleteEvent}
        onGenerateImage={handleGenerateImage}
        allPeople={people}
      />
    </div>
  );
}
