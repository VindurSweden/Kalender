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
  formatInputDate, parseInputDate, parseInputTime, TIME_FORMAT, combineDateAndTime, format 
} from '@/lib/date-utils';


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
    // Load events from localStorage
    try {
      const storedEvents = localStorage.getItem('visuCalEvents');
      if (storedEvents) {
        setEvents(JSON.parse(storedEvents));
      }
    } catch (error) {
      console.error("Failed to load events from localStorage:", error);
      toast({ title: "Error", description: "Could not load saved events.", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    // Save events to localStorage
    try {
      localStorage.setItem('visuCalEvents', JSON.stringify(events));
    } catch (error) {
      console.error("Failed to save events to localStorage:", error);
      // Potentially notify user if storage is full or failing
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
    if (id) { // Editing existing event
      setEvents(prevEvents =>
        prevEvents.map(e => (e.id === id ? { ...e, ...eventData, imageUrl: newImageUrl ?? e.imageUrl } : e))
      );
      toast({ title: "Event Updated", description: `"${eventData.title}" has been updated.` });
    } else { // Creating new event
      const newEvent: CalendarEvent = {
        ...eventData,
        id: crypto.randomUUID(),
        imageUrl: newImageUrl,
      };
      setEvents(prevEvents => [...prevEvents, newEvent]);
      toast({ title: "Event Created", description: `"${newEvent.title}" has been added.` });
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
      toast({ title: "Event Deleted", description: `"${event.title}" has been deleted.` });
    }
  };


  // AI Assistant handlers
  const handleAiCreateEvent = async (eventDetails: any): Promise<CalendarEvent | null> => {
    try {
      // Example: eventDetails = { title: "Möte", date: "2024-07-15", time: "10:00", description: "Diskutera..." }
      // More robust parsing and validation needed here
      const title = eventDetails.title || 'AI Event';
      const dateStr = eventDetails.date ? formatInputDate(parseInputDate(eventDetails.date)) : formatInputDate(new Date());
      const startTime = eventDetails.time || '12:00';
      // Assume 1 hour duration if not specified by AI
      const endTimeDate = combineDateAndTime(parseInputDate(dateStr), parseInputTime(startTime));
      endTimeDate.setHours(endTimeDate.getHours() + 1);
      const endTime = format(endTimeDate, TIME_FORMAT);

      const description = eventDetails.description || '';
      
      const newEventData: Omit<CalendarEvent, 'id' | 'imageUrl'> = {
        title,
        date: dateStr,
        startTime,
        endTime,
        description,
        color: '#69B4EB', // Default AI event color
      };
      
      // Call existing save logic, which will also handle image generation
      const tempId = crypto.randomUUID(); // Create a temporary ID to find the event later for returning
      handleSaveEvent(newEventData, undefined, undefined); // Image will be generated within handleSaveEvent if description exists
      
      // Find the event to return (it might take a moment for state to update and image to generate)
      // This is a simplification; in a real app, handleSaveEvent might return the new event
      return new Promise(resolve => {
        setTimeout(() => {
           const createdEvent = events.find(e => e.title === title && e.date === dateStr && e.startTime === startTime);
           resolve(createdEvent || null);
        }, 500); // Wait for state update and potential image gen
      });

    } catch (e) {
      console.error("Error processing AI event creation:", e);
      toast({ title: "AI Error", description: "Could not create event from AI instruction.", variant: "destructive" });
      return null;
    }
  };

  const findEventToModifyOrDelete = (eventDetails: any): CalendarEvent | null => {
    // Try to find by ID if provided by AI (ideal)
    if (eventDetails.id) {
      return events.find(e => e.id === eventDetails.id) || null;
    }
    // Fallback: try to match by title and date (less reliable)
    if (eventDetails.title && eventDetails.date) {
      const targetDate = formatInputDate(parseInputDate(eventDetails.date));
      return events.find(e => e.title === eventDetails.title && e.date === targetDate) || null;
    }
    // Further fallbacks: by title only, or other unique properties if available
    if (eventDetails.title) {
      return events.find(e => e.title === eventDetails.title) || null;
    }
    return null;
  };
  
  const handleAiModifyEvent = async (eventDetails: any): Promise<CalendarEvent | null> => {
    const eventToModify = findEventToModifyOrDelete(eventDetails);
    if (!eventToModify) {
      toast({ title: "AI Error", description: "Could not find event to modify.", variant: "destructive" });
      return null;
    }

    const updatedData: Partial<CalendarEvent> = {};
    if (eventDetails.title) updatedData.title = eventDetails.title;
    if (eventDetails.date) updatedData.date = formatInputDate(parseInputDate(eventDetails.date));
    if (eventDetails.time) updatedData.startTime = eventDetails.time; // AI might need to specify start/end or duration
    // Handle endTime: if AI gives new start time, adjust end time or expect it from AI. For now, just update start.
    if (eventDetails.description) updatedData.description = eventDetails.description;

    const finalData = { ...eventToModify, ...updatedData };
    
    // Re-use handleSaveEvent for update logic, including image regeneration if description changes
    handleSaveEvent(finalData, finalData.id, finalData.imageUrl); // Pass existing imageUrl to potentially preserve it or allow regeneration

    return new Promise(resolve => {
        setTimeout(() => {
           const modifiedEvent = events.find(e => e.id === finalData.id);
           resolve(modifiedEvent || null);
        }, 500);
      });
  };

  const handleAiDeleteEvent = async (eventDetails: any): Promise<string | null> => {
     const eventToDeleteByAi = findEventToModifyOrDelete(eventDetails);
    if (!eventToDeleteByAi) {
      toast({ title: "AI Error", description: "Could not find event to delete.", variant: "destructive" });
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
          aria-label="Add new event"
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
              <AlertDialogTitle>Are you sure you want to delete this event?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the event "{eventToDelete.title}".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setEventToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDeleteEvent(eventToDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
