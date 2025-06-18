'use server';

/**
 * @fileOverview VisuCal Bildskapar-AI.
 * Automatically generates an image for a calendar event using AI, based on the event title and an optional hint.
 *
 * - generateEventImage - A function that generates an image for a calendar event.
 */

import {ai} from '@/ai/genkit';
import { 
  GenerateEventImageInputSchema, 
  GenerateEventImageOutputSchema, 
  type GenerateEventImageInput, 
  type GenerateEventImageOutput 
} from '@/ai/schemas';


export async function generateEventImage(input: GenerateEventImageInput): Promise<GenerateEventImageOutput> {
  return generateEventImageFlow(input);
}

const generateEventImageFlow = ai.defineFlow(
  {
    name: 'generateEventImageFlow',
    inputSchema: GenerateEventImageInputSchema,
    outputSchema: GenerateEventImageOutputSchema,
  },
  async (input: GenerateEventImageInput): Promise<GenerateEventImageOutput> => {
    if (!input.eventTitle || input.eventTitle.trim() === '') {
      console.warn('Image generation skipped: Event title is empty.');
      return {imageUrl: ''};
    }

    let promptText = `Generate an image for a calendar event titled: "${input.eventTitle}"`;
    if (input.imageHint && input.imageHint.trim() !== '') {
      promptText += `\nImage context/hint: "${input.imageHint}"`;
    }

    console.log(`[Bildskapar-AI Flow] Generating image with prompt: "${promptText}"`);

    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp', 
      prompt: promptText,
      config: {
        responseModalities: ['TEXT', 'IMAGE'], 
      },
    });

    if (media && media.url && media.url.startsWith('data:') && media.url.includes(';base64,') && media.url.split(',')[1]?.length > 0) {
      console.log(`[Bildskapar-AI Flow] Image generated successfully for title: "${input.eventTitle}"`);
      return {imageUrl: media.url};
    } else {
      console.warn('[Bildskapar-AI Flow] Image generation did not return a valid/complete media URL for title:', input.eventTitle, 'Received URL:', media?.url);
      return {imageUrl: ''}; 
    }
  }
);
