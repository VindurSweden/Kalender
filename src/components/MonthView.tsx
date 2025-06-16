
"use client";

import type { FC } from 'react';
import Image from 'next/image';
import { CalendarEvent } from '@/types/event';
import { getDaysInMonth, isSameDay, isSameMonth, format, getDayOfWeekShort, SwedishLocale, parseInputDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const MonthView: FC<MonthViewProps> = ({ currentDate, events, onDayClick, onEventClick }) => {
  const days = getDaysInMonth(currentDate);
  const today = new Date();

  const dayHeaders = Array.from({ length: 7 }, (_, i) => {
    const dayIndex = SwedishLocale.options?.weekStartsOn === 1 ? (i + 1) % 7 : i;
    const d = new Date(2023, 0, dayIndex + 1); 
    return getDayOfWeekShort(d);
  });


  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-px border-l border-t border-border bg-border rounded-lg overflow-hidden shadow-md">
        {dayHeaders.map((dayHeader, index) => (
          <div key={index} className="py-2 text-center font-medium text-sm bg-muted/50 text-muted-foreground">
            {dayHeader}
          </div>
        ))}
        {days.map((day, index) => {
          const eventsForDay = events.filter(event => isSameDay(parseInputDate(event.date), day));
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);

          return (
            <div
              key={index}
              className={cn(
                'relative min-h-[100px] sm:min-h-[120px] p-2 border-b border-r border-border transition-colors duration-200 ease-in-out flex flex-col', // Added flex flex-col
                isCurrentMonth ? 'bg-card hover:bg-accent/10' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50',
                isToday && isCurrentMonth && 'bg-primary/10'
              )}
              onClick={() => onDayClick(day)}
              role="gridcell"
              aria-label={`Date ${format(day, 'MMMM d, yyyy')}, ${eventsForDay.length} events`}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onDayClick(day)}
            >
              <time dateTime={format(day, 'yyyy-MM-dd')} className={cn('text-sm font-medium self-start', isToday && 'text-primary font-bold')}>
                {format(day, 'd')}
              </time>
              <div className="mt-1 space-y-1 overflow-y-auto flex-grow"> {/* Added overflow-y-auto and flex-grow */}
                {eventsForDay.slice(0, 2).map(event => (
                  <button
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    className="w-full text-left text-xs p-1 rounded block hover:bg-accent/20 focus:bg-accent/30 overflow-hidden"
                    style={{ backgroundColor: event.color + '33', borderLeft: `3px solid ${event.color}`}}
                    title={`${event.title} (${event.startTime}-${event.endTime})`}
                  >
                    {event.imageUrl && (
                      <div className="relative h-8 w-full mb-1 rounded-sm overflow-hidden">
                        <Image 
                          src={event.imageUrl} 
                          alt="" 
                          layout="fill" 
                          objectFit="cover" 
                          data-ai-hint="event thumbnail" 
                          className="rounded-sm"
                        />
                      </div>
                    )}
                    <span className="block truncate font-medium">{event.title}</span>
                    <span className="block truncate text-muted-foreground text-[10px]">{event.startTime} - {event.endTime}</span>
                  </button>
                ))}
                {eventsForDay.length > 2 && (
                  <p className="text-xs text-muted-foreground mt-1 text-center">+{eventsForDay.length - 2} more</p>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute bottom-1 right-1 h-6 w-6 sm:h-7 sm:w-7 opacity-50 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
                aria-label={`Add event for ${format(day, 'MMMM d')}`}
              >
                <PlusCircle className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;
