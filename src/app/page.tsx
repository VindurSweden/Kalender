
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
  { id: "leia", name: "Leia", color: "#F28CB2", bg: "bg-pink-600/40", emoji: "👧" },
  { id: "gabriel", name: "Gabriel", color: "#5B9BFF", bg: "bg-blue-600/40", emoji: "🧒" },
  { id: "maria", name: "Mamma", color: "#C9A7FF", bg: "bg-purple-600/40", emoji: "👩" },
  { id: "antony", name: "Pappa", color: "#8AE68C", bg: "bg-green-600/40", emoji: "👨‍🦱" },
];

const DEFAULT_EVENTS: Event[] = [
    // Maria
    { id: uid(), personId: "maria", start: `${todayISO()}T06:00:00`, end: `${todayISO()}T07:00:00`, title: "Vaknar & kaffe", minDurationMin: 5, location: "home", cluster: "morning" },
    { id: uid(), personId: "maria", start: `${todayISO()}T07:00:00`, end: `${todayISO()}T08:00:00`, title: "Morgonrutin", minDurationMin: 15, location: "home", cluster: "morning" },
    { id: uid(), personId: "maria", start: `${todayISO()}T08:00:00`, end: `${todayISO()}T12:00:00`, title: "Jobb (förmiddag)", location: "work" },
    { id: uid(), personId: "maria", start: `${todayISO()}T12:00:00`, end: `${todayISO()}T13:00:00`, title: "Lunch", minDurationMin: 15, location: "work" },
    { id: uid(), personId: "maria", start: `${todayISO()}T13:00:00`, end: `${todayISO()}T16:30:00`, title: "Jobb (eftermiddag)", location: "work" },
    { id: uid(), personId: "maria", start: `${todayISO()}T16:30:00`, end: `${todayISO()}T17:00:00`, title: "Hämtar Leia (fritids)", fixedStart: true, involved: [{personId:"leia", role:"required"}], resource: "car", location: "city" },
    { id: uid(), personId: "maria", start: `${todayISO()}T18:00:00`, end: `${todayISO()}T19:00:00`, title: "Middag", minDurationMin: 20, involved: [{personId:"antony", role:"required"}, {personId:"leia", role:"required"}, {personId:"gabriel", role:"required"}], location: "home", cluster: "evening" },
    { id: uid(), personId: "maria", start: `${todayISO()}T21:00:00`, end: `${todayISO()}T22:00:00`, title: "Kvällsrutin", minDurationMin: 10, location: "home", cluster: "evening" },

    // Leia
    { id: uid(), personId: "leia", start: `${todayISO()}T06:00:00`, end: `${todayISO()}T07:00:00`, title: "Vaknar långsamt", minDurationMin: 10, location: "home", cluster: "morning" },
    { id: uid(), personId: "leia", start: `${todayISO()}T07:00:00`, end: `${todayISO()}T07:08:00`, title: "Vakna", minDurationMin: 3, location: "home", cluster: "morning" },
    { id: uid(), personId: "leia", start: `${todayISO()}T07:08:00`, end: `${todayISO()}T07:16:00`, title: "Borsta tänder", minDurationMin: 2, location: "home", cluster: "morning" },
    { id: uid(), personId: "leia", start: `${todayISO()}T07:16:00`, end: `${todayISO()}T07:24:00`, title: "Äta frukost", minDurationMin: 10, dependsOn: ["ant-07-00-10"], involved: [{personId:"antony", role:"required"}], location: "home", cluster: "morning" },
    { id: uid(), personId: "leia", start: `${todayISO()}T07:24:00`, end: `${todayISO()}T07:32:00`, title: "Ta vitaminer", minDurationMin: 1, dependsOn: ["leia-07-16"], allowAlone: true, location: "home", cluster: "morning" },
    { id: uid(), personId: "leia", start: `${todayISO()}T07:32:00`, end: `${todayISO()}T07:40:00`, title: "Borsta hår", minDurationMin: 2, allowAlone: true, location: "home", cluster: "morning" },
    { id: uid(), personId: "leia", start: `${todayISO()}T07:40:00`, end: `${todayISO()}T07:48:00`, title: "Klä på sig", minDurationMin: 4, allowAlone: true, location: "home", cluster: "morning" },
    { id: uid(), personId: "leia", start: `${todayISO()}T07:48:00`, end: `${todayISO()}T08:00:00`, title: "Packa väska & skor", minDurationMin: 5, allowAlone: true, location: "home", cluster: "morning" },
    { id: uid(), personId: "leia", start: `${todayISO()}T08:00:00`, end: `${todayISO()}T13:30:00`, title: "Skola", fixedStart: true, location: "school" },
    { id: uid(), personId: "leia", start: `${todayISO()}T13:30:00`, end: `${todayISO()}T16:30:00`, title: "Fritids", location: "school" },
    { id: uid(), personId: "leia", start: `${todayISO()}T16:30:00`, end: `${todayISO()}T17:00:00`, title: "Blir hämtad (fritids)", dependsOn: ["maria-1630"], involved: [{personId:"maria", role:"required"}], location: "school", resource: "car" },
    { id: uid(), personId: "leia", start: `${todayISO()}T18:00:00`, end: `${todayISO()}T19:00:00`, title: "Middag", minDurationMin: 20, involved: [{personId:"maria", role:"required"}, {personId:"antony", role:"required"}, {personId:"gabriel", role:"helper"}], location: "home", cluster: "evening" },
    { id: uid(), personId: "leia", start: `${todayISO()}T19:00:00`, end: `${todayISO()}T20:00:00`, title: "Läxor", minDurationMin: 15, location: "home" },
    { id: uid(), personId: "leia", start: `${todayISO()}T20:00:00`, end: `${todayISO()}T21:00:00`, title: "Spel / lugn", minDurationMin: 5, location: "home" },
    { id: uid(), personId: "leia", start: `${todayISO()}T21:00:00`, end: `${todayISO()}T22:00:00`, title: "Kvällsrutin", minDurationMin: 10, location: "home", cluster: "evening" },
    
    // Gabriel
    { id: uid(), personId: "gabriel", start: `${todayISO()}T06:00:00`, end: `${todayISO()}T07:00:00`, title: "Morgonmys", minDurationMin: 5, location: "home" },
    { id: uid(), personId: "gabriel", start: `${todayISO()}T07:00:00`, end: `${todayISO()}T07:20:00`, title: "Vakna & påklädning", minDurationMin: 8, location: "home", cluster: "morning" },
    { id: uid(), personId: "gabriel", start: `${todayISO()}T07:20:00`, end: `${todayISO()}T07:40:00`, title: "Frukost", minDurationMin: 8, dependsOn: ["ant-07-00-10"], involved: [{personId:"antony", role:"required"}], location: "home", cluster: "morning" },
    { id: uid(), personId: "gabriel", start: `${todayISO()}T07:40:00`, end: `${todayISO()}T08:00:00`, title: "Tänder & skor", minDurationMin: 4, allowAlone: false, location: "home", cluster: "morning" },
    { id: uid(), personId: "gabriel", start: `${todayISO()}T08:00:00`, end: `${todayISO()}T13:00:00`, title: "Förskola", fixedStart: true, location: "school" },
    { id: uid(), personId: "gabriel", start: `${todayISO()}T13:00:00`, end: `${todayISO()}T16:00:00`, title: "Lek & mellis", minDurationMin: 20, location: "home" },
    { id: uid(), personId: "gabriel", start: `${todayISO()}T18:00:00`, end: `${todayISO()}T19:00:00`, title: "Middag", minDurationMin: 20, involved: [{personId:"maria", role:"required"}, {personId:"antony", role:"required"}, {personId:"leia", role:"helper"}], location: "home", cluster: "evening" },
    { id: uid(), personId: "gabriel", start: `${todayISO()}T19:00:00`, end: `${todayISO()}T20:00:00`, title: "Lego", minDurationMin: 5, location: "home" },
    { id: uid(), personId: "gabriel", start: `${todayISO()}T21:00:00`, end: `${todayISO()}T22:00:00`, title: "Kvällsrutin", minDurationMin: 10, location: "home", cluster: "evening" },
    
    // Antony
    { id: "ant-07-00-10", personId: "antony", start: `${todayISO()}T07:00:00`,  end: `${todayISO()}T07:10:00`, title: "Fixa frukost", minDurationMin: 6, location: "home", resource: "kitchen", cluster: "morning" },
    { id: "ant-07-10-30", personId: "antony", start: `${todayISO()}T07:10:00`, end: `${todayISO()}T07:30:00`, title: "Äta frukost (med barnen)", minDurationMin: 10, involved: [{personId:"leia", role:"required"}, {personId:"gabriel", role:"required"}], location: "home", cluster: "morning" },
    { id: "ant-07-30-40", personId: "antony", start: `${todayISO()}T07:30:00`, end: `${todayISO()}T07:40:00`, title: "Göra sig klar", minDurationMin: 6, location: "home", cluster: "morning" },
    { id: "ant-07-40-50", personId: "antony", start: `${todayISO()}T07:40:00`, end: `${todayISO()}T07:50:00`, title: "Hjälpa Leia bli klar", minDurationMin: 8, involved: [{personId:"leia", role:"required"}], location: "home", cluster: "morning" },
    { id: "ant-07-50-55", personId: "antony", start: `${todayISO()}T07:50:00`, end: `${todayISO()}T07:55:00`, title: "Hjälpa Gabriel med väskan", minDurationMin: 3, involved: [{personId:"gabriel", role:"required"}], location: "home", cluster: "morning" },
    { id: "ant-07-55-08", personId: "antony", start: `${todayISO()}T07:55:00`, end: `${todayISO()}T08:00:00`,  title: "Gå med Leia", minDurationMin: 5, involved: [{personId:"leia", role:"required"}], location: "street", cluster: "morning" },
    { id: uid(), personId: "antony", start: `${todayISO()}T08:00:00`,    end: `${todayISO()}T12:00:00`,   title: "Jobb (hemma)", location: "home" },
    { id: uid(), personId: "antony", start: `${todayISO()}T12:00:00`,   end: `${todayISO()}T13:00:00`,   title: "Lunch", minDurationMin: 15, location: "home" },
    { id: uid(), personId: "antony", start: `${todayISO()}T13:00:00`,   end: `${todayISO()}T18:00:00`,   title: "Jobb (hemma)", location: "home" },
    { id: uid(), personId: "antony", start: `${todayISO()}T18:00:00`,   end: `${todayISO()}T19:00:00`,   title: "Middag", minDurationMin: 20, involved: [{personId:"maria", role:"required"}, {personId:"leia", role:"required"}, {personId:"gabriel", role:"required"}], location: "home", cluster: "evening" },
];


// --- Main Component ---
export default function NPFScheduleApp() {
  const [isClient, setIsClient] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [date, setDate] = useState(() => new Date());
  const [showFor, setShowFor] = useState<string[]>([]);
  const [dark, setDark] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
    setPeople(loadLS("vcal.people", DEFAULT_PEOPLE));
    setEvents(loadLS("vcal.events", DEFAULT_EVENTS));
    setShowFor(loadLS("vcal.showFor", DEFAULT_PEOPLE.slice(0, 2).map(p => p.id)));
  }, []);

  useEffect(() => { if (isClient) saveLS("vcal.people", people)}, [people, isClient]);
  useEffect(() => { if (isClient) saveLS("vcal.events", events)}, [events, isClient]);
  useEffect(() => { if (isClient) saveLS("vcal.showFor", showFor)}, [showFor, isClient]);
  
  useEffect(() => { if (typeof window !== 'undefined') { if (dark) document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark"); } }, [dark]);

  const orderedShowFor = useMemo(() => {
    const order = new Map(people.map((p, i) => [p.id, i]));
    return [...showFor].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }, [showFor, people]);

  const dailyEvents = useMemo(() => {
      return events.filter(e => isSameDay(new Date(e.start), date));
  }, [events, date]);

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
  
  function deleteEvent(id: string) { 
    setEvents(prev => prev.filter(ev => ev.id !== id)); 
  }
  
  function onEventUpdate(updatedEvent: Event) {
    setEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));
    setEditingEvent(null);
  }

  function handleKlar(eventId: string | null) {
      if (!eventId) return;
      boom();
  }
  
  function handleKlarSent(eventId: string | null) {
      if (!eventId) return;
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
                    events={dailyEvents}
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
        events={events} 
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
