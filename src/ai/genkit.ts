import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * Initializes and configures the Genkit AI instance.
 *
 * The `googleAI()` plugin is used, which will automatically look for
 * the GOOGLE_API_KEY environment variable.
 *
 * The default model is set to 'googleai/gemini-1.5-flash-latest'.
 * Specific flows may override this by specifying a different model.
 * For example, the Tolk-AI uses a more advanced model for better understanding,
 * and the Planformaterar-AI uses this default for precise JSON generation.
 */
export const ai = genkit({
  plugins: [
    googleAI(), // This plugin will use the GOOGLE_API_KEY from the environment.
  ],
  // Default model, good for tasks like JSON formatting or less complex generation.
  model: 'googleai/gemini-1.5-flash-latest', 
});
