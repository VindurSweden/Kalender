
import React, { useState, useEffect, useCallback } from 'react';
import { CalendarEvent } from '../types';
import { XMarkIcon, PhotoIcon } from './Icons'; // Assuming PhotoIcon is for general UI, not specific to the other modal
import { format } from 'date-fns';
import { GoogleGenAI } from '@google/genai';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<CalendarEvent, 'id'>) => void;
  onDelete?: () => void;
  selectedDate: Date | null;
  eventToEdit?: CalendarEvent | null;
  initialTime?: string;
  initialDetails?: Partial<Omit<CalendarEvent, 'id' | 'date'>>;
  isApiConfigured: boolean;
  aiInstance: GoogleGenAI | null;
}



const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  selectedDate,
  eventToEdit,
  initialTime,
  initialDetails,
  isApiConfigured,
  aiInstance,
}) => {
  const people = [
    { name: 'Leia', color: 'bg-blue-500' },
    { name: 'Gabriel', color: 'bg-green-500' },
    { name: 'Antony', color: 'bg-red-500' },
    { name: 'Familjen', color: 'bg-purple-500' },
  ];

  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState<string>('');
  const [person, setPerson] = useState<string>(people[0].name);
  const [color, setColor] = useState<string>(people[0].color);
  
  // Event image generation states
  const [eventImageUrl, setEventImageUrl] = useState<string | null | undefined>(null);
  const [currentImagePrompt, setCurrentImagePrompt] = useState<string | null | undefined>(null);
  const [isGeneratingEventImage, setIsGeneratingEventImage] = useState<boolean>(false);
  const [eventImageError, setEventImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (eventToEdit) {
      setTitle(eventToEdit.title);
      setTime(eventToEdit.time || '');
      setEndTime(eventToEdit.endTime || '');
      setDescription(eventToEdit.description || '');
      setEventDate(eventToEdit.date);
      setPerson(eventToEdit.person);
      setColor(eventToEdit.color || people.find(p => p.name === eventToEdit.person)?.color || people[0].color);
      setEventImageUrl(eventToEdit.imageUrl);
      setCurrentImagePrompt(eventToEdit.imagePrompt);
    } else if (selectedDate) {
      setTitle(initialDetails?.title || '');
      setTime(initialDetails?.time || initialTime || '');
      setEndTime(initialDetails?.endTime || '');
      setDescription(initialDetails?.description || '');
      setEventDate(format(selectedDate, 'yyyy-MM-dd'));
      setPerson(initialDetails?.person || people[0].name);
      setColor(initialDetails?.color || people.find(p => p.name === (initialDetails?.person || people[0].name))?.color || people[0].color);
      setEventImageUrl(initialDetails?.imageUrl);
      setCurrentImagePrompt(initialDetails?.imagePrompt);
    } else {
      setTitle(initialDetails?.title || '');
      setTime(initialDetails?.time || initialTime || '');
      setEndTime(initialDetails?.endTime || '');
      setDescription(initialDetails?.description || '');
      setEventDate(format(new Date(), 'yyyy-MM-dd'));
      setPerson(initialDetails?.person || people[0].name);
      setColor(initialDetails?.color || people.find(p => p.name === (initialDetails?.person || people[0].name))?.color || people[0].color);
      setEventImageUrl(initialDetails?.imageUrl);
      setCurrentImagePrompt(initialDetails?.imagePrompt);
    }
    // Reset image generation states specific to this modal opening
    setIsGeneratingEventImage(false);
    setEventImageError(null);
  }, [isOpen, selectedDate, eventToEdit, initialTime, initialDetails]);

  const handleGenerateEventImage = useCallback(async () => {
    if (!aiInstance || !title.trim()) {
      setEventImageError("Title is required to generate an image.");
      return;
    }
    setIsGeneratingEventImage(true);
    setEventImageError(null);
    
    const promptText = `A simple visual icon or depiction for a calendar event: "${title}". ${description ? 'Context: ' + description : ''}. Style: clean, easily recognizable, suitable for a small icon in a calendar. Avoid text in the image.`;
    setCurrentImagePrompt(promptText);

    try {
      const response = await aiInstance.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: promptText,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
      });
      if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        setEventImageUrl(`data:image/jpeg;base64,${base64ImageBytes}`);
      } else {
        setEventImageError('No image data received from API.');
        setCurrentImagePrompt(null); // Clear prompt if generation failed to produce image
      }
    } catch (err) {
      console.error("Error generating event image:", err);
      const message = err instanceof Error ? err.message : "Unknown error generating image.";
      setEventImageError(`Failed: ${message}`);
      setCurrentImagePrompt(null); // Clear prompt on error
    } finally {
      setIsGeneratingEventImage(false);
    }
  }, [aiInstance, title, description]);

  const handleRemoveEventImage = () => {
    setEventImageUrl(null);
    setCurrentImagePrompt(null);
    setEventImageError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !eventDate) {
      alert('Title and Date are required.');
      return;
    }
    if (time && endTime && endTime <= time) {
      alert('End time must be after start time.');
      return;
    }

    onSave({
      date: eventDate,
      title,
      time: time || undefined,
      endTime: endTime || undefined,
      description: description || undefined,
      person,
      color,
      imageUrl: eventImageUrl || undefined,
      imagePrompt: currentImagePrompt || undefined,
    });
    onClose();
  };
  
  const handleDelete = () => {
    if (eventToEdit && onDelete) {
        if (window.confirm(`Are you sure you want to delete the event "${eventToEdit.title}"?`)) {
            onDelete();
        }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md transform transition-all max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white py-2 z-10">
          <h2 className="text-xl font-semibold text-gray-800">{eventToEdit ? 'Edit Event' : (initialDetails?.title ? 'Confirm Suggested Event' : 'Add New Event')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* Standard event fields */}
          <div className="mb-4">
            <label htmlFor="eventTitle" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              id="eventTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              required
              aria-required="true"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="eventDate" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              id="eventDate"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              required
              aria-required="true"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="eventTime" className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                id="eventTime"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="eventEndTime" className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                id="eventEndTime"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="eventDescription" className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <textarea
              id="eventDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Person</label>
            <div className="flex space-x-2">
              {people.map(p => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => { setPerson(p.name); setColor(p.color); }}
                  className={`flex-1 px-3 py-2 rounded-md border text-sm ${person === p.name ? `${p.color} text-white` : 'border-gray-300 text-gray-700 bg-white'}`}
                  aria-label={`Assign to ${p.name}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Event Image Generation Section */}
          {isApiConfigured && aiInstance && (
            <div className="mb-6 p-4 border border-gray-200 rounded-md">
              <h3 className="text-md font-medium text-gray-700 mb-2 flex items-center">
                <PhotoIcon className="w-5 h-5 mr-2 text-accent" />
                Event Image (Bildstöd)
              </h3>
              {eventImageUrl && (
                <div className="mb-3 text-center">
                  <img src={eventImageUrl} alt={currentImagePrompt || title || "Event image"} className="max-w-full max-h-40 mx-auto rounded border border-gray-300 shadow-sm mb-2" />
                  {currentImagePrompt && <p className="text-xs text-gray-500 italic mt-1">Prompt: "{currentImagePrompt}"</p>}
                </div>
              )}

              {isGeneratingEventImage && (
                <div className="flex items-center justify-center text-gray-600 my-3">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating image...
                </div>
              )}

              {eventImageError && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded my-2" role="alert">{eventImageError}</p>
              )}

              {!isGeneratingEventImage && (
                <div className="flex flex-col sm:flex-row gap-2">
                   <button
                    type="button"
                    onClick={handleGenerateEventImage}
                    disabled={!title.trim() || isGeneratingEventImage}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-green-600 rounded-md shadow-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {eventImageUrl ? 'Regenerate Image' : 'Generate Image from Title'}
                  </button>
                  {eventImageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveEventImage}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 transition-colors"
                    >
                      Remove Image
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {!isApiConfigured && (
            <p className="text-xs text-orange-600 my-2">Event image generation is disabled (API not configured).</p>
          )}


          <div className="flex justify-between items-center sticky bottom-0 bg-white py-3 z-10 border-t border-gray-200 -mx-6 px-6">
            <div>
              {eventToEdit && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-100 hover:bg-red-200 rounded-md border border-red-300 transition-colors"
                >
                  Delete Event
                </button>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-md shadow-sm transition-colors"
              >
                {eventToEdit ? 'Save Changes' : (initialDetails?.title ? 'Confirm & Add Event' : 'Add Event')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventModal;
