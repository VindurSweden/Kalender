'use server';
/**
 * @fileOverview Shared Zod schemas for AI flows.
 */
import {z} from 'genkit';

// Schema for events passed to AI for context (e.g., via tools)
export const AiEventSchema = z.object({
  title: z.string().describe("Händelsens titel."),
  date: z.string().describe("Händelsens datum (YYYY-MM-DD)."),
  startTime: z.string().optional().describe("Händelsens starttid (HH:MM)."),
});
export type AiEventType = z.infer<typeof AiEventSchema>;

// For identifying the event to modify/delete
export const EventIdentifierSchema = z.object({
  title: z.string().optional().describe("The current title of the event to find. Example: 'Tandläkarbesök', 'Budgetplanering'. This should be the title of ONE specific event."),
  dateQuery: z.string().optional().describe("A fuzzy date/time query for the event to find, as mentioned by the user. Example: 'idag', 'imorgon', 'nästa vecka', 'den 10e'."),
  timeQuery: z.string().optional().describe("The current start time query (e.g., 'kl 10', '11:30') for the event to find. Use this if title and dateQuery are not unique enough, referencing the event's original start time."),
});

// For details of a new event or changes to an existing one
export const EventDetailsSchema = z.object({
  title: z.string().optional().describe("The new title for the event. Example: 'Lunch med Kalle'."),
  dateQuery: z.string().optional().describe("The new date query in natural language. Example: 'nästa fredag', '15 augusti', 'om en vecka'."),
  timeQuery: z.string().optional().describe("The new time query in natural language. Example: 'kl 14', 'på eftermiddagen', '10:30'."),
  description: z.string().optional().describe("The new description for the event."),
  color: z.string().optional().describe("A hex color code for the event, if specified or inferred.")
});

export const SingleCalendarOperationSchema = z.object({
  commandType: z.enum(['CREATE', 'MODIFY', 'DELETE', 'QUERY']).describe("The type of operation: CREATE, MODIFY, DELETE, or QUERY (if the user is asking about their schedule)."),
  eventIdentifier: EventIdentifierSchema.optional().describe("Details to identify the event for MODIFY or DELETE operations. This should be populated if commandType is MODIFY or DELETE. Include original title, dateQuery, and timeQuery if needed for uniqueness."),
  eventDetails: EventDetailsSchema.optional().describe("Details for the event to be CREATED or MODIFIED. This should be populated if commandType is CREATE or MODIFY."),
});
export type SingleCalendarOperationType = z.infer<typeof SingleCalendarOperationSchema>;

// Schema for conversation history messages
export const ConversationMessageSchema = z.object({
  sender: z.enum(['user', 'ai']).describe("Vem som skickade meddelandet ('user' eller 'ai')."),
  text: z.string().describe("Textinnehållet i meddelandet."),
});
export type ConversationMessageType = z.infer<typeof ConversationMessageSchema>;

// Schemas for FormatPlanFlow
export const FormatPlanInputSchema = z.object({
  planDescription: z
    .string()
    .describe('A natural language description of the calendar operations to perform, provided by the Tolk-AI.'),
  currentDate: z.string().describe('The current date in YYYY-MM-DD format, for context if the plan description contains relative dates not fully resolved by Tolk-AI.'),
});
export type FormatPlanInput = z.infer<typeof FormatPlanInputSchema>;

export const FormatPlanOutputSchema = z.object({
  operations: z
    .array(SingleCalendarOperationSchema)
    .optional()
    .describe('An array of calendar operations (the structured PLAN) derived from the planDescription. Should be empty if no valid operations could be parsed.'),
});
export type FormatPlanOutput = z.infer<typeof FormatPlanOutputSchema>;

// Schemas for GenerateEventImageFlow
export const GenerateEventImageInputSchema = z.object({
  eventTitle: z
    .string()
    .describe('The title of the calendar event.'),
  imageHint: z
    .string()
    .optional()
    .describe('An optional hint or additional context for the image generation (e.g., "en glad hund", "ett professionellt möte").'),
});
export type GenerateEventImageInput = z.infer<typeof GenerateEventImageInputSchema>;

export const GenerateEventImageOutputSchema = z.object({
  imageUrl: z
    .string()
    .describe(
      'The URL of the generated image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.'
    ),
});
export type GenerateEventImageOutput = z.infer<typeof GenerateEventImageOutputSchema>;

// Schemas for TolkAI (NaturalLanguageEventCreation)
export const TolkAIInputSchema = z.object({
  instruction: z.string().describe('The instruction in natural language (Swedish).'),
  currentDate: z.string().describe('The current date in YYYY-MM-DD HH:MM format, for context.'),
  allCalendarEvents: z.array(AiEventSchema).describe('A complete list of all current calendar events. The AI will use a tool to query this list if needed.'), // This will be passed to the tool context
  conversationHistory: z.array(ConversationMessageSchema).optional().describe("The previous conversation for context."),
});
export type TolkAIInput = z.infer<typeof TolkAIInputSchema>;

export const TolkAIOutputSchema = z.object({
  planDescription: z
    .string()
    .optional()
    .describe("A natural language description of the plan for Planformaterar-AI. Only populated if not requiresClarification and the AI intends for actions to be taken."),
  imageHint: z
    .string()
    .optional()
    .describe("A hint for image generation if applicable (e.g., 'en glad hund', 'ett professionellt möte'). This hint is generated by the Tolk-AI."),
  userFeedbackMessage: z
    .string()
    .describe("A message to show to the user. This could be a direct answer to a QUERY, a confirmation of understanding the intent before plan execution, or an intro to a clarification question. Should be concise."),
  requiresClarification: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set to true if the AI is unsure or needs more information.'),
  clarificationQuestion: z
    .string()
    .optional()
    .describe('If requiresClarification is true, this field MUST contain ONE SINGLE, VERY SHORT, and DIRECT question. MAX 150 CHARACTERS.'),
});
export type TolkAIOutput = z.infer<typeof TolkAIOutputSchema>;
