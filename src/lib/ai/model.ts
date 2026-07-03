import { google } from "@ai-sdk/google";

/**
 * Model selection for the gift agent.
 *
 * gemini-2.5-flash via @ai-sdk/google. The provider reads the API key from
 * GOOGLE_GENERATIVE_AI_API_KEY (see .env.example). Kept behind one export so
 * later sprints can swap models or add tiering in a single place.
 */
export const model = google("gemini-2.5-flash");
