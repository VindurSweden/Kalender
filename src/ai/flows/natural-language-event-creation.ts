
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

// Define schemas for input and output
const NaturalLanguageEventCreationInputSchema = z.object({
  instruction: z.string().describe('The instruction in natural language (Swedish) to create, modify, or delete a calendar event.'),
  currentDate: z.string().describe('The current date in YYYY-MM-DD format, for context when interpreting relative dates like "idag" or "imorgon".'),
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
  commandType: z.enum(['CREATE', 'MODIFY', 'DELETE']).describe("The type of operation: CREATE, MODIFY, or DELETE."),
  eventIdentifier: EventIdentifierSchema.optional().describe("Details to identify the event for MODIFY or DELETE operations. This should be populated if commandType is MODIFY or DELETE."),
  eventDetails: EventDetailsSchema.optional().describe("Details for the event to be CREATED or MODIFIED. This should be populated if commandType is CREATE or MODIFY."),
});

const NaturalLanguageEventCreationOutputSchema = z.object({
  operations: z.array(SingleCalendarOperationSchema).describe('An array of calendar operations derived from the instruction. Usually one, but could be more if the user asks for multiple things.'),
  userConfirmationMessage: z.string().describe('A confirmation message for the user in Swedish, summarizing what the AI understood and will attempt to do. Example: "Okej, jag bokar in Lunch med Anna på tisdag kl 12." or "Jag försöker flytta ditt möte Budgetplanering till nästa vecka."'),
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

Din uppgift är att tolka användarens instruktion och omvandla den till en eller flera strukturerade kalenderoperationer (CREATE, MODIFY, DELETE).
Fyll i NaturalLanguageEventCreationOutputSchema så noggrant som möjligt.

Användarens instruktion: "{{instruction}}"

Analysera instruktionen för att bestämma:
1.  Avsikt (commandType): Är det CREATE (skapa ny), MODIFY (ändra befintlig), eller DELETE (ta bort befintlig)?
2.  Event Identifier (eventIdentifier - för MODIFY/DELETE):
    *   Vilken händelse vill användaren ändra/ta bort? Extrahera titel (t.ex. "Tandläkarbesök", "Möte med chefen").
    *   Om användaren ger en tidsreferens för den befintliga händelsen (t.ex. "mötet idag", "lunchen imorgon"), extrahera det som 'dateQuery' i 'eventIdentifier'.
3.  Event Details (eventDetails - för CREATE/MODIFY):
    *   Titel: Ny titel för händelsen.
    *   Datum (dateQuery): Den *nya* datumspecifikationen från användaren i naturligt språk (t.ex. "nästa fredag", "den 15 augusti", "imorgon"). Lämna den som text, frontenden kommer att tolka den.
    *   Tid (timeQuery): Den *nya* tidsspecifikationen från användaren i naturligt språk (t.ex. "kl 14", "på eftermiddagen", "10:30"). Lämna som text.
    *   Beskrivning: Eventuell beskrivning.
    *   Färg: Om användaren nämner en färg, försök extrahera den som en hex-kod (t.ex. #FF0000 för röd). Annars utelämna.

Bekräftelsemeddelande (userConfirmationMessage):
*   Formulera ett kort, vänligt bekräftelsemeddelande på svenska som sammanfattar vad du har förstått och kommer att försöka göra. Exempel: "Jag lägger till 'Middag med Eva' imorgon kl 19." eller "Jag försöker flytta 'Projektmöte' till nästa tisdag."

Förtydligande (requiresClarification & clarificationQuestion):
*   Om instruktionen är tvetydig (t.ex. "ändra mötet"), sätt 'requiresClarification' till true och formulera en 'clarificationQuestion' (t.ex. "Vilket möte vill du ändra?").
*   Om flera händelser matchar en sökning (vilket du inte kan veta här, men om det är uppenbart från texten att det kan vara så), be om förtydligande.

Exempel:
Instruktion: "Boka ett möte med Projektgruppen nästa tisdag kl 10 för att diskutera budgeten."
Output (ungefärligt):
{
  "operations": [{
    "commandType": "CREATE",
    "eventDetails": { "title": "Möte med Projektgruppen", "dateQuery": "nästa tisdag", "timeQuery": "kl 10", "description": "Diskutera budgeten" }
  }],
  "userConfirmationMessage": "Okej, jag bokar in 'Möte med Projektgruppen' nästa tisdag kl 10 för att diskutera budgeten.",
  "requiresClarification": false
}

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

Instruktion: "Ta bort mötet Budgetplanering."
Output (ungefärligt):
{
  "operations": [{
    "commandType": "DELETE",
    "eventIdentifier": { "title": "Budgetplanering" }
  }],
  "userConfirmationMessage": "Jag tar bort mötet 'Budgetplanering'.",
  "requiresClarification": false
}

Instruktion: "Ändra mötet."
Output (ungefärligt):
{
  "operations": [],
  "userConfirmationMessage": "Jag är osäker på vilket möte du menar.",
  "requiresClarification": true,
  "clarificationQuestion": "Vilket möte vill du ändra?"
}

Returnera ALLTID ett svar som följer NaturalLanguageEventCreationOutputSchema. Även om du är osäker, sätt requiresClarification till true.
Försök att extrahera så mycket information som möjligt även om du begär förtydligande.
Om användaren inte specificerar en tid för en ny händelse, kan du utelämna 'timeQuery'. Frontend kommer att använda en standardtid.
Samma gäller 'dateQuery' för nya händelser; om den saknas kan frontend använda dagens datum.
Var noga med att skilja på 'dateQuery' i 'eventIdentifier' (för att hitta en befintlig händelse) och 'dateQuery' i 'eventDetails' (för den nya tiden för händelsen).
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
export async function naturalLanguageEventCreation(instruction: string): Promise<NaturalLanguageEventCreationOutput> {
  const currentDateStr = format(new Date(), 'yyyy-MM-dd');
  return naturalLanguageEventCreationFlow({ instruction, currentDate: currentDateStr });
}

