
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
import { collection, onSnapshot, query, where, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";

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

    const today = new Date();
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) { // 0 = Sunday, 6 = Saturday
      setTodayType("OffDay");
    } else {
      setTodayType("SchoolDay");
    }
  }, []);
  
  // Real-time listener for events from Firestore
  useEffect(() => {
    if (!db || !isClient) return;

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
        eventsFromDb.push({ id: doc.id, ...doc.data() } as Event);
      });
      
      const dayType = manualDayType || (new Date(date).getDay() % 6 === 0 ? "OffDay" : "SchoolDay");
      const tomorrow = new Date(date);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDayType = tomorrow.getDay() % 6 === 0 ? "OffDay" : "SchoolDay";
      const templateEvents = expandProfileForDate(date.toISOString().slice(0,10), PROFILES[dayType], tomorrowDayType);

      // Simple merge: DB events take precedence over template events with the same key
      const dbEventKeys = new Set(eventsFromDb.map(e => e.meta?.templateKey).filter(Boolean));
      const filteredTemplateEvents = templateEvents.filter(te => !dbEventKeys.has(te.meta?.templateKey));
      
      const allEvents = [...eventsFromDb, ...filteredTemplateEvents].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      
      setSourceEvents(allEvents);
    }, (error) => {
        console.error("Error fetching events from Firestore:", error);
        toast({
            title: "Fel vid hämtning av data",
            description: "Kunde inte ansluta till databasen. Vissa funktioner kanske inte fungerar.",
            variant: "destructive"
        });
    });

    return () => unsubscribe();
  }, [date, toast, isClient, manualDayType]);


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
          if (eventDetails.person) {
            personId = people.find(p => p.name.toLowerCase() === eventDetails.person!.toLowerCase())?.id;
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
            
            await setDoc(doc(db, "events", newEvent.id), newEvent);
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
        await updateDoc(doc(db, "events", event.id), { imageUrl: result.imageUrl });
        toast({ title: 'Bild genererad!', description: 'Bilden har lagts till på din händelse.' });
      } else {
        throw new Error('Image URL was empty.');
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      toast({ variant: 'destructive', title: 'Fel vid bildgenerering', description: 'Kunde inte skapa bilden.' });
    }
  };
  
  async function deleteEvent(id: string) { 
    try {
        await deleteDoc(doc(db, "events", id));
        toast({ title: "Händelse borttagen" });
        setEditingEvent(null);
    } catch (error) {
        console.error("Error deleting event: ", error);
        toast({ title: "Fel", description: "Kunde inte ta bort händelsen.", variant: "destructive" });
    }
  }
  
  async function onEventUpdate(updatedEventData: Partial<Event>) {
    if (!updatedEventData.id) return;
    try {
      await updateDoc(doc(db, "events", updatedEventData.id), updatedEventData);
      toast({ title: "Händelse uppdaterad" });
      setEditingEvent(null);
    } catch (error) {
      console.error("Error updating event: ", error);
      toast({ title: "Fel", description: "Kunde inte uppdatera händelsen.", variant: "destructive" });
    }
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

    

    