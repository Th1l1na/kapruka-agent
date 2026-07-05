import { anthropic } from "@ai-sdk/anthropic";

/**
 * Model selection for the gift agent.
 *
 * claude-haiku-4-5 via @ai-sdk/anthropic. The provider reads the API key from
 * ANTHROPIC_API_KEY (see .env.example). Kept behind one export so later sprints
 * can swap models or add tiering in a single place.
 */
export const model = anthropic("claude-haiku-4-5");
