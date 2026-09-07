// Phase 3G.10 output-hygiene compatibility owner.
// Frozen index_v37_hotfix.js remains unchanged for the v37-v40 lineage.
// V41 owns bot-only internal metadata stripping/drop behavior here.
import shadowWorker, { ChatRoom as PausedShadowChatRoom } from "./index_v41_paused_shadow_compat.js";
import { stripInternalChatMetadata } from "./output_hygiene_v37.js";

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const response = await shadowWorker.fetch(request, env);
    const url = new URL(request.url);
    if (url.pathname !== "/api/health" && url.pathname !== "/api/everything" && url.pathname !== "/api/full-status") {
      return response;
    }
    const data = await json(response);
    if (!data) return response;
    return Response.json({
      ...data,
      v37: {
        ...(data.v37 || {}),
        internalMetadataOutputHygiene: true
      }
    });
  }
};

export class ChatRoom extends PausedShadowChatRoom {
  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const original = String(text || "");
    if (kind !== "bot") return super.say(from, original, kind, source, meta);

    const sanitized = stripInternalChatMetadata(original);
    if (sanitized !== original) this.v37ProductionTurnStats.internalMetadataStrips += 1;
    if (!sanitized) {
      this.v37ProductionTurnStats.internalMetadataDroppedLines += 1;
      return false;
    }
    return super.say(from, sanitized, kind, source, meta);
  }

  v37Snapshot() {
    const base = super.v37Snapshot();
    return {
      ...base,
      mode: {
        ...(base.mode || {}),
        internalMetadataOutputHygiene: true
      }
    };
  }
}
