import baseWorker, { ChatRoom as HistoricalChatRoom } from "./index_v27.js";
import {
  simulatedDateLabel,
  simulatedDateTimeLabel,
  relationshipScore,
  relationshipInteractions
} from "./social.js";
import {
  lifeBibleCount,
  lifeBibleDebug,
  lifeBiblePrompt,
  lifeIdentityLine,
  lifeClaimViolation
} from "./life_bibles_v28.js";

const PROVIDER_PRIORITY = ["gemini", "groq", "workers-ai"];
const V28_HARNESS_START_KEY = "realismHarnessV28Start";
const PRIVATE_TRUST_SCORE = 28;
const PRIVATE_MIN_INTERACTIONS = 4;
const HARD_GUARD_KINDS = new Set(["sister", "brother", "son", "daughter", "children", "roommate"]);

function privateTopic(text = "") {
  return /\b(secret|embarrass|embarrassed|afraid|scared|worry|worried|regret|private|never told)\b/i.test(String(text || ""));
}

function compact(value, max = 180) {
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
        pass: "canonical-life-bibles-v28",
        providerPriority: PROVIDER_PRIORITY,
        lifeBibles: {
          characterCount: lifeBibleCount(),
          canonicalFamily: true,
          canonicalSiblings: true,
          canonicalPets: true,
          canonicalEducation: true,
          canonicalWorkDetails: true,
          canonicalHousing: true,
          canonicalRelationships: true,
          canonicalTransportation: true,
          canonicalRoutines: true,
          canonicalBackground: true,
          gradualPrivateFacts: true,
          selfKnowledgeBoundaries: true,
          contradictionGuard: true,
          relevantFactsOnlyInPrompt: true,
          persistentAcrossHistoricalYearReset: true,
          statusEndpoint: "/api/life-status"
        },
        aiProviders: {
          groq: Boolean(env.GROQ_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          workersAI: Boolean(env.AI)
        }
      });
    }

    if (url.pathname === "/api/life-status") {
      const name = compact(url.searchParams.get("name") || "", 32);
      const data = lifeBibleDebug(name);
      if (name && !data) return Response.json({ ok: false, error: "unknown character" }, { status: 404 });
      return Response.json({
        ok: true,
        pass: "canonical-life-bibles-v28",
        privateFactsHidden: true,
        characters: name ? undefined : data,
        character: name ? data : undefined
      });
    }

    return baseWorker.fetch(request, env);
  }
};

export class ChatRoom extends HistoricalChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v28Loaded = false;
    this.v28Stats = {
      lifePromptCalls: 0,
      identityPromptCalls: 0,
      estimatedFactsOffered: 0,
      privateFactWindows: 0,
      contradictionsBlocked: 0,
      contradictionKinds: {}
    };
  }

  async ensureState() {
    await super.ensureState();
    if (this.v28Loaded) return;
    let started = Number(await this.ctx.storage.get(V28_HARNESS_START_KEY) || 0);
    if (!started) {
      started = Date.now();
      await this.ctx.storage.put(V28_HARNESS_START_KEY, started);
    }
    this.realismHarnessStartedAt = started;
    this.v28Loaded = true;
  }

  trustedLifeNames(active, human = null) {
    const trusted = new Set();
    if (!human?.from || !this.social) return trusted;
    for (const character of (active || []).slice(0, 8)) {
      const score = relationshipScore(this.social, character.name, human.from);
      const interactions = relationshipInteractions(this.social, character.name, human.from);
      if (score >= PRIVATE_TRUST_SCORE && interactions >= PRIVATE_MIN_INTERACTIONS) trusted.add(character.name);
    }
    return trusted;
  }

  promptProfiles(characters, limit = 8) {
    const selected = (characters || []).slice(0, limit);
    const base = super.promptProfiles(characters, limit);
    const anchors = selected.map((character) => lifeIdentityLine(character?.name)).filter(Boolean);
    this.v28Stats.identityPromptCalls += 1;
    if (!anchors.length) return base;
    return `${base}\n\nCANONICAL PERSONAL-LIFE ANCHORS — hard continuity facts, not optional flavor:\n${anchors.map((row) => `- ${row}`).join("\n")}\nThese are SELF-KNOWLEDGE for the named character. Another bot may know one of these facts only if that fact was actually said in a conversation they could have witnessed or appears in their persistent memory. Do not make the room omniscient. Do not invent alternate siblings, pets, spouses, children, roommates, schools, or living situations. If a detail is not supplied, stay vague instead of making one up.`;
  }

  brainPrompt(active, reason, human = null) {
    const base = super.brainPrompt(active, reason, human);
    const recent = typeof this.recentTranscript === "function" ? this.recentTranscript(8) : "";
    const query = compact(human?.text || recent || "ordinary life", 700);
    const trustedNames = this.trustedLifeNames(active, human);
    const prompt = lifeBiblePrompt(active, query, { trustedNames, perCharacter: 5 });
    this.v28Stats.lifePromptCalls += 1;
    this.v28Stats.estimatedFactsOffered += Math.min((active || []).length, 8) * 5;
    if (human && privateTopic(human.text) && trustedNames.size) this.v28Stats.privateFactWindows += trustedNames.size;

    return `${base}\n\n${prompt}\n\nPERSONAL-LIFE CONTINUITY RULES:\n- These biography facts survive the January historical-world reset because they are facts about who these fictional people are, not later-1996 news.\n- Each character automatically knows their OWN biography. Other characters do NOT automatically know it. They may refer to somebody else's family, pet, job detail, relationship, or private fact only if that information appeared in visible conversation they plausibly witnessed or exists in their persistent memory.\n- Use only facts relevant to what somebody is actually discussing. Do not recite biographies or force family/pet/work facts into unrelated chat.\n- Names and counts are canonical. If the supplied biography says one younger sister, do not invent a brother or a second sister later.\n- A private fact appears only when trust/context made it eligible. Even then, reveal it only if the conversation naturally reaches it; do not announce secrets randomly.\n- If the bible does not answer a personal question, the character may be vague, say they do not want to get into it, or answer without inventing a new permanent fact.`;
  }

  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    if (kind === "bot") {
      const violation = lifeClaimViolation(from, text);
      // Hard-block only facts that are effectively immutable and unambiguous.
      // Pets and romantic labels can be phrased as family/past relationships, so
      // those remain prompt-enforced rather than risking false positives.
      if (violation && HARD_GUARD_KINDS.has(violation.kind)) {
        this.v28Stats.contradictionsBlocked += 1;
        this.v28Stats.contradictionKinds[violation.kind] = Number(this.v28Stats.contradictionKinds[violation.kind] || 0) + 1;
        this.broadcast({
          type: "life_bible_guard",
          action: "contradiction-blocked",
          speaker: from,
          kind: violation.kind,
          at: Date.now()
        });
        return false;
      }
    }
    return super.say(from, text, kind, source, meta);
  }

  realismReport(includeAll = false) {
    const report = super.realismReport(includeAll);
    report.pass = "canonical-life-bibles-v28";
    report.scope = includeAll ? "all retained messages" : "messages since v28 harness activation";
    report.harnessStartedAt = this.realismHarnessStartedAt;
    report.v28CharacterContinuity = {
      lifeBibleCharacters: lifeBibleCount(),
      contradictionsBlocked: Number(this.v28Stats.contradictionsBlocked || 0),
      contradictionKinds: { ...this.v28Stats.contradictionKinds },
      privateFactWindows: Number(this.v28Stats.privateFactWindows || 0),
      hardFactsPersistAcrossHistoricalReset: true,
      biographyIsSelfKnowledge: true
    };
    return report;
  }

  v28Snapshot() {
    return {
      ...this.v28Stats,
      lifeBibleCharacters: lifeBibleCount(),
      privateTrustScore: PRIVATE_TRUST_SCORE,
      privateMinInteractions: PRIVATE_MIN_INTERACTIONS,
      hardGuardKinds: [...HARD_GUARD_KINDS]
    };
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
        pass: "canonical-life-bibles-v28",
        v28: this.v28Snapshot()
      });
    } catch {
      return response;
    }
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "canonical-life-bibles-v28",
      v28: this.v28Snapshot()
    };
  }
}
