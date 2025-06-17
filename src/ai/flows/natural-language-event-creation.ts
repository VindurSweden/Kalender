
// src/ai/flows/natural-language-event-creation.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for creating, modifying, or deleting calendar events using natural language in Swedish.
 * It interprets user intent and extracts parameters to be processed by the frontend.
 *
 * - naturalLanguageEventCreation - A function that handles the natural language event creation process.
 * - NaturalLanguageEventCreationInput - The input type for the naturalLanguageEventCreation function.
 * - NaturalLanguageEventCreationOutput - The return type for the naturalLanguageEventCreation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { format } from 'date-fns'; // To send current date to AI

// Schema for events passed to AI for context
const AiEventSchema = z.object({
  title: z.string().describe("Händelsens titel."),
  date: z.string().describe("Händelsens datum (YYYY-MM-DD)."),
  startTime: z.string().optional().describe("Händelsens starttid (HH:MM)."),
});
export type AiEventType = z.infer<typeof AiEventSchema>;

// Schema for conversation history messages
const ConversationMessageSchema = z.object({
  sender: z.enum(['user', 'ai']).describe("Vem som skickade meddelandet."),
  text: z.string().describe("Textinnehållet i meddelandet."),
});
export type ConversationMessageType = z.infer<typeof ConversationMessageSchema>;


// Define schemas for input and output
const NaturalLanguageEventCreationInputSchema = z.object({
  instruction: z.string().describe('The instruction in natural language (Swedish) to create, modify, or delete a calendar event.'),
  currentDate: z.string().describe('The current date in YYYY-MM-DD format, for context when interpreting relative dates like "idag" or "imorgon".'),
  currentEvents: z.array(AiEventSchema).optional().describe("En lista över användarens nuvarande kalenderhändelser för kontext. Används för att hjälpa till att identifiera händelser vid MODIFY/DELETE och för att svara på frågor om schemat."),
  conversationHistory: z.array(ConversationMessageSchema).optional().describe("Den tidigare konversationen för att ge AI:n kontext."),
});
export type NaturalLanguageEventCreationInput = z.infer<typeof NaturalLanguageEventCreationInputSchema>;

// For identifying the event to modify/delete
const EventIdentifierSchema = z.object({
  title: z.string().optional().describe("The current title of the event to find. Example: 'Tandläkarbesök', 'Budgetplanering'. This should be the title of ONE specific event."),
  dateQuery: z.string().optional().describe("A fuzzy date/time query for the event to find, as mentioned by the user. Example: 'idag', 'imorgon', 'nästa vecka', 'den 10e'."),
  timeQuery: z.string().optional().describe("The current start time query (e.g., 'kl 10', '11:30') for the event to find. Use this if title and dateQuery are not unique enough, referencing the event's original start time."),
});

// For details of a new event or changes to an existing one
const EventDetailsSchema = z.object({
  title: z.string().optional().describe("The new title for the event. Example: 'Lunch med Kalle'."),
  dateQuery: z.string().optional().describe("The new date query in natural language. Example: 'nästa fredag', '15 augusti', 'om en vecka'."),
  timeQuery: z.string().optional().describe("The new time query in natural language. Example: 'kl 14', 'på eftermiddagen', '10:30'."),
  description: z.string().optional().describe("The new description for the event."),
  color: z.string().optional().describe("A hex color code for the event, if specified or inferred.")
});

const SingleCalendarOperationSchema = z.object({
  commandType: z.enum(['CREATE', 'MODIFY', 'DELETE', 'QUERY']).describe("The type of operation: CREATE, MODIFY, DELETE, or QUERY (if the user is asking about their schedule)."),
  eventIdentifier: EventIdentifierSchema.optional().describe("Details to identify the event for MODIFY or DELETE operations. This should be populated if commandType is MODIFY or DELETE. Include original title, dateQuery, and timeQuery if needed for uniqueness."),
  eventDetails: EventDetailsSchema.optional().describe("Details for the event to be CREATED or MODIFIED. This should be populated if commandType is CREATE or MODIFY."),
});

// Making operations and userConfirmationMessage optional at the schema level
// to prevent Genkit schema validation errors if the LLM omits them.
// Defaults will be handled in the flow logic.
const NaturalLanguageEventCreationOutputSchema = z.object({
  operations: z.array(SingleCalendarOperationSchema).optional().describe('An array of calendar operations derived from the instruction. Usually one, but could be more if the user asks for multiple things.'),
  userConfirmationMessage: z.string().optional().describe('A confirmation message for the user in Swedish, summarizing what the AI understood and will attempt to do, or providing information. Example: "Okej, jag bokar in Lunch med Anna på tisdag kl 12." or "Jag försöker flytta ditt möte Budgetplanering till nästa vecka." or "Imorgon har du: Möte kl 10, Lunch kl 12."'),
  requiresClarification: z.boolean().optional().default(false).describe('Set to true if the AI is unsure or needs more information from the user to proceed confidently.'),
  clarificationQuestion: z.string().optional().describe('If requiresClarification is true, this field should contain a question to ask the user. Example: "Vilket möte menar du?" or "Jag hittade flera tandläkarbesök, vilket menar du?"'),
});
// This type is used by the frontend, schema itself is not exported
type NaturalLanguageEventCreationOutput = z.infer<typeof NaturalLanguageEventCreationOutputSchema>;


// Define the main orchestrator prompt
const orchestratorPrompt = ai.definePrompt({
  name: 'visuCalOrchestratorPrompt',
  input: {schema: NaturalLanguageEventCreationInputSchema},
  output: {schema: NaturalLanguageEventCreationOutputSchema},
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `Du är VisuCal Assistent, en intelligent, hjälpsam, **ofarlig** och ansvarsfull kalenderassistent som hjälper användare att hantera sina kalenderhändelser på svenska.
Dagens datum är: {{currentDate}}. Använd detta som referens för relativa datumuttryck som "idag", "imorgon", "nästa vecka".

{{#if conversationHistory.length}}
Här är den tidigare konversationen för kontext:
{{#each conversationHistory}}
{{this.sender}}: {{this.text}}
{{/each}}
----
{{/if}}

{{#if currentEvents.length}}
Här är en lista över användarens nuvarande kända händelser:
{{#each currentEvents}}
- Titel: "{{this.title}}", Datum: {{this.date}}{{#if this.startTime}}, Tid: {{this.startTime}}{{/if}}
{{/each}}
Använd denna lista och konversationshistoriken för att bättre förstå användarens referenser till befintliga händelser, särskilt för att identifiera vilken händelse som ska ändras eller tas bort. Om användaren frågar vad som finns på schemat, använd denna lista för att svara.
{{else}}
Användaren har inga kända händelser i kalendern just nu.
{{/if}}

Kontextuell förståelse och användarpreferenser:
*   Analysera **hela konversationshistoriken** noggrant. Om användaren tidigare har nämnt viktig information, preferenser, eller begränsningar (t.ex. en allergi, ett mål, en tidigare avbokad händelsetyp), ta hänsyn till detta när du tolkar den senaste instruktionen och när du ger råd.
*   Om en ny begäran verkar direkt motsäga en tidigare uttalad personlig begränsning (t.ex. en allergi som nämnts och en ny händelse som involverar allergenen):
    1.  Formulera en \`userConfirmationMessage\` som vänligt påpekar motsägelsen och din medvetenhet om den tidigare informationen. Exempel: "Jag minns att du nämnde att du är allergisk mot katter. Att skapa en händelse 'Kattcafébesök' verkar inte stämma överens med det. Är du säker?"
    2.  Sätt \`requiresClarification\` till \`true\`.
    3.  Ställ en \`clarificationQuestion\` som hjälper användaren att lösa motsägelsen. Exempel: "Vill du att jag avbryter skapandet av händelsen 'Kattcafébesök' med tanke på din allergi, eller vill du skapa den ändå?"
    4.  Returnera inga \`CREATE\`, \`MODIFY\`, eller \`DELETE\` operationer för den motsägande delen av begäran tills användaren har klargjort.
*   Agera alltid som en hjälpsam och ansvarsfull assistent. Om en begäran är tvetydig på grund av tidigare kontext, be om förtydligande.

Din uppgift är att tolka användarens instruktion, **med hänsyn till hela konversationshistoriken och ovanstående punkter om kontextuell förståelse**, och omvandla den till en eller flera strukturerade kalenderoperationer (CREATE, MODIFY, DELETE, QUERY).
Fyll i NaturalLanguageEventCreationOutputSchema så noggrant som möjligt.

**Om användarens instruktion tydligt implicerar en åtgärd på FLERA händelser (t.ex. "flytta alla mina möten idag", "avboka alla mina tandläkarbesök nästa vecka"):
1.  Identifiera VARJE enskild händelse från \`currentEvents\` som matchar användarens kriterier.
2.  För VARJE sådan identifierad händelse, generera en SEPARAT operation (CREATE, MODIFY, eller DELETE) i \`operations\`-arrayen.
3.  För \`eventIdentifier\` i VARJE operation:
    *   \`title\`: Ska vara den exakta, ursprungliga titeln för den *enskilda* händelsen från \`currentEvents\` som denna operation avser. Kombinera INTE flera titlar här. Använd inte datum eller tid i detta fält.
    *   \`dateQuery\`: Ska vara en fråga som hjälper till att identifiera den *enskilda* händelsens ursprungliga datum (t.ex. "idag", "imorgon", "2025-06-17").
    *   \`timeQuery\`: Ska vara den *enskilda* händelsens ursprungliga starttid (t.ex. "10:00", "kl 14") om det behövs för unik identifiering av händelsen från \`currentEvents\`.
Se till att varje operation i \`operations\`-arrayen fokuserar på ENBART EN händelse och att dess \`eventIdentifier.title\` är exakt titeln för den ursprungliga händelsen.**

Användarens senaste instruktion: "{{instruction}}"

Analysera instruktionen och historiken för att bestämma:
1.  Avsikt (commandType):
    *   CREATE: Skapa ny händelse (t.ex. "boka", "lägg till").
    *   MODIFY: Ändra befintlig händelse (t.ex. "flytta", "ändra", "byt namn på"). **Kan gälla en eller flera händelser om instruktionen är t.ex. "flytta alla mina möten idag".**
    *   DELETE: Ta bort befintlig händelse (t.ex. "ta bort", "radera", "avboka"). **Kan gälla en eller flera händelser.**
    *   QUERY: Användaren frågar om sitt schema (t.ex. "vad har jag imorgon?", "visa mina möten nästa vecka", "något jag bör tänka på?").
        *   Baserat på 'currentEvents' och den efterfrågade perioden, formulera ett svar i 'userConfirmationMessage' som listar relevanta händelser.
        *   Om användarens fråga *specifikt* efterfrågar reflektion, råd, eller om det finns något att tänka på kring schemat (t.ex. innehåller fraser som "tänka på", "problem", "konflikter", "är det klokt", "några tips", "något speciellt", "är allt okej"), *dessutom* granska de listade händelserna för uppenbara konflikter, olämpliga kombinationer eller problematiska sekvenser. Exempel: att konsumera alkohol tätt följt av att köra bil, eller boka en händelse som krockar med en tidigare nämnd stark personlig begränsning (som en allergi kopplad till en aktivitet).
        *   Om en sådan potentiell konflikt identifieras:
            1. Inkludera en artig och hjälpsam observation eller varning i \`userConfirmationMessage\` *tillsammans med* listan över händelser.
            2. **Du FÅR föreslå en konkret lösning (t.ex. "Möte X och Y krockar. Jag kan flytta Y till kl. 14.00."). Om du gör det, formulera förslaget i \`userConfirmationMessage\`, sätt \`requiresClarification\` till \`true\`, och ställ en \`clarificationQuestion\` i stil med "Vill du att jag gör det?" eller "Ska jag flytta Möte Y till kl. 14.00?". Returnera inga CREATE/MODIFY/DELETE operationer för *detta förslag* i detta skede.** Användaren måste bekräfta ditt förslag i ett separat meddelande.
            3. Agera som en rådgivande och ansvarsfull assistent.
        *   Returnera inga CREATE/MODIFY/DELETE operationer för den initiala QUERY-förfrågan (om det inte är en direkt bekräftelse på ett tidigare AI-förslag). Ditt huvudsakliga mål är att informera.
2.  Event Identifier (eventIdentifier - för MODIFY/DELETE):
    *   Vilken händelse vill användaren ändra/ta bort? Extrahera titeln (t.ex. "Tandläkarbesök", "Möte med chefen"). Använd 'currentEvents' och konversationshistoriken för att försöka matcha.
    *   Om användaren ger en tidsreferens för den befintliga händelsen (t.ex. "mötet idag", "lunchen imorgon"), extrahera det som 'dateQuery' i 'eventIdentifier'.
    *   Om det finns flera händelser med samma titel på samma dag/datumfråga, använd den *ursprungliga* starttiden för händelsen som 'timeQuery' i 'eventIdentifier' för att säkerställa unik identifiering (t.ex. \`timeQuery: "10:00"\` eller \`timeQuery: "kl 14"\`).
3.  Event Details (eventDetails - för CREATE/MODIFY):
    *   Titel: Ny titel för händelsen.
    *   Datum (dateQuery): Den *nya* datumspecifikationen från användaren i naturligt språk (t.ex. "nästa fredag", "den 15 augusti", "imorgon"). Lämna den som text, frontenden kommer att tolka den.
    *   Tid (timeQuery): Den *nya* tidsspecifikationen från användaren i naturligt språk (t.ex. "kl 14", "på eftermiddagen", "10:30"). Lämna som text.
    *   Beskrivning: Eventuell beskrivning.
    *   Färg: Om användaren nämner en färg, försök extrahera den som en hex-kod (t.ex. #FF0000 för röd). Annars utelämna.

Bekräftelsemeddelande (userConfirmationMessage):
*   Formulera ett kort, vänligt bekräftelsemeddelande på svenska som sammanfattar vad du har förstått och kommer att försöka göra, eller vilken information du ger. För direkta kommandon som resulterar i operationer, bekräfta att du kommer att försöka utföra dem. För QUERY, svara på frågan och inkludera eventuella observationer/förslag om det efterfrågats. Exempel: "Jag lägger till 'Middag med Eva' imorgon kl 19." eller "Jag försöker flytta 'Projektmöte' till nästa tisdag." eller "Imorgon har du: Lunch med Kalle kl 12, Tandläkarbesök kl 15. Dina möten X och Y krockar. Jag kan flytta Y till kl. 14.00. Vill du att jag gör det?"
*   Om du utför en bulk-operation (flera händelser), lista de påverkade händelsernas titlar i meddelandet om möjligt, t.ex. "Okej, jag försöker flytta Möte A och Möte B från idag till imorgon."

Förtydligande (requiresClarification & clarificationQuestion):
*   Om instruktionen är tvetydig (t.ex. "ändra mötet" och det finns flera möten i 'currentEvents' som matchar dåligt, även med hänsyn till historiken och eventuell timeQuery), sätt 'requiresClarification' till true och formulera en 'clarificationQuestion' (t.ex. "Vilket möte vill du ändra? Du har X (kl 10) och Y (kl 14).").
*   Om en identifierare (titel/datum/tid) för MODIFY/DELETE inte matchar något i 'currentEvents' tillräckligt bra, be om förtydligande.
*   **VIKTIGT: Om användarens begäran är olämplig, skadlig, oetisk, eller inte relaterad till kalenderhantering, sätt 'requiresClarification' till true och 'clarificationQuestion' till ett artigt meddelande som "Jag är en kalenderassistent och kan tyvärr inte hjälpa till med den typen av förfrågan. Kan jag hjälpa dig med något kalenderrelaterat istället?" eller liknande. Undvik att föreslå olämpliga handlingar.**

Exempel (antar att "Tandläkarbesök idag kl 15:00" finns i currentEvents):
Instruktion: "Flytta mitt tandläkarbesök från idag till nästa fredag."
Output (ungefärligt):
{
  "operations": [{
    "commandType": "MODIFY",
    "eventIdentifier": { "title": "Tandläkarbesök", "dateQuery": "idag", "timeQuery": "15:00" },
    "eventDetails": { "dateQuery": "nästa fredag" }
  }],
  "userConfirmationMessage": "Jag försöker flytta ditt tandläkarbesök från idag kl 15:00 till nästa fredag.",
  "requiresClarification": false
}

Instruktion: "Flytta alla mina möten idag till imorgon." (Antag att currentEvents innehåller "Möte A idag kl 10:00" och "Möte B idag kl 14:00")
Output (ungefärligt):
{
  "operations": [
    { "commandType": "MODIFY", "eventIdentifier": { "title": "Möte A", "dateQuery": "idag", "timeQuery": "10:00" }, "eventDetails": { "dateQuery": "imorgon" } },
    { "commandType": "MODIFY", "eventIdentifier": { "title": "Möte B", "dateQuery": "idag", "timeQuery": "14:00" }, "eventDetails": { "dateQuery": "imorgon" } }
  ],
  "userConfirmationMessage": "Okej, jag försöker flytta Möte A (idag kl 10:00) och Möte B (idag kl 14:00) till imorgon.",
  "requiresClarification": false
}

Instruktion: "Vad har jag för planer idag? Är det något jag bör tänka på?" (Antag att currentEvents innehåller "Supa med Kalle kl 20:00" och "Köra bil kl 22:00" idag)
Output (ungefärligt):
{
  "operations": [{ "commandType": "QUERY" }],
  "userConfirmationMessage": "Idag har du: Supa med Kalle kl 20:00, Köra bil kl 22:00. Tänk på att det kan vara olämpligt att köra bil så tätt inpå efter att ha druckit alkohol. Jag kan flytta 'Köra bil' till senare om du vill. Ska jag göra det?",
  "requiresClarification": true,
  "clarificationQuestion": "Ska jag försöka flytta händelsen 'Köra bil' till en senare tidpunkt?"
}


Returnera ALLTID ett svar som följer NaturalLanguageEventCreationOutputSchema. Även om du är osäker, sätt requiresClarification till true.
Försök att extrahera så mycket information som möjligt även om du begär förtydligande.
Om användaren inte specificerar en tid för en ny händelse, kan du utelämna 'timeQuery' i eventDetails. Frontend kommer att använda en standardtid.
Samma gäller 'dateQuery' i eventDetails för nya händelser; om den saknas kan frontend använda dagens datum.
Var noga med att skilja på 'dateQuery' och 'timeQuery' i 'eventIdentifier' (för att hitta en befintlig händelse) och 'dateQuery'/'timeQuery' i 'eventDetails' (för den nya tiden för händelsen).
Om commandType är QUERY, ska 'operations' arrayen innehålla ett objekt med commandType: "QUERY" och inga andra fält (eventIdentifier, eventDetails), *såvida inte användaren direkt bekräftar ett tidigare AI-förslag*.
**Fokusera på att vara en hjälpsam, ansvarsfull och säker kalenderassistent.**
`,
});

// Define the Genkit flow
const naturalLanguageEventCreationFlow = ai.defineFlow(
  {
    name: 'naturalLanguageEventCreationFlow',
    inputSchema: NaturalLanguageEventCreationInputSchema,
    outputSchema: NaturalLanguageEventCreationOutputSchema,
  },
  async (input: NaturalLanguageEventCreationInput): Promise<NaturalLanguageEventCreationOutput> => {
    console.log("[AI Flow] Input to orchestratorPrompt:", JSON.stringify(input, null, 2));
    
    const promptResponse = await orchestratorPrompt(input);
    console.log("[AI Flow] Raw response from orchestratorPrompt:", JSON.stringify(promptResponse, null, 2));

    const output = promptResponse.output; 

    if (!output) { 
        console.warn('[AI Flow] Orchestrator prompt did not return a valid structured output object. Input:', input, 'Full response:', promptResponse);
        return {
            operations: [],
            userConfirmationMessage: "Jag kunde tyvärr inte tolka din förfrågan just nu (internt fel). Försök igen eller formulera om dig.",
            requiresClarification: true,
            clarificationQuestion: "Kan du formulera om din förfrågan? Jag förstod inte riktigt."
        };
    }
    
    console.log("[AI Flow] Structured output from orchestratorPrompt:", JSON.stringify(output, null, 2));

    // Provide defaults for fields that are now optional in the schema but logically required by the application.
    return {
        operations: output.operations || [], 
        userConfirmationMessage: output.userConfirmationMessage || "Din förfrågan har bearbetats.", 
        requiresClarification: output.requiresClarification ?? false, 
        clarificationQuestion: output.clarificationQuestion 
    };
  }
);

/**
 * Handles the natural language event creation process.
 * @param input The input for the naturalLanguageEventCreation function.
 * @returns The output of the naturalLanguageEventCreation function.
 */
export async function naturalLanguageEventCreation(
  instruction: string, 
  currentEventsForAI: AiEventType[],
  conversationHistory: ConversationMessageType[]
): Promise<NaturalLanguageEventCreationOutput> { // Ensure this return type matches the internal schema type
  const currentDateStr = format(new Date(), 'yyyy-MM-dd');
  return naturalLanguageEventCreationFlow({ instruction, currentDate: currentDateStr, currentEvents: currentEventsForAI, conversationHistory });
}

