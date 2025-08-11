

export interface Person {
  id: string;
  name: string;
  color: string;
  bg: string;
  speak?: boolean;
}

export interface EventItem {
  id: string;
  title: string;
  personId: string;
  start: string; // ISO format
  end: string;   // ISO format
  isFamily?: boolean;
  imageUrl?: string;
  recurrence?: string;
  completed?: boolean;
  challenge?: string;
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
import { type TolkAIInput as GenkitTolkAIInput, type TolkAIOutput as GenkitTolkAIOutput } from '@/ai/schemas';
import { type FormatPlanOutput as GenkitFormatPlanOutput } from '@/ai/schemas';

export type TolkAIInput = GenkitTolkAIInput;
export type TolkAIOutput = GenkitTolkAIOutput;
export type FormatPlanOutput = GenkitFormatPlanOutput;
