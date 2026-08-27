import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EXTENDED_PROVIDER_PRIORITY,
  AMBIENT_PROVIDER_PRIORITY,
  configuredExtendedProviders,
  orderedExtendedProviders,
  ambientReadyProviders
} from "../src/free_provider_pool_v37.js";

assert.deepEqual(EXTENDED_PROVIDER_PRIORITY.slice(0, 4), ["gemini", "groq", "mistral", "vercel-ai-gateway"]);
assert.ok(EXTENDED_PROVIDER_PRIORITY.includes("openrouter"));
assert.ok(EXTENDED_PROVIDER_PRIORITY.includes("huggingface"));
assert.ok(EXTENDED_PROVIDER_PRIORITY.includes("cerebras"));
assert.ok(EXTENDED_PROVIDER_PRIORITY.includes("cohere-trial"));
assert.deepEqual(AMBIENT_PROVIDER_PRIORITY, ["gemini", "groq", "mistral", "vercel-ai-gateway"]);

const configured = configuredExtendedProviders({
  MISTRAL_API_KEY: "x",
  AI_GATEWAY_API_KEY: "x",
  OPENROUTER_API_KEY: "x",
  HF_TOKEN: "x",
  CEREBRAS_API_KEY: "x",
  COHERE_TRIAL_API_KEY: "x"
}, ["gemini", "groq", "workers-ai"]);
assert.ok(configured.includes("mistral"));
assert.ok(configured.includes("vercel-ai-gateway"));
assert.ok(configured.includes("openrouter"));
assert.ok(configured.includes("huggingface"));
assert.ok(configured.includes("cerebras"));
assert.equal(configured.includes("cohere-trial"), false, "Cohere trial must stay disabled in production by default");

const devConfigured = configuredExtendedProviders({ COHERE_TRIAL_API_KEY: "x", ALLOW_DEV_TRIAL_PROVIDERS: "1" }, []);
assert.ok(devConfigured.includes("cohere-trial"));

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

const ambient = ambientReadyProviders({
  configured: ["mistral", "vercel-ai-gateway", "openrouter", "huggingface", "cerebras"],
  hardReady: ["mistral", "vercel-ai-gateway", "openrouter", "huggingface", "cerebras"],
  softReady: ["mistral", "vercel-ai-gateway", "openrouter", "huggingface", "cerebras"]
});
assert.deepEqual(ambient, ["mistral", "vercel-ai-gateway"], "tiny/trial free pools must not be spent on ambient chatter");

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

console.log("v37 extended free-provider pool regression checks passed");
