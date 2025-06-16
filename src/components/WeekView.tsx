"use client";

import type { FC } from 'react';
import { CalendarEvent } from '@/types/event';
import { getWeekDays, getHoursInDay, format, isSameDay, parseInputDate, parseInputTime, combineDateAndTime, SwedishLocale, getDayOfWeekShort } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onSlotClick: (date: Date, startTime: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const WeekView: FC<WeekViewProps> = ({ currentDate, events, onSlotClick, onEventClick }) => {
  const weekDays = getWeekDays(currentDate);
  const hours = getHoursInDay();
  const today = new Date();
  const hourRowHeight = '60px'; // Height for each hour slot

  const getEventPositionAndDuration = (event: CalendarEvent, day: Date) => {
    if (!isSameDay(parseInputDate(event.date), day)) return null;

    const eventStartDateTime = parseInputTime(event.startTime, parseInputDate(event.date));
    const eventEndDateTime = parseInputTime(event.endTime, parseInputDate(event.date));
    
    const startHour = eventStartDateTime.getHours();
    const startMinute = eventStartDateTime.getMinutes();
    const endHour = eventEndDateTime.getHours();
    const endMinute = eventEndDateTime.getMinutes();

    const topOffset = (startHour + startMinute / 60) * parseFloat(hourRowHeight);
    const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    const height = (durationMinutes / 60) * parseFloat(hourRowHeight);

    if (height <= 0) return null; // Invalid duration

    return { top: topOffset, height };
  };

  return (
    <div className="p-4 flex flex-col overflow-x-auto">
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px border-t border-l border-border bg-border rounded-t-lg shadow-md">
        {/* Empty corner */}
        <div className="p-2 bg-muted/50 border-b border-r border-border"></div>
        {/* Day headers */}
        {weekDays.map(day => (
          <div key={day.toISOString()} className={cn("p-2 text-center font-medium text-sm bg-muted/50 border-b border-r border-border", isSameDay(day, today) && "text-primary")}>
            <div>{getDayOfWeekShort(day)}</div>
            <div className={cn("text-lg", isSameDay(day, today) && "font-bold")}>{format(day, 'd')}</div>
          </div>
        ))}
      </div>
      <div className="flex-grow overflow-y-auto max-h-[calc(100vh-200px)]"> {/* Adjust max-h as needed */}
        <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px border-l border-border bg-border rounded-b-lg shadow-md relative">
          {/* Time column */}
          <div className="col-start-1 row-start-1">
            {hours.map(hour => (
              <div key={hour.toISOString()} className="text-xs text-right pr-2 border-r border-b border-border bg-card text-muted-foreground" style={{ height: hourRowHeight }}>
                {format(hour, 'HH:mm')}
              </div>
            ))}
          </div>

          {/* Event grid */}
          {weekDays.map((day, dayIndex) => (
            <div key={day.toISOString()} className="col-start-auto row-start-1 relative border-r border-border bg-card">
              {hours.map((hour, hourIndex) => (
                <div
                  key={`${day.toISOString()}-${hour.toISOString()}`}
                  className="border-b border-border hover:bg-accent/10 transition-colors"
                  style={{ height: hourRowHeight }}
                  onClick={() => onSlotClick(day, format(hour, 'HH:mm'))}
                  role="button"
                  tabIndex={0}
                  aria-label={`Add event on ${format(day, 'MMMM d')} at ${format(hour, 'HH:mm')}`}
                  onKeyDown={(e) => e.key === 'Enter' && onSlotClick(day, format(hour, 'HH:mm'))}
                >
                </div>
              ))}
              {/* Render events for this day */}
              {events.map(event => {
                const position = getEventPositionAndDuration(event, day);
                if (!position) return null;
                return (
                  <button
                    key={event.id}
                    className="absolute w-[calc(100%-8px)] ml-1 p-2 rounded-md text-left text-xs shadow-md overflow-hidden hover:opacity-80 focus:ring-2 focus:ring-primary z-10"
                    style={{
                      top: `${position.top}px`,
                      height: `${position.height}px`,
                      backgroundColor: event.color,
                      color: getContrastingTextColor(event.color) // Ensure text is readable
                    }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    title={`${event.title}\n${event.startTime} - ${event.endTime}\n${event.description || ''}`}
                  >
                    <strong className="block truncate">{event.title}</strong>
                    <span className="block truncate">{event.startTime} - {event.endTime}</span>
                    {position.height > 40 && event.description && <p className="text-[10px] mt-1 truncate whitespace-normal max-h-[calc(100%-30px)] overflow-hidden">{event.description}</p>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper function to get contrasting text color (simple version)
function getContrastingTextColor(hexColor: string): string {
  if (!hexColor) return '#000000';
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}


export default WeekView;
