

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
    } else { 
      const newEvent: CalendarEvent = {
        ...eventData,
        id: crypto.randomUUID(),
        imageUrl: newImageUrl,
      };
      setEvents(prevEvents => [...prevEvents, newEvent]);
    }
  };
  
  const confirmDeleteEvent = (event: CalendarEvent) => {
    setEventToDelete(event);
  };

  const handleDeleteEvent = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    setEvents(prevEvents => prevEvents.filter(e => e.id !== eventId));
    setEventToDelete(null);
    if (event && !isAiAssistantOpen) { 
      toast({ title: "Händelse Borttagen", description: `"${event.title}" har tagits bort.` });
    }
  };

  const handleAiCreateEvent = async (eventDetails: any): Promise<CalendarEvent | null> => {
    console.log("[HomePage] handleAiCreateEvent received eventDetails:", eventDetails);
    try {
      const title = eventDetails.title || 'AI Händelse';
      
      const parsedDate = eventDetails.dateQuery ? parseFlexibleSwedishDateString(eventDetails.dateQuery, new Date()) : new Date();
      if (!parsedDate) {
        console.warn("[HomePage] AI Create: Could not parse dateQuery:", eventDetails.dateQuery);
        return null;
      }
      const dateStr = formatInputDate(parsedDate);

      let startTime = '09:00'; 
      if (eventDetails.timeQuery) {
        const parsedTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery, parsedDate);
        if (parsedTime) {
          startTime = formatInputTime(parsedTime);
        } else {
          console.warn(`[HomePage] AI Create: Could not parse timeQuery: "${eventDetails.timeQuery}". Using default ${startTime}.`);
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
          console.log(`[HomePage] AI Create: Generating image for title: "${title}"`);
          const imageResult = await generateEventImage({ eventTitle: title });
          imageUrl = imageResult.imageUrl;
          console.log(`[HomePage] AI Create: Image generation result for "${title}": ${imageUrl ? 'Success' : 'No URL'}`);
        } catch (imgError) {
          console.error("[HomePage] AI Create: Image Generation Error:", imgError);
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
      console.log("[HomePage] AI Create: Successfully created event:", newEvent);
      return newEvent;

    } catch (e) {
      console.error("[HomePage] AI Create: Error processing AI event creation:", e);
      toast({ title: "Internt Fel", description: "Kunde inte skapa händelse från AI instruktion på grund av ett internt fel.", variant: "destructive" });
      return null;
    }
  };

  const findEventToModifyOrDelete = (identifier: any): CalendarEvent | null => {
    console.log("[HomePage] findEventToModifyOrDelete, identifier:", identifier);
    if (!identifier) {
      console.log("[HomePage] findEventToModifyOrDelete: No identifier provided.");
      return null;
    }

    const { title: targetTitle, dateQuery: targetDateQuery, timeQuery: targetTimeQuery } = identifier;

    if (!targetTitle) {
        console.log("[HomePage] findEventToModifyOrDelete: No targetTitle in identifier.");
        return null;
    }

    let potentialEvents = events.filter(e => e.title.toLowerCase().includes(targetTitle.toLowerCase()));
    console.log(`[HomePage] findEventToModifyOrDelete: Found ${potentialEvents.length} potential events after title match for "${targetTitle}".`);

    if (potentialEvents.length === 0) return null;

    let referenceDateForDateQuery: Date | null = null;
    if (targetDateQuery) {
        referenceDateForDateQuery = parseFlexibleSwedishDateString(targetDateQuery, new Date());
        if (referenceDateForDateQuery) {
            console.log(`[HomePage] findEventToModifyOrDelete: Parsed targetDateQuery "${targetDateQuery}" to ${formatInputDate(referenceDateForDateQuery)}.`);
            potentialEvents = potentialEvents.filter(e => 
                isSameDay(parseInputDate(e.date), referenceDateForDateQuery!)
            );
            console.log(`[HomePage] findEventToModifyOrDelete: Found ${potentialEvents.length} potential events after dateQuery match.`);
        } else {
            console.warn(`[HomePage] findEventToModifyOrDelete: Could not parse targetDateQuery "${targetDateQuery}".`);
            if (potentialEvents.length > 1) {
              console.log("[HomePage] findEventToModifyOrDelete: Ambiguous due to unparsed dateQuery and multiple title matches.");
              return null;
            }
        }
    }
    if (potentialEvents.length === 0) return null;

    if (targetTimeQuery) {
        console.log(`[HomePage] findEventToModifyOrDelete: Attempting to filter by targetTimeQuery "${targetTimeQuery}".`);
        const baseDateForOriginalTimeParse = 
            referenceDateForDateQuery || 
            (potentialEvents.length > 0 ? parseInputDate(potentialEvents[0].date) : new Date());
            
        const parsedOriginalTime = parseFlexibleSwedishTimeString(targetTimeQuery, baseDateForOriginalTimeParse);

        if (parsedOriginalTime) {
            const originalStartTimeStr = formatInputTime(parsedOriginalTime);
            console.log(`[HomePage] findEventToModifyOrDelete: Parsed targetTimeQuery "${targetTimeQuery}" to ${originalStartTimeStr}.`);
            potentialEvents = potentialEvents.filter(e => e.startTime === originalStartTimeStr);
            console.log(`[HomePage] findEventToModifyOrDelete: Found ${potentialEvents.length} potential events after timeQuery match.`);
        } else {
            console.warn(`[HomePage] findEventToModifyOrDelete: Could not parse targetTimeQuery "${targetTimeQuery}".`);
            if (potentialEvents.length > 1) {
              console.log("[HomePage] findEventToModifyOrDelete: Ambiguous due to unparsed timeQuery and multiple remaining matches.");
              return null;
            }
        }
    }
    if (potentialEvents.length === 0) {
      console.log("[HomePage] findEventToModifyOrDelete: No events found after all filters.");
      return null;
    }
    
    if (potentialEvents.length > 1) {
        console.warn("[HomePage] findEventToModifyOrDelete: Ambiguous - multiple events match criteria:", potentialEvents);
        return null; 
    }
    console.log("[HomePage] findEventToModifyOrDelete: Found unique event:", potentialEvents[0]);
    return potentialEvents[0] || null;
  };
  
  const handleAiModifyEvent = async (eventIdentifier: any, eventDetails: any): Promise<CalendarEvent | null> => {
    console.log("[HomePage] handleAiModifyEvent received:", { eventIdentifier, eventDetails });
    const eventToModify = findEventToModifyOrDelete(eventIdentifier);
    if (!eventToModify) {
      console.warn("[HomePage] AI Modify: Could not find event to modify with identifier:", eventIdentifier);
      return null;
    }
    console.log("[HomePage] AI Modify: Found event to modify:", eventToModify);

    const updatedEventData: Partial<Omit<CalendarEvent, 'id' | 'imageUrl'>> = {};
    let titleChanged = false;
    let newTitleForImage = eventToModify.title;

    if (eventDetails.title) {
      if (eventToModify.title !== eventDetails.title) titleChanged = true;
      updatedEventData.title = eventDetails.title;
      newTitleForImage = eventDetails.title;
      console.log(`[HomePage] AI Modify: Title changed to "${newTitleForImage}"`);
    }
    if (eventDetails.dateQuery) {
      const parsedDate = parseFlexibleSwedishDateString(eventDetails.dateQuery, parseInputDate(eventToModify.date));
      if (parsedDate) {
        updatedEventData.date = formatInputDate(parsedDate);
        console.log(`[HomePage] AI Modify: Date changed to "${updatedEventData.date}" from query "${eventDetails.dateQuery}"`);
      } else {
        console.warn(`[HomePage] AI Modify: Could not parse new dateQuery "${eventDetails.dateQuery}". Date not changed.`);
        toast({ title: "AI Varning", description: `Kunde inte tolka nytt datum från AI: "${eventDetails.dateQuery}". Datumet ändras inte.`, variant: "default" });
      }
    }
    
    const baseDateForNewTimeParse = updatedEventData.date ? parseInputDate(updatedEventData.date) : parseInputDate(eventToModify.date);
    if (eventDetails.timeQuery) {
      const parsedNewTime = parseFlexibleSwedishTimeString(eventDetails.timeQuery, baseDateForNewTimeParse);
      if (parsedNewTime) {
        updatedEventData.startTime = formatInputTime(parsedNewTime);
        console.log(`[HomePage] AI Modify: Start time changed to "${updatedEventData.startTime}" from query "${eventDetails.timeQuery}"`);
        
        const currentEventDurationMs = parseInputTime(eventToModify.endTime, baseDateForNewTimeParse).getTime() - parseInputTime(eventToModify.startTime, baseDateForNewTimeParse).getTime();
        const newEndTime = new Date(parsedNewTime.getTime() + currentEventDurationMs);
        updatedEventData.endTime = formatInputTime(newEndTime);
        console.log(`[HomePage] AI Modify: End time calculated to "${updatedEventData.endTime}"`);

      } else {
         console.warn(`[HomePage] AI Modify: Could not parse new timeQuery "${eventDetails.timeQuery}". Time not changed.`);
         toast({ title: "AI Varning", description: `Kunde inte tolka ny tid från AI: "${eventDetails.timeQuery}". Tiden ändras inte.`, variant: "default" });
      }
    }
    if (typeof eventDetails.description === 'string') {
      updatedEventData.description = eventDetails.description;
      console.log(`[HomePage] AI Modify: Description changed to "${updatedEventData.description}"`);
    }
    if (eventDetails.color) {
      updatedEventData.color = eventDetails.color;
      console.log(`[HomePage] AI Modify: Color changed to "${updatedEventData.color}"`);
    }
    
    let finalImageUrl = eventToModify.imageUrl;
    const shouldRegenerateImage = (titleChanged && newTitleForImage) || (!eventToModify.imageUrl && newTitleForImage);

    if (shouldRegenerateImage) {
        console.log(`[HomePage] AI Modify: Regenerating image for title: "${newTitleForImage!}"`);
        try {
            const imageResult = await generateEventImage({ eventTitle: newTitleForImage! }); 
            finalImageUrl = imageResult.imageUrl;
            console.log(`[HomePage] AI Modify: Image generation result: ${finalImageUrl ? 'Success' : 'No URL'}`);
        } catch (imgError) {
            console.error("[HomePage] AI Modify: Image Regeneration Error:", imgError);
        }
    } else if (titleChanged && !newTitleForImage) { 
        finalImageUrl = undefined; 
        console.log("[HomePage] AI Modify: Title changed to empty, removing image URL.");
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
    const savedEvent = { ...eventDataForSave, id: eventToModify.id, imageUrl: finalImageUrl };
    console.log("[HomePage] AI Modify: Successfully modified event:", savedEvent);
    return savedEvent;
  };

  const handleAiDeleteEvent = async (eventIdentifier: any): Promise<string | null> => {
    console.log("[HomePage] handleAiDeleteEvent received identifier:", eventIdentifier);
    const eventToDeleteByAi = findEventToModifyOrDelete(eventIdentifier);
    if (!eventToDeleteByAi) {
      console.warn("[HomePage] AI Delete: Could not find event to delete with identifier:", eventIdentifier);
      return null;
    }
    console.log("[HomePage] AI Delete: Found event to delete:", eventToDeleteByAi);
    handleDeleteEvent(eventToDeleteByAi.id);
    console.log("[HomePage] AI Delete: Successfully deleted event with ID:", eventToDeleteByAi.id);
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
