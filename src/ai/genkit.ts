import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * Initializes and configures the Genkit AI instance.
 *
 * The `googleAI()` plugin is used, which will automatically look for
 * the GOOGLE_API_KEY environment variable.
 *
 * The default model is set to 'googleai/gemini-1.5-flash-latest' for
 * general text-based AI tasks due to its balance of capability and cost.
 * Specific flows (like image generation) may override this by specifying
 * a different model.
 */
export const ai = genkit({
  plugins: [
    googleAI(), // This plugin will use the GOOGLE_API_KEY from the environment.
  ],
  // Default model for text generation, chosen for capability and cost-effectiveness.
  model: 'googleai/gemini-1.5-flash-latest',
});
