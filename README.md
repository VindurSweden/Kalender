# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a `.env.local` file and set the required keys:
   - `GEMINI_API_KEY` – for Gemini image and chat features
   - `GOOGLE_API_KEY` and `GOOGLE_CLIENT_ID` – from a Google Cloud project with Calendar API enabled
   - `GOOGLE_CALENDAR_ID` – the calendar to sync against
3. Run the app:
   `npm run dev`

## Features

* **Voice control** – click the microphone in the chat window to dictate questions or calendar commands using the browser's speech recognition (tested in Chrome on Android).
* **Google Calendar sync** – events load from and are pushed to the calendar specified by `GOOGLE_CALENDAR_ID` once the Google client is authorised.
* **Automatic image support** – when creating events without an image, the app generates a simple pictogram using the Gemini image API.
* **Week-first visual UI** – the app opens in a week view where you can tap a day to see a pictogram list of that day's events. Large name buttons let each family member filter the schedule to just their events.
