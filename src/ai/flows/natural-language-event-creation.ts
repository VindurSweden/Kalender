
// src/ai/flows/natural-language-event-creation.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for creating, modifying, or deleting calendar events using natural language in Swedish.
 * It leverages an orchestrator to interpret user intent and an executor to generate calendar commands.
 *
 * - naturalLanguageEventCreation - A function that handles the natural language event creation process.
 * - NaturalLanguageEventCreationInput - The input type for the naturalLanguageEventCreation function.
 * - NaturalLanguageEventCreationOutput - The return type for the naturalLanguageEventCreation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Define schemas for input and output
const NaturalLanguageEventCreationInputSchema = z.object({
  instruction: z.string().describe('The instruction in natural language (Swedish) to create, modify, or delete a calendar event.'),
});
export type NaturalLanguageEventCreationInput = z.infer<typeof NaturalLanguageEventCreationInputSchema>;

const CalendarCommandSchema = z.object({
  command: z.string().describe('The command to execute on the calendar (e.g., CREATE, MODIFY, DELETE).'),
  eventDetails: z.record(z.any()).describe('The details of the event to create, modify, or delete (e.g., title, date, time, description).'),
});

const NaturalLanguageEventCreationOutputSchema = z.object({
  calendarCommands: z.array(CalendarCommandSchema).describe('An array of calendar commands to execute.'),
  confirmationMessage: z.string().describe('A confirmation message to display to the user in Swedish.'),
});
export type NaturalLanguageEventCreationOutput = z.infer<typeof NaturalLanguageEventCreationOutputSchema>;

// Define tool schemas
const generateCalendarCommands = ai.defineTool(
  {
    name: 'generateCalendarCommands',
    description: 'Generates calendar commands based on user instructions.',
    inputSchema: z.object({
      instruction: z.string().describe('The instruction to create, modify, or delete a calendar event.'),
    }),
    outputSchema: z.array(CalendarCommandSchema),
  },
  async input => {
    // Placeholder implementation - replace with actual command generation logic
    console.log('Generating calendar commands for instruction:', input.instruction);
    // Example: For "Skapa ett möte imorgon kl 14 om projektplanering"
    // This should ideally parse date/time more robustly
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    if (input.instruction.toLowerCase().includes("möte med chefen")) {
       return [
        {
          command: 'CREATE',
          eventDetails: {
            title: 'Möte med chefen',
            date: '2024-07-15',
            time: '10:00',
            description: 'Diskussion om projektets framsteg.',
          },
        },
      ];
    } else if (input.instruction.toLowerCase().includes("projektplanering")) {
       return [
        {
          command: 'CREATE',
          eventDetails: {
            title: 'Projektplanering',
            date: dateStr, 
            time: '14:00',
            description: 'Planeringsmöte för projektet.',
          },
        },
      ];
    }
    // Default or fallback if no specific parsing matches
    return [
      {
        command: 'CREATE',
        eventDetails: {
          title: 'Obestämd Händelse',
          date: dateStr,
          time: '12:00',
          description: 'Automatisk skapad händelse.',
        },
      },
    ];
  }
);

const validateCalendarCommands = ai.defineTool(
  {
    name: 'validateCalendarCommands',
    description: 'Validates calendar commands to ensure they are accurate and safe to execute.',
    inputSchema: z.object({
      calendarCommands: z.array(CalendarCommandSchema).describe('The calendar commands to validate.'),
    }),
    outputSchema: z.boolean(),
  },
  async input => {
    // Placeholder implementation - replace with actual validation logic
    console.log('Validating calendar commands:', input.calendarCommands);
    if (!input.calendarCommands || input.calendarCommands.length === 0) return false;
    for (const command of input.calendarCommands) {
        if (!command.command || !['CREATE', 'MODIFY', 'DELETE'].includes(command.command.toUpperCase())) return false;
        if (!command.eventDetails || typeof command.eventDetails.title !== 'string' || !command.eventDetails.title) return false;
        // Add more specific validation as needed, e.g., date format, time format
    }
    return true; // Assume commands are valid for now
  }
);

// Define the orchestrator prompt
const orchestratorPrompt = ai.definePrompt({
  name: 'orchestratorPrompt',
  tools: [generateCalendarCommands, validateCalendarCommands],
  input: {schema: NaturalLanguageEventCreationInputSchema},
  output: {schema: NaturalLanguageEventCreationOutputSchema},
  prompt: `Du är en kalenderassistent som förstår svenska. Din uppgift är att tolka användarens instruktioner för att skapa, ändra eller ta bort kalenderhändelser. 

Användaren kommer att ge dig en instruktion på svenska. Använd verktyget generateCalendarCommands för att generera kalenderkommandon baserat på instruktionen. Validera sedan kalenderkommandona med verktyget validateCalendarCommands.

Instruktion: {{{instruction}}}

Om valideringen lyckas, svara med kalenderkommandona och ett bekräftelsemeddelande på svenska. 
Om valideringen misslyckas, svara med ett tomt array för calendarCommands och ett meddelande som förklarar att kommandot inte kunde valideras eller var ogiltigt.
Se till att ditt svar alltid följer NaturalLanguageEventCreationOutputSchema.
`,
});

// Define the Genkit flow
const naturalLanguageEventCreationFlow = ai.defineFlow(
  {
    name: 'naturalLanguageEventCreationFlow',
    inputSchema: NaturalLanguageEventCreationInputSchema,
    outputSchema: NaturalLanguageEventCreationOutputSchema,
  },
  async input => {
    const promptResponse = await orchestratorPrompt(input);

    if (!promptResponse || !promptResponse.output) {
        console.warn('Orchestrator prompt did not return a valid structured output. Full response:', promptResponse);
        return {
            calendarCommands: [],
            confirmationMessage: "Jag kunde inte helt tolka din förfrågan. Försök igen eller formulera om dig."
        };
    }
    
    const output = promptResponse.output;

    // Ensure output structure matches the schema even if commands are empty due to validation failure etc.
    return {
        calendarCommands: output.calendarCommands || [],
        confirmationMessage: output.confirmationMessage || "Bearbetning klar, men ingen specifik bekräftelse genererades."
    };
  }
);

/**
 * Handles the natural language event creation process.
 * @param input The input for the naturalLanguageEventCreation function.
 * @returns The output of the naturalLanguageEventCreation function.
 */
export async function naturalLanguageEventCreation(input: NaturalLanguageEventCreationInput): Promise<NaturalLanguageEventCreationOutput> {
  return naturalLanguageEventCreationFlow(input);
}
