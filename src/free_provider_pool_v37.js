export const EXTENDED_PROVIDER_PRIORITY = [
  "gemini",
  "groq",
  "mistral",
  "vercel-ai-gateway",
  "openrouter",
  "workers-ai",
  "huggingface",
  "cerebras",
  "cohere-trial"
];

export const AMBIENT_PROVIDER_PRIORITY = [
  "gemini",
  "groq",
  "mistral",
  "vercel-ai-gateway"
];

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

export function orderedExtendedProviders({ configured = [], hardReady = [], softReady = [], structuredGenerationDepth = 0 } = {}) {
  const configuredSet = new Set(configured);
  const hardSet = new Set(hardReady);
  const softSet = new Set(softReady);
  const ordered = EXTENDED_PROVIDER_PRIORITY.filter((provider) => configuredSet.has(provider) && hardSet.has(provider) && softSet.has(provider));

  if (Number(structuredGenerationDepth || 0) > 0) {
    const nonWorkers = ordered.filter((provider) => provider !== "workers-ai");
    if (nonWorkers.length) return nonWorkers;
    if (ordered.includes("workers-ai")) return ["workers-ai"];
  }
  return ordered;
}

export function ambientReadyProviders({ configured = [], hardReady = [], softReady = [] } = {}) {
  const configuredSet = new Set(configured);
  const hardSet = new Set(hardReady);
  const softSet = new Set(softReady);
  return AMBIENT_PROVIDER_PRIORITY.filter((provider) => configuredSet.has(provider) && hardSet.has(provider) && softSet.has(provider));
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
