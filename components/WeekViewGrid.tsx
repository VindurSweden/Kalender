
import React from 'react';
import { CalendarEvent } from '../types';
// Fix: Changed import style for specific date-fns functions to resolve "no exported member" errors.
import {
  format,
  // startOfWeek, // Removed: imported individually below
  addDays,
  isToday,
  isSameDay,
  // parseISO,    // Removed: imported individually below
  eachDayOfInterval,
  getHours,
  getMinutes
} from 'date-fns';
import startOfWeek from 'date-fns/startOfWeek';
import parseISO from 'date-fns/parseISO';


interface WeekViewGridProps {
  currentDate: Date; // Any date within the week to display
  events: CalendarEvent[];
  onSlotClick: (date: Date, startTime: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const slotHeightRem = 4; // Corresponds to h-16 in Tailwind (4rem = 64px)

const WeekViewGrid: React.FC<WeekViewGridProps> = ({ currentDate, events, onSlotClick, onEventClick }) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col h-full">
      {/* Header: Day Names and Dates */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] sticky top-0 bg-white z-20 border-b border-gray-300">
        <div className="p-2 border-r border-gray-200 text-xs text-gray-500 flex items-center justify-center">Time</div>
        {daysInWeek.map(day => (
          <div key={day.toISOString()} className={`py-2 px-1 border-r border-gray-200 text-center ${isToday(day) ? 'bg-primary-light' : ''}`}>
            <div className={`text-xs font-medium ${isToday(day) ? 'text-primary' : 'text-gray-600'}`}>{format(day, 'EEE')}</div>
            <div className={`text-lg font-bold mt-1 ${isToday(day) ? 'bg-primary text-white rounded-full w-7 h-7 mx-auto flex items-center justify-center' : 'text-gray-800'}`}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Grid Body: Time Slots and Events */}
      <div className="flex-grow grid grid-cols-[60px_repeat(7,minmax(0,1fr))] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        {/* Time Gutter */}
        <div className="col-start-1 row-start-1 grid grid-rows-24">
          {hours.map(hour => (
            <div key={hour} className={`h-16 flex items-center justify-center p-1 border-r border-b border-gray-200 text-xs text-gray-500`}>
              {hour.substring(0,2)}
            </div>
          ))}
        </div>

        {/* Event Grid */}
        {daysInWeek.map((day, dayIndex) => (
          <div key={day.toISOString()} className={`col-start-${dayIndex + 2} row-start-1 grid grid-rows-24 relative border-r border-gray-200`}>
            {hours.map((hour, hourIndex) => {
              // Find events that should be rendered starting in this day & hour cell
              const eventsInThisCell = events.filter(event => {
                const eventDate = parseISO(event.date);
                if (!isSameDay(eventDate, day)) return false;
                if (!event.time) return false; // Event must have a start time
                
                const eventStartHour = parseInt(event.time.split(':')[0]);
                return eventStartHour === hourIndex; // Event starts in this hour
              }).sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));

              return (
                <div
                  key={hour}
                  className="h-16 border-b border-gray-200 relative hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onSlotClick(day, hour)}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') onSlotClick(day, hour);}}
                  aria-label={`Add event for ${format(day, 'MMMM d')} at ${hour}`}
                >
                  {eventsInThisCell.map(event => {
                    const eventStartParts = (event.time || "00:00").split(':');
                    const eventStartHour = parseInt(eventStartParts[0]);
                    const eventStartMinute = parseInt(eventStartParts[1] || '0');

                    let eventEndHour = eventStartHour;
                    let eventEndMinute = eventStartMinute + 59; // Default to almost an hour if no end time

                    if (event.endTime) {
                      const eventEndParts = event.endTime.split(':');
                      eventEndHour = parseInt(eventEndParts[0]);
                      eventEndMinute = parseInt(eventEndParts[1] || '0');
                    } else { // If no end time, assume 1 hour duration
                        eventEndHour = eventStartHour + 1;
                        eventEndMinute = eventStartMinute;
                    }
                    
                    let durationMinutes = (eventEndHour - eventStartHour) * 60 + (eventEndMinute - eventStartMinute);
                    if (durationMinutes <= 0 && event.endTime) { 
                        durationMinutes = 60; 
                    } else if (durationMinutes <= 0 && !event.endTime) {
                        durationMinutes = 60; 
                    }
                    if (durationMinutes < 15) durationMinutes = 15;


                    const topPositionPercent = (eventStartMinute / 60) * 100;
                    const heightPercent = (durationMinutes / 60) * 100;

                    return (
                      <div
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                        onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onEventClick(event);}}}
                        className={`absolute left-px right-px ${event.color || 'bg-blue-500'} text-white p-1 text-[10px] rounded shadow overflow-hidden z-10 cursor-pointer hover:opacity-80 transition-opacity flex items-start gap-1`}
                        style={{
                          top: `${topPositionPercent}%`,
                          height: `calc(${heightPercent}% - 1px)`, // -1px for slight margin
                          maxHeight: `calc(${heightPercent}% - 1px)`
                        }}
                        title={`${event.time}${event.endTime ? '-' + event.endTime : ''} ${event.title}`}
                        tabIndex={0}
                        role="button"
                        aria-label={`Edit event: ${event.title} at ${event.time}`}
                      >
                        {event.imageUrl && (
                           <img 
                             src={event.imageUrl} 
                             alt={event.imagePrompt || event.title} 
                             className="w-5 h-5 mt-0.5 rounded-sm object-cover flex-shrink-0"
                            />
                        )}
                        <div className="flex-grow min-w-0">
                          <div className="font-semibold truncate leading-tight">{event.title}</div>
                          {durationMinutes > 20 && <div className="truncate leading-tight">{event.time}{event.endTime ? ` - ${event.endTime}` : ''}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeekViewGrid;