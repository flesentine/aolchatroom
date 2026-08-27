import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(new URL("../src/index_v37_human_only.js", import.meta.url), "utf8");
const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.ok(worker.includes("async generateBackgroundPlan()"));
assert.ok(worker.includes("ContinuityFallbackChatRoom.prototype.builtInAmbient.call(this)"));
assert.equal(worker.includes("super.generateBackgroundPlan()"), false, "ambient generation must not call model-backed parent planner");
assert.ok(worker.includes("async generateHumanReplan(human)"));
assert.ok(worker.includes("const lines = await super.generateHumanReplan(human)"));
assert.ok(worker.includes("ContinuityFallbackChatRoom.prototype.builtInHumanReply.call(this, human)"));
assert.ok(worker.includes("AI human reply fallback · built-in"));
assert.ok(worker.includes("humanOnlyModelBudget: true"));
assert.ok(worker.includes("ambientModelGenerationDisabled: true"));
assert.ok(worker.includes("humanModelFailureFallsBackBuiltIn: true"));
assert.ok(wrangler.includes('"main": "src/index_v37_human_only.js"'));

console.log("v37 human-only model budget regression checks passed");
