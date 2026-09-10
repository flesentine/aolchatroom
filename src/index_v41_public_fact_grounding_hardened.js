import worker from "./index_v41_public_fact_grounding.js";
import { ChatRoom as PublicFactChatRoom } from "./index_v41_public_fact_grounding.js";
import { AmbiguitySafeWikidataPublicFactResolver } from "./public_fact_ambiguity_guard_v41.js";

export default worker;

export class ChatRoom extends PublicFactChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.v41PublicFactResolver = new AmbiguitySafeWikidataPublicFactResolver({
      fetcher: (url, init) => this.v41FetchPublicFactSource(url, init)
    });
  }

  v41Snapshot(now = Date.now()) {
    const snapshot = super.v41Snapshot(now);
    return {
      ...snapshot,
      policy: {
        ...(snapshot.policy || {}),
        sameLabelRelationAmbiguityFailsClosed: true
      }
    };
  }
}
