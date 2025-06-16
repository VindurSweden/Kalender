
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { CalendarEvent } from '@/types/event';
import Header from '@/components/Header';
import MonthView from '@/components/MonthView';
import WeekView from '@/components/WeekView';
import EventForm from '@/components/EventForm';
import AiAssistant from '@/components/AiAssistant';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  addMonths, subMonths, addWeeks, subWeeks, getMonthNameYear, 
  formatInputDate, formatInputTime, parseInputDate, parseInputTime, TIME_FORMAT, combineDateAndTime, format,
  parseFlexibleSwedishDateString, parseFlexibleSwedishTimeString, isSameDay
} from '@/lib/date-utils';
import { generateEventImage } from '@/ai/flows/generate-event-image';


export default function HomePage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultDateForNewEvent, setDefaultDateForNewEvent] = useState<Date | null>(null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedEvents = localStorage.getItem('visuCalEvents');
      if (storedEvents) {
        setEvents(JSON.parse(storedEvents).map((e: any) => ({...e, date: e.date ? formatInputDate(parseInputDate(e.date)) : formatInputDate(new Date())})));
      }
    } catch (error) {
      console.error("Failed to load events from localStorage:", error);
      toast({ title: "Fel", description: "Kunde inte ladda sparade händelser.", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    try {
      localStorage.setItem('visuCalEvents', JSON.stringify(events));
    } catch (error) {
      console.error("Failed to save events to localStorage:", error);
    }
  }, [events]);

  const handleOpenEventForm = (event?: CalendarEvent | null, date?: Date) => {
    setEditingEvent(event || null);
    setDefaultDateForNewEvent(date || null);
    setIsEventFormOpen(true);
  };

  const handleCloseEventForm = () => {
    setIsEventFormOpen(false);
    setEditingEvent(null);
    setDefaultDateForNewEvent(null);
  };

  const handleSaveEvent = (eventData: Omit<CalendarEvent, 'id' | 'imageUrl'>, id?: string, newImageUrl?: string) => {
    if (id) { 
      setEvents(prevEvents =>
        prevEvents.map(e => (e.id === id ? { ...e, ...eventData, imageUrl: newImageUrl ?? e.imageUrl } : e))
      );
      toast({ title: "Händelse Uppdaterad", description: `"${eventData.title}" har uppdaterats.` });
    } else { 
      const newEvent: CalendarEvent = {
        ...eventData,
        id: crypto.randomUUID(),
        imageUrl: newImageUrl,
      };
      setEvents(prevEvents => [...prevEvents, newEvent]);
      toast({ title: "Händelse Skapad", description: `"${newEvent.title}" har lagts till.` });
    }
  };
  
  const confirmDeleteEvent = (event: CalendarEvent) => {
    setEventToDelete(event);
  };

  const handleDeleteEvent = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    setEvents(prevEvents => prevEvents.filter(e => e.id !== eventId));
    setEventToDelete(null);
    if (event) {
      toast({ title: "Händelse Borttagen", description: `"${event.title}" har tagits bort.` });
    }
  };

  const handleAiCreateEvent = async (eventDetails: any): Promise<CalendarEvent | null> => {
    try {
      const title = eventDetails.title || 'AI Händelse';
      
      const parsedDate = eventDetails.dateQuery ? parseFlexibleSwedishDateString(eventDetails.dateQuery, new Date()) : new Date();
      if (!parsedDate) {
        toast({ title: "AI Fel", description: `Kunde inte tolka datum: "${eventDetails.dateQuery}".`, variant: "destructive" });
        return null;
      }
      const dateStr = formatInputDate(parsedDate);

      let startTime = '09:00'; // Default start time
      if (eventDetails.timeQuery) {
        const parsedTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery, parsedDate);
        if (parsedTime) {
          startTime = formatInputTime(parsedTime);
        } else {
          toast({ title: "AI Varning", description: `Kunde inte tolka tid: "${eventDetails.timeQuery}". Använder standardtid.`, variant: "default" });
        }
      }
      
      const endTimeDate = combineDateAndTime(parseInputDate(dateStr), parseInputTime(startTime));
      endTimeDate.setHours(endTimeDate.getHours() + 1); 
      const endTime = format(endTimeDate, TIME_FORMAT);
      const description = eventDetails.description || '';
      const color = eventDetails.color || '#69B4EB';
      
      let imageUrl: string | undefined = undefined;
      if (title) {
        try {
          const imageResult = await generateEventImage({ eventTitle: title });
          imageUrl = imageResult.imageUrl;
        } catch (imgError) {
          console.error("AI Event Image Generation Error:", imgError);
          // Non-critical, proceed without image
        }
      }

      const newEvent: CalendarEvent = {
        id: crypto.randomUUID(),
        title,
        date: dateStr,
        startTime,
        endTime,
        description,
        color, 
        imageUrl,
      };
      
      setEvents(prevEvents => [...prevEvents, newEvent]);
      toast({ title: "Händelse skapad av AI", description: `"${newEvent.title}" har lagts till.` });
      return newEvent;

    } catch (e) {
      console.error("Error processing AI event creation:", e);
      toast({ title: "AI Fel", description: "Kunde inte skapa händelse från AI instruktion.", variant: "destructive" });
      return null;
    }
  };

  const findEventToModifyOrDelete = (identifier: any): CalendarEvent | null => {
    if (!identifier) return null;

    const { title: targetTitle, dateQuery: targetDateQuery } = identifier;

    if (!targetTitle) {
      // If no title is provided for identification, we cannot reliably find the event.
      // AI should be prompted to ask for which event.
      return null;
    }

    let potentialEvents = events.filter(e => e.title.toLowerCase().includes(targetTitle.toLowerCase()));

    if (potentialEvents.length === 0) return null;
    if (potentialEvents.length === 1) return potentialEvents[0];

    // If multiple events match the title, try to use dateQuery to disambiguate
    if (targetDateQuery) {
      const referenceDateForQuery = parseFlexibleSwedishDateString(targetDateQuery, new Date());
      if (referenceDateForQuery) {
        const dateFilteredEvents = potentialEvents.filter(e => 
          isSameDay(parseInputDate(e.date), referenceDateForQuery)
        );
        if (dateFilteredEvents.length === 1) return dateFilteredEvents[0];
        if (dateFilteredEvents.length > 0) potentialEvents = dateFilteredEvents; // Narrow down
      }
    }
    
    // If still multiple, or couldn't use dateQuery, it's ambiguous.
    // For now, return the first match, but ideally AI would ask for clarification.
    // This function doesn't directly make the AI ask, but the AI flow should use this possibility.
    if (potentialEvents.length > 1) {
        toast({ title: "AI Info", description: `Flera händelser matchar "${targetTitle}". Specificera gärna mer. Ändrar den första.`, variant: "default" });
    }
    return potentialEvents[0];
  };
  
  const handleAiModifyEvent = async (eventIdentifier: any, eventDetails: any): Promise<CalendarEvent | null> => {
    const eventToModify = findEventToModifyOrDelete(eventIdentifier);
    if (!eventToModify) {
      toast({ title: "AI Fel", description: "Kunde inte hitta händelse att ändra baserat på din beskrivning.", variant: "destructive" });
      return null;
    }

    const updatedEventData: Partial<Omit<CalendarEvent, 'id' | 'imageUrl'>> = {};
    let titleChanged = false;
    let newTitleForImage = eventToModify.title;

    if (eventDetails.title) {
      if (eventToModify.title !== eventDetails.title) titleChanged = true;
      updatedEventData.title = eventDetails.title;
      newTitleForImage = eventDetails.title;
    }
    if (eventDetails.dateQuery) {
      const parsedDate = parseFlexibleSwedishDateString(eventDetails.dateQuery, parseInputDate(eventToModify.date));
      if (parsedDate) {
        updatedEventData.date = formatInputDate(parsedDate);
      } else {
        toast({ title: "AI Varning", description: `Kunde inte tolka nytt datum: "${eventDetails.dateQuery}". Datumet ändras inte.`, variant: "default" });
      }
    }
    if (eventDetails.timeQuery) {
      const referenceDateForTimeParse = updatedEventData.date ? parseInputDate(updatedEventData.date) : parseInputDate(eventToModify.date);
      const parsedTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery, referenceDateForTimeParse);
      if (parsedTime) {
        updatedEventData.startTime = formatInputTime(parsedTime);
        // Optionally adjust end time if only start time is changed
        const newEndTime = new Date(parsedTime);
        newEndTime.setHours(newEndTime.getHours() + 1); // Assume 1 hour duration if only start time changes
        updatedEventData.endTime = formatInputTime(newEndTime);

      } else {
         toast({ title: "AI Varning", description: `Kunde inte tolka ny tid: "${eventDetails.timeQuery}". Tiden ändras inte.`, variant: "default" });
      }
    }
    if (typeof eventDetails.description === 'string') {
      updatedEventData.description = eventDetails.description;
    }
    if (eventDetails.color) {
      updatedEventData.color = eventDetails.color;
    }
    
    let finalImageUrl = eventToModify.imageUrl;
    if (titleChanged && newTitleForImage) {
        try {
            const imageResult = await generateEventImage({ eventTitle: newTitleForImage });
            finalImageUrl = imageResult.imageUrl;
        } catch (imgError) {
            console.error("AI Event Image Regeneration Error:", imgError);
        }
    } else if (titleChanged && !newTitleForImage) { 
        finalImageUrl = undefined; 
    }
    
    // Create the event object with all fields for saving
    const eventDataForSave: Omit<CalendarEvent, 'id' | 'imageUrl'> = {
      title: updatedEventData.title ?? eventToModify.title,
      date: updatedEventData.date ?? eventToModify.date,
      startTime: updatedEventData.startTime ?? eventToModify.startTime,
      endTime: updatedEventData.endTime ?? eventToModify.endTime,
      description: updatedEventData.description ?? eventToModify.description,
      color: updatedEventData.color ?? eventToModify.color,
    };
    
    handleSaveEvent(eventDataForSave, eventToModify.id, finalImageUrl);
    
    return { ...eventDataForSave, id: eventToModify.id, imageUrl: finalImageUrl };
  };

  const handleAiDeleteEvent = async (eventIdentifier: any): Promise<string | null> => {
     const eventToDeleteByAi = findEventToModifyOrDelete(eventIdentifier);
    if (!eventToDeleteByAi) {
      toast({ title: "AI Fel", description: "Kunde inte hitta händelse att ta bort baserat på din beskrivning.", variant: "destructive" });
      return null;
    }
    handleDeleteEvent(eventToDeleteByAi.id);
    return eventToDeleteByAi.id;
  };


  const prevPeriod = useCallback(() => {
    setCurrentDate(current => view === 'month' ? subMonths(current, 1) : subWeeks(current, 1));
  }, [view]);

  const nextPeriod = useCallback(() => {
    setCurrentDate(current => view === 'month' ? addMonths(current, 1) : addWeeks(current, 1));
  }, [view]);


  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onPrev={prevPeriod}
        onNext={nextPeriod}
        currentMonthYear={getMonthNameYear(currentDate)}
        onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
      />
      <main className="flex-grow container mx-auto px-0 sm:px-4 py-4 relative">
        {view === 'month' ? (
          <MonthView 
            currentDate={currentDate} 
            events={events} 
            onDayClick={(date) => handleOpenEventForm(null, date)}
            onEventClick={(event) => handleOpenEventForm(event)}
          />
        ) : (
          <WeekView 
            currentDate={currentDate} 
            events={events}
            onSlotClick={(date, startTime) => {
              const newEventDate = combineDateAndTime(date, parseInputTime(startTime));
              handleOpenEventForm(null, newEventDate);
            }}
            onEventClick={(event) => handleOpenEventForm(event)}
          />
        )}
        <Button
          onClick={() => handleOpenEventForm(null, new Date())}
          className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-xl"
          aria-label="Lägg till ny händelse"
        >
          <PlusCircle className="w-7 h-7" />
        </Button>
      </main>

      <EventForm
        isOpen={isEventFormOpen}
        onClose={handleCloseEventForm}
        onSave={handleSaveEvent}
        eventToEdit={editingEvent}
        defaultDate={defaultDateForNewEvent}
      />
      
      <AiAssistant
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        onAiCreateEvent={handleAiCreateEvent}
        onAiModifyEvent={handleAiModifyEvent}
        onAiDeleteEvent={handleAiDeleteEvent}
      />

      {eventToDelete && (
        <AlertDialog open={!!eventToDelete} onOpenChange={() => setEventToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Är du säker på att du vill ta bort den här händelsen?</AlertDialogTitle>
              <AlertDialogDescription>
                Denna åtgärd kan inte ångras. Detta kommer permanent att radera händelsen "{eventToDelete.title}".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setEventToDelete(null)}>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDeleteEvent(eventToDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <Trash2 className="mr-2 h-4 w-4" /> Ta bort
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
