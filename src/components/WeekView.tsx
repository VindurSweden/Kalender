
"use client";

import type { FC } from 'react';
import Image from 'next/image';
import { CalendarEvent } from '@/types/event';
import { getWeekDays, getHoursInDay, format, isSameDay, parseInputDate, parseInputTime, combineDateAndTime, SwedishLocale, getDayOfWeekShort } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

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
  const hourRowHeight = '80px'; // Increased height to accommodate potential images

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
    let height = (durationMinutes / 60) * parseFloat(hourRowHeight);

    if (height <= 0) return null; 
    // Ensure a minimum height for very short events to be clickable and visible
    height = Math.max(height, 30); // Minimum height of 30px

    return { top: topOffset, height };
  };

  return (
    <div className="p-4 flex flex-col overflow-x-auto">
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px border-t border-l border-border bg-border rounded-t-lg shadow-md">
        <div className="p-2 bg-muted/50 border-b border-r border-border"></div>
        {weekDays.map(day => (
          <div key={day.toISOString()} className={cn("p-2 text-center font-medium text-sm bg-muted/50 border-b border-r border-border", isSameDay(day, today) && "text-primary")}>
            <div>{getDayOfWeekShort(day)}</div>
            <div className={cn("text-lg", isSameDay(day, today) && "font-bold")}>{format(day, 'd')}</div>
          </div>
        ))}
      </div>
      <div className="flex-grow overflow-y-auto max-h-[calc(100vh-200px)]">
        <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px border-l border-border bg-border rounded-b-lg shadow-md relative">
          <div className="col-start-1 row-start-1">
            {hours.map(hour => (
              <div key={hour.toISOString()} className="text-xs text-right pr-2 border-r border-b border-border bg-card text-muted-foreground flex items-center justify-end" style={{ height: hourRowHeight }}>
                {format(hour, 'HH:mm')}
              </div>
            ))}
          </div>

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
              {events.map(event => {
                const position = getEventPositionAndDuration(event, day);
                if (!position) return null;
                return (
                  <button
                    key={event.id}
                    className="absolute w-[calc(100%-8px)] ml-1 p-1 rounded-md text-left text-xs shadow-md overflow-hidden hover:opacity-80 focus:ring-2 focus:ring-primary z-10 flex flex-col"
                    style={{
                      top: `${position.top}px`,
                      height: `${position.height}px`,
                      backgroundColor: event.color,
                      color: getContrastingTextColor(event.color) 
                    }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    title={`${event.title}\n${event.startTime} - ${event.endTime}\n${event.description || ''}`}
                  >
                    {event.imageUrl && position.height > 40 && ( // Only show image if space permits
                      <div className="relative h-10 w-full mb-1 rounded-sm overflow-hidden flex-shrink-0">
                        <Image 
                          src={event.imageUrl} 
                          alt="" 
                          layout="fill" 
                          objectFit="cover" 
                          data-ai-hint="event image" 
                          className="rounded-sm"
                        />
                      </div>
                    )}
                    <div className="flex-grow overflow-hidden">
                      <strong className="block truncate text-xs sm:text-sm">{event.title}</strong>
                      <span className="block truncate text-[10px] sm:text-xs">{event.startTime} - {event.endTime}</span>
                      {position.height > 60 && event.description && <p className="text-[10px] mt-0.5 truncate whitespace-normal max-h-[calc(100%-20px-10px)] overflow-hidden">{event.description}</p>}
                    </div>
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

function getContrastingTextColor(hexColor: string): string {
  if (!hexColor) return '#000000';
  try {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  } catch (e) {
    return '#000000'; // Fallback for invalid hex
  }
}

export default WeekView;
