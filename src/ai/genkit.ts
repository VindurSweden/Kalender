import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  // Updated to use a cost-effective and capable Flash model for orchestration.
  model: 'googleai/gemini-1.5-flash-latest', 
});
