
import { type TolkAIInput as GenkitTolkAIInput, type TolkAIOutput as GenkitTolkAIOutput } from '@/ai/schemas';
import { type FormatPlanOutput as GenkitFormatPlanOutput, SingleCalendarOperationSchema as GenkitSingleCalendarOperationSchema } from '@/ai/schemas';
import { z } from 'zod';

export interface Person {
  id: string;
  name: string;
  color: string;
  bg: string;
  emoji: string;
  speak?: boolean;
}

export type Role = "required" | "helper";

export type DayType = "SchoolDay" | "OffDay" | "FritidsDay";

// TemplateStep now includes bestDurationMin and allowPreemption
export type TemplateStep = {
  key: string;
  personId: "antony" | "maria" | "leia" | "gabriel";
  title: string;
  at?: string; // "HH:MM" (absolut start)
  offsetMin?: number; // alt: relativt
  atByNextDayType?: Partial<Record<DayType, string>>; // kväll styrs av i morgon
  minDurationMin?: number;
  bestDurationMin?: number; // The ideal duration, for calculating "pain-free start"
  fixedStart?: boolean;
  dependsOnKeys?: string[];
  involved?: { personId: string; role: Role }[];
  resource?: string;
  location?: string;
  cluster?: "morning" | "day" | "evening";
  allowPreemption?: boolean; // Can this task be paused and resumed?
};

export type DayProfile = { id: DayType; label: string; steps: TemplateStep[]; };

// Event type now also includes the new properties, inherited from the template
export interface Event {
  id:string;
  personId: string;
  start: string; // ISO8601, mandatory
  end: string;   // ISO8601, now mandatory
  title: string;
  
  // Metadata from template or user edits
  minDurationMin?: number;
  bestDurationMin?: number; // The ideal duration
  fixedStart?: boolean;
  fixedEnd?: boolean; // Added for completeness, can be used by solver
  dependsOn?: string[];
  involved?: { personId: string; role: Role }[];
  resource?: string;
  location?: string;
  cluster?: string;
  allowAlone?: boolean; // Can this be done without any 'required' people?
  allowPreemption?: boolean; // Can this task be paused?
  
  // UI/Legacy fields
  imageUrl?: string;
  challenge?: string; // from user input
  meta?: {
    templateKey?: string;
    dayType?: DayType;
    synthetic?: boolean; // True if it's a fill-in event like "Sover" or "Tillgänglig"
    source?: "user" | "assistant" | "system" | "template";
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

export type Row = { time: number; cells: Map<string, Event> };
export type Override = { startMs?: number; plannedMs?: number };
