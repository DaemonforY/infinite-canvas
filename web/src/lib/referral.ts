// Invite attribution. Links people share from the canvas carry their HiveGPT invite code (?aff=).
// A visitor who lands with one keeps it for 30 days, and every link into the main site passes it on,
// so registering there (directly or via the sign-in popup) counts as the sharer's invite.

const STORAGE_KEY = "hg_referral_code";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Same rule as the main site: 4–32 of A–Z, 0–9, "_" and "-" (case-insensitive).
const CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;

export function normalizeReferralCode(value: unknown): string {
    const code = typeof value === "string" ? value.trim().toUpperCase() : "";
    return CODE_PATTERN.test(code) ? code : "";
}

/** Keeps the ?aff= (or ?aff_code=) of the landing URL. */
export function captureReferral(search = typeof window === "undefined" ? "" : window.location.search, now = Date.now()): void {
    const params = new URLSearchParams(search);
    const code = normalizeReferralCode(params.get("aff") || params.get("aff_code"));
    if (!code) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, expiresAt: now + TTL_MS }));
    } catch {
        // Storage may be unavailable (private mode); attribution is best-effort.
    }
}

/** The kept invite code, "" when none or expired. */
export function loadReferral(now = Date.now()): string {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return "";
        const stored = JSON.parse(raw) as { code?: unknown; expiresAt?: unknown };
        const code = normalizeReferralCode(stored.code);
        if (code && Number(stored.expiresAt) > now) return code;
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Unreadable entries count as none.
    }
    return "";
}

/** Adds ?aff=code to url (unchanged when the code is empty or invalid). */
export function withReferral(url: string, code: unknown): string {
    const aff = normalizeReferralCode(code);
    if (!aff) return url;
    try {
        const parsed = new URL(url);
        parsed.searchParams.set("aff", aff);
        return parsed.toString();
    } catch {
        return url;
    }
}

/** Link to a canvas page for sharing, carrying the sharer's invite code when they have one. */
export function canvasShareUrl(path: string, code: unknown): string {
    return withReferral(new URL(path, window.location.origin).toString(), code);
}
