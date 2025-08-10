import React from 'react';
import { CalendarEvent } from '../types';
import { format, parseISO, isSameDay } from 'date-fns';

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  onBack: () => void;
  onEventClick: (event: CalendarEvent) => void;
}

const DayView: React.FC<DayViewProps> = ({ date, events, onBack, onEventClick }) => {
  const dayEvents = events
    .filter(e => isSameDay(parseISO(e.date), date))
    .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));

  return (
    <div className="bg-white shadow-lg rounded-lg flex flex-col h-full">
      <div className="flex items-center p-4 border-b">
        <button onClick={onBack} className="mr-4 text-primary hover:underline" aria-label="Tillbaka till veckan">&larr; Vecka</button>
        <h2 className="text-xl font-semibold text-gray-800">{format(date, 'EEEE d MMMM')}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {dayEvents.length === 0 && (
          <div className="text-center text-gray-500">Inga händelser</div>
        )}
        {dayEvents.map(event => (
          <div
            key={event.id}
            onClick={() => onEventClick(event)}
            className="flex items-center bg-gray-50 rounded-lg shadow cursor-pointer hover:bg-gray-100 p-4 gap-4"
          >
            {event.imageUrl && (
              <img
                src={event.imageUrl}
                alt={event.imagePrompt || event.title}
                className="w-16 h-16 object-cover rounded flex-shrink-0"
              />
            )}
            <div className="flex flex-col">
              <span className="text-lg font-medium text-gray-900">{event.title}</span>
              {event.time && (
                <span className="text-sm text-gray-600">{event.time}{event.endTime ? ` - ${event.endTime}` : ''}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DayView;
