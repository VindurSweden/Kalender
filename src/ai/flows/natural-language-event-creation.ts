
// src/ai/flows/natural-language-event-creation.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for creating, modifying, or deleting calendar events using natural language in Swedish.
 * It acts as an ORCHESTRATOR: interpreting user intent and extracting parameters to be processed by the frontend (Executor).
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
  operations: z.array(SingleCalendarOperationSchema).optional().describe('An array of calendar operations (the PLAN) derived from the instruction. Usually one, but could be more if the user asks for multiple things.'),
  userConfirmationMessage: z.string().optional().describe('A **VERY SHORT** message for the user in Swedish. If clarification is needed, this is an intro like "Förtydliga:". If returning operations, this confirms understanding of intent, e.g., "Okej, jag planerar att...". If a QUERY, this contains the answer. MAX 150 CHARACTERS.'),
  requiresClarification: z.boolean().optional().default(false).describe('Set to true if the AI is unsure or needs more information from the user to proceed confidently. If true, "clarificationQuestion" MUST be populated and "operations" should be empty or not acted upon for the ambiguous part.'),
  clarificationQuestion: z.string().optional().describe('If requiresClarification is true, this field MUST contain **ONE SINGLE, VERY SHORT, and DIRECT question** to ask the user. Example: "Vilket möte menar du?" or "Ska jag fortfarande lägga till \'Äta banan\' trots din allergi?". MAX 150 CHARACTERS.'),
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
  prompt: `Du är VisuCal Orkestrerare, en AI som **ENBART TOLKAR, PLANERAR och FRÅGAR VID OKLARHET**. Du är **EXTREMT KONCIS**. Du hjälper användare att hantera sina kalenderhändelser på svenska genom att omvandla deras önskemål till en strukturerad plan.
Ditt jobb är **INTE** att utföra åtgärder eller bekräfta att något är gjort. Du skapar en plan (operations) eller ställer en förtydligande fråga.

Dagens datum är: {{currentDate}}.

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

DIN UPPGIFT:
1.  TOLKA instruktionen.
2.  OMVANDLA den till en eller flera kalenderoperationer (CREATE, MODIFY, DELETE, QUERY) enligt NaturalLanguageEventCreationOutputSchema. Detta är din **PLAN**.
3.  OM instruktionen är oklar eller om det finns en konflikt (t.ex. allergi mot 'Äta banan'):
    a.  Sätt \`requiresClarification\` till \`true\`.
    b.  Sätt \`userConfirmationMessage\` till en **extremt kort** introduktion, t.ex. "Förtydliga:" eller "En fråga:".
    c.  Formulera en **ENDA, MYCKET KORT, DIREKT fråga** i \`clarificationQuestion\`. Exempel: "Vilket möte menar du?", "Ska 'Äta banan' läggas till trots allergin?". **MAX 150 TECKEN.**
    d.  Generera **INGA operationer** för den tvetydiga delen.
4.  OM instruktionen är en fråga om schemat (QUERY):
    a.  Svara **kortfattat** i \`userConfirmationMessage\`. Exempel: "Idag har du: Möte X kl 10, Lunch kl 12."
    b.  Sätt \`commandType\` till \`QUERY\` i en operation (utan eventDetails/eventIdentifier).
5.  OM instruktionen är tydlig och inga konflikter:
    a.  Sätt \`requiresClarification\` till \`false\`.
    b.  Populate \`operations\` med din plan.
    c.  Sätt \`userConfirmationMessage\` till en **mycket kort** bekräftelse på att du förstått avsikten. Exempel: "Okej, jag planerar att skapa ett möte.", "Förstått, här är planen för att flytta händelsen.". **NÄMN INTE ATT DU HAR UTFÖRT NÅGOT.**
6.  OLÄMPLIGA BEGÄRANDEN:
    a.  Sätt \`requiresClarification\` till \`true\`.
    b.  Sätt \`userConfirmationMessage\` till "Kan ej hjälpa:".
    c.  Sätt \`clarificationQuestion\` till "Jag kan endast hjälpa med kalenderfrågor. Har du en sådan?".

VIKTIGA REGLER FÖR ALL TEXT DU GENERERAR:
*   **VAR YTTERST KONCIS. ALLTID. MAX 150 TECKEN FÖR \`userConfirmationMessage\` OCH \`clarificationQuestion\`.**
*   Inga långa förklaringar, varningar, disclaimers eller upprepningar.
*   Returnera ALLTID ett svar som följer NaturalLanguageEventCreationOutputSchema.
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
    console.log("[AI Orchestrator Flow] Input to orchestratorPrompt:", JSON.stringify(input, null, 2));
    
    const promptResponse = await orchestratorPrompt(input);
    let output = promptResponse.output; 
    
    console.log("[AI Orchestrator Flow] Raw structured output from orchestratorPrompt:", JSON.stringify(output, null, 2));

    if (!output) { 
        console.warn('[AI Orchestrator Flow] Orchestrator prompt did not return a valid structured output object. Input:', input, 'Full response:', promptResponse);
        return {
            operations: [],
            userConfirmationMessage: "Tolkningsfel.", // Keep extremely short
            requiresClarification: true,
            clarificationQuestion: "Kunde inte tolka din förfrågan. Försök igen." // Keep short
        };
    }
    
    // Safeguard for clarification questions
    if (output.requiresClarification) {
        if (!output.clarificationQuestion || output.clarificationQuestion.trim() === '' || output.clarificationQuestion.length > 150) {
            console.warn(`[AI Orchestrator Flow] Safeguard: AI's clarificationQuestion was invalid or too long. Original: "${output.clarificationQuestion}". Overriding.`);
            output.clarificationQuestion = "Jag är osäker, kan du förtydliga?"; // Standard short question
        }
        // Ensure userConfirmationMessage is also very short if we override or if it's too long
        if (!output.userConfirmationMessage || output.userConfirmationMessage.trim() === '' || output.userConfirmationMessage.length > 30) {
            console.warn(`[AI Orchestrator Flow] Safeguard: AI's userConfirmationMessage with clarification was invalid or too long. Original: "${output.userConfirmationMessage}". Overriding/Shortening.`);
            output.userConfirmationMessage = "Förtydliga:";
        }
    } else { // Not requiring clarification
        if (output.userConfirmationMessage && output.userConfirmationMessage.length > 150) {
            console.warn(`[AI Orchestrator Flow] Safeguard: AI's userConfirmationMessage was too long (no clarification). Original: "${output.userConfirmationMessage}". Shortening.`);
            // If operations exist, it's a plan confirmation. If not, it might be a query answer that's too long.
            if (output.operations && output.operations.length > 0) {
                output.userConfirmationMessage = "Förfrågan tolkad.";
            } else {
                // For QUERY results, truncation might be bad. But if it's ridiculously long, we must cap it.
                // This case should ideally be handled by the AI being concise based on the prompt.
                // If it's still too long here, it's a model failure to adhere to prompt length constraints.
                 output.userConfirmationMessage = output.userConfirmationMessage.substring(0, 147) + "...";
            }
        }
    }
    
    // Ensure userConfirmationMessage is provided if no clarification is needed and no operations are returned (e.g. a simple acknowledgement or a very short query answer)
    if (!output.requiresClarification && (!output.operations || output.operations.length === 0) && (!output.userConfirmationMessage || output.userConfirmationMessage.trim() === '')) {
      // This case should be rare if the prompt is followed.
      // If it's a QUERY, the answer should be in userConfirmationMessage.
      // If it's not a QUERY and no ops, it might be a failed interpretation that didn't trigger clarification.
      console.warn("[AI Orchestrator Flow] Safeguard: No clarification, no operations, and no confirmation message. Setting a default.");
      output.userConfirmationMessage = "Förfrågan mottagen.";
    }


    console.log("[AI Orchestrator Flow] Final processed output to be sent to UI:", JSON.stringify(output, null, 2));

    return {
        operations: output.operations || [], 
        userConfirmationMessage: output.userConfirmationMessage || undefined, // Explicitly allow undefined if AI omits and not caught by safeguards
        requiresClarification: output.requiresClarification ?? false, 
        clarificationQuestion: output.clarificationQuestion 
    };
  }
);

/**
 * Orchestrates natural language event creation.
 * Interprets user instruction and returns a plan or a clarification question.
 * @param instruction The user's instruction in Swedish.
 * @param currentEventsForAI Current calendar events for context.
 * @param conversationHistory Previous messages for context.
 * @returns A promise that resolves to the orchestrator's output.
 */
export async function naturalLanguageEventCreation(
  instruction: string, 
  currentEventsForAI: AiEventType[],
  conversationHistory: ConversationMessageType[]
): Promise<NaturalLanguageEventCreationOutput> { 
  const currentDateStr = format(new Date(), 'yyyy-MM-dd');
  return naturalLanguageEventCreationFlow({ instruction, currentDate: currentDateStr, currentEvents: currentEventsForAI, conversationHistory });
}

    