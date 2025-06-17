import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  // Updated to use the user-specified model for orchestration/understanding.
  // This assumes 'googleai/gemini-2.5-pro-preview-0506' is a valid and available model ID
  // for the user's API key and project.
  model: 'googleai/gemini-2.5-pro-preview-0506', 
});
