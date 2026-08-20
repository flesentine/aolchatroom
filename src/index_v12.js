import baseWorker, { ChatRoom as QualityChatRoom } from "./index_v11.js";
import { screenNameEraPrompt, screenNameSignals } from "./screenname.js";

export default baseWorker;

export class ChatRoom extends QualityChatRoom {
  async callGroq(prompt, maxTokens = 340, maxMessages = 5, defaultTarget = "room") {
    const cuePrompt = screenNameEraPrompt(this.humanNames());
    const override = `IMPORTANT SCREEN-NAME CLARIFICATION: ${cuePrompt}\n\nThis clarification supersedes any broader wording below that says a screen name can never imply age or sex. It may suggest those two things socially, but never proves them.`;
    return super.callGroq(`${override}\n\n${prompt}`, maxTokens, maxMessages, defaultTarget);
  }

  debugState(name) {
    const base = super.debugState(name);
    return {
      ...base,
      pass: "screenname-social-cues-v12",
      screenNameCues: this.humanNames().map((human) => screenNameSignals(human))
    };
  }
}
