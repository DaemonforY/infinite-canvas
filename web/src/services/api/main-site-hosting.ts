// Publishing a page from the canvas as a website on the main site (/api/v1/hosting/sites, API key).
// Only subscribers can publish; the main site explains quota, balance and review errors in Chinese.

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import { stripEnglishOriginal } from "@/lib/provider-errors";
import { extractApiError, humanizeApiError, networkErrorText } from "./errors";

export type HostedSite = {
    id: number;
    name: string;
    title: string;
    status: "active" | "disabled" | "unpaid" | "lapsed" | "pending";
    status_reason: string;
    version: number;
    pending_version: number;
    url: string;
    preview_url?: string;
};

const base = () => `${MAIN_SITE_URL}/api/v1/hosting/sites`;

async function request(input: string, init: RequestInit): Promise<HostedSite> {
    let res: Response;
    try {
        res = await fetch(input, init);
    } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        throw new Error(networkErrorText());
    }
    const text = await res.text().catch(() => "");
    let body: { code?: number; message?: string; reason?: string; data?: HostedSite } = {};
    try {
        body = JSON.parse(text);
    } catch {
        // Not JSON (proxy error page…).
    }
    if (res.ok && body.code === 0 && body.data) return body.data;
    if ((body.reason?.startsWith("SITE") || body.reason === "API_KEY_REQUIRED") && body.message) throw new Error(stripEnglishOriginal(body.message));
    throw new Error(humanizeApiError({ ...extractApiError(text), status: res.status }));
}

export function publishSite(apiKey: string, title: string, html: string): Promise<HostedSite> {
    return request(base(), { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ title, html }) });
}

export function updateSite(apiKey: string, id: number, title: string, html: string): Promise<HostedSite> {
    return request(`${base()}/${id}`, { method: "PUT", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ title, html }) });
}

/** The main site's page where users manage their sites. */
export const MY_SITES_URL = () => `${MAIN_SITE_URL}/sites`;
