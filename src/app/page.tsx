

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
      // Toast is handled by AiAssistant or EventForm now.
      // toast({ title: "Händelse Uppdaterad", description: `"${eventData.title}" har uppdaterats.` });
    } else { 
      const newEvent: CalendarEvent = {
        ...eventData,
        id: crypto.randomUUID(),
        imageUrl: newImageUrl,
      };
      setEvents(prevEvents => [...prevEvents, newEvent]);
      // toast({ title: "Händelse Skapad", description: `"${newEvent.title}" har lagts till.` });
    }
  };
  
  const confirmDeleteEvent = (event: CalendarEvent) => {
    setEventToDelete(event);
  };

  const handleDeleteEvent = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    setEvents(prevEvents => prevEvents.filter(e => e.id !== eventId));
    setEventToDelete(null);
    if (event && !isAiAssistantOpen) { // Avoid double toast if AI initiated
      toast({ title: "Händelse Borttagen", description: `"${event.title}" har tagits bort.` });
    }
  };

  const handleAiCreateEvent = async (eventDetails: any): Promise<CalendarEvent | null> => {
    try {
      const title = eventDetails.title || 'AI Händelse';
      
      const parsedDate = eventDetails.dateQuery ? parseFlexibleSwedishDateString(eventDetails.dateQuery, new Date()) : new Date();
      if (!parsedDate) {
        // Toast will be handled by AiAssistant based on AI's response (clarification needed)
        return null;
      }
      const dateStr = formatInputDate(parsedDate);

      let startTime = '09:00'; // Default start time
      if (eventDetails.timeQuery) {
        const parsedTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery, parsedDate);
        if (parsedTime) {
          startTime = formatInputTime(parsedTime);
        } else {
          // AI should ideally ask for clarification if timeQuery is bad.
          // If it proceeds, this is a fallback warning from frontend.
          toast({ title: "AI Varning", description: `Kunde inte tolka tid: "${eventDetails.timeQuery}". Använder standardtid ${startTime}.`, variant: "default" });
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
          console.error("AI Event Image Generation Error (Create):", imgError);
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
      return newEvent;

    } catch (e) {
      console.error("Error processing AI event creation:", e);
      // Generic error if something unexpected happens here, AI should provide main user feedback
      toast({ title: "Internt Fel", description: "Kunde inte skapa händelse från AI instruktion på grund av ett internt fel.", variant: "destructive" });
      return null;
    }
  };

  const findEventToModifyOrDelete = (identifier: any): CalendarEvent | null => {
    if (!identifier) return null;

    const { title: targetTitle, dateQuery: targetDateQuery, timeQuery: targetTimeQuery } = identifier;

    if (!targetTitle) {
        // AI should have provided a title if it's identifying an event
        return null;
    }

    let potentialEvents = events.filter(e => e.title.toLowerCase().includes(targetTitle.toLowerCase()));

    if (potentialEvents.length === 0) return null;

    let referenceDateForDateQuery: Date | null = null;
    if (targetDateQuery) {
        referenceDateForDateQuery = parseFlexibleSwedishDateString(targetDateQuery, new Date());
        if (referenceDateForDateQuery) {
            potentialEvents = potentialEvents.filter(e => 
                isSameDay(parseInputDate(e.date), referenceDateForDateQuery!)
            );
        } else {
            // dateQuery was provided but couldn't be parsed by frontend.
            // If AI was confident, it implies it matched based on something, but frontend can't verify date.
            // If multiple title matches exist, this is ambiguous.
            if (potentialEvents.length > 1) return null; 
        }
    }
    if (potentialEvents.length === 0) return null;

    if (targetTimeQuery) {
        // Determine the base date for parsing the original timeQuery
        // If referenceDateForDateQuery is set (meaning dateQuery was parsable and specific), use it.
        // Otherwise, if we have potentialEvents, use the date of the first one (they should share the same date
        // if dateQuery was broad like "idag" but successfully narrowed down the list).
        // As a last resort, use new Date(), though this path should be rare if events were found.
        const baseDateForOriginalTimeParse = 
            referenceDateForDateQuery || 
            (potentialEvents.length > 0 ? parseInputDate(potentialEvents[0].date) : new Date());
            
        const parsedOriginalTime = parseFlexibleSwedishTimeString(targetTimeQuery, baseDateForOriginalTimeParse);

        if (parsedOriginalTime) {
            const originalStartTimeStr = formatInputTime(parsedOriginalTime);
            potentialEvents = potentialEvents.filter(e => e.startTime === originalStartTimeStr);
        } else {
            // timeQuery was provided but couldn't be parsed by frontend.
            // If multiple events remain, this is ambiguous.
            if (potentialEvents.length > 1) return null;
        }
    }
    if (potentialEvents.length === 0) return null;
    
    if (potentialEvents.length > 1) {
        // Still ambiguous after all filters. AI should ideally ask for clarification.
        return null; 
    }
    return potentialEvents[0] || null;
  };
  
  const handleAiModifyEvent = async (eventIdentifier: any, eventDetails: any): Promise<CalendarEvent | null> => {
    const eventToModify = findEventToModifyOrDelete(eventIdentifier);
    if (!eventToModify) {
      // AI should handle user feedback if it needs clarification or couldn't find the event.
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
        // AI should clarify if date is unparsable by frontend
        toast({ title: "AI Varning", description: `Kunde inte tolka nytt datum från AI: "${eventDetails.dateQuery}". Datumet ändras inte.`, variant: "default" });
      }
    }
    
    const baseDateForNewTimeParse = updatedEventData.date ? parseInputDate(updatedEventData.date) : parseInputDate(eventToModify.date);
    if (eventDetails.timeQuery) {
      const parsedNewTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery, baseDateForNewTimeParse);
      if (parsedNewTime) {
        updatedEventData.startTime = formatInputTime(parsedNewTime);
        
        const currentEventDurationMs = parseInputTime(eventToModify.endTime, baseDateForNewTimeParse).getTime() - parseInputTime(eventToModify.startTime, baseDateForNewTimeParse).getTime();
        const newEndTime = new Date(parsedNewTime.getTime() + currentEventDurationMs);
        updatedEventData.endTime = formatInputTime(newEndTime);

      } else {
         toast({ title: "AI Varning", description: `Kunde inte tolka ny tid från AI: "${eventDetails.timeQuery}". Tiden ändras inte.`, variant: "default" });
      }
    }
    if (typeof eventDetails.description === 'string') {
      updatedEventData.description = eventDetails.description;
    }
    if (eventDetails.color) {
      updatedEventData.color = eventDetails.color;
    }
    
    let finalImageUrl = eventToModify.imageUrl;
    // Regenerate image if title has changed AND the new title is not empty.
    // Or if there's no image and a title exists.
    const shouldRegenerateImage = (titleChanged && newTitleForImage) || (!eventToModify.imageUrl && newTitleForImage);

    if (shouldRegenerateImage) {
        try {
            const imageResult = await generateEventImage({ eventTitle: newTitleForImage! }); // newTitleForImage is guaranteed by shouldRegenerateImage logic
            finalImageUrl = imageResult.imageUrl;
        } catch (imgError) {
            console.error("AI Event Image Regeneration Error (Modify):", imgError);
        }
    } else if (titleChanged && !newTitleForImage) { 
        finalImageUrl = undefined; 
    }
    
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
        events={events}
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


    