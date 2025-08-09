
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CalendarEvent, ChatMessage } from './types';
import CalendarGrid from './components/CalendarGrid';
import WeekViewGrid from './components/WeekViewGrid';
import EventModal from './components/EventModal';
import ImageGenModal from './components/ImageGenModal'; // New Import
import ChatWindow from './components/ChatWindow';
import useLocalStorage from './hooks/useLocalStorage';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, PhotoIcon } from './components/Icons'; // Added PhotoIcon
import { format, addMonths, addWeeks, addDays, differenceInMinutes, isSameDay as fnsIsSameDay, isValid } from 'date-fns';
import subMonths from 'date-fns/subMonths';
import subWeeks from 'date-fns/subWeeks';
import startOfDay from 'date-fns/startOfDay';
import parseISO from 'date-fns/parseISO';
import { GoogleGenAI, GenerateContentResponse, Chat } from "@google/genai";
import { initClient as initGoogleClient, listEvents as listGoogleEvents, createEvent as createGoogleEvent } from './googleCalendar';

const API_KEY = process.env.API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

const initialDefaultEvents: CalendarEvent[] = [];

// Executor AI Prefixes (used by Executor, checked by Orchestrator)
const AI_PARSED_EVENT_DETAILS_PREFIX = 'AI_PARSED_EVENT_DETAILS::';
const AI_EVENT_SUGGESTION_MODAL_PREFIX = 'AI_CALENDAR_EVENT_SUGGESTION_MODAL::';
const AI_EVENT_CREATE_CONFIRMED_PREFIX = 'AI_CALENDAR_EVENT_CREATE_CONFIRMED::';
const AI_EVENT_DELETE_CONFIRMED_PREFIX = 'AI_CALENDAR_EVENT_DELETE_CONFIRMED::';

// Orchestrator AI Communication Prefixes
const TASK_FOR_EXECUTOR_PREFIX = 'TASK_FOR_EXECUTOR::';
const ORCHESTRATOR_APPROVED_EXECUTOR_RESPONSE_PREFIX = 'ORCHESTRATOR_APPROVED_EXECUTOR_RESPONSE::';
const ORCHESTRATOR_APPROVED_FINAL_RESPONSE_PREFIX = 'ORCHESTRATOR_APPROVED_FINAL_RESPONSE::';
const ORCHESTRATOR_REVISION_NEEDED_PREFIX = 'ORCHESTRATOR_REVISION_NEEDED::';

const MAX_REVISION_ATTEMPTS = 2;

const EXECUTOR_SYSTEM_INSTRUCTION = `Du är VisuCal Executor. Du tar emot specifika uppgifter från VisuCal Orchestrator. Följ dessa uppgifter noggrant.
Din input kan också innehålla "Orchestrator Feedback:" om ett tidigare försök behövde korrigeras; hantera denna feedback noggrant.
Ditt primära ansvar är kalenderhantering och att generera svar eller kommandon baserat på den uppgift du fått.
Svara i första hand på svenska. Om användaren (via Orchestrator) skriver på ett annat språk, svara på det språket.

Du har tillgång till konversationshistoriken (via Orchestrator). Använd den för att förstå sammanhanget för uppgiften.
Din input för AKTUELL UPPGIFT kommer från Orchestratorn och kan innehålla:
1. Användarens ursprungliga meddelande och kontext (datum, tid, kalender).
2. En specifik instruktion om vad du ska göra (t.ex. tolka detaljer, skapa händelse direkt, hantera konflikter).

Din svarsstrategi (följ den exakta uppgiften från Orchestratorn, men använd dessa regler som guide för HUR du utför uppgiften):

0.  **PROAKTIV PLANERINGSRÅDGIVNING & KRITISKT RESONEMANG (ENLIGT UPPGIFT):**
    Om din uppgift från Orchestratorn innefattar att analysera för logistiska problem, säkerhetsaspekter etc.:
    Analysera användarens påstående/fråga mot "Dagens kalender", historik och input-kontexten.
    Om problem: Svara konversationellt (Regel #7), artikulera oron. Orchestratorn avgör hur detta presenteras för användaren.

1.  **FLERSTEGSOPERATIONER – DIREKT UTFÖRANDE MED FÖRKLARING (ENLIGT UPPGIFT):**
    Om uppgiften kräver FLERA kalenderåtgärder (t.ex. ta bort X OCH lägg till Y):
    - Utför åtgärderna direkt om möjligt.
    - I ditt konversationella svar (Regel #7), beskriv tydligt HELA den genomförda planen (t.ex. "Jag har tagit bort X och lagt till Y.").
    - Om någon del inte kunde utföras, förklara varför.

2.  **VISA DINA "TANKAR" (INNAN SKAPANDE, OM BEGÄRT AV ORCHESTRATOR):**
    **INNAN** du skickar ett kommando för att skapa en händelse (Regel #3), ENDAST OM Orchestratorns uppgift EXPLICIT instruerar dig att visa dina 'tankar' (t.ex. för komplexa tolkningar som Orchestratorn vill dubbelkolla):
    - **PÅ EN EGEN, FÖREGÅENDE RAD**, mata ut de detaljer du har parsat med formatet:
      \`${AI_PARSED_EVENT_DETAILS_PREFIX}TITLE:{titel}::DATE_STRING:{datumssträng_från_användare_eller_idag/imorgon/today/tomorrow/YYYY-MM-DD_etc}::TIME:{HH:MM_eller_tom}::ENDTIME:{HH:MM_eller_tom}::DESCRIPTION:{beskrivning_eller_tom}\`
    - **VIKTIGT:** Använd INTE klammerparenteser runt de faktiska värdena.

3.  **HÄNDELSEÅTGÄRD – DIREKT UTFÖRANDE (STANDARD):**
    Om din uppgift är att skapa, ändra eller ta bort en händelse, och det är rimligt att göra det direkt:
    - Skapa/Ta bort: **KOMMANDO FÖRST, SEDAN KONVERSATIONELLT SVAR (Regel #7).**
      - Skapande: \`${AI_EVENT_CREATE_CONFIRMED_PREFIX}TITLE:{titel}::DATE:{datumssträng_som_ovan}::TIME:{tid}::ENDTIME:{sluttid}::DESCRIPTION:{beskrivning}\`
      - Borttagning: \`${AI_EVENT_DELETE_CONFIRMED_PREFIX}ID:{id}\`
    - Flerstegsoperation (sekvens av kommandon, ETT PER RAD, följt av ETT konversationellt svar):
      \`${AI_EVENT_DELETE_CONFIRMED_PREFIX}ID:{id_för_borttagning}\`
      \`${AI_EVENT_CREATE_CONFIRMED_PREFIX}TITLE:{titel_för_skapande}::DATE:{datum_för_skapande}::TIME:{tid_för_skapande}...\`
    - **VIKTIGT:** Ditt konversationella svar (Regel #7) ska sedan bekräfta åtgärden och förklara eventuella avvikelser (se Regel #5c, #7b).

4.  **HÄNDELSESKAPANDE – UNDVIK FÖRSLAG VIA MODAL (PRIORITERA DIREKT ÅTGÄRD):**
    UNDVIK ATT ANVÄNDA FÖRSLAG VIA MODAL (\`${AI_EVENT_SUGGESTION_MODAL_PREFIX}\`). Försök alltid att direkt skapa händelsen (Regel #3).
    Endast om Orchestratorns uppgift EXPLICIT kräver ett modalförslag för en specifik, oundviklig användarvalssituation som du inte kan lösa, eller om det är absolut omöjligt att agera utan specifik användarinput som inte kan lösas konversationellt, kan du överväga detta.
    I ett sådant extremfall, FÖRKLARA FÖRST konversationellt varför en modal är nödvändig, och SEDAN, på en ny rad, använd: \`${AI_EVENT_SUGGESTION_MODAL_PREFIX}TITLE:{titel}::DATE:{datumssträng}::TIME:{tid}...\`.

5.  **HÄNDELSESKAPANDE – HANTERING AV KONFLIKTER & TVETYDIGHETER (AGERA OCH INFORMERA):**
    Om din uppgift är att skapa en händelse och det finns problem:
    a.  **Konflikt:** Om det krockar med "Dagens kalender" (eller specificerad dag):
        - Försök om möjligt hitta ett rimligt alternativ (t.ex. närmaste lediga tid samma dag, eller en logisk justering). Om du bokar ett alternativ, använd Regel #3 för kommandot.
        - Om inget alternativ är rimligt eller om uppgiften var strikt, skapa INTE händelsen.
    b.  **Tvetydighet:** Om detaljer är oklara (t.ex. "möte på eftermiddagen"), gör en rimlig tolkning (t.ex. boka kl 14:00). Använd Regel #3.
    c.  **Informera ALLTID i ditt konversationella svar (Regel #7) om:**
        - Den exakta åtgärden du vidtog (t.ex. "Jag har bokat mötet kl 14:30 istället för 14:00 på grund av en befintlig händelse.").
        - Om du inte kunde skapa händelsen och varför (t.ex. "Jag kunde inte boka mötet eftersom det fanns en olöslig konflikt och inga omedelbara alternativ.").
        - Din tolkning av tvetydigheter (t.ex. "Jag tolkade 'eftermiddag' som kl 14:00 och bokade mötet då.").

6.  **HÄNDELSEBORTTAGNING – DIREKT UTFÖRANDE MED FÖRKLARING (ENLIGT UPPGIFT):**
    Om uppgiften är att ta bort en händelse baserat på tillräcklig information från användaren (t.ex. titel och ungefärlig tid, eller ID):
    - Identifiera händelsen så gott det går. Om osäkert, men en trolig kandidat finns, agera på den.
    - Ta bort händelsen med kommandot från Regel #3.
    - I ditt konversationella svar (Regel #7), bekräfta borttagningen och specificera vilken händelse som togs bort (t.ex. "Jag har tagit bort mötet 'Lunch med Kalle' (ID: 123)."). Om du var osäker men agerade, nämn det.

7.  **NORMAL KONVERSATIONSRESPONS (STANDARD & FÖRKLARING AV ÅTGÄRDER):**
    För alla andra situationer, eller efter att ha skickat kommandon enligt Regel #3:
      a. **BÖRJA ALLTID svaret (efter eventuella kommandon) med kontextbekräftelse.** Denna bekräftelse ska tydligt ange: "Idag är det YYYY-MM-DD, klockan är HH:MM." (använd informationen du fått i "Current date" och "Current time"). Därefter, om relevant, nämn "Tid sedan ditt senaste meddelande..." och en kort notis eller sammanfattning om "Dagens kalender".
      b. **Förklara dina åtgärder:** Bekräfta vad du har gjort (t.ex. "Jag har lagt till mötet...", "Jag har tagit bort händelsen..."). Om du har avvikit från den exakta ursprungliga begäran (p.g.a. konflikt, tvetydighet etc.), måste ditt svar tydligt förklara vad du gjorde istället och varför (se Regel #5c).
      c. Fortsätt sedan konversationen vänligt och koncist om ytterligare information behövs eller om uppgiften var rent konversationell.
DITT SVAR SKA ALLTID VARA DIREKT TILL ORCHESTRATORN.
`;

const ORCHESTRATOR_SYSTEM_INSTRUCTION = `Du är VisuCal Orchestrator. Din primära roll är att hantera interaktionen mellan användaren och VisuCal Executor AI, och säkerställa högkvalitativa svar och efterlevnad av instruktioner. Du arbetar i två huvudfaser. Dina svar MÅSTE vara på svenska om inte användaren skriver på ett annat språk.

**Fas 1: Förstå Användarens Avsikt & Delegera Uppgift till Executor**
När du tar emot det initiala användarmeddelandet tillsammans med aktuell kontext (datum, tid, dagens kalenderhändelser och konversationshistorik), är ditt mål att:
1.  Analysera användarens fullständiga begäran och avsikt.
2.  Formulera en tydlig, specifik och genomförbar uppgiftsinstruktion för 'VisuCal Executor AI'. Denna instruktion ska vägleda Executor att:
    a.  **Prioritera direkt åtgärd:** Försöka skapa/modifiera/ta bort kalenderhändelser direkt.
    b.  **Hantera problem autonomt:** Om Executor inte kan uppfylla begäran exakt (p.g.a. konflikter, tvetydigheter), instruera den att göra ett "bästa försök" att lösa användarens underliggande behov (t.ex. hitta alternativ tid, göra rimlig tolkning) och sedan tydligt informera om eventuella avvikelser i sitt svar.
    c.  **Undvika onödiga frågor/modaler:** Instruera Executor att undvika att föreslå via modal (\`${AI_EVENT_SUGGESTION_MODAL_PREFIX}\`) eller ställa bekräftelsefrågor om det inte är absolut kritiskt och oundvikligt för att kunna agera.
    d.  Använda korrekta kommandoprefix (\`${AI_PARSED_EVENT_DETAILS_PREFIX}\`, \`${AI_EVENT_CREATE_CONFIRMED_PREFIX}\`, etc.) och svara konversationellt för att förklara sina handlingar.
3.  Ditt utdata för DENNA FAS MÅSTE ENDAST vara en enda rad som börjar med prefixet \`${TASK_FOR_EXECUTOR_PREFIX}\` följt av den detaljerade instruktionen för Executor.
    Exempel på Användarinput till dig: "Current date: 2023-10-27, Current time: 10:30. Dagens kalender: (ID: 1) Lunch 12:00. User says: Boka ett möte med Anna imorgon kl 14."
    Ditt Fas 1 Output Exempel: \`${TASK_FOR_EXECUTOR_PREFIX}Användaren vill boka 'Möte med Anna imorgon kl 14'. Försök skapa denna händelse direkt. Tolka alla relevanta detaljer. Om det finns en konflikt, försök hitta ett rimligt alternativ och boka det. Om du gör avvikelser eller tolkar tvetydigheter, förklara detta tydligt i ditt konversationella svar efteråt. Använd dina regler för kommandon och konversationella svar. Visa dina 'tankar' (tolkade detaljer) endast om tolkningen är mycket komplex och behöver extra granskning.\`

**Fas 2: Granska Executors Svar & Formulera Slutgiltigt Användaroutput**
Efter att Executor AI har bearbetat uppgiften du delegerade, kommer du att få dess föreslagna svar. Du kommer också att få det ursprungliga användarmeddelandet, kontexten, Executors fullständiga systeminstruktioner (för din referens) och chatthistoriken (mellan användare och dina godkända svar). Ditt mål är att:
1.  KRITISKT GRANSKA Executors svar. Kontrollera:
    a.  **Instruktionsefterlevnad (Både Dina & Dess Egna):** Följde Executor uppgiften du gav? Prioriterade den direkt åtgärd? Undvek den onödiga modaler/frågor? Använde den korrekta kommandoprefix?
    b.  **Kvalitet på "Bästa Försök":** Om Executor avvek från den exakta begäran, var dess alternativa lösning och tolkning rimlig och välmotiverad?
    c.  **Korrekthet & Logik:** Är informationen korrekt? Är datum/tider giltiga? Är logiken sund?
    d.  **Fullständighet & Klarhet:** Adresserade den uppgiften fullständigt? Är dess förklaring av åtgärder och eventuella avvikelser tydlig, koncis, artig och på rätt språk? Är den konversationella delen komplett enligt dess regel #7?
    e.  **Modal-användning:** Om Executor mot förmodan använde \`${AI_EVENT_SUGGESTION_MODAL_PREFIX}\`, fanns det en extremt stark och oundviklig anledning? Godkänn detta endast i undantagsfall.
2.  Baserat på din granskning, MÅSTE DITT UTADATA VARA ETT av följande enradsformat:
    a.  Om Executors svar (inklusive eventuella kommandon och efterföljande konversationell förklaring) är helt godkänt och ska bearbetas av systemet/visas för användaren:
        \`${ORCHESTRATOR_APPROVED_EXECUTOR_RESPONSE_PREFIX}[Executors_exakta_ursprungliga_ordagrant_svar_inklusive_alla_rader_och_kommandon_samt_den_konversationella_delen]\`
    b.  Om Executors svar var rent konversationellt (inga kommandon), godkänt, OCH du vill endast lägga till din standardintroduktion för användaren (använd sparsamt, Executor ska normalt hantera detta):
        \`${ORCHESTRATOR_APPROVED_FINAL_RESPONSE_PREFIX}Idag är det YYYY-MM-DD, klockan är HH:MM. [Executors konversationella text.]\`
        (Använd endast detta om INGA kommandon från Executor vidarebefordras och du BARA lägger till en tidsstämpel.)
    c.  Om Executors svar behöver revideras (t.ex. den föreslog en modal utan anledning, missade att förklara en avvikelse, gjorde ett logiskt fel):
        \`${ORCHESTRATOR_REVISION_NEEDED_PREFIX}[Din_specifika_åtgärdbara_feedback_TILL_EXECUTOR_AI_som_förklarar_vad_som_ska_korrigeras_för_att_uppnå_autonomt_agerande_och_tydlig_information]\`

**Allmänna Regler:**
*   Styr Executor mot att vara en "doer" som informerar, inte en "frågeställare".
*   Dina slutgiltiga godkända svar till användaren (via \`${ORCHESTRATOR_APPROVED_EXECUTOR_RESPONSE_PREFIX}\` som innehåller Executors fulla svar) ska vara kompletta och tydliga.
*   Lägg inte till några konversationella artigheter i dina råa utdata som bara är prefix + innehåll, om det inte är en del av innehållet i \`${ORCHESTRATOR_APPROVED_FINAL_RESPONSE_PREFIX}\`.
`;


function parseAiCalendarDetails(commandString: string, prefixToRemove: string): {
  title?: string;
  suggestedDateString?: string;
  time?: string;
  endTime?: string;
  description?: string;
  eventId?: string;
} {
  const cleanValue = (val: string) => val.replace(/^{(.*)}$/, '$1').trim();
  const parts = commandString.replace(prefixToRemove, '').split('::');
  const details: ReturnType<typeof parseAiCalendarDetails> = {};
  parts.forEach(part => {
    const [key, ...valueParts] = part.split(':');
    const rawValue = valueParts.join(':'); 
    if (rawValue) { 
      const value = cleanValue(rawValue); 
      switch (key.toUpperCase()) {
        case 'TITLE': details.title = value; break;
        case 'DATE_STRING': 
        case 'DATE': details.suggestedDateString = value; break;
        case 'TIME': details.time = value; break;
        case 'ENDTIME': details.endTime = value; break;
        case 'DESCRIPTION': details.description = value; break;
        case 'ID': details.eventId = value; break;
      }
    }
  });
  return details;
}

function parseAndValidateDateString(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    const lowerDateStr = dateStr.toLowerCase().trim();
    if (lowerDateStr === 'idag' || lowerDateStr === 'today') return startOfDay(new Date());
    if (lowerDateStr === 'imorgon' || lowerDateStr === 'tomorrow') return startOfDay(addDays(new Date(), 1));
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(lowerDateStr)) {
        const parsed = parseISO(lowerDateStr);
        if (isValid(parsed)) return startOfDay(parsed);
    }
    console.error("Failed to parse and validate date string (unrecognized format):", dateStr);
    return null;
}

const getTodaysEventsStringForAI = (currentEvents: CalendarEvent[], forDate: Date): string => {
    const dayToQuery = startOfDay(forDate);
    let todaysEventsOutput = "Inga händelser schemalagda för den aktuella dagen i kalendern (" + format(dayToQuery, 'yyyy-MM-dd') + ").";
    try {
        const validTodaysEvents = currentEvents
            .filter(event => {
                if (!event.date || typeof event.date !== 'string') return false;
                const eventDateObj = parseISO(event.date);
                if (!isValid(eventDateObj)) return false;
                return fnsIsSameDay(eventDateObj, dayToQuery);
            })
            .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));

        if (validTodaysEvents.length > 0) {
            todaysEventsOutput = "Kalenderhändelser för " + format(dayToQuery, 'yyyy-MM-dd') + ": " + validTodaysEvents.map(e => {
                let eventStr = `(ID: ${e.id}) ${e.title}`;
                if (e.time) eventStr += ` kl ${e.time}`;
                if (e.endTime) eventStr += `-${e.endTime}`;
                if (e.description) eventStr += ` (Beskrivning: ${e.description.trim()})`;
                 if (e.imageUrl) eventStr += ` (Har bildstöd)`;
                return eventStr;
            }).join('; ') + ".";
        }
    } catch (e) {
        console.error("Error processing today's events for AI context:", e);
        todaysEventsOutput = "Fel vid hämtning av dagens händelser.";
    }
    return todaysEventsOutput;
};


const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [events, setEvents] = useLocalStorage<CalendarEvent[]>('calendarEvents', initialDefaultEvents);
  const [isEventModalOpen, setIsEventModalOpen] = useState<boolean>(false);
  const [selectedDateForModal, setSelectedDateForModal] = useState<Date | null>(null);
  const [initialTimeForModal, setInitialTimeForModal] = useState<string | undefined>(undefined);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);
  const [view, setView] = useState<'month' | 'week'>('month');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false); 
  const [aiSuggestedEventDetails, setAiSuggestedEventDetails] = useState<Partial<Omit<CalendarEvent, 'id' | 'date'>>>({});

  const executorChatRef = useRef<Chat | null>(null); 
  const orchestratorChatRef = useRef<Chat | null>(null); 
  const genericAiInstanceRef = useRef<GoogleGenAI | null>(null);

  // State for Image Generation Modal
  const [isImageGenModalOpen, setIsImageGenModalOpen] = useState<boolean>(false);
  const [imageGenUserPrompt, setImageGenUserPrompt] = useState<string>('');
  const [submittedImageGenPrompt, setSubmittedImageGenPrompt] = useState<string>('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>('');
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [imageGenError, setImageGenError] = useState<string>('');
  const isApiConfigured = !!API_KEY && !!genericAiInstanceRef.current;
  const [isGoogleReady, setIsGoogleReady] = useState<boolean>(false);


  useEffect(() => {
    if (API_KEY) {
      if (!genericAiInstanceRef.current) {
        try {
          genericAiInstanceRef.current = new GoogleGenAI({ apiKey: API_KEY });
        } catch (e) {
            console.error("Failed to initialize GoogleGenAI:", e);
            genericAiInstanceRef.current = null; // Ensure it's null if init fails
        }
      }
      const ai = genericAiInstanceRef.current;
      
      if (ai && !executorChatRef.current) {
        executorChatRef.current = ai.chats.create({
            model: "gemini-2.5-flash-preview-04-17",
            config: { systemInstruction: EXECUTOR_SYSTEM_INSTRUCTION } 
        });
      }
      if (ai && !orchestratorChatRef.current) { 
        orchestratorChatRef.current = ai.chats.create({
            model: "gemini-2.5-flash-preview-04-17",
            config: { systemInstruction: ORCHESTRATOR_SYSTEM_INSTRUCTION } 
        });
      }
    } else {
      console.warn("API_KEY not found. AI chat and image generation functionality will be limited.");
    }
  }, []);

  useEffect(() => {
    const loadGoogle = async () => {
      if (!GOOGLE_API_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CALENDAR_ID) return;
      try {
        await initGoogleClient(GOOGLE_API_KEY, GOOGLE_CLIENT_ID);
        const items = await listGoogleEvents(GOOGLE_CALENDAR_ID);
        const mapped: CalendarEvent[] = items.map((item: any) => {
          const start = item.start?.dateTime || item.start?.date;
          let date = '';
          let time: string | undefined;
          let endTime: string | undefined;
          if (start) {
            date = start.substring(0,10);
            if (item.start?.dateTime) {
              time = new Date(item.start.dateTime).toISOString().substring(11,16);
            }
          }
          if (item.end?.dateTime) {
            endTime = new Date(item.end.dateTime).toISOString().substring(11,16);
          }
          return {
            id: item.id,
            date,
            title: item.summary || 'Untitled',
            time,
            endTime,
            description: item.description || undefined,
          } as CalendarEvent;
        });
        setEvents(mapped);
        setIsGoogleReady(true);
      } catch (err) {
        console.error('Google Calendar init failed', err);
      }
    };
    loadGoogle();
  }, [setEvents]);


  const handlePrev = useCallback(() => {
    if (view === 'month') setCurrentDate(prev => subMonths(prev, 1));
    else setCurrentDate(prev => subWeeks(prev, 1));
  }, [view]);

  const handleNext = useCallback(() => {
    if (view === 'month') setCurrentDate(prev => addMonths(prev, 1));
    else setCurrentDate(prev => addWeeks(prev, 1));
  }, [view]);

  const handleToday = useCallback(() => setCurrentDate(startOfDay(new Date())), []);

  const openModalForNewEvent = useCallback((date: Date, details?: Partial<Omit<CalendarEvent, 'id' | 'date'>>, time?: string) => {
    setSelectedDateForModal(date);
    setInitialTimeForModal(time || details?.time);
    setAiSuggestedEventDetails(details || {});
    setEventToEdit(null);
    setIsEventModalOpen(true);
  }, []);
  
  const openModalForNewEventOnDate = useCallback((date: Date) => openModalForNewEvent(date, {}), [openModalForNewEvent]);
  const openModalForNewEventOnSlot = useCallback((date: Date, time: string) => openModalForNewEvent(date, {}, time), [openModalForNewEvent]);
  
  const openModalForEditingEvent = useCallback((event: CalendarEvent) => {
    setEventToEdit(event);
    setSelectedDateForModal(null); 
    setInitialTimeForModal(event.time);
    setAiSuggestedEventDetails({}); // Clear AI suggestions when editing existing event
    setIsEventModalOpen(true);
  }, []);

  const handleCloseEventModal = useCallback(() => {
    setIsEventModalOpen(false);
    setSelectedDateForModal(null);
    setInitialTimeForModal(undefined);
    setEventToEdit(null);
    setAiSuggestedEventDetails({}); 
  }, []);

  const handleSaveEvent = useCallback((eventData: Omit<CalendarEvent, 'id'>) => {
    setEvents(prevEvents => {
      if (eventToEdit) {
        const updated = prevEvents.map(e => e.id === eventToEdit.id ? { ...eventToEdit, ...eventData } : e);
        return updated;
      }
      const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newEvents = [...prevEvents, { ...eventData, id: newId }];
      if (!eventData.imageUrl && genericAiInstanceRef.current && isApiConfigured) {
        generateImageForEvent(newId, eventData.title, eventData.description);
      }
      return newEvents;
    });
    if (isGoogleReady && GOOGLE_CALENDAR_ID) {
      const gEvent: any = {
        summary: eventData.title,
        description: eventData.description,
        start: eventData.time ? { dateTime: `${eventData.date}T${eventData.time}:00` } : { date: eventData.date },
        end: eventData.endTime ? { dateTime: `${eventData.date}T${eventData.endTime}:00` } : { date: eventData.date },
      };
      createGoogleEvent(GOOGLE_CALENDAR_ID, gEvent).catch(err => console.error('Google sync failed', err));
    }
    handleCloseEventModal();
  }, [setEvents, handleCloseEventModal, eventToEdit, isApiConfigured, isGoogleReady]);
  
  const handleDeleteEventInModal = useCallback(() => {
    if (eventToEdit) {
      setEvents(prevEvents => prevEvents.filter(e => e.id !== eventToEdit.id));
      handleCloseEventModal();
    }
  }, [eventToEdit, setEvents, handleCloseEventModal]);

  const handleClearChat = useCallback(() => {
    setChatMessages([]);
    if (genericAiInstanceRef.current) {
        const ai = genericAiInstanceRef.current;
        executorChatRef.current = ai.chats.create({
            model: "gemini-2.5-flash-preview-04-17",
            config: { systemInstruction: EXECUTOR_SYSTEM_INSTRUCTION }
        });
        orchestratorChatRef.current = ai.chats.create({
            model: "gemini-2.5-flash-preview-04-17",
            config: { systemInstruction: ORCHESTRATOR_SYSTEM_INSTRUCTION }
        });
    }
  }, []);

  const generateImageForEvent = async (eventId: string, title: string, description?: string) => {
    try {
      if (!genericAiInstanceRef.current) return;
      const promptText = `A simple visual icon or depiction for a calendar event: "${title}".${description ? ' Context: ' + description : ''} Style: clean, easily recognizable.`;
      const ai = genericAiInstanceRef.current;
      const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: promptText,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
      });
      if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, imageUrl: `data:image/jpeg;base64,${base64ImageBytes}`, imagePrompt: promptText } : e));
      }
    } catch (err) {
      console.error('Automatic image generation failed', err);
    }
  };

  const headerDateFormatter = () => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy');
    const weekStart = startOfDay(currentDate); 
    return format(weekStart, 'MMMM') === format(addDays(weekStart,6), 'MMMM')
      ? `${format(weekStart, 'MMMM d')} - ${format(addDays(weekStart,6), 'd, yyyy')}`
      : `${format(weekStart, 'MMMM d')} - ${format(addDays(weekStart,6), 'MMMM d, yyyy')}`;
  };
  
  const processApprovedExecutorResponse = (approvedResponseText: string) => {
    const responseLines = approvedResponseText.split('\n');
    let conversationalTextForThisTurn = "";
    let aiThinkingDetails: ReturnType<typeof parseAiCalendarDetails> | null = null;
    let commandsProcessedThisTurn = 0;

    for (const line of responseLines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith(AI_PARSED_EVENT_DETAILS_PREFIX)) {
          aiThinkingDetails = parseAiCalendarDetails(trimmedLine, AI_PARSED_EVENT_DETAILS_PREFIX);
          setChatMessages(prev => [...prev, { id: `ai-thinks-${Date.now()}`, text: `[AI överväger]: Titel: ${aiThinkingDetails.title || '?'}, DatumSträng: ${aiThinkingDetails.suggestedDateString || '?'}, Tid: ${aiThinkingDetails.time || '?'}${aiThinkingDetails.endTime ? ', Sluttid: ' + aiThinkingDetails.endTime : ''}${aiThinkingDetails.description ? ', Beskrivning: Ja' : ''}`, sender: 'ai', timestamp: new Date() }]);
      } else if (trimmedLine.startsWith(AI_EVENT_SUGGESTION_MODAL_PREFIX)) {
        commandsProcessedThisTurn++;
        const suggestedDetails = parseAiCalendarDetails(trimmedLine, AI_EVENT_SUGGESTION_MODAL_PREFIX);
        const eventDateObj = parseAndValidateDateString(suggestedDetails.suggestedDateString);
        if (!eventDateObj) {
          conversationalTextForThisTurn += (conversationalTextForThisTurn ? "\n" : "") + `Ursäkta, jag fick problem med att tolka datumet ("${suggestedDetails.suggestedDateString || 'inget datum angivet'}") för den föreslagna händelsen. Kan du specificera det igen?`;
          aiThinkingDetails = null; continue;
        }
        const eventDetailsToPass = { title: suggestedDetails.title || 'Föreslagen händelse', time: suggestedDetails.time, endTime: suggestedDetails.endTime, description: suggestedDetails.description };
        openModalForNewEvent(eventDateObj, eventDetailsToPass, suggestedDetails.time);
        aiThinkingDetails = null; 
      } else if (trimmedLine.startsWith(AI_EVENT_CREATE_CONFIRMED_PREFIX)) {
        commandsProcessedThisTurn++;
        const eventDetails = parseAiCalendarDetails(trimmedLine, AI_EVENT_CREATE_CONFIRMED_PREFIX);
        const eventDateObj = parseAndValidateDateString(eventDetails.suggestedDateString);
        if (!eventDateObj) {
          aiThinkingDetails = null; continue;
        }
        const newEventData = { date: format(eventDateObj, 'yyyy-MM-dd'), title: eventDetails.title || 'Ny händelse', time: eventDetails.time, endTime: eventDetails.endTime, description: eventDetails.description, color: 'bg-green-500' };
        setEvents(prev => [...prev, { ...newEventData, id: `${Date.now()}-${Math.random().toString(36).substring(2,9)}` }]);
        aiThinkingDetails = null;
      } else if (trimmedLine.startsWith(AI_EVENT_DELETE_CONFIRMED_PREFIX)) {
        commandsProcessedThisTurn++;
        const deleteDetails = parseAiCalendarDetails(trimmedLine, AI_EVENT_DELETE_CONFIRMED_PREFIX);
        if (deleteDetails.eventId) {
            setEvents(prev => prev.filter(e => e.id !== deleteDetails.eventId));
        }
        aiThinkingDetails = null;
      } else if (trimmedLine) { 
          conversationalTextForThisTurn += (conversationalTextForThisTurn ? "\n" : "") + trimmedLine;
          aiThinkingDetails = null; 
      }
    }

    if (aiThinkingDetails && !conversationalTextForThisTurn && commandsProcessedThisTurn === 0) {
        setChatMessages(prev => [...prev, { id: `ai-thinks-only-${Date.now()}`, text: `[AI funderade (ingen direkt åtgärd eller förklaring följde)]: Titel: ${aiThinkingDetails.title || '?'}, DatumSträng: ${aiThinkingDetails.suggestedDateString || '?'}, Tid: ${aiThinkingDetails.time || '?'}${aiThinkingDetails.endTime ? ', Sluttid: ' + aiThinkingDetails.endTime : ''}${aiThinkingDetails.description ? ', Beskrivning: Ja' : ''}`, sender: 'ai', timestamp: new Date() }]);
    } else if (conversationalTextForThisTurn) {
      setChatMessages(prev => [...prev, { id: `ai-${Date.now()}`, text: conversationalTextForThisTurn.trim(), sender: 'ai', timestamp: new Date() }]);
    } else if (commandsProcessedThisTurn === 0 && !approvedResponseText && !aiThinkingDetails) {
       setChatMessages(prev => [...prev, {id: `ai-${Date.now()}-empty`, text: "Jag är inte säker på hur jag ska svara på det.", sender: 'ai', timestamp: new Date()}]);
    }
  };

  const handleSendChatMessage = async (messageText: string) => {
    const userMessageTimestamp = new Date();
    const newUserMessage: ChatMessage = { id: `user-${Date.now()}`, text: messageText, sender: 'user', timestamp: userMessageTimestamp };
    
    const uiVisibleChatHistory = [...chatMessages, newUserMessage]; 
    setChatMessages(prev => [...prev, newUserMessage]);
    setIsAiProcessing(true);

    if (!genericAiInstanceRef.current || !executorChatRef.current || !orchestratorChatRef.current) {
      setChatMessages(prev => [...prev, { id: `ai-${Date.now()}`, text: "AI-assistenten är för närvarande offline (API-nyckel eller AI-moduler ej konfigurerade).", sender: 'ai', timestamp: new Date() }]);
      setIsAiProcessing(false);
      return;
    }
    const ai = genericAiInstanceRef.current;

    let revisionAttempts = 0;
    const now = new Date();
    const formattedTime = format(now, 'HH:mm');
    const currentDateString = format(now, 'yyyy-MM-dd');
    let elapsedMinutesString = "";
    const userMessagesInHistory = uiVisibleChatHistory.filter(msg => msg.sender === 'user' && msg.id !== newUserMessage.id);
    if (userMessagesInHistory.length > 0) {
        const lastUserMessageTime = userMessagesInHistory[userMessagesInHistory.length - 1].timestamp;
        if (lastUserMessageTime instanceof Date && !isNaN(lastUserMessageTime.getTime())) {
            const minutesSinceLast = differenceInMinutes(userMessageTimestamp, lastUserMessageTime);
            if (minutesSinceLast > 0) elapsedMinutesString = `Tid sedan ditt senaste meddelande: ${minutesSinceLast} minut${minutesSinceLast > 1 ? 'er' : ''}. `;
        }
    }
    const todaysEventsContext = getTodaysEventsStringForAI(events, now);
    
    const initialOrchestratorPrompt_Phase1 = `Current date: ${currentDateString}, Current time: ${formattedTime}. ${elapsedMinutesString}${todaysEventsContext} User says: ${messageText}
Konversationshistorik (User/Assistant):
${uiVisibleChatHistory.slice(0, -1).map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n') || 'Ingen tidigare historik denna session.'}
`;
    
    let taskForExecutor = "";
    let executorResponseTextForRevision = ""; 

    try {
        console.log("Orchestrator (Phase 1) Input (using generateContent):", initialOrchestratorPrompt_Phase1.substring(0, 500) + "...");
        // Ensure orchestratorChatRef.current is not null before using it
        if (!orchestratorChatRef.current) throw new Error("Orchestrator chat not initialized.");

        const orchestratorResponse_Phase1: GenerateContentResponse = await orchestratorChatRef.current.sendMessage({
            message: initialOrchestratorPrompt_Phase1
        });
        const orchestratorPhase1Text = orchestratorResponse_Phase1.text.trim();
        console.log("Orchestrator (Phase 1) Response:", orchestratorPhase1Text);

        if (!orchestratorPhase1Text.startsWith(TASK_FOR_EXECUTOR_PREFIX)) {
            throw new Error(`Orchestrator Phase 1 response did not start with ${TASK_FOR_EXECUTOR_PREFIX}. Response: ${orchestratorPhase1Text}`);
        }
        taskForExecutor = orchestratorPhase1Text.replace(TASK_FOR_EXECUTOR_PREFIX, "").trim();

        while (revisionAttempts <= MAX_REVISION_ATTEMPTS) {
            let currentMessageForExecutor = taskForExecutor;
            if (revisionAttempts > 0 && executorResponseTextForRevision) { 
                currentMessageForExecutor = `Orchestrator Feedback: ${executorResponseTextForRevision}. Ursprunglig uppgift var: "${taskForExecutor}". Försök igen att adressera den ursprungliga uppgiften baserat på feedbacken. Kontext: Current date: ${currentDateString}, Current time: ${formattedTime}. ${elapsedMinutesString}${todaysEventsContext}`;
            }
            
            console.log(`Executor Input (Attempt ${revisionAttempts + 1}, using generateContent):`, currentMessageForExecutor.substring(0,500) + "...");
            // Ensure executorChatRef.current is not null
            if (!executorChatRef.current) throw new Error("Executor chat not initialized.");
            
            const executorResponse: GenerateContentResponse = await executorChatRef.current.sendMessage({
                 message: currentMessageForExecutor 
            });
            const fullExecutorResponseText = executorResponse.text.trim(); 
            console.log(`Executor Response (Attempt ${revisionAttempts + 1}):`, fullExecutorResponseText);

            const orchestratorPrompt_Phase2 = `CONTEXT FOR ORCHESTRATOR REVIEW (PHASE 2):
Original user message this turn: "${messageText}"
Current date for user: ${currentDateString}, Current time for user: ${formattedTime}.
User's calendar events for ${currentDateString}: ${todaysEventsContext}
Conversation history between user and Assistant (your approved responses):
${uiVisibleChatHistory.slice(0, -1).map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n') || 'Ingen tidigare historik denna session.'}

EXECUTOR AI'S SYSTEM INSTRUCTIONS (for your review reference):
--- START EXECUTOR INSTRUCTIONS ---
${EXECUTOR_SYSTEM_INSTRUCTION}
--- END EXECUTOR INSTRUCTIONS ---

EXECUTOR AI'S PROPOSED RESPONSE TO THE TASK YOU GAVE IT (verbatim):
--- START EXECUTOR RESPONSE ---
${fullExecutorResponseText}
--- END EXECUTOR RESPONSE ---

Based on all the above, please evaluate the Executor AI's proposed response according to your Phase 2 instructions.
Your output must be one of:
- ${ORCHESTRATOR_APPROVED_EXECUTOR_RESPONSE_PREFIX}[Executor's_exact_response]
- ${ORCHESTRATOR_APPROVED_FINAL_RESPONSE_PREFIX}[Your_final_conversational_response_to_user]
- ${ORCHESTRATOR_REVISION_NEEDED_PREFIX}[Feedback_to_Executor]`;

            console.log("Orchestrator (Phase 2) Input (using generateContent):", orchestratorPrompt_Phase2.substring(0, 500) + "...");
            
            // Ensure orchestratorChatRef.current is not null
             if (!orchestratorChatRef.current) throw new Error("Orchestrator chat not initialized for phase 2.");

            const orchestratorResponse_Phase2: GenerateContentResponse = await orchestratorChatRef.current.sendMessage({
                message: orchestratorPrompt_Phase2
            });
            const orchestratorDecisionText = orchestratorResponse_Phase2.text.trim();
            console.log(`Orchestrator (Phase 2) Decision (Attempt ${revisionAttempts + 1}):`, orchestratorDecisionText);

            if (orchestratorDecisionText.startsWith(ORCHESTRATOR_APPROVED_EXECUTOR_RESPONSE_PREFIX)) {
                const approvedResponse = orchestratorDecisionText.replace(ORCHESTRATOR_APPROVED_EXECUTOR_RESPONSE_PREFIX, "").trim();
                processApprovedExecutorResponse(approvedResponse);
                setIsAiProcessing(false);
                return; 
            } else if (orchestratorDecisionText.startsWith(ORCHESTRATOR_APPROVED_FINAL_RESPONSE_PREFIX)) {
                const finalConversationalResponse = orchestratorDecisionText.replace(ORCHESTRATOR_APPROVED_FINAL_RESPONSE_PREFIX, "").trim();
                setChatMessages(prev => [...prev, { id: `ai-final-${Date.now()}`, text: finalConversationalResponse, sender: 'ai', timestamp: new Date() }]);
                setIsAiProcessing(false);
                return;
            } else if (orchestratorDecisionText.startsWith(ORCHESTRATOR_REVISION_NEEDED_PREFIX)) {
                executorResponseTextForRevision = orchestratorDecisionText.replace(ORCHESTRATOR_REVISION_NEEDED_PREFIX, "").trim(); 
                revisionAttempts++;
                if (revisionAttempts > MAX_REVISION_ATTEMPTS) {
                    setChatMessages(prev => [...prev, { id: `ai-err-maxrev-${Date.now()}`, text: "Ursäkta, jag har problem med att bearbeta din förfrågan internt efter flera försök. Kan du försöka omformulera?", sender: 'ai', timestamp: new Date() }]);
                    setIsAiProcessing(false);
                    return; 
                }
            } else {
                console.error("Unexpected Orchestrator AI (Phase 2) response format:", orchestratorDecisionText);
                setChatMessages(prev => [...prev, { id: `ai-err-orchestratorfmt-${Date.now()}`, text: "Ett oväntat fel uppstod med den interna AI-granskningen (oväntat format från Orchestrator Fas 2).", sender: 'ai', timestamp: new Date() }]);
                setIsAiProcessing(false);
                return;
            }
        }
    } catch (error) {
      console.error("Error during AI processing chain:", error);
      let errorMessage = "Ursäkta, ett API-fel uppstod när jag försökte svara. Försök igen.";
      if (error instanceof Error) {
        errorMessage += ` (Detaljer: ${error.message})`;
      }
      setChatMessages(prev => [...prev, { id: `ai-err-api-${Date.now()}`, text: errorMessage, sender: 'ai', timestamp: new Date() }]);
    } finally {
      setIsAiProcessing(false);
    }
  };

  // Image Generation Functions
  const openImageGenModal = () => {
    setGeneratedImageUrl('');
    setImageGenError('');
    setSubmittedImageGenPrompt('');
    setIsImageGenModalOpen(true);
  };

  const closeImageGenModal = () => {
    setIsImageGenModalOpen(false);
  };

  const triggerImageGeneration = async () => {
    if (!imageGenUserPrompt.trim() || !genericAiInstanceRef.current) {
        setImageGenError("Please enter a prompt and ensure API is configured.");
        return;
    }
    setIsGeneratingImage(true);
    setGeneratedImageUrl('');
    setImageGenError('');
    setSubmittedImageGenPrompt(imageGenUserPrompt);

    try {
        const ai = genericAiInstanceRef.current;
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: imageGenUserPrompt,
            config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
        });

        if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            setGeneratedImageUrl(`data:image/jpeg;base64,${base64ImageBytes}`);
        } else {
            console.warn("Image generation response did not contain expected image data:", response);
            setImageGenError('No image data received. The response might be empty or the prompt could not be processed.');
        }
    } catch (error) {
        console.error("Error generating image:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during image generation.";
        setImageGenError(`Failed to generate image: ${errorMessage}`);
    } finally {
        setIsGeneratingImage(false);
    }
  };


  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans p-4 gap-4">
      <header className="mb-0">
        <h1 className="text-3xl font-bold text-gray-800 text-center">VisuCal Planner</h1>
      </header>

      <ChatWindow 
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
        isLoadingAiResponse={isAiProcessing}
        isApiConfigured={isApiConfigured && !!genericAiInstanceRef.current && !!executorChatRef.current && !!orchestratorChatRef.current}
        onClearChat={handleClearChat} 
      />

      <div className="flex items-center justify-between mb-0 bg-white p-3 rounded-t-lg shadow">
        <div className="flex items-center space-x-2">
          <button onClick={handlePrev} className="p-2 text-gray-600 hover:text-primary hover:bg-primary-light rounded-full" aria-label={view === 'month' ? "Previous month" : "Previous week"}><ChevronLeftIcon className="w-6 h-6" /></button>
          <button onClick={handleNext} className="p-2 text-gray-600 hover:text-primary hover:bg-primary-light rounded-full" aria-label={view === 'month' ? "Next month" : "Next week"}><ChevronRightIcon className="w-6 h-6" /></button>
          <button onClick={handleToday} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Idag</button>
        </div>
        <h2 className="text-xl font-semibold text-gray-800 hidden md:block">{headerDateFormatter()}</h2>
        <div className="flex items-center space-x-2">
          <div className="flex rounded-md shadow-sm">
            <button onClick={() => setView('month')} className={`px-3 py-2 text-sm font-medium rounded-l-md border ${view === 'month' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Månad</button>
            <button onClick={() => setView('week')} className={`px-3 py-2 text-sm font-medium rounded-r-md border ${view === 'week' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 border-l-0 hover:bg-gray-50'}`}>Vecka</button>
          </div>
           <button 
             onClick={openImageGenModal} 
             className="p-2 bg-accent text-white rounded-full hover:bg-green-600 shadow disabled:bg-gray-400" 
             aria-label="Generate image"
             title="Generate Image (General)"
             disabled={!isApiConfigured || !genericAiInstanceRef.current}
            >
             <PhotoIcon className="w-5 h-5" />
           </button>
           <button 
            onClick={() => openModalForNewEvent(currentDate, {})} 
            className="p-2 bg-primary text-white rounded-full hover:bg-primary-hover shadow" 
            aria-label="Lägg till ny händelse"
            title="Add New Event"
            >
             <PlusIcon className="w-5 h-5" />
           </button>
        </div>
      </div>
      <h2 className="text-xl font-semibold text-gray-800 text-center md:hidden mb-3 -mt-1">{headerDateFormatter()}</h2>

      <main className="flex-grow overflow-y-auto" style={{minHeight: '300px'}}>
        {view === 'month' ? (
          <CalendarGrid currentDate={currentDate} events={events} onDayClick={openModalForNewEventOnDate} onEventClick={openModalForEditingEvent} />
        ) : (
          <WeekViewGrid currentDate={currentDate} events={events} onSlotClick={openModalForNewEventOnSlot} onEventClick={openModalForEditingEvent} />
        )}
      </main>

      <EventModal 
        isOpen={isEventModalOpen} 
        onClose={handleCloseEventModal} 
        onSave={handleSaveEvent} 
        onDelete={handleDeleteEventInModal} 
        selectedDate={selectedDateForModal} 
        eventToEdit={eventToEdit} 
        initialTime={initialTimeForModal} 
        initialDetails={aiSuggestedEventDetails} 
        isApiConfigured={isApiConfigured && !!genericAiInstanceRef.current}
        aiInstance={genericAiInstanceRef.current}
      />
      <ImageGenModal
        isOpen={isImageGenModalOpen}
        onClose={closeImageGenModal}
        userPrompt={imageGenUserPrompt}
        setUserPrompt={setImageGenUserPrompt}
        onGenerate={triggerImageGeneration}
        generatedImageUrl={generatedImageUrl}
        isLoading={isGeneratingImage}
        error={imageGenError}
        submittedPrompt={submittedImageGenPrompt}
        isApiConfigured={isApiConfigured && !!genericAiInstanceRef.current}
      />
    </div>
  );
};

export default App;
