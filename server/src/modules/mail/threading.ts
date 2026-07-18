const SUBJECT_PREFIX = /^(?:(?:re|fw|fwd)\s*:\s*)+/i;
const MESSAGE_ID = /<[^<>\s]+>/g;

export function normaliseSubject(subject: string): string {
  return subject.normalize("NFKC").trim().replace(SUBJECT_PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function referenceIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.match(MESSAGE_ID) ?? [])];
}

export function replySubject(subject: string): string {
  const clean = subject.trim();
  return /^re\s*:/i.test(clean) ? clean : `Re: ${clean || "(no subject)"}`;
}

export function replyReferences(
  existing: readonly string[],
  messageId: string,
): string[] {
  return [...new Set([...existing, ...referenceIds(messageId)])];
}
