import { MAIN_SITE_API_BASE_URL, MAIN_SITE_URL, mainSiteLink } from "@/constant/runtime-config";
import { readFetchError } from "./errors";

// "Connect with the main site" handoff.
//
// The canvas opens MAIN_SITE_URL/canvas-connect in a popup with a random `state`. After the user
// picks (or creates) a key there, the main site posts it back with window.opener.postMessage,
// targeted at this origin only. We accept the message only from the main site's exact origin and
// only with the state we generated, so another page cannot inject a key and a stale popup cannot
// answer a newer request. The key never travels in a URL.

export const CONNECT_MESSAGE_TYPE = "hivegpt:canvas-key";

export type ConnectedKey = { apiKey: string; baseUrl: string; keyName: string };

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

/** Validates a postMessage event from the connect popup; returns the key or null. */
export function parseConnectMessage(event: MessageEvent, expectedState: string): ConnectedKey | null {
    const origin = mainSiteOrigin();
    if (!origin || event.origin !== origin) return null;
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object" || data.type !== CONNECT_MESSAGE_TYPE) return null;
    if (typeof data.state !== "string" || data.state !== expectedState) return null;
    const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
    if (!apiKey || apiKey.length > 256 || /\s/.test(apiKey)) return null;
    const keyName = typeof data.keyName === "string" ? data.keyName.slice(0, 80) : "";
    return { apiKey, baseUrl: MAIN_SITE_API_BASE_URL, keyName };
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
