const REQUEST_LOCAL_PROVIDER_STATUSES = new Set([400, 413, 422]);
const PREFERRED_STRUCTURED_PROVIDERS = Object.freeze(["gemini", "groq"]);
const WORKERS_DAILY_QUOTA_CUE = /(?:daily free allocation|10\s*,?\s*000\s+neurons|used up[^.]{0,80}neurons|daily quota)/i;

export function isRequestLocalProviderFailure(status) {
  return REQUEST_LOCAL_PROVIDER_STATUSES.has(Number(status || 0));
}

export function isWorkersAiDailyQuotaExhaustion(provider, detail = "") {
  return String(provider || "") === "workers-ai" && WORKERS_DAILY_QUOTA_CUE.test(String(detail || ""));
}

export function nextUtcDailyQuotaResetAt(now = Date.now()) {
  const date = new Date(Number(now || Date.now()));
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
}

export function effectiveStructuredProviders({
  configuredProviders = [],
  hardReadyProviders = [],
  softReadyProviders = null
} = {}) {
  const configured = new Set(configuredProviders || []);
  const hardReady = new Set(hardReadyProviders || []);
  const softReady = new Set(Array.isArray(softReadyProviders) ? softReadyProviders : hardReadyProviders || []);
  const usable = (provider) => configured.has(provider) && hardReady.has(provider) && softReady.has(provider);

  const preferred = PREFERRED_STRUCTURED_PROVIDERS.filter(usable);
  if (preferred.length) return preferred;
  if (usable("workers-ai")) return ["workers-ai"];
  return [];
}

export function degradedBuiltInFallbackEligible({
  configuredProviders = [],
  effectiveReadyProviders = []
} = {}) {
  return (configuredProviders || []).length > 0 && (effectiveReadyProviders || []).length === 0;
}

export function emergencyWorkersBrainEligible({
  orderedProviders = [],
  structuredBrainDepth = 0,
  configuredProviders = [],
  workersHardReady = false,
  workersSoftReady = true
} = {}) {
  if ((orderedProviders || []).length) return false;
  if (Number(structuredBrainDepth || 0) <= 0) return false;
  if (!(configuredProviders || []).includes("workers-ai")) return false;
  return Boolean(workersHardReady && workersSoftReady);
}
