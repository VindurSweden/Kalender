import { gapi } from 'gapi-script';

const SCOPES = 'https://www.googleapis.com/auth/calendar';

export const initClient = (apiKey: string, clientId: string) => {
  return new Promise<void>((resolve, reject) => {
    gapi.load('client:auth2', async () => {
      try {
        await gapi.client.init({
          apiKey,
          clientId,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
          scope: SCOPES,
        });
        await gapi.auth2.getAuthInstance().signIn();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
};

export const listEvents = async (calendarId: string) => {
  const response = await gapi.client.calendar.events.list({
    calendarId,
    timeMin: new Date().toISOString(),
    showDeleted: false,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return response.result.items || [];
};

export const createEvent = async (calendarId: string, event: any) => {
  return gapi.client.calendar.events.insert({ calendarId, resource: event });
};
