
export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD format
  title: string;
  time?: string; // HH:MM format, optional start time
  endTime?: string; // HH:MM format, optional end time
  description?: string; // Optional
  color?: string; // Optional event color (e.g., Tailwind color class like 'bg-blue-500')
  imageUrl?: string; // Optional base64 data URL for a generated image
  imagePrompt?: string; // Optional prompt used to generate the image
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}