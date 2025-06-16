
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


// Define schemas for input and output
const NaturalLanguageEventCreationInputSchema = z.object({
  instruction: z.string().describe('The instruction in natural language (Swedish) to create, modify, or delete a calendar event.'),
  currentDate: z.string().describe('The current date in YYYY-MM-DD format, for context when interpreting relative dates like "idag" or "imorgon".'),
  currentEvents: z.array(AiEventSchema).optional().describe("En lista över användarens nuvarande kalenderhändelser för kontext. Används för att hjälpa till att identifiera händelser vid MODIFY/DELETE och för att svara på frågor om schemat."),
});
export type NaturalLanguageEventCreationInput = z.infer<typeof NaturalLanguageEventCreationInputSchema>;

// For identifying the event to modify/delete
const EventIdentifierSchema = z.object({
  title: z.string().optional().describe("The current title of the event to find. Example: 'Tandläkarbesök', 'Budgetplanering'."),
  dateQuery: z.string().optional().describe("A fuzzy date/time query for the event to find, as mentioned by the user. Example: 'idag', 'imorgon', 'nästa vecka', 'den 10e'."),
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
  eventIdentifier: EventIdentifierSchema.optional().describe("Details to identify the event for MODIFY or DELETE operations. This should be populated if commandType is MODIFY or DELETE."),
  eventDetails: EventDetailsSchema.optional().describe("Details for the event to be CREATED or MODIFIED. This should be populated if commandType is CREATE or MODIFY."),
});

const NaturalLanguageEventCreationOutputSchema = z.object({
  operations: z.array(SingleCalendarOperationSchema).describe('An array of calendar operations derived from the instruction. Usually one, but could be more if the user asks for multiple things.'),
  userConfirmationMessage: z.string().describe('A confirmation message for the user in Swedish, summarizing what the AI understood and will attempt to do. Example: "Okej, jag bokar in Lunch med Anna på tisdag kl 12." or "Jag försöker flytta ditt möte Budgetplanering till nästa vecka." or "Imorgon har du: Möte kl 10, Lunch kl 12."'),
  requiresClarification: z.boolean().optional().default(false).describe('Set to true if the AI is unsure or needs more information from the user to proceed confidently.'),
  clarificationQuestion: z.string().optional().describe('If requiresClarification is true, this field should contain a question to ask the user. Example: "Vilket möte menar du?" or "Jag hittade flera tandläkarbesök, vilket menar du?"'),
});
export type NaturalLanguageEventCreationOutput = z.infer<typeof NaturalLanguageEventCreationOutputSchema>;


// Define the main orchestrator prompt
const orchestratorPrompt = ai.definePrompt({
  name: 'visuCalOrchestratorPrompt',
  input: {schema: NaturalLanguageEventCreationInputSchema},
  output: {schema: NaturalLanguageEventCreationOutputSchema},
  prompt: `Du är VisuCal Assistent, en intelligent kalenderassistent som hjälper användare att hantera sina kalenderhändelser på svenska.
Dagens datum är: {{currentDate}}. Använd detta som referens för relativa datumuttryck som "idag", "imorgon", "nästa vecka".

{{#if currentEvents.length}}
Här är en lista över användarens nuvarande kända händelser:
{{#each currentEvents}}
- Titel: "{{this.title}}", Datum: {{this.date}}{{#if this.startTime}}, Tid: {{this.startTime}}{{/if}}
{{/each}}
Använd denna lista för att bättre förstå användarens referenser till befintliga händelser, särskilt för att identifiera vilken händelse som ska ändras eller tas bort. Om användaren frågar vad som finns på schemat, använd denna lista för att svara.
{{else}}
Användaren har inga kända händelser i kalendern just nu.
{{/if}}

Din uppgift är att tolka användarens instruktion och omvandla den till en eller flera strukturerade kalenderoperationer (CREATE, MODIFY, DELETE, QUERY).
Fyll i NaturalLanguageEventCreationOutputSchema så noggrant som möjligt.

Användarens instruktion: "{{instruction}}"

Analysera instruktionen för att bestämma:
1.  Avsikt (commandType):
    *   CREATE: Skapa ny händelse (t.ex. "boka", "lägg till").
    *   MODIFY: Ändra befintlig händelse (t.ex. "flytta", "ändra", "byt namn på").
    *   DELETE: Ta bort befintlig händelse (t.ex. "ta bort", "radera", "avboka").
    *   QUERY: Användaren frågar om sitt schema (t.ex. "vad har jag imorgon?", "visa mina möten nästa vecka"). Då ska du formulera ett svar i 'userConfirmationMessage' baserat på 'currentEvents' och den efterfrågade perioden. Returnera inga operationer av typen CREATE/MODIFY/DELETE för QUERY.
2.  Event Identifier (eventIdentifier - för MODIFY/DELETE):
    *   Vilken händelse vill användaren ändra/ta bort? Extrahera titel (t.ex. "Tandläkarbesök", "Möte med chefen"). Använd 'currentEvents' för att försöka matcha.
    *   Om användaren ger en tidsreferens för den befintliga händelsen (t.ex. "mötet idag", "lunchen imorgon"), extrahera det som 'dateQuery' i 'eventIdentifier'.
3.  Event Details (eventDetails - för CREATE/MODIFY):
    *   Titel: Ny titel för händelsen.
    *   Datum (dateQuery): Den *nya* datumspecifikationen från användaren i naturligt språk (t.ex. "nästa fredag", "den 15 augusti", "imorgon"). Lämna den som text, frontenden kommer att tolka den.
    *   Tid (timeQuery): Den *nya* tidsspecifikationen från användaren i naturligt språk (t.ex. "kl 14", "på eftermiddagen", "10:30"). Lämna som text.
    *   Beskrivning: Eventuell beskrivning.
    *   Färg: Om användaren nämner en färg, försök extrahera den som en hex-kod (t.ex. #FF0000 för röd). Annars utelämna.

Bekräftelsemeddelande (userConfirmationMessage):
*   Formulera ett kort, vänligt bekräftelsemeddelande på svenska som sammanfattar vad du har förstått och kommer att försöka göra. För QUERY, svara på frågan. Exempel: "Jag lägger till 'Middag med Eva' imorgon kl 19." eller "Jag försöker flytta 'Projektmöte' till nästa tisdag." eller "Imorgon har du: Lunch med Kalle kl 12, Tandläkarbesök kl 15."

Förtydligande (requiresClarification & clarificationQuestion):
*   Om instruktionen är tvetydig (t.ex. "ändra mötet" och det finns flera möten i 'currentEvents' som matchar dåligt), sätt 'requiresClarification' till true och formulera en 'clarificationQuestion' (t.ex. "Vilket möte vill du ändra? Du har X och Y.").
*   Om en identifierare (titel/datum) för MODIFY/DELETE inte matchar något i 'currentEvents' tillräckligt bra, be om förtydligande.

Exempel (antar att "Tandläkarbesök idag" finns i currentEvents):
Instruktion: "Flytta mitt tandläkarbesök från idag till nästa fredag."
Output (ungefärligt):
{
  "operations": [{
    "commandType": "MODIFY",
    "eventIdentifier": { "title": "tandläkarbesök", "dateQuery": "idag" },
    "eventDetails": { "dateQuery": "nästa fredag" }
  }],
  "userConfirmationMessage": "Jag försöker flytta ditt tandläkarbesök från idag till nästa fredag.",
  "requiresClarification": false
}

Instruktion: "Vad har jag för planer idag?" (Antag att currentEvents innehåller "Lunch med Kalle" idag kl 12)
Output (ungefärligt):
{
  "operations": [{ "commandType": "QUERY" }],
  "userConfirmationMessage": "Idag har du: Lunch med Kalle kl 12.",
  "requiresClarification": false
}


Returnera ALLTID ett svar som följer NaturalLanguageEventCreationOutputSchema. Även om du är osäker, sätt requiresClarification till true.
Försök att extrahera så mycket information som möjligt även om du begär förtydligande.
Om användaren inte specificerar en tid för en ny händelse, kan du utelämna 'timeQuery'. Frontend kommer att använda en standardtid.
Samma gäller 'dateQuery' för nya händelser; om den saknas kan frontend använda dagens datum.
Var noga med att skilja på 'dateQuery' i 'eventIdentifier' (för att hitta en befintlig händelse) och 'dateQuery' i 'eventDetails' (för den nya tiden för händelsen).
Om commandType är QUERY, ska 'operations' arrayen innehålla ett objekt med commandType: "QUERY" och inga andra fält (eventIdentifier, eventDetails). Svaret ges i userConfirmationMessage.
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
    const promptResponse = await orchestratorPrompt(input);

    if (!promptResponse || !promptResponse.output) {
        console.warn('Orchestrator prompt did not return a valid structured output. Input:', input, 'Full response:', promptResponse);
        return {
            operations: [],
            userConfirmationMessage: "Jag kunde tyvärr inte tolka din förfrågan just nu. Försök igen eller formulera om dig.",
            requiresClarification: true,
            clarificationQuestion: "Kan du formulera om din förfrågan? Jag förstod inte riktigt."
        };
    }
    
    const output = promptResponse.output;

    // Ensure output structure matches the schema
    return {
        operations: output.operations || [],
        userConfirmationMessage: output.userConfirmationMessage || "Bearbetning klar, men ingen specifik bekräftelse genererades.",
        requiresClarification: output.requiresClarification || false,
        clarificationQuestion: output.clarificationQuestion
    };
  }
);

/**
 * Handles the natural language event creation process.
 * @param input The input for the naturalLanguageEventCreation function.
 * @returns The output of the naturalLanguageEventCreation function.
 */
export async function naturalLanguageEventCreation(instruction: string, currentEventsForAI: AiEventType[]): Promise<NaturalLanguageEventCreationOutput> {
  const currentDateStr = format(new Date(), 'yyyy-MM-dd');
  return naturalLanguageEventCreationFlow({ instruction, currentDate: currentDateStr, currentEvents: currentEventsForAI });
}
