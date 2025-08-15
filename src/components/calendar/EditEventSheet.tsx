
"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from '@/components/ui/sheet';
import { Trash2, Image as ImageIcon, Edit } from 'lucide-react';
import type { Event, Person } from '@/types/event';

interface EditEventSheetProps {
  open: boolean;
  onClose: () => void;
  event: Event | null;
  onSave: (updatedEvent: Partial<Event>) => void;
  onDelete: (id: string) => void;
  onGenerateImage: (event: Event) => void;
  allPeople: Person[];
}

export function EditEventSheet({ open, onClose, event, onSave, onDelete, onGenerateImage, allPeople }: EditEventSheetProps) {
  const [formState, setFormState] = useState<Partial<Event>>({});
  const [startTime, setStartTime] = useState('');

  useEffect(() => {
    if (event) {
      setFormState(event);
      setStartTime(new Date(event.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
    } else {
      setFormState({});
      setStartTime('');
    }
  }, [event]);

  const handleSave = () => {
    if (event) {
      const [hours, minutes] = startTime.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        const newStartDate = new Date(event.start);
        newStartDate.setHours(hours, minutes, 0, 0);
        onSave({ ...formState, start: newStartDate.toISOString() });
      } else {
         onSave(formState);
      }
    }
    onClose();
  };

  const handleDelete = () => {
    if (event) {
      onDelete(event.id);
    }
    onClose();
  };
  
  const handleGenerate = () => {
      if (event) {
          onGenerateImage(event);
      }
      onClose();
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  if (!event) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="bg-neutral-900 border-neutral-800 text-neutral-100">
        <SheetHeader>
          <SheetTitle>
            <Edit className="inline-block w-5 h-5 mr-2" />
            Redigera händelse
          </SheetTitle>
          <SheetDescription>
            Gör ändringar i din händelse här. Klicka på spara när du är klar.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Titel
            </Label>
            <Input id="title" name="title" value={formState.title || ''} onChange={handleChange} className="col-span-3 bg-neutral-800 border-neutral-700" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="challenge" className="text-right">
              Beskrivning
            </Label>
            <Textarea id="challenge" name="challenge" value={formState.challenge || ''} onChange={handleChange} className="col-span-3 bg-neutral-800 border-neutral-700" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startTime" className="text-right">
                Starttid
              </Label>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="col-span-3 bg-neutral-800 border-neutral-700"
              />
            </div>
        </div>
        <SheetFooter>
            <div className='flex items-center w-full'>
                 <Button onClick={handleDelete} variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Ta bort
                </Button>
                <div className="ml-auto flex gap-2">
                     <Button onClick={handleGenerate} variant="secondary" className="bg-neutral-800 hover:bg-neutral-700">
                        <ImageIcon className="mr-2 h-4 w-4" /> Skapa bild
                    </Button>
                    <Button onClick={handleSave} type="submit">Spara ändringar</Button>
                </div>
            </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
