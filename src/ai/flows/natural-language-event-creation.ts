
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
  sender: z.enum(['user', 'ai']).describe("Vem som skickade meddelandet ('user' eller 'ai')."),
  text: z.string().describe("Textinnehållet i meddelandet."),
});
export type ConversationMessageType = z.infer<typeof ConversationMessageSchema>;


// Define schemas for input and output
const NaturalLanguageEventCreationInputSchema = z.object({
  instruction: z.string().describe('The instruction in natural language (Swedish) to create, modify, or delete a calendar event.'),
  currentDate: z.string().describe('The current date in YYYY-MM-DD format, for context when interpreting relative dates like "idag" or "imorgon".'),
  currentEvents: z.array(AiEventSchema).optional().describe("En lista över användarens nuvarande kalenderhändelser för kontext. Används för att hjälpa till att identifiera händelser vid MODIFY/DELETE och för att svara på frågor om schemat."),
  conversationHistory: z.array(ConversationMessageSchema).optional().describe("Den tidigare konversationen för att ge AI:n kontext. Varje meddelande har en 'sender' ('user' eller 'ai') och 'text'."),
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

const NaturalLanguageEventCreationOutputSchema = z.object({
  operations: z.array(SingleCalendarOperationSchema).optional().describe('An array of calendar operations derived from the instruction. Usually one, but could be more if the user asks for multiple things.'),
  userConfirmationMessage: z.string().optional().describe('A **VERY SHORT** confirmation message or introductory phrase for the user in Swedish. Example: "Okej, jag bokar in...", "Jag försöker flytta...", "Förtydliga:", "En fråga:". Om requiresClarification är true, håll detta extremt kort; huvudfrågan ska vara i clarificationQuestion.'),
  requiresClarification: z.boolean().optional().default(false).describe('Set to true if the AI is unsure or needs more information from the user to proceed confidently.'),
  clarificationQuestion: z.string().optional().describe('If requiresClarification is true, this field MUST contain **ONE SINGLE, SHORT, and DIRECT question** to ask the user. Example: "Vilket möte menar du?" or "Ska jag fortfarande flytta händelsen trots din allergi?" or "Menar du idag eller imorgon?". Håll denna fråga under 150 tecken.'),
});
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
  prompt: `Du är VisuCal Assistent, en intelligent, hjälpsam, **EXTREMT KONCIS** och ansvarsfull kalenderassistent som hjälper användare att hantera sina kalenderhändelser på svenska.
Ditt absoluta primära mål är att vara **kortfattad och effektiv**. Undvik ALLA långa svar, upprepningar eller onödiga disclaimers. Var direkt och till punkten.

Dagens datum är: {{currentDate}}. Använd detta som referens för relativa datumuttryck.

{{#if conversationHistory.length}}
Konversationshistorik (senaste först):
{{#each conversationHistory}}
{{this.sender}}: {{this.text}}
{{/each}}
----
{{/if}}

{{#if currentEvents.length}}
Användarens nuvarande händelser:
{{#each currentEvents}}
- Titel: "{{this.title}}", Datum: {{this.date}}{{#if this.startTime}}, Tid: {{this.startTime}}{{/if}}
{{/each}}
Använd denna lista och historiken för att förstå referenser till befintliga händelser.
{{else}}
Användaren har inga kända händelser.
{{/if}}

ANVÄNDARINSTRUKTION: "{{instruction}}"

DIN UPPGIFT: Tolka instruktionen och omvandla den till en eller flera strukturerade kalenderoperationer (CREATE, MODIFY, DELETE, QUERY) enligt NaturalLanguageEventCreationOutputSchema.

VIKTIGA REGLER FÖR DITT SVAR:
1.  **VAR YTTERST KONCIS I ALL TEXT DU GENERERAR.**
2.  Avsikt (commandType): CREATE, MODIFY, DELETE, QUERY.
3.  Event Identifier (eventIdentifier - för MODIFY/DELETE): Titel, urspr. datum ('dateQuery'), urspr. tid ('timeQuery').
4.  Event Details (eventDetails - för CREATE/MODIFY): Titel, ny datumfråga ('dateQuery'), ny tidsfråga ('timeQuery'), beskrivning, färg.
5.  Fler-händelse-operationer: Om instruktionen gäller FLERA händelser (t.ex. "flytta alla möten idag"), generera en SEPARAT operation för VARJE identifierad händelse i 'operations'. Varje 'eventIdentifier.title' ska vara den EXAKTA titeln för den ENKLA ursprungliga händelsen.

HANTERING AV KONFLIKTER/TVETYDIGHETER (t.ex. allergi mot "Äta banan"):
*   Om en begäran krockar med känd information (t.ex. allergi) eller är tvetydig:
    1.  Sätt \`requiresClarification\` till \`true\`.
    2.  Formulera en **ENDA, KORT, DIREKT fråga** i \`clarificationQuestion\`. Exempel: "Ska jag flytta 'Äta banan' trots din allergi?" eller "Vilket möte menar du?". **MAX 150 TECKEN.**
    3.  Sätt \`userConfirmationMessage\` till något **extremt kort**, t.ex. "En fråga:" eller "Förtydliga:".
    4.  Generera **INGA operationer** för den motstridiga/tvetydiga delen förrän användaren svarat.
    5.  **INGA LÅNGA FÖRKLARINGAR, VARNINGAR ELLER FRISKRIVNINGAR.** Bara den korta frågan.

QUERY (användaren frågar om sitt schema):
*   Svara i \`userConfirmationMessage\` med en **kort** lista över relevanta händelser.
*   Om frågan antyder reflektion och du ser en UPPENBAR konflikt (t.ex. alkohol före bilkörning):
    1.  Efter listan, nämn konflikten **extremt kort** i \`userConfirmationMessage\`. Exempel: "...och jag ser 'Vinprovning' precis före 'Köra hem'."
    2.  Ställ en **ENDA, KORT, ÖPPEN fråga** i \`clarificationQuestion\`. Exempel: "Vill du justera något av detta?"
    3.  Sätt \`requiresClarification\` till \`true\`.
    4.  **INGA LÅNGA UTREDNINGAR ELLER VARNINGAR.**
*   Returnera inga CREATE/MODIFY/DELETE operationer för en QUERY.

OLÄMPLIGA BEGÄRANDEN:
*   Om begäran är olämplig, skadlig, oetisk eller inte kalenderrelaterad:
    1.  Sätt \`requiresClarification\` till \`true\`.
    2.  Sätt \`clarificationQuestion\` till: "Jag kan endast hjälpa till med kalenderfrågor. Har du en sådan?".
    3.  Sätt \`userConfirmationMessage\` till "Förfrågan avvisad:".
    4.  **INGA ANDRA KOMMENTARER ELLER DISKUSSIONER.**

Exempel på output vid tvetydighet:
{
  "requiresClarification": true,
  "clarificationQuestion": "Menar du mötet idag kl 10 eller det imorgon kl 14?",
  "userConfirmationMessage": "Förtydliga:"
}

**Returnera ALLTID ett svar som följer NaturalLanguageEventCreationOutputSchema. Följ reglerna ovan strikt.**
**HÅLL ALLA TEXTFÄLT SÅ KORTA SOM MÖJLIGT. FOKUSERA PÅ ATT VARA EN EFFEKTIV KALENDERASSISTENT.**
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
    let output = promptResponse.output; 
    
    console.log("[AI Flow] Raw structured output from orchestratorPrompt:", JSON.stringify(output, null, 2));

    if (!output) { 
        console.warn('[AI Flow] Orchestrator prompt did not return a valid structured output object. Input:', input, 'Full response:', promptResponse);
        return {
            operations: [],
            userConfirmationMessage: "Jag kunde tyvärr inte tolka din förfrågan just nu (internt fel).",
            requiresClarification: true,
            clarificationQuestion: "Kan du formulera om din förfrågan? Jag förstod inte."
        };
    }
    
    // Nödbroms / Safeguard for clarification questions
    if (output.requiresClarification) {
        if (!output.clarificationQuestion || output.clarificationQuestion.trim() === '' || output.clarificationQuestion.length > 150) {
            console.warn(`[AI Flow] Safeguard triggered: AI's clarificationQuestion was invalid or too long. Original: "${output.clarificationQuestion}". Overriding.`);
            output.clarificationQuestion = "Jag är osäker, kan du förtydliga din senaste begäran?";
            // Ensure userConfirmationMessage is also short if we override clarification
            if (!output.userConfirmationMessage || output.userConfirmationMessage.length > 30) {
                 output.userConfirmationMessage = "Förtydliga:";
            }
        }
        // Ensure confirmation message is very short if clarification is required
        if (output.userConfirmationMessage && output.userConfirmationMessage.length > 30) {
            console.warn(`[AI Flow] Safeguard triggered: AI's userConfirmationMessage was too long with clarification. Original: "${output.userConfirmationMessage}". Shortening.`);
            output.userConfirmationMessage = "Förtydliga:";
        }
    }
    
    // Ensure userConfirmationMessage is short even if not clarification, if it's abnormally long
    if (output.userConfirmationMessage && output.userConfirmationMessage.length > 250) { // 250 as a general sanity limit
        console.warn(`[AI Flow] Safeguard triggered: AI's userConfirmationMessage was excessively long. Original: "${output.userConfirmationMessage}". Shortening.`);
        output.userConfirmationMessage = "Din begäran har bearbetats."; // Generic short message
    }


    console.log("[AI Flow] Final processed output:", JSON.stringify(output, null, 2));

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
): Promise<NaturalLanguageEventCreationOutput> { 
  const currentDateStr = format(new Date(), 'yyyy-MM-dd');
  return naturalLanguageEventCreationFlow({ instruction, currentDate: currentDateStr, currentEvents: currentEventsForAI, conversationHistory });
}

    