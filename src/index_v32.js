import baseWorker, { ChatRoom as StoryChatRoom } from "./index_v31.js";
import { CHARACTERS, getCharacter } from "./characters.js";
import { simulatedDateLabel, simulatedDateTimeLabel } from "./social.js";
import { typingStyleDebug } from "./typing.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V32_HARNESS_START_KEY = "realismHarnessV32Start";

function compact(value, max = 32) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        room: "Town Square",
        simulatedDate: simulatedDateLabel(),
        simulatedDateTime: simulatedDateTimeLabel(),
        pass: "natural-character-typing-v32",
        providerPriority: PROVIDER_PRIORITY,
        inherits: "emergent-life-spontaneity-v31",
        typing: {
          rarerTypos: true,
          characterSpecificFingerprints: true,
          contextSensitiveTypoChance: true,
          shortLinesProtected: true,
          excitedLinesSlightlyMessier: true,
          oneTypoMaximumPerNormalLine: true,
          arbitrarySingleWordCapsRemoved: true,
          shorthandPreserved: true,
          punctuationStylePreserved: true,
          rareSelfCorrection: true,
          statusEndpoint: "/api/typing-status?name=JennJenn"
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }

    if (url.pathname === "/api/typing-status") {
      const name = compact(url.searchParams.get("name") || "", 32);
      if (name) {
        const character = getCharacter(name);
        if (!character) return Response.json({ ok: false, error: "unknown character" }, { status: 404 });
        return Response.json({
          ok: true,
          pass: "natural-character-typing-v32",
          character: typingStyleDebug(character)
        });
      }
      return Response.json({
        ok: true,
        pass: "natural-character-typing-v32",
        characters: CHARACTERS.map((character) => typingStyleDebug(character))
      });
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends StoryChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v32Loaded = false;
  }

  async ensureState() {
    await super.ensureState();
    if (this.v32Loaded) return;
    let started = Number(await this.ctx.storage.get(V32_HARNESS_START_KEY) || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V32_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v32Loaded = true;
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    report.pass = "natural-character-typing-v32";
    report.scope = includeAll ? "all retained messages" : "messages since v32 harness activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.v32Typing = {
      injectedTyposReduced: true,
      recurringCharacterFingerprints: true,
      arbitrarySingleWordCapsRemoved: true,
      rareNextMessageCorrections: true,
      conversationStoryEngineStillV31: true
    };
    return report;
  }

  async fetch(request) {
    await this.ensureState();
    const url = new URL(request.url);
    const response = await super.fetch(request);
    if (url.pathname !== "/ai-status" && url.pathname !== "/realism-score") return response;
    try {
      const data = await response.json();
      return Response.json({
        ...data,
        pass: "natural-character-typing-v32",
        v32: {
          naturalTyping: true,
          characterSpecificFingerprints: true,
          arbitrarySingleWordCapsRemoved: true
        }
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "natural-character-typing-v32",
      v32: {
        naturalTyping: true,
        profile: name && getCharacter(name) ? typingStyleDebug(getCharacter(name)) : null
      }
    };
  }
}
