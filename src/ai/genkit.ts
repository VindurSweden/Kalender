import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  // Updated to use a potentially more advanced model for orchestration/understanding.
  // Please ensure 'googleai/gemini-2.5-flash-preview-0520' is a valid and available model ID.
  // If not, replace it with the correct ID for the model you intend to use,
  // e.g., 'googleai/gemini-1.5-flash-preview-0514' or 'googleai/gemini-1.5-pro-latest'.
  model: 'googleai/gemini-2.5-flash-preview-0520', 
});

