
"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from '@/components/ui/sheet';
import { Trash2, Image as ImageIcon, Edit } from 'lucide-react';
import type { Event, Person, Role } from '@/types/event';

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
      setFormState({
          ...event,
          dependsOn: event.dependsOn ?? [],
          involved: event.involved ?? [],
      });
      setStartTime(new Date(event.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
    } else {
      setFormState({});
      setStartTime('');
    }
  }, [event]);

  const handleSave = () => {
    if (event) {
      const [hours, minutes] = startTime.split(':').map(Number);
      let finalState = { ...formState };
      if (!isNaN(hours) && !isNaN(minutes)) {
        const newStartDate = new Date(event.start);
        newStartDate.setHours(hours, minutes, 0, 0);
        finalState.start = newStartDate.toISOString();
      }
      onSave(finalState);
    }
    onClose();
  };
  
  const handleInvolvedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {value} = e.target;
    const involved = value.split(',').map(s => s.trim()).filter(Boolean).map(part => {
        const [personId, role = 'required'] = part.split(':');
        return { personId, role: role as Role };
    });
    setFormState(f => ({ ...f, involved }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckedChange = (name: keyof Event, checked: boolean) => {
    setFormState(prev => ({...prev, [name]: checked}));
  };

  const handleDelete = () => { if (event) { onDelete(event.id); } onClose(); };
  const handleGenerate = () => { if (event) { onGenerateImage(event); } onClose(); };

  const dependsCsv = (formState.dependsOn ?? []).join(",");
  const involvedCsv = (formState.involved ?? []).map(i => `${i.personId}:${i.role}`).join(", ");

  if (!event) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="bg-neutral-900 border-neutral-800 text-neutral-100 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            <Edit className="inline-block w-5 h-5 mr-2" />
            Redigera händelse
          </SheetTitle>
          <SheetDescription>
            ID: {event.id}
          </SheetDescription>
        </SheetHeader>
        <div className="py-4 space-y-6">
          
          {/* Grundinfo */}
          <div className="space-y-3 p-3 rounded-lg border border-neutral-800">
            <h4 className="font-medium text-neutral-200 text-xs uppercase tracking-wider">Grundinfo</h4>
            <div>
              <Label htmlFor="title" className="text-neutral-300">Titel</Label>
              <Input id="title" name="title" value={formState.title || ''} onChange={handleChange} className="mt-1 bg-neutral-800 border-neutral-700" />
            </div>
            <div>
              <Label htmlFor="cluster" className="text-neutral-300">Rutin (cluster)</Label>
              <Input id="cluster" name="cluster" value={formState.cluster || ''} onChange={handleChange} placeholder="T.ex. 'morning'" className="mt-1 bg-neutral-800 border-neutral-700" />
            </div>
          </div>

          {/* Tid */}
          <div className="space-y-3 p-3 rounded-lg border border-neutral-800">
            <h4 className="font-medium text-neutral-200 text-xs uppercase tracking-wider">Tid</h4>
             <div>
                <Label htmlFor="startTime" className="text-neutral-300">Starttid</Label>
                <Input id="startTime" name="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 bg-neutral-800 border-neutral-700" />
            </div>
            <div>
              <Label htmlFor="minDurationMin" className="text-neutral-300">Minsta tid (minuter)</Label>
              <Input id="minDurationMin" name="minDurationMin" type="number" value={formState.minDurationMin ?? 0} onChange={e => setFormState(f => ({ ...f, minDurationMin: Number(e.target.value || 0) }))} className="mt-1 bg-neutral-800 border-neutral-700" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="fixedStart" className="text-neutral-300">Fast starttid?</Label>
              <Switch id="fixedStart" checked={!!formState.fixedStart} onCheckedChange={(c) => handleCheckedChange('fixedStart', c)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="fixedEnd" className="text-neutral-300">Fast sluttid?</Label>
              <Switch id="fixedEnd" disabled // Not implemented in logic yet
                 className="opacity-50" />
            </div>
          </div>

          {/* Beroenden & Resurser */}
          <div className="space-y-3 p-3 rounded-lg border border-neutral-800">
            <h4 className="font-medium text-neutral-200 text-xs uppercase tracking-wider">Beroenden & Resurser</h4>
            <div>
              <Label htmlFor="resource" className="text-neutral-300">Resurs</Label>
              <select name="resource" value={formState.resource ?? ""} onChange={(e) => setFormState(f => ({...f, resource: e.target.value || undefined}))} className="w-full mt-1 px-2 py-1.5 rounded-md bg-neutral-800 border border-neutral-700">
                  <option value="">Ingen</option>
                  <option value="bathroom">Badrum</option>
                  <option value="car">Bil</option>
                  <option value="kitchen">Kök</option>
              </select>
            </div>
            <div>
              <Label htmlFor="location" className="text-neutral-300">Plats</Label>
              <select name="location" value={formState.location ?? ""} onChange={(e) => setFormState(f => ({...f, location: e.target.value || undefined}))} className="w-full mt-1 px-2 py-1.5 rounded-md bg-neutral-800 border border-neutral-700">
                  <option value="">Okänd</option>
                  <option value="home">Hemma</option>
                  <option value="school">Skola/Förskola</option>
                  <option value="work">Jobbet</option>
              </select>
            </div>
            <div>
              <Label htmlFor="dependsOn" className="text-neutral-300">Beroende av (event IDs)</Label>
              <Input id="dependsOn" name="dependsOn" value={dependsCsv} onChange={e => setFormState(f => ({ ...f, dependsOn: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} placeholder="ID, kommaseparerade" className="mt-1 bg-neutral-800 border-neutral-700" />
            </div>
          </div>
          
          {/* Roller */}
          <div className="space-y-3 p-3 rounded-lg border border-neutral-800">
             <h4 className="font-medium text-neutral-200 text-xs uppercase tracking-wider">Roller & Involverade</h4>
              <div className="flex items-center justify-between">
                <Label htmlFor="allowAlone" className="text-neutral-300">Kan göras ensam?</Label>
                <Switch id="allowAlone" checked={!!formState.allowAlone} onCheckedChange={(c) => handleCheckedChange('allowAlone', c)} />
              </div>
              <div>
                <Label htmlFor="involved" className="text-neutral-300">Involverade personer</Label>
                <Input id="involved" name="involved" value={involvedCsv} onChange={handleInvolvedChange} placeholder="Ex: 'antony:required, leia:helper'" className="mt-1 bg-neutral-800 border-neutral-700" />
                <p className="text-xs text-neutral-500 mt-1">Format: personId:roll. Roller är 'required'/'helper'.</p>
              </div>
          </div>

        </div>
        <SheetFooter className="mt-auto pt-4 border-t border-neutral-800">
            <div className='flex items-center w-full'>
                 <Button onClick={handleDelete} variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" /> Ta bort
                </Button>
                <div className="ml-auto flex gap-2">
                     <Button onClick={handleGenerate} variant="secondary" size="sm" className="bg-neutral-800 hover:bg-neutral-700">
                        <ImageIcon className="mr-2 h-4 w-4" /> Skapa bild
                    </Button>
                    <Button onClick={handleSave} type="submit" size="sm">Spara</Button>
                </div>
            </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
