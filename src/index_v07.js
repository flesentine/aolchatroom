import baseWorker, { ChatRoom as ConversationChatRoom } from "./index_v06.js";
import { getCharacter } from "./characters.js";
import { applyTypingStyle } from "./typing.js";

export default baseWorker;

export class ChatRoom extends ConversationChatRoom {
  say(from, text, kind = "bot", source = "built-in", meta = {}) {
    const character = kind === "bot" ? getCharacter(from) : null;
    const styledText = character ? applyTypingStyle(character, text) : text;
    return super.say(from, styledText, kind, source, meta);
  }
}
