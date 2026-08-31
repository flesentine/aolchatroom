import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EXTENDED_PROVIDER_PRIORITY,
  AMBIENT_PROVIDER_PRIORITY,
  EXTENDED_ONLY_PROVIDERS,
  configuredExtendedProviders,
  orderedExtendedProviders,
  ambientReadyProviders
} from "../src/free_provider_pool_v37.js";

assert.deepEqual(EXTENDED_PROVIDER_PRIORITY.slice(0, 4), ["gemini", "mistral", "groq", "vercel-ai-gateway"]);
for (const provider of ["openrouter", "huggingface", "cerebras", "cohere-trial"]) {
  assert.ok(EXTENDED_PROVIDER_PRIORITY.includes(provider));
  assert.ok(EXTENDED_ONLY_PROVIDERS.has(provider));
}
assert.deepEqual(AMBIENT_PROVIDER_PRIORITY, ["gemini", "mistral", "groq", "vercel-ai-gateway"]);

const configured = configuredExtendedProviders({
  MISTRAL_API_KEY: "x",
  AI_GATEWAY_API_KEY: "x",
  OPENROUTER_API_KEY: "x",
  HF_TOKEN: "x",
  CEREBRAS_API_KEY: "x",
  COHERE_TRIAL_API_KEY: "x"
}, ["gemini", "groq", "workers-ai"]);
for (const provider of ["mistral", "vercel-ai-gateway", "openrouter", "huggingface", "cerebras"]) assert.ok(configured.includes(provider));
assert.equal(configured.includes("cohere-trial"), false, "Cohere trial must stay disabled in production by default");

const devConfigured = configuredExtendedProviders({ COHERE_TRIAL_API_KEY: "x", ALLOW_DEV_TRIAL_PROVIDERS: "1" }, []);
assert.ok(devConfigured.includes("cohere-trial"));

const humanPrimaryOrder = orderedExtendedProviders({
  configured: ["gemini", "groq", "mistral"],
  hardReady: ["gemini", "groq", "mistral"],
  softReady: ["gemini", "groq", "mistral"],
  structuredGenerationDepth: 1
});
assert.deepEqual(humanPrimaryOrder, ["gemini", "mistral", "groq"], "human-facing routing must prefer Gemini, then Mistral, before Groq");

const ordered = orderedExtendedProviders({
  configured: ["gemini", "groq", "mistral", "vercel-ai-gateway", "openrouter", "workers-ai", "huggingface", "cerebras"],
  hardReady: ["mistral", "openrouter", "workers-ai", "cerebras"],
  softReady: ["mistral", "openrouter", "workers-ai", "cerebras"],
  structuredGenerationDepth: 1
});
assert.deepEqual(ordered, ["mistral", "openrouter", "cerebras"], "Workers AI remains emergency-only while other structured providers are ready");

const emergencyWorkers = orderedExtendedProviders({
  configured: ["workers-ai"], hardReady: ["workers-ai"], softReady: ["workers-ai"], structuredGenerationDepth: 1
});
assert.deepEqual(emergencyWorkers, ["workers-ai"]);

const softSuppressedRecovery = orderedExtendedProviders({
  configured: ["mistral", "openrouter"],
  hardReady: ["mistral", "openrouter"],
  softReady: [],
  structuredGenerationDepth: 1
});
assert.deepEqual(softSuppressedRecovery, ["mistral"], "all-soft-suppressed must still allow exactly one hard-healthy recovery probe");

const ambientGeminiPrimary = ambientReadyProviders({
  configured: ["gemini", "groq", "mistral", "vercel-ai-gateway"],
  hardReady: ["gemini", "groq", "mistral", "vercel-ai-gateway"],
  softReady: ["gemini", "groq", "mistral", "vercel-ai-gateway"]
});
assert.deepEqual(ambientGeminiPrimary, ["gemini"], "healthy Gemini must exclusively own routine ambient generation");

const ambientMistralFallback = ambientReadyProviders({
  configured: ["groq", "mistral", "vercel-ai-gateway"],
  hardReady: ["groq", "mistral", "vercel-ai-gateway"],
  softReady: ["groq", "mistral", "vercel-ai-gateway"]
});
assert.deepEqual(ambientMistralFallback, ["mistral"], "Mistral must be the first ambient fallback when Gemini is unavailable");

const ambientGroqEmergency = ambientReadyProviders({
  configured: ["groq"], hardReady: ["groq"], softReady: ["groq"]
});
assert.deepEqual(ambientGroqEmergency, ["groq"], "Groq remains an anti-silence ambient fallback, not a routine provider");

const ambient = ambientReadyProviders({
  configured: ["mistral", "vercel-ai-gateway", "openrouter", "huggingface", "cerebras"],
  hardReady: ["mistral", "vercel-ai-gateway", "openrouter", "huggingface", "cerebras"],
  softReady: ["mistral", "vercel-ai-gateway", "openrouter", "huggingface", "cerebras"]
});
assert.deepEqual(ambient, ["mistral"], "ambient generation should use one best ready provider instead of rotating across the pool");
assert.deepEqual(ambientReadyProviders({ configured: ["mistral"], hardReady: ["mistral"], softReady: [] }), [], "ambient chatter must honor the soft breaker");

const runtime = fs.readFileSync(new URL("../src/index_v37_free_providers.js", import.meta.url), "utf8");
for (const needle of [
  "https://api.mistral.ai/v1/chat/completions",
  "https://ai-gateway.vercel.sh/v1/chat/completions",
  "https://openrouter.ai/api/v1/chat/completions",
  "https://router.huggingface.co/v1/chat/completions",
  "https://api.cerebras.ai/v1/chat/completions",
  "https://api.cohere.com/v2/chat"
]) assert.ok(runtime.includes(needle), `missing provider endpoint: ${needle}`);
assert.ok(runtime.includes('return super.callProvider(provider, prompt, maxTokens)'));
assert.ok(runtime.includes("cohereTrialProductionDisabledByDefault: true"));
assert.ok(runtime.includes('return super.say(from, text, kind, "ai", { ...meta, aiProvider: source, provider: source })'), "new provider lines must remain AI-classified in inherited realism/memory layers");
assert.ok(runtime.includes("async fetch(request)"));
assert.ok(runtime.includes('url.pathname !== "/ai-status"'), "AI status must expose new-provider health");
assert.equal(runtime.includes('reasoning_effort: "none"'), false, "do not send provider-specific unsupported reasoning fields by default");

console.log("v37 extended free-provider pool regression checks passed");
