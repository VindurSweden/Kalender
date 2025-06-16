
'use server';

/**
 * @fileOverview Automatically generates an image for a calendar event using AI.
 *
 * - generateEventImage - A function that generates an image for a calendar event.
 * - GenerateEventImageInput - The input type for the generateEventImage function.
 * - GenerateEventImageOutput - The return type for the generateEventImage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateEventImageInputSchema = z.object({
  eventDescription: z
    .string()
    .describe('The description of the calendar event.'),
});
export type GenerateEventImageInput = z.infer<typeof GenerateEventImageInputSchema>;

const GenerateEventImageOutputSchema = z.object({
  imageUrl: z
    .string()
    .describe(
      'The URL of the generated image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.'
    ),
});
export type GenerateEventImageOutput = z.infer<typeof GenerateEventImageOutputSchema>;

export async function generateEventImage(input: GenerateEventImageInput): Promise<GenerateEventImageOutput> {
  return generateEventImageFlow(input);
}

// This prompt definition is not directly used by the ai.generate call in the flow below for image generation,
// as ai.generate with responseModalities: ['IMAGE'] is a more direct way to get images.
// It's kept here for potential future reference or alternative implementations.
const generateEventImagePrompt = ai.definePrompt({
  name: 'generateEventImagePrompt',
  input: {schema: GenerateEventImageInputSchema},
  output: {schema: GenerateEventImageOutputSchema},
  prompt: `You are an AI that generates images for calendar events.

  Based on the event description, generate a relevant image.

  Event Description: {{{eventDescription}}}

  The image should be a visual representation of the event.
  The image url should be returned in the output as a data URI.
  Ensure that the outputted URL is a valid data URI.
  `,
});

const generateEventImageFlow = ai.defineFlow(
  {
    name: 'generateEventImageFlow',
    inputSchema: GenerateEventImageInputSchema,
    outputSchema: GenerateEventImageOutputSchema,
  },
  async input => {
    // Ensure eventDescription is not empty, as it might cause issues with image generation.
    if (!input.eventDescription || input.eventDescription.trim() === '') {
      console.warn('Image generation skipped: Event description is empty.');
      return {imageUrl: ''};
    }

    const {media} = await ai.generate({
      // IMPORTANT: ONLY the googleai/gemini-2.0-flash-exp model is able to generate images. You MUST use exactly this model to generate images.
      model: 'googleai/gemini-2.0-flash-exp',
      prompt: input.eventDescription,
      config: {
        responseModalities: ['TEXT', 'IMAGE'], // MUST provide both TEXT and IMAGE, IMAGE only won't work
      },
    });

    if (media && media.url) {
      return {imageUrl: media.url};
    } else {
      console.warn('Image generation did not return a media URL for description:', input.eventDescription);
      return {imageUrl: ''}; // Return empty string to satisfy schema and prevent crash
    }
  }
);

