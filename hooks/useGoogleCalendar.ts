import { useEffect, useState } from 'react';
import { CalendarEvent } from '../types';

// Allow TypeScript to recognise gapi on window
declare global {
  interface Window {
    gapi: any;
  }
}

const SCOPES = 'https://www.googleapis.com/auth/calendar';

export const useGoogleCalendar = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({
            apiKey: process.env.GOOGLE_API_KEY,
            clientId: process.env.GOOGLE_CLIENT_ID,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
            scope: SCOPES,
          });
          const auth = window.gapi.auth2.getAuthInstance();
          setIsSignedIn(auth.isSignedIn.get());
          auth.isSignedIn.listen(setIsSignedIn);
          setIsReady(true);
        } catch (e) {
          console.error('Failed to init Google API', e);
        }
      });
    };
    document.body.appendChild(script);
  }, []);

  const signIn = () => {
    if (isReady) {
      window.gapi.auth2.getAuthInstance().signIn();
    }
  };

  const listEvents = async (calendarId: string): Promise<CalendarEvent[]> => {
    if (!isReady || !isSignedIn) return [];
    const res = await window.gapi.client.calendar.events.list({
      calendarId,
      timeMin: new Date().toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    const items = res.result.items || [];
    return items.map((item: any) => {
      const start = item.start?.dateTime || item.start?.date;
      const end = item.end?.dateTime || item.end?.date;
      return {
        id: item.id,
        title: item.summary || 'Untitled',
        date: start?.slice(0, 10),
        time: start?.length > 10 ? start.slice(11, 16) : undefined,
        endTime: end?.length > 10 ? end.slice(11, 16) : undefined,
        description: item.description,
        color: 'bg-blue-500',
      } as CalendarEvent;
    });
  };

  const addEvent = async (calendarId: string, event: CalendarEvent) => {
    if (!isReady || !isSignedIn) return;
    const startDateTime = event.time ? `${event.date}T${event.time}:00` : `${event.date}T00:00:00`;
    const endDateTime = event.endTime ? `${event.date}T${event.endTime}:00` : undefined;
    await window.gapi.client.calendar.events.insert({
      calendarId,
      resource: {
        summary: event.title,
        description: event.description,
        start: { dateTime: startDateTime },
        end: { dateTime: endDateTime || startDateTime },
      },
    });
  };

  return { isReady, isSignedIn, signIn, listEvents, addEvent };
};
