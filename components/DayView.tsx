import React from 'react';
import { CalendarEvent } from '../types';
import { format } from 'date-fns';
import { ChevronLeftIcon, PlusIcon } from './Icons';

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  onBack: () => void;
  onAdd: () => void;
  onEventClick: (event: CalendarEvent) => void;
}

const DayView: React.FC<DayViewProps> = ({ date, events, onBack, onAdd, onEventClick }) => {
  const sorted = [...events].sort((a, b) => {
    const t1 = a.time || '00:00';
    const t2 = b.time || '00:00';
    return t1.localeCompare(t2);
  });

  return (
    <div className="bg-white shadow-lg rounded-lg flex flex-col h-full">
      <div className="flex items-center p-4 border-b border-gray-200">
        <button
          onClick={onBack}
          className="p-2 text-gray-600 hover:text-primary hover:bg-primary-light rounded-full"
          aria-label="Back to week view"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>
        <h2 className="flex-grow text-center text-lg font-semibold text-gray-800">
          {format(date, 'EEEE d MMMM')}
        </h2>
        <button
          onClick={onAdd}
          className="p-2 bg-primary text-white rounded-full hover:bg-primary-hover shadow"
          aria-label="Add event"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {sorted.length === 0 && (
          <p className="text-center text-gray-500">Inga händelser</p>
        )}
        {sorted.map(event => (
          <div
            key={event.id}
            onClick={() => onEventClick(event)}
            className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg shadow cursor-pointer hover:bg-gray-100"
          >
            {event.imageUrl && (
              <img
                src={event.imageUrl}
                alt={event.imagePrompt || event.title}
                className="w-16 h-16 object-cover rounded-md flex-shrink-0"
              />
            )}
            <div className="flex flex-col">
              <div className="text-lg font-semibold">{event.title}</div>
              <div className="text-sm text-gray-600">
                {event.time || ''}{event.endTime ? ` - ${event.endTime}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DayView;
