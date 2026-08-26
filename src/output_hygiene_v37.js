const INTERNAL_THREAD_TOPIC_TAG = /\s*\{t\d+\/[A-Za-z][A-Za-z0-9_-]{0,39}\}\s*/g;

export function hasInternalChatMetadata(text) {
  INTERNAL_THREAD_TOPIC_TAG.lastIndex = 0;
  return INTERNAL_THREAD_TOPIC_TAG.test(String(text || ""));
}

export function stripInternalChatMetadata(text) {
  const value = String(text || "");
  INTERNAL_THREAD_TOPIC_TAG.lastIndex = 0;
  if (!INTERNAL_THREAD_TOPIC_TAG.test(value)) return value;
  INTERNAL_THREAD_TOPIC_TAG.lastIndex = 0;
  return value
    .replace(INTERNAL_THREAD_TOPIC_TAG, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
