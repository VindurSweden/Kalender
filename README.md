# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` and set:
   - `GEMINI_API_KEY` – key for Gemini image generation
   - `GOOGLE_API_KEY` and `GOOGLE_CLIENT_ID` – credentials for Google Calendar API
   - `GOOGLE_CALENDAR_ID` – ID of the calendar to sync against
3. Run the app:
   `npm run dev`

## Features

* **Google Calendar sync** – press *Koppla Google* in the header to authorize and load events from the configured calendar. New events are also inserted into Google Calendar.
* **Voice input** – use the microphone button in the chat window to dictate messages via the browser's speech recognition (sv-SE).
* **Automatic event images** – when an event is saved, an image is generated using Gemini Imagen to provide visual support.
