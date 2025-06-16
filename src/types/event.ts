export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  description: string;
  color: string; // Hex color code
  imageUrl?: string; // URL or data URI for the event image
}
