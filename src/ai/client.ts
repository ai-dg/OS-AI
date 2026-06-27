import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;

export const hasApiKey = Boolean(apiKey);

/**
 * Browser-side Anthropic provider. The `anthropic-dangerous-direct-browser-access`
 * header lets the API accept calls straight from the page — acceptable for a
 * local demo only, since the key is shipped to the client.
 */
export const anthropic = createAnthropic({
  apiKey: apiKey ?? "missing-key",
  headers: {
    "anthropic-dangerous-direct-browser-access": "true",
  },
});

export const MODEL = "claude-sonnet-4-6";
