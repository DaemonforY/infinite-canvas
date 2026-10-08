import { MAIN_SITE_API_BASE_URL, MAIN_SITE_URL, mainSiteLink } from "@/constant/runtime-config";
import { readFetchError } from "./errors";

// "Sign in / connect with the main site" handoff.
//
// The canvas opens MAIN_SITE_URL/canvas-connect in a popup with a random `state`. Authorizing there
// signs the canvas in (the main site sets its session cookie) and, when the user picked (or created)
// a key, the key is posted back too; the main site answers with window.opener.postMessage,
// targeted at this origin only. We accept the message only from the main site's exact origin and
// only with the state we generated, so another page cannot inject a key and a stale popup cannot
// answer a newer request. The key never travels in a URL.

export const CONNECT_MESSAGE_TYPE = "hivegpt:canvas-key";

/** apiKey is "" when the user signed in without connecting a key. */
export type ConnectedKey = { apiKey: string; baseUrl: string; keyName: string; signedIn: boolean };

export function mainSiteOrigin(): string {
    try {
        return new URL(MAIN_SITE_URL).origin;
    } catch {
        return "";
    }
}

export function createConnectState(): string {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function connectUrl(state: string): string {
    const url = new URL(mainSiteLink("/canvas-connect", "quick-start"));
    url.searchParams.set("state", state);
    return url.toString();
}

/** Opens the connect popup; returns null when the browser blocked it. */
export function openConnectPopup(state: string): Window | null {
    const width = 520;
    const height = 720;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    // No "noopener": the main site needs window.opener to post the key back.
    return window.open(connectUrl(state), "hivegpt-canvas-connect", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
}

// Full-page sign-in (phones and the WeChat in-app browser, where the popup cannot answer): the
// canvas goes to the main site's login with the connect page as the target and comes back to the
// same path with #hivegpt_connect=<state>; the picked key is then taken once over the session cookie.
const REDIRECT_STATE_KEY = "hivegpt:connect-redirect-state";
const RETURN_HASH = "hivegpt_connect";

export function isWeChatBrowser() {
    return typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);
}

/** Phones and WeChat sign in by redirect; desktops keep the popup (the page stays as it is). */
export function prefersRedirectSignIn() {
    if (typeof window === "undefined") return false;
    return isWeChatBrowser() || (window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth < 768);
}

export function startConnectRedirect() {
    const state = createConnectState();
    sessionStorage.setItem(REDIRECT_STATE_KEY, state);
    const back = `${window.location.pathname}${window.location.search}`;
    const url = new URL(mainSiteLink("/login", "connect-redirect"));
    url.searchParams.set("redirect", `/canvas-connect?state=${state}&return=${encodeURIComponent(back)}`);
    if (isWeChatBrowser()) url.searchParams.set("auto_wechat", "1");
    window.location.href = url.toString();
}

/** True when this page load is the return from a full-page sign-in (and consumes the marker). */
export function takeConnectRedirectReturn(): boolean {
    const match = window.location.hash.match(new RegExp(`${RETURN_HASH}=([A-Za-z0-9_-]{16,128})`));
    if (!match) return false;
    const expected = sessionStorage.getItem(REDIRECT_STATE_KEY);
    sessionStorage.removeItem(REDIRECT_STATE_KEY);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    // A different state is someone else's link; a missing one is a browser that dropped sessionStorage.
    return !expected || expected === match[1];
}

/** The key picked on the connect page, handed over once ("" when none). */
export async function fetchConnectKey(signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${MAIN_SITE_URL}/api/v1/canvas/connect-key`, { credentials: "include", headers: { "X-HiveGPT-Canvas": "1" }, signal });
    const body = (await res.json().catch(() => null)) as { code?: number; data?: { api_key?: string } } | null;
    const key = body?.code === 0 ? (body.data?.api_key || "").trim() : "";
    return key && key.length <= 256 && !/\s/.test(key) ? key : "";
}

/** Validates a postMessage event from the connect popup; returns the key or null. */
export function parseConnectMessage(event: MessageEvent, expectedState: string): ConnectedKey | null {
    const origin = mainSiteOrigin();
    if (!origin || event.origin !== origin) return null;
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object" || data.type !== CONNECT_MESSAGE_TYPE) return null;
    if (typeof data.state !== "string" || data.state !== expectedState) return null;
    const signedIn = data.signedIn === true;
    const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
    if (!apiKey && signedIn && data.apiKey === undefined) return { apiKey: "", baseUrl: MAIN_SITE_API_BASE_URL, keyName: "", signedIn };
    if (!apiKey || apiKey.length > 256 || /\s/.test(apiKey)) return null;
    const keyName = typeof data.keyName === "string" ? data.keyName.slice(0, 80) : "";
    return { apiKey, baseUrl: MAIN_SITE_API_BASE_URL, keyName, signedIn };
}

export type KeyTestResult = { ok: true; modelCount: number; imageCapable: boolean } | { ok: false; reason: "invalid" | "network" | "http"; status?: number; message?: string };

const IMAGE_MODEL_HINTS = ["image", "dall-e", "seedream", "flux", "imagen"];

/** Checks a key against the main-site gateway by listing models (allowed cross-origin via CORS). */
export async function testApiKey(apiKey: string, signal?: AbortSignal): Promise<KeyTestResult> {
    let response: Response;
    try {
        response = await fetch(`${MAIN_SITE_API_BASE_URL}/v1/models`, { headers: { Authorization: `Bearer ${apiKey.trim()}` }, signal });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return { ok: false, reason: "network" };
    }
    if (response.status === 401) return { ok: false, reason: "invalid", status: response.status };
    // 403 / 429 / 5xx carry a reason (no balance, key disabled or expired, IP whitelist, …) worth showing.
    if (!response.ok) return { ok: false, reason: "http", status: response.status, message: await readFetchError(response) };
    const body = (await response.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
    const ids = (body?.data || []).map((m) => String(m.id || "").toLowerCase());
    return { ok: true, modelCount: ids.length, imageCapable: ids.some((id) => IMAGE_MODEL_HINTS.some((hint) => id.includes(hint))) };
}
