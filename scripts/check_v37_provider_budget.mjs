import assert from "node:assert/strict";
import fs from "node:fs";
import {
  preferredStructuredReadyProviders,
  providerCapacityConstrained
} from "../src/provider_failover_v37.js";

const configured = ["gemini", "groq", "workers-ai"];

assert.deepEqual(preferredStructuredReadyProviders({
  configuredProviders: configured,
  hardReadyProviders: ["gemini", "groq", "workers-ai"],
  softReadyProviders: ["gemini", "groq", "workers-ai"]
}), ["gemini", "groq"]);

assert.equal(providerCapacityConstrained({
  configuredProviders: configured,
  hardReadyProviders: ["gemini", "groq", "workers-ai"],
  softReadyProviders: ["gemini", "groq", "workers-ai"]
}), false, "healthy primary pair should permit normal ambient AI generation");

assert.equal(providerCapacityConstrained({
  configuredProviders: configured,
  hardReadyProviders: ["gemini"],
  softReadyProviders: ["gemini"]
}), true, "one recovered primary must be reserved instead of spent on ambient scenes");

assert.equal(providerCapacityConstrained({
  configuredProviders: configured,
  hardReadyProviders: ["workers-ai"],
  softReadyProviders: ["workers-ai"]
}), true, "Workers AI emergency capacity does not mean the preferred provider pool recovered");

assert.equal(providerCapacityConstrained({
  configuredProviders: configured,
  hardReadyProviders: [],
  softReadyProviders: []
}), true, "zero ready primaries is constrained/degraded capacity");

assert.equal(providerCapacityConstrained({
  configuredProviders: ["gemini", "workers-ai"],
  hardReadyProviders: ["gemini"],
  softReadyProviders: ["gemini"]
}), false, "a deployment with only one configured primary must not be permanently constrained");

const hotfix = fs.readFileSync(new URL("../src/index_v37_hotfix.js", import.meta.url), "utf8");
assert.ok(hotfix.includes("humanPriorityProviderBudget: true"));
assert.ok(hotfix.includes("ambientAiCapacityShedding: true"));
assert.ok(hotfix.includes("async refillSceneAi(now = Date.now(), force = false)"));
assert.ok(hotfix.includes("if (this.providerCapacityConstrained(now))"));
assert.ok(hotfix.includes("backgroundAiPlansSuppressed"));
assert.ok(hotfix.includes("queueV37CapacitySheddingAmbient"));
assert.ok(hotfix.includes("if (this.pendingHumans?.length || this.aiQueue?.length) return false"));
assert.ok(hotfix.includes("ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this)"));
assert.ok(hotfix.includes("AI constrained · human-priority · ambient built-in"));
assert.ok(hotfix.includes("return super.refillSceneAi(now, force)"));
assert.ok(hotfix.includes("preferredStructuredReadyProviders: preferredReady"));
assert.ok(hotfix.includes("ambientAiSuppressedWhenConstrained: true"));

console.log("v37 human-priority provider budget regression checks passed");
