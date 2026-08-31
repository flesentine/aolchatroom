export const EXTENDED_PROVIDER_PRIORITY = [
  "gemini",
  "mistral",
  "groq",
  "vercel-ai-gateway",
  "openrouter",
  "workers-ai",
  "huggingface",
  "cerebras",
  "cohere-trial"
];

export const AMBIENT_PROVIDER_PRIORITY = [
  "gemini",
  "mistral",
  "groq",
  "vercel-ai-gateway"
];

export const EXTENDED_ONLY_PROVIDERS = new Set([
  "mistral",
  "vercel-ai-gateway",
  "openrouter",
  "huggingface",
  "cerebras",
  "cohere-trial"
]);

export const PROVIDER_LABELS_V37 = {
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  "vercel-ai-gateway": "Vercel AI Gateway",
  openrouter: "OpenRouter Free",
  "workers-ai": "Workers AI",
  huggingface: "Hugging Face",
  cerebras: "Cerebras",
  "cohere-trial": "Cohere Trial"
};

export const FREE_PROVIDER_ENV = {
  mistral: "MISTRAL_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  huggingface: "HF_TOKEN",
  cerebras: "CEREBRAS_API_KEY",
  "cohere-trial": "COHERE_TRIAL_API_KEY"
};

export function devTrialProvidersAllowed(env = {}) {
  return String(env.ALLOW_DEV_TRIAL_PROVIDERS || "") === "1";
}

export function configuredExtendedProviders(env = {}, inherited = []) {
  const providers = [...new Set(inherited || [])];
  for (const [provider, key] of Object.entries(FREE_PROVIDER_ENV)) {
    if (!env[key]) continue;
    if (provider === "cohere-trial" && !devTrialProvidersAllowed(env)) continue;
    if (!providers.includes(provider)) providers.push(provider);
  }
  return providers;
}

function inPriority(priority, configuredSet, readySet) {
  return priority.filter((provider) => configuredSet.has(provider) && readySet.has(provider));
}

function structuredWorkersBoundary(ordered, structuredGenerationDepth) {
  if (Number(structuredGenerationDepth || 0) <= 0) return ordered;
  const nonWorkers = ordered.filter((provider) => provider !== "workers-ai");
  if (nonWorkers.length) return nonWorkers;
  return ordered.includes("workers-ai") ? ["workers-ai"] : [];
}

export function orderedExtendedProviders({ configured = [], hardReady = [], softReady = [], structuredGenerationDepth = 0 } = {}) {
  const configuredSet = new Set(configured);
  const hardSet = new Set(hardReady);
  const softSet = new Set(softReady);

  const softOrdered = inPriority(EXTENDED_PROVIDER_PRIORITY, configuredSet, softSet)
    .filter((provider) => hardSet.has(provider));
  if (softOrdered.length) return structuredWorkersBoundary(softOrdered, structuredGenerationDepth);

  // Preserve v25's anti-silence rule: a soft output breaker may suppress a bad
  // provider temporarily, but if every hard-healthy provider is soft-suppressed,
  // allow exactly the highest-priority hard-healthy provider to prove recovery.
  const hardOrdered = inPriority(EXTENDED_PROVIDER_PRIORITY, configuredSet, hardSet);
  return structuredWorkersBoundary(hardOrdered.slice(0, 1), structuredGenerationDepth);
}

export function ambientReadyProviders({ configured = [], hardReady = [], softReady = [] } = {}) {
  const configuredSet = new Set(configured);
  const hardSet = new Set(hardReady);
  const softSet = new Set(softReady);
  const ready = AMBIENT_PROVIDER_PRIORITY.filter((provider) =>
    configuredSet.has(provider) && hardSet.has(provider) && softSet.has(provider)
  );

  // Routine ambient chatter is where lower-quality generations can poison the
  // room by inventing facts that later replies must rationalize. While Gemini
  // is healthy it owns ambient generation exclusively. Mistral is the first
  // fallback. Groq is retained only as an anti-silence fallback when neither
  // Gemini nor Mistral is currently usable.
  if (ready.includes("gemini")) return ["gemini"];
  if (ready.includes("mistral")) return ["mistral"];
  if (ready.includes("groq")) return ["groq"];
  if (ready.includes("vercel-ai-gateway")) return ["vercel-ai-gateway"];
  return [];
}

export function providerPoolSummary(env = {}) {
  return {
    mistral: Boolean(env.MISTRAL_API_KEY),
    vercelAiGateway: Boolean(env.AI_GATEWAY_API_KEY),
    openrouter: Boolean(env.OPENROUTER_API_KEY),
    huggingFace: Boolean(env.HF_TOKEN),
    cerebras: Boolean(env.CEREBRAS_API_KEY),
    cohereTrialConfigured: Boolean(env.COHERE_TRIAL_API_KEY),
    cohereTrialEnabled: Boolean(env.COHERE_TRIAL_API_KEY) && devTrialProvidersAllowed(env)
  };
}
