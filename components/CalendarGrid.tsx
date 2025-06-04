
import React from 'react';
import { CalendarEvent } from '../types';
// Fix: Changed import style for specific date-fns functions to resolve "no exported member" errors.
import {
  format,
  // startOfMonth, // Removed: imported individually below
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  isSameDay,
  isToday,
  addDays,
  // startOfWeek, // Removed: imported individually below
  // parseISO,    // Removed: imported individually below
} from 'date-fns';
import startOfMonth from 'date-fns/startOfMonth';
import startOfWeek from 'date-fns/startOfWeek';
import parseISO from 'date-fns/parseISO';

interface CalendarGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const DayCell: React.FC<{
  day: Date;
  isCurrentMonth: boolean;
  isCurrentDay: boolean;
  eventsOnDay: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}> = ({ day, isCurrentMonth, isCurrentDay, eventsOnDay, onDayClick, onEventClick }) => {
  let cellClasses = "h-24 md:h-32 lg:h-36 p-2 border border-gray-200 flex flex-col relative transition-colors duration-150 ease-in-out ";
  if (!isCurrentMonth) {
    cellClasses += "bg-gray-50 text-gray-400 hover:bg-gray-100";
  } else if (isCurrentDay) {
    cellClasses += "bg-primary-light text-primary font-semibold hover:bg-blue-100";
  } else {
    cellClasses += "bg-white text-gray-700 hover:bg-gray-50";
  }

  return (
    <div className={cellClasses} onClick={() => isCurrentMonth && onDayClick(day)}>
      <span className={`text-sm ${isCurrentDay ? 'bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>
        {format(day, 'd')}
      </span>
      {isCurrentMonth && (
        <div className="mt-1 space-y-1 overflow-y-auto max-h-20 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {eventsOnDay.slice(0, 3).map(event => (
            <div
              key={event.id}
              onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
              className={`p-1 text-xs rounded-md text-white truncate cursor-pointer ${event.color || 'bg-blue-500'} hover:opacity-80 flex items-center`}
              title={event.title}
            >
              {event.imageUrl && (
                <img 
                  src={event.imageUrl} 
                  alt={event.imagePrompt || event.title} 
                  className="w-4 h-4 mr-1.5 rounded-sm object-cover flex-shrink-0" 
                />
              )}
              <span className="truncate">
                {event.time ? `${event.time} ` : ''}{event.title}
              </span>
            </div>
          ))}
          {eventsOnDay.length > 3 && (
            <div className="text-xs text-gray-500 mt-1">
              + {eventsOnDay.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
};


const CalendarGrid: React.FC<CalendarGridProps> = ({ currentDate, events, onDayClick, onEventClick }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday as start of week
  const endDate = startOfWeek(addDays(monthEnd, 6), { weekStartsOn: 0 }); // Ensure 6 weeks displayed, end on Saturday

  const daysInGrid = eachDayOfInterval({
    start: startDate,
    end: addDays(endDate, 6) // to make it a full 6 weeks row x 7 days columns = 42 cells
  }).slice(0,42);


  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white shadow-lg rounded-lg p-4 md:p-6">
      <div className="grid grid-cols-7 gap-px text-center text-sm font-medium text-gray-600 mb-2">
        {daysOfWeek.map(dayName => (
          <div key={dayName} className="py-2">{dayName}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {daysInGrid.map((day, index) => {
          const eventsOnDay = events.filter(event => isSameDay(parseISO(event.date), day))
                                   .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
          return (
            <DayCell
              key={index}
              day={day}
              isCurrentMonth={isSameMonth(day, currentDate)}
              isCurrentDay={isToday(day)}
              eventsOnDay={eventsOnDay}
              onDayClick={onDayClick}
              onEventClick={onEventClick}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CalendarGrid;