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
      'The URL of the generated image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.' // escaping backslashes
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

  Based on the event description, generate a relevant image.

  Event Description: {{{eventDescription}}}

  The image should be a visual representation of the event.
  The image url should be returned in the output as a data URI.
  Ensure that the outputted URL is a valid data URI.
  `, // Ensure that the outputted URL is a valid data URI.
});

const generateEventImageFlow = ai.defineFlow(
  {
    name: 'generateEventImageFlow',
    inputSchema: GenerateEventImageInputSchema,
    outputSchema: GenerateEventImageOutputSchema,
  },
  async input => {
    const {media} = await ai.generate({
      // IMPORTANT: ONLY the googleai/gemini-2.0-flash-exp model is able to generate images. You MUST use exactly this model to generate images.
      model: 'googleai/gemini-2.0-flash-exp',

      // simple prompt
      prompt: input.eventDescription,

      config: {
        responseModalities: ['TEXT', 'IMAGE'], // MUST provide both TEXT and IMAGE, IMAGE only won't work
      },
    });
    return {imageUrl: media.url!};
  }
);
