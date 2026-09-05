import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

assert.ok(
  app.includes("const renderedMessageKeys = new Set();"),
  "client must track rendered stable message frames"
);
assert.ok(
  /function renderedMessageKey\(item\)[\s\S]*?Number\(item\?\.at \|\| 0\)[\s\S]*?if \(!Number\.isFinite\(at\) \|\| at <= 0\) return ""/.test(app),
  "render dedupe must require a real server timestamp so ordinary repeated text without identity is not suppressed"
);
assert.ok(
  /function renderedMessageKey\(item\)[\s\S]*?item\?\.source[\s\S]*?item\?\.intent[\s\S]*?item\?\.target[\s\S]*?item\?\.topic[\s\S]*?item\?\.threadId/.test(app),
  "render dedupe key must include debug-visible routing metadata, not only display text"
);
assert.ok(
  /function addLine\(item\)[\s\S]*?renderedMessageKeys\.has\(messageKey\)\) return false/.test(app),
  "addLine must suppress an already-rendered stable frame"
);
assert.ok(
  /row\.dataset\.messageKey = messageKey;[\s\S]*?renderedMessageKeys\.add\(messageKey\)/.test(app),
  "rendered rows must retain their stable key"
);
assert.ok(
  /while \(transcript\.children\.length > 220\)[\s\S]*?renderedMessageKeys\.delete\(oldestKey\)/.test(app),
  "trimmed transcript rows must release their dedupe keys"
);
assert.ok(
  /if \(data\.type === "hello"\)[\s\S]*?transcript\.replaceChildren\(\);[\s\S]*?renderedMessageKeys\.clear\(\)/.test(app),
  "authoritative reconnect history replacement must reset render dedupe state"
);
assert.ok(
  /else if \(data\.type === "message"\)[\s\S]*?addLine\(data\.message\);[\s\S]*?recordCaptureMessage\(data\.message\)/.test(app),
  "live rendering and capture dedupe must remain separate"
);

console.log("Client identical-live-frame display dedupe regression checks passed");
