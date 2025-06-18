'use server';
/**
 * @fileOverview Development server entry point for Genkit.
 * This file imports all flows that should be runnable by the Genkit
 * development server. It also configures dotenv to load environment
 * variables from a .env file.
 */
import { config } from 'dotenv';
config(); // Load environment variables from .env file

// Import all your flow files here
import '@/ai/flows/generate-event-image.ts';
import '@/ai/flows/natural-language-event-creation.ts';
