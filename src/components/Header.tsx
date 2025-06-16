"use client";

import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronLeft, ChevronRight, ListWeek, Bot } from 'lucide-react';

interface HeaderProps {
  currentDate: Date;
  view: 'month' | 'week';
  onViewChange: (view: 'month' | 'week') => void;
  onPrev: () => void;
  onNext: () => void;
  currentMonthYear: string;
  onOpenAiAssistant: () => void;
}

const Header: FC<HeaderProps> = ({
  currentMonthYear,
  view,
  onViewChange,
  onPrev,
  onNext,
  onOpenAiAssistant,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/90 backdrop-blur-sm">
      <div className="container flex h-16 items-center justify-between">
        <h1 className="text-2xl font-bold text-primary font-headline">VisuCal</h1>
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="outline" size="icon" onClick={onPrev} aria-label="Previous period">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-lg font-medium text-foreground w-32 text-center sm:w-40" aria-live="polite">
            {currentMonthYear}
          </span>
          <Button variant="outline" size="icon" onClick={onNext} aria-label="Next period">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'month' ? 'default' : 'outline'}
            onClick={() => onViewChange('month')}
            aria-pressed={view === 'month'}
            className="hidden sm:inline-flex"
          >
            <CalendarDays className="mr-2 h-4 w-4" /> Month
          </Button>
          <Button
            variant={view === 'week' ? 'default' : 'outline'}
            onClick={() => onViewChange('week')}
            aria-pressed={view === 'week'}
            className="hidden sm:inline-flex"
          >
            <ListWeek className="mr-2 h-4 w-4" /> Week
          </Button>
           <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewChange('month')}
            aria-pressed={view === 'month'}
            className="sm:hidden"
            aria-label="Month view"
          >
            <CalendarDays className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewChange('week')}
            aria-pressed={view === 'week'}
            className="sm:hidden"
            aria-label="Week view"
          >
            <ListWeek className="h-5 w-5" />
          </Button>
          <Button variant="outline" onClick={onOpenAiAssistant} aria-label="Open AI Assistant">
            <Bot className="h-5 w-5 mr-0 sm:mr-2" />
            <span className="hidden sm:inline">Assistant</span>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
