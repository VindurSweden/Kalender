
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

import { expandProfileForDate, RULES, PROFILES, classifyDay } from "@/lib/recurrence";
import type { Event, Person, TolkAIInput, TolkAIOutput, FormatPlanOutput, SingleCalendarOperationType, DayType } from '@/types/event';
import { isSameDay, parseFlexibleSwedishDateString, parseFlexibleSwedishTimeString } from '@/lib/date-utils';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from "firebase/firestore";

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
  
  const [manualDayType, setManualDayType] = useState<DayType | null>(null);
  const currentDayType: DayType = manualDayType || todayType;

  useEffect(() => {
    setIsClient(true);
    setPeople(loadLS("vcal.people", DEFAULT_PEOPLE));
    setShowFor(loadLS("vcal.showFor", DEFAULT_PEOPLE.map(p => p.id)));

    // Set day type based on current date
    const today = new Date();
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        setTodayType("OffDay");
    } else {
        setTodayType("SchoolDay");
    }
  }, []);
  
  // Real-time listener for events from Firestore
  useEffect(() => {
    if (!db) return;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, "events"),
      where("start", ">=", startOfDay.toISOString()),
      where("start", "<=", endOfDay.toISOString())
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const eventsFromDb: Event[] = [];
      querySnapshot.forEach((doc) => {
        // Note: Firestore data is just data. We cast it to our Event type.
        // You might want to add data validation here (e.g., with Zod) in a real app.
        eventsFromDb.push({ id: doc.id, ...doc.data() } as Event);
      });
      
      // Sort events by start time
      eventsFromDb.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      
      setSourceEvents(eventsFromDb);
    }, (error) => {
        console.error("Error fetching events from Firestore:", error);
        toast({
            title: "Fel vid hämtning av data",
            description: "Kunde inte ansluta till databasen. Vissa funktioner kanske inte fungerar.",
            variant: "destructive"
        });
    });

    // Cleanup listener on component unmount
    return () => unsubscribe();
  }, [date, toast]); // Rerun when date changes


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
  
  function onEventUpdate(updatedEventData: Partial<Event>) {
    if (!updatedEventData.id) return;
  
    setSourceEvents(prevEvents => {
      const newEvents = [...prevEvents];
      const eventIndex = newEvents.findIndex(e => e.id === updatedEventData.id);
      if (eventIndex === -1) return prevEvents;
  
      const originalEvent = newEvents[eventIndex];
      const updatedEvent = { ...originalEvent, ...updatedEventData };
  
      // Simple property update
      if (updatedEventData.start === originalEvent.start) {
        newEvents[eventIndex] = updatedEvent;
        return newEvents;
      }
  
      // Complex start time update with replanning
      const personEvents = newEvents
        .filter(e => e.personId === updatedEvent.personId)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  
      const personEventIndex = personEvents.findIndex(e => e.id === updatedEvent.id);
  
      // 1. Update previous event's end time
      if (personEventIndex > 0) {
        const prevEventInPersonTimeline = personEvents[personEventIndex - 1];
        const prevEventGlobalIndex = newEvents.findIndex(e => e.id === prevEventInPersonTimeline.id);
        if (prevEventGlobalIndex !== -1 && !newEvents[prevEventGlobalIndex].fixedStart) {
           newEvents[prevEventGlobalIndex].end = updatedEvent.start;
        }
      }
  
      // 2. Update current event
      const originalDuration = new Date(originalEvent.end).getTime() - new Date(originalEvent.start).getTime();
      updatedEvent.end = new Date(new Date(updatedEvent.start).getTime() + originalDuration).toISOString();
      newEvents[eventIndex] = updatedEvent;
  
      // 3. Cascade changes to subsequent events
      let lastEnd = new Date(updatedEvent.end).getTime();
      for (let i = personEventIndex + 1; i < personEvents.length; i++) {
        const subsequentEvent = personEvents[i];
        if (subsequentEvent.fixedStart) break; // Stop at a fixed event
  
        const subsequentEventGlobalIndex = newEvents.findIndex(e => e.id === subsequentEvent.id);
        if (subsequentEventGlobalIndex !== -1) {
          const duration = new Date(subsequentEvent.end).getTime() - new Date(subsequentEvent.start).getTime();
          const newStart = lastEnd;
          const newEnd = newStart + duration;
          newEvents[subsequentEventGlobalIndex].start = new Date(newStart).toISOString();
          newEvents[subsequentEventGlobalIndex].end = new Date(newEnd).toISOString();
          lastEnd = newEnd;
        }
      }
  
      return newEvents.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });
  
    setEditingEvent(null);
  }

  function handleKlar(eventId: string | null) {
      if (!eventId) return;
      const ev = sourceEvents.find(e => e.id === eventId);
      if (!ev) return;
      boom();
  }
  
  function handleKlarSent(eventId: string | null) {
      if (!eventId) return;
       const ev = sourceEvents.find(e => e.id === eventId);
      if (!ev) return;
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
        shiftDate={(d) => { setDate(new Date(date.setDate(date.getDate() + d))); setManualDayType(null); }}
        setDate={(newDate) => { setDate(newDate); setManualDayType(null); }}
        dark={dark} 
        setDark={setDark} 
        assistantOpen={assistantOpen} 
        setAssistantOpen={setAssistantOpen} 
      />
      <main className="p-3 md:p-6 max-w-[1600px] mx-auto">
        <Toolbar people={people} showFor={showFor} setShowFor={setShowFor} />
        
        <div className="mt-3">
             <div className="flex items-center gap-4 text-xs text-neutral-400 mb-2 px-2">
                <span className="px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800">
                    Dagstyp: {PROFILES[currentDayType]?.label ?? currentDayType}
                </span>
                <span className="px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800">
                    Händelser: {sourceEvents.length}
                </span>
            </div>
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

    