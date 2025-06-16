"use client";

import type { FC } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import ColorPicker from '@/components/ColorPicker';
import type { CalendarEvent } from '@/types/event';
import { formatInputDate, formatInputTime, parseInputDate, parseInputTime, combineDateAndTime } from '@/lib/date-utils';
import { CalendarIcon, Palette, Image as ImageIcon, Loader2 } from 'lucide-react';
import { generateEventImage } from '@/ai/flows/generate-event-image';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const eventFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'), // Stored as YYYY-MM-DD string
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  description: z.string().optional(),
  color: z.string().min(1, 'Color is required'),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (eventData: Omit<CalendarEvent, 'id' | 'imageUrl'>, id?: string, newImageUrl?: string) => void;
  eventToEdit?: CalendarEvent | null;
  defaultDate?: Date | null;
}

const EventForm: FC<EventFormProps> = ({ isOpen, onClose, onSave, eventToEdit, defaultDate }) => {
  const { toast } = useToast();
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | undefined>(eventToEdit?.imageUrl);
  
  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: '',
      date: defaultDate ? formatInputDate(defaultDate) : formatInputDate(new Date()),
      startTime: '09:00',
      endTime: '10:00',
      description: '',
      color: '#A7D1ED', // Default color
    },
  });

  const eventDescriptionForImage = watch('description');

  useEffect(() => {
    if (eventToEdit) {
      reset({
        title: eventToEdit.title,
        date: eventToEdit.date, // Already YYYY-MM-DD
        startTime: eventToEdit.startTime,
        endTime: eventToEdit.endTime,
        description: eventToEdit.description,
        color: eventToEdit.color,
      });
      setCurrentImageUrl(eventToEdit.imageUrl);
    } else if (defaultDate) {
       reset({
        title: '',
        date: formatInputDate(defaultDate),
        startTime: '09:00',
        endTime: '10:00',
        description: '',
        color: '#A7D1ED',
      });
      setCurrentImageUrl(undefined);
    } else {
      reset({
        title: '',
        date: formatInputDate(new Date()),
        startTime: '09:00',
        endTime: '10:00',
        description: '',
        color: '#A7D1ED',
      });
      setCurrentImageUrl(undefined);
    }
  }, [eventToEdit, defaultDate, reset]);

  const onSubmit = async (data: EventFormValues) => {
    try {
      let newImageUrl = currentImageUrl;
      if (data.description && data.description !== eventToEdit?.description) { // Generate image if description exists and changed or is new
        setIsGeneratingImage(true);
        try {
          const imageResult = await generateEventImage({ eventDescription: data.description });
          newImageUrl = imageResult.imageUrl;
          setCurrentImageUrl(newImageUrl); // Update preview
        } catch (error) {
          console.error('Failed to generate event image:', error);
          toast({
            title: 'Image Generation Failed',
            description: 'Could not generate image. Please try again or save without an image.',
            variant: 'destructive',
          });
          // Allow saving without image if generation fails
        } finally {
          setIsGeneratingImage(false);
        }
      }
      
      onSave(data, eventToEdit?.id, newImageUrl);
      onClose();
    } catch (error) {
      console.error('Failed to save event:', error);
      toast({
        title: 'Save Failed',
        description: 'Could not save event. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateImageManually = async () => {
    if (!eventDescriptionForImage) {
      toast({ title: "Cannot generate image", description: "Please provide an event description first.", variant: "destructive"});
      return;
    }
    setIsGeneratingImage(true);
    try {
      const imageResult = await generateEventImage({ eventDescription: eventDescriptionForImage });
      setCurrentImageUrl(imageResult.imageUrl);
    } catch (error) {
      console.error('Failed to generate event image:', error);
      toast({
        title: 'Image Generation Failed',
        description: 'Could not generate image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };


  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline">{eventToEdit ? 'Edit Event' : 'Create Event'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...register('title')} aria-invalid={errors.title ? "true" : "false"} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Controller
                name="date"
                control={control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        aria-invalid={errors.date ? "true" : "false"}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? formatInputDate(parseInputDate(field.value)) : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value ? parseInputDate(field.value) : undefined}
                        onSelect={(date) => field.onChange(date ? formatInputDate(date) : '')}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
            </div>
            <div>
              <Label htmlFor="color">Color</Label>
               <Controller
                name="color"
                control={control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                         <Palette className="mr-2 h-4 w-4" />
                         <div className="flex items-center gap-2">
                           <span style={{ backgroundColor: field.value }} className="h-4 w-4 rounded-full border"/>
                           {field.value}
                         </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                       <ColorPicker selectedColor={field.value} onColorChange={field.onChange} />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.color && <p className="text-sm text-destructive">{errors.color.message}</p>}
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startTime">Start Time</Label>
              <Input id="startTime" type="time" {...register('startTime')} aria-invalid={errors.startTime ? "true" : "false"} />
              {errors.startTime && <p className="text-sm text-destructive">{errors.startTime.message}</p>}
            </div>
            <div>
              <Label htmlFor="endTime">End Time</Label>
              <Input id="endTime" type="time" {...register('endTime')} aria-invalid={errors.endTime ? "true" : "false"} />
              {errors.endTime && <p className="text-sm text-destructive">{errors.endTime.message}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register('description')} rows={3} />
          </div>

          {currentImageUrl && (
            <div className="space-y-2">
              <Label>Event Image</Label>
              <div className="relative w-full h-40 rounded-md overflow-hidden border">
                <Image src={currentImageUrl} alt="Event visual support" layout="fill" objectFit="cover" data-ai-hint="event banner" />
              </div>
            </div>
          )}
          
          <Button type="button" variant="outline" onClick={handleGenerateImageManually} disabled={isGeneratingImage || !eventDescriptionForImage} className="w-full">
            {isGeneratingImage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
            {currentImageUrl ? 'Regenerate Image' : 'Generate Image'}
          </Button>
          {!eventDescriptionForImage && <p className="text-xs text-muted-foreground text-center">Add a description to generate an image.</p>}


          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || isGeneratingImage}>
              {(isSubmitting || isGeneratingImage) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EventForm;
