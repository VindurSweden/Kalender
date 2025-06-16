
'use server';

/**
 * @fileOverview Automatically generates an image for a calendar event using AI, based on the event title.
 *
 * - generateEventImage - A function that generates an image for a calendar event.
 * - GenerateEventImageInput - The input type for the generateEventImage function.
 * - GenerateEventImageOutput - The return type for the generateEventImage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateEventImageInputSchema = z.object({
  eventTitle: z
    .string()
    .describe('The title of the calendar event.'),
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

const generateEventImagePrompt = ai.definePrompt({
  name: 'generateEventImagePrompt',
  input: {schema: GenerateEventImageInputSchema},
  output: {schema: GenerateEventImageOutputSchema},
  prompt: `You are an AI that generates images for calendar events.

  Based on the event title, generate a relevant image.

  Event Title: {{{eventTitle}}}

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
    if (!input.eventTitle || input.eventTitle.trim() === '') {
      console.warn('Image generation skipped: Event title is empty.');
      return {imageUrl: ''};
    }

    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp',
      prompt: `Generate an image for a calendar event titled: "${input.eventTitle}"`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'], 
      },
    });

    if (media && media.url) {
      return {imageUrl: media.url};
    } else {
      console.warn('Image generation did not return a media URL for title:', input.eventTitle);
      return {imageUrl: ''}; 
    }
  }
);
