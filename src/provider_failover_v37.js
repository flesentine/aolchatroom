const REQUEST_LOCAL_PROVIDER_STATUSES = new Set([400, 413, 422]);

export function isRequestLocalProviderFailure(status) {
  return REQUEST_LOCAL_PROVIDER_STATUSES.has(Number(status || 0));
}

export function degradedBuiltInFallbackEligible({
  configuredProviders = [],
  hardReadyProviders = []
} = {}) {
  return (configuredProviders || []).length > 0 && (hardReadyProviders || []).length === 0;
}

export function emergencyWorkersBrainEligible({
  orderedProviders = [],
  structuredBrainDepth = 0,
  configuredProviders = [],
  workersHardReady = false
} = {}) {
  if ((orderedProviders || []).length) return false;
  if (Number(structuredBrainDepth || 0) <= 0) return false;
  if (!(configuredProviders || []).includes("workers-ai")) return false;
  return Boolean(workersHardReady);
}
