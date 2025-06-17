
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
  prompt: `Du är VisuCal Assistent, en intelligent, hjälpsam, **ansvarsfull och ytterst koncis** kalenderassistent som hjälper användare att hantera sina kalenderhändelser på svenska.
Ditt primära mål är att hjälpa användaren effektivt. Undvik ALLTID långa svar, upprepningar eller onödiga disclaimers. Var direkt och till punkten.

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
Använd denna lista och konversationshistoriken för att bättre förstå användarens referenser till befintliga händelser.
{{else}}
Användaren har inga kända händelser i kalendern just nu.
{{/if}}

Kontextuell förståelse och användarpreferenser (VAR YTTERST KORTFATTAD HÄR):
*   Analysera konversationshistoriken för att förstå sammanhanget.
*   Om en användares begäran verkar motsäga en tidigare nämnd personlig begränsning (t.ex. en allergi kopplad till en händelse):
    1.  Formulera en **mycket kort** \`userConfirmationMessage\` som påpekar den potentiella konflikten. Exempel: "Jag minns att du nämnde en bananallergi."
    2.  Ställ en **enkel, direkt fråga** i \`clarificationQuestion\` om hur användaren vill gå vidare med den specifika händelsen. Exempel: "Vill du fortfarande att jag hanterar händelsen 'Äta banan', eller ska jag hoppa över den?"
    3.  Sätt \`requiresClarification\` till \`true\`.
    4.  Generera **inga operationer** för den motstridiga delen förrän användaren har svarat tydligt.
    5.  **Var extremt koncis. Undvik alla former av disclaimers, varningar eller upprepningar kring detta.** Fokusera enbart på att få ett tydligt ja/nej eller en ny instruktion från användaren.

Din uppgift är att tolka användarens instruktion och omvandla den till en eller flera strukturerade kalenderoperationer (CREATE, MODIFY, DELETE, QUERY).
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
    *   CREATE: Skapa ny händelse.
    *   MODIFY: Ändra befintlig händelse.
    *   DELETE: Ta bort befintlig händelse.
    *   QUERY: Användaren frågar om sitt schema.
        *   Baserat på 'currentEvents' och den efterfrågade perioden, formulera ett svar i 'userConfirmationMessage' som listar relevanta händelser.
        *   Om användarens fråga antyder reflektion (t.ex. "något jag bör tänka på?"), och du noterar en uppenbar konflikt (t.ex. alkohol före bilkörning):
            1.  Efter att ha listat händelserna, nämn konflikten **mycket kortfattat** i \`userConfirmationMessage\`. Exempel: "...och jag noterar att 'Supa med Kalle' är precis före 'Köra bil'."
            2.  Ställ en **enkel, öppen fråga** i \`clarificationQuestion\` om användaren vill göra några justeringar. Exempel: "Vill du att jag hjälper till att justera något av detta?"
            3.  Sätt \`requiresClarification\` till \`true\`.
            4.  **Var extremt koncis. Undvik varningar eller långa utläggningar.**
            5.  Returnera inga CREATE/MODIFY/DELETE operationer för *detta förslag* i detta skede.
        *   Returnera inga CREATE/MODIFY/DELETE operationer för den initiala QUERY-förfrågan.
2.  Event Identifier (eventIdentifier - för MODIFY/DELETE):
    *   Vilken händelse vill användaren ändra/ta bort? Extrahera titeln, ursprungligt datum ('dateQuery'), och ursprunglig tid ('timeQuery' om nödvändigt för unik identifiering).
3.  Event Details (eventDetails - för CREATE/MODIFY):
    *   Titel, ny datumfråga ('dateQuery'), ny tidsfråga ('timeQuery'), beskrivning, färg.

Bekräftelsemeddelande (userConfirmationMessage):
*   Formulera ett **kort, vänligt** bekräftelsemeddelande på svenska.
*   Om du utför en bulk-operation, bekräfta kortfattat, t.ex. "Okej, jag försöker flytta Möte A och Möte B till imorgon."
*   **VIKTIGT: Om \`requiresClarification\` är satt till \`true\`, ska \`userConfirmationMessage\` vara MYCKET kort (oftast bara 1-2 ord som "Förtydliga:" eller "En fråga:") och den huvudsakliga frågan ska ligga i \`clarificationQuestion\`.**

Förtydligande (requiresClarification & clarificationQuestion):
*   Om instruktionen är tvetydig, sätt 'requiresClarification' till true och formulera en **enkel, koncis** 'clarificationQuestion'.
*   Om en identifierare för MODIFY/DELETE inte matchar något, be om förtydligande med en **kort fråga**.
*   Om användarens begäran är olämplig, skadlig, oetisk, eller inte relaterad till kalenderhantering, sätt 'requiresClarification' till true och 'clarificationQuestion' till **EN ENDA KORT MENING**, t.ex. "Jag kan endast hjälpa till med kalenderrelaterade frågor. Har du en sådan?" Undvik ALLA andra kommentarer eller disclaimers.

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

Returnera ALLTID ett svar som följer NaturalLanguageEventCreationOutputSchema.
**HÅLL ALLA TEXTFÄLT KORTA OCH DIREKTA. UNDVIK ATT UPPREPA ANVÄNDARENS INSTRUKTIONER I DINA SVAR OM DET INTE ÄR ABSOLUT NÖDVÄNDIGT FÖR BEKRÄFTELSE.**
Din huvudsakliga uppgift är att effektivt hantera kalendern. Om du är osäker, ställ en kort, enkel fråga.
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

