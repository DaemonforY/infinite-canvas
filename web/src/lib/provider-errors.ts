// Upstream content-safety rejections (e.g. OpenAI "moderation_blocked") arrive as English text;
// callers replace them with an actionable localized message and keep the provider's request id.
const SAFETY_REJECTION = /rejected by the safety system|moderation_blocked|content_policy_violation|safety_violations?|violates? (?:our|the) (?:content|usage) polic/i;

export function isSafetyRejection(message: string): boolean {
    return Boolean(message) && SAFETY_REJECTION.test(message);
}

/** The provider request id quoted in a rejection ("… include the request ID <id>"), if any. */
export function safetyRequestId(message: string): string | undefined {
    return /request ID\s+([0-9a-f-]{8,})/i.exec(message)?.[1];
}
