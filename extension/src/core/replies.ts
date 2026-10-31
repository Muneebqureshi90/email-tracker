/** Reply detection: pure rules over sender addresses and message times only (never bodies). */

export interface ThreadMessage {
  sender: string;
  /** Epoch milliseconds, or NaN when Gmail's date could not be read. */
  at: number;
}

export const MAX_REPORTED_REPLIES = 500;

function normal(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * The earliest message after the tracked email that one of its recipients sent, or null.
 * The owner's own messages and messages without a readable time never count.
 */
export function findReply(
  owner: string,
  recipients: readonly string[],
  sentAt: number,
  messages: readonly ThreadMessage[],
): number | null {
  const self = normal(owner);
  const wanted = new Set(recipients.map(normal).filter((address) => address !== '' && address !== self));
  let earliest: number | null = null;
  for (const message of messages) {
    const sender = normal(message.sender);
    if (sender === self || !wanted.has(sender)) continue;
    if (!Number.isFinite(message.at) || !Number.isFinite(sentAt) || message.at <= sentAt) continue;
    if (earliest === null || message.at < earliest) earliest = message.at;
  }
  return earliest;
}

/** Adds an email id to the bounded list of reported replies (oldest dropped first). */
export function rememberReported(list: readonly string[], emailId: string, max = MAX_REPORTED_REPLIES): string[] {
  const kept = list.filter((id) => id !== emailId);
  kept.push(emailId);
  return kept.slice(-max);
}
