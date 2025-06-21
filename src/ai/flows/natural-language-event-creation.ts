
'use server';
/**
 * @fileOverview VisuCal Tolk-AI (Orchestrator).
 * This AI flow interprets user's natural language instructions in Swedish.
 * It understands context, uses the provided calendar events list,
 * and generates a high-level plan in natural language for the Planformaterar-AI,
 * or asks clarifying questions.
 *
 * - interpretUserInstruction - Main function to call this flow.
 */

import {ai} from '@/ai/genkit';
import { 
  TolkAIInputSchema,
  TolkAIOutputSchema,
  type TolkAIInput,
  type TolkAIOutput,
} from '@/ai/schemas';
import { json } from 'genkit';


// Define the prompt at the top level to avoid runtime definition errors.
const tolkPrompt = ai.definePrompt({
  name: 'visuCalTolkPrompt',
  input: {schema: TolkAIInputSchema},
  output: {schema: TolkAIOutputSchema},
  model: 'googleai/gemini-2.5-flash', 
  config: {
    temperature: 0.5, 
    safetySettings: [ 
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `Du är VisuCal Tolk-AI, en intelligent, koncis och hjälpsam kalenderassistent.
Din uppgift är att:
1.  FÖRSTÅ användarens instruktion på svenska.
2.  ANVÄND DEN MEDSKICKADE LISTAN över kalenderhändelser för att svara på frågor om användarens schema, eller för att verifiera en händelse innan du planerar en ändring/borttagning.
3.  AVGÖR ANVÄNDARENS AVSIKT: Skapa (CREATE), Ändra (MODIFY), Ta bort (DELETE), eller Fråga (QUERY).
4.  OM INSTRUKTIONEN ÄR TYDLIG och inga konflikter och avsikten är CREATE, MODIFY eller DELETE:
    a.  Svara först med en kort bekräftelse i \`userFeedbackMessage\`. Exempel: "Okej, jag förstår. Jag skapar en plan för det.", "Förstått, jag ska försöka flytta mötet."
    b.  Formulera sedan en **planDescription** på naturlig svenska som beskriver de åtgärder som ska utföras. Exempel: "Skapa ett möte 'Lunch med Kalle' imorgon kl 12 med beskrivning 'Projekt X'. Bildhint: en glad hund." Denna text skickas vidare till Planformaterar-AI:n. Inkludera eventuell bildhint i slutet, tydligt markerad.
    c.  Extrahera en eventuell **imageHint** från din planDescription om den finns.
    d.  Sätt **requiresClarification** till false.
5.  OM ANVÄNDAREN STÄLLER EN FRÅGA (QUERY) som du kan svara på (baserat på den medskickade kontexten):
    a.  Svara på frågan direkt och koncis i **userFeedbackMessage**. Exempel: "Idag har du: Möte X kl 10, Lunch kl 12."
    b.  Sätt **planDescription** till en tom sträng.
    c.  Sätt **requiresClarification** till false.
6.  OM INSTRUKTIONEN ÄR OKLAR, TVETYDIG, eller om det finns en potentiell KONFLIKT:
    a.  Sätt **requiresClarification** till true.
    b.  Formulera en **ENDA, MYCKET KORT OCH DIREKT fråga** i **clarificationQuestion** för att lösa oklarheten. MAX 150 TECKEN.
    c.  Sätt **userFeedbackMessage** till en extremt kort introduktion, t.ex. "Förtydliga:", "En fundering:".
    d.  Generera INGEN **planDescription**.
7.  OLÄMPLIGA BEGÄRANDEN: Svara artigt i **userFeedbackMessage** att du endast kan hjälpa med kalenderfrågor, sätt **requiresClarification** till true, och ställ en kort fråga i **clarificationQuestion** som "Har du en kalenderfråga?".

VIKTIGA REGLER:
*   **VAR YTTERST KONCIS i all text du genererar för användaren (\`userFeedbackMessage\`, \`clarificationQuestion\`).**
*   Använd dagens datum och tid ({{currentDate}}) som referens för relativa tidsangivelser.
*   Använd information från konversationshistoriken och listan med händelser för att ge bästa möjliga hjälp.
*   Om du genererar en \`planDescription\`, se till att den är en fullständig, naturlig språkbeskrivning av *alla* steg som behöver tas, inklusive eventuell \`imageHint\`.

Kontext:
Dagens datum och tid: {{currentDate}}
{{#if allCalendarEvents}}
Här är en lista över kända kalenderhändelser som du kan använda som kontext:
{{{json allCalendarEvents}}}
---
{{/if}}
{{#if conversationHistory.length}}
Konversationshistorik (senaste först):
{{#each conversationHistory}}
{{this.sender}}: {{this.text}}
{{/each}}
----
{{/if}}

ANVÄNDARINSTRUKTION: "{{instruction}}"
`,
});


export async function interpretUserInstruction(
  input: TolkAIInput
): Promise<TolkAIOutput> { 
  return tolkAIFlow(input);
}

const tolkAIFlow = ai.defineFlow(
  {
    name: 'tolkAIFlow',
    inputSchema: TolkAIInputSchema,
    outputSchema: TolkAIOutputSchema,
  },
  async (input: TolkAIInput): Promise<TolkAIOutput> => {
    
    console.log("[Tolk-AI Flow] Input to Tolk-AI prompt. Instruction:", input.instruction, "Current Date:", input.currentDate);
    if (input.conversationHistory && input.conversationHistory.length > 0) {
      const formattedHistory = input.conversationHistory.map(m => 
        `[${m.sender === 'user' ? 'Användare' : 'AI'}]: ${m.text.substring(0, 100)}${m.text.length > 100 ? "..." : ""}`
      ).join('\n');
      console.log("[Tolk-AI Flow] Conversation History (last 10 lines):\n", formattedHistory);
    }
        
    const promptResponse = await tolkPrompt(input);
    let output = promptResponse.output; 
    
    console.log("[Tolk-AI Flow] Raw structured output from Tolk-AI prompt:", JSON.stringify(output, null, 2));

    if (!output) { 
        console.warn('[Tolk-AI Flow] Tolk-AI prompt did not return a valid structured output object. Input:', input, 'Full response:', promptResponse);
        return {
            userFeedbackMessage: "Tolkningsfel.",
            requiresClarification: true,
            clarificationQuestion: "Kunde inte tolka din förfrågan. Försök igen."
        };
    }
    
    // Safeguard against malformed clarification questions
    if (output.requiresClarification) {
        if (!output.clarificationQuestion || output.clarificationQuestion.trim() === '' || output.clarificationQuestion.length > 150) {
            console.warn(`[Tolk-AI Flow] Safeguard: AI's clarificationQuestion was invalid or too long. Original: "${output.clarificationQuestion}". Overriding.`);
            output.clarificationQuestion = "Jag är osäker, kan du förtydliga din senaste begäran?";
        }
        if (!output.userFeedbackMessage || output.userFeedbackMessage.trim() === '' || output.userFeedbackMessage.length > 50) { 
             console.warn(`[Tolk-AI Flow] Safeguard: AI's userFeedbackMessage with clarification was invalid or too long. Original: "${output.userFeedbackMessage}". Overriding.`);
            output.userFeedbackMessage = "Förtydliga:";
        }
    } else {
        if (output.userFeedbackMessage && output.userFeedbackMessage.length > 200) { 
            console.warn(`[Tolk-AI Flow] Safeguard: AI's userFeedbackMessage was too long (no clarification). Original: "${output.userFeedbackMessage}". Shortening.`);
            output.userFeedbackMessage = output.userFeedbackMessage.substring(0, 197) + "...";
        }
    }
    
    if (!output.userFeedbackMessage || output.userFeedbackMessage.trim() === '') {
        console.warn("[Tolk-AI Flow] Safeguard: No userFeedbackMessage provided by AI. Setting a default.");
        output.userFeedbackMessage = output.requiresClarification ? "Förtydliga:" : "Jag har mottagit din förfrågan och skapar en plan.";
    }

    console.log("[Tolk-AI Flow] Final processed output to be sent to UI/Formatter:", JSON.stringify(output, null, 2));

    return {
        planDescription: output.planDescription,
        imageHint: output.imageHint,
        userFeedbackMessage: output.userFeedbackMessage,
        requiresClarification: output.requiresClarification ?? false, 
        clarificationQuestion: output.clarificationQuestion 
    };
  }
);
