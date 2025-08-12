
import { type TolkAIInput as GenkitTolkAIInput, type TolkAIOutput as GenkitTolkAIOutput } from '@/ai/schemas';
import { type FormatPlanOutput as GenkitFormatPlanOutput, SingleCalendarOperationSchema as GenkitSingleCalendarOperationSchema } from '@/ai/schemas';
import { z } from 'zod';

export interface Person {
  id: string;
  name: string;
  color: string;
  bg: string;
  speak?: boolean;
}

// Updated Event type based on the new specification
export interface Event {
  id: string;
  personId: string;
  start: string; // ISO8601, mandatory
  end: string;   // ISO8601, now mandatory
  title: string;
  topic?: string;
  isFamily?: boolean; 
  imageUrl?: string;
  recurrence?: string;
  completed?: boolean;
  challenge?: string;
  presentation?: {
    displayTitle?: string;
  };
  meta?: {
    synthetic?: boolean; // true if created by the assistant
    source?: "user" | "assistant" | "system";
    isContinuation?: boolean; // True if this is a repeated block of a longer event
  };
}


// For AI interaction
export interface AiEvent {
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
}

export interface ConversationMessage {
  id: string;
  sender: 'user' | 'ai' | 'systemInfo' | 'planStep';
  text: string;
  isProcessing?: boolean;
  isError?: boolean;
}

// Schemas for AI flows (from schemas.ts)

export type TolkAIInput = GenkitTolkAIInput;
export type TolkAIOutput = GenkitTolkAIOutput;
export type FormatPlanOutput = GenkitFormatPlanOutput;
export type SingleCalendarOperationType = z.infer<typeof GenkitSingleCalendarOperationSchema>;
