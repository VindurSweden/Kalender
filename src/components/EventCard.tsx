"use client";

import type { FC }_ from 'react';
import Image from 'next/image';
import { CalendarEvent } from '@/types/event';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Edit3, Trash2, Image as ImageIcon } from 'lucide-react';

interface EventCardProps {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  className?: string;
}

const EventCard: FC<EventCardProps> = ({ event, onEdit, onDelete, className }) => {
  return (
    <Card className={className} style={{ borderLeft: `4px solid ${event.color}` }}>
      <CardHeader>
        <CardTitle className="font-headline text-lg">{event.title}</CardTitle>
        <CardDescription className="flex items-center text-sm">
          <Clock className="mr-2 h-4 w-4" />
          {event.startTime} - {event.endTime}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {event.imageUrl && (
          <div className="relative aspect-video w-full rounded-md overflow-hidden my-2">
            <Image src={event.imageUrl} alt={event.title} layout="fill" objectFit="cover" data-ai-hint="event visual" />
          </div>
        )}
        {!event.imageUrl && (
           <div className="flex items-center justify-center aspect-video w-full rounded-md bg-muted/50 text-muted-foreground my-2">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
        {event.description && <p className="text-sm text-foreground/80">{event.description}</p>}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(event)} aria-label={`Edit event ${event.title}`}>
          <Edit3 className="mr-2 h-4 w-4" /> Edit
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(event.id)} aria-label={`Delete event ${event.title}`}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </Button>
      </CardFooter>
    </Card>
  );
};

export default EventCard;
