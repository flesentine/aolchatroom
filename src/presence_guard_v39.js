function cleanHumanName(value) {
  return String(value || "Guest").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 16) || "Guest";
}

export function attachmentIsLogicallyActive(attachment = {}) {
  return !attachment?.v39DisconnectPending && !attachment?.v39Superseded;
}

export function logicalHumanNames(attachments = []) {
  const names = [];
  const seen = new Set();
  for (const attachment of attachments || []) {
    if (!attachmentIsLogicallyActive(attachment)) continue;
    const name = cleanHumanName(attachment?.name);
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function activeHumanConnectionCount(attachments = [], name = "") {
  const target = cleanHumanName(name);
  return (attachments || []).filter((attachment) =>
    attachmentIsLogicallyActive(attachment)
    && cleanHumanName(attachment?.name) === target
  ).length;
}

export function markHumanDisconnectPending(attachment = {}, token = "", at = Date.now()) {
  return {
    ...(attachment || {}),
    v39DisconnectPending: true,
    v39DisconnectToken: String(token || ""),
    v39DisconnectPendingAt: Number(at || Date.now())
  };
}

export function markHumanSuperseded(attachment = {}, at = Date.now()) {
  return {
    ...(attachment || {}),
    v39Superseded: true,
    v39SupersededAt: Number(at || Date.now())
  };
}

export function cleanLogicalHumanName(value) {
  return cleanHumanName(value);
}
