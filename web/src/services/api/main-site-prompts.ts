// Prompt library on the main site (/api/v1/prompt-library). Browsing is anonymous; usage events,
// "for you" recommendations and the user's own prompts authenticate with the main-site API key,
// like the other companion-app endpoints (see main-site-app-state.ts).

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import { readFetchError } from "./errors";

export type ServerPromptStatus = "active" | "hidden" | "pending" | "rejected" | "duplicate";

export type ServerPrompt = {
    id: number;
    source_id: string;
    source_name: string;
    external_id: string;
    mine?: boolean;
    kind: "image" | "video";
    title: string;
    prompt: string;
    description: string;
    cover_url: string;
    reference_image_urls: string[];
    source_tags: string[];
    scenes: string[];
    tags: string[];
    model: string;
    lang: string;
    needs_reference: boolean;
    author: string;
    source_url: string;
    visibility: "public" | "private";
    status: ServerPromptStatus;
    review_note?: string;
    featured: boolean;
    use_count: number;
    favorite_count: number;
    published_at?: string;
    created_at: string;
    updated_at: string;
};

export type ServerPromptList = {
    items: ServerPrompt[];
    total: number;
    page: number;
    page_size: number;
    scene_counts: Record<string, number>;
    sources?: { id: string; name: string }[];
};

export type ServerRecommendations = {
    items: ServerPrompt[];
    /** "history": from the user's own usage; "popular": not enough history yet. */
    basis: "history" | "popular";
    scenes: { scene: string; share: number }[];
};

export type MyPromptInput = {
    title: string;
    prompt: string;
    description?: string;
    kind: "image" | "video";
    scenes: string[];
    tags: string[];
    /** Path returned by uploadPromptCover (or the current cover when editing). */
    cover_url: string;
    /** Ask for the prompt to be listed publicly (reviewed first). */
    share: boolean;
};

type Envelope<T> = { code: number | string; message?: string; data?: T };

async function readEnvelope<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(await readFetchError(res));
    const body = (await res.json()) as Envelope<T>;
    if (body.code !== 0) throw new Error(body.message || `HTTP ${res.status}`);
    return body.data as T;
}

const base = () => `${MAIN_SITE_URL}/api/v1/prompt-library`;

function query(params: Record<string, string | number | undefined>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
    const text = search.toString();
    return text ? `?${text}` : "";
}

function authed(apiKey: string, init: RequestInit = {}): RequestInit {
    return { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${apiKey}` } };
}

/** Covers of user prompts are served by the main site under a relative path. */
export function mainSiteAssetUrl(url: string): string {
    return url && url.startsWith("/") ? `${MAIN_SITE_URL}${url}` : url;
}

export async function listServerPrompts(params: { q?: string; scene?: string; model?: string; source?: string; kind?: string; tag?: string; sort?: string; page?: number; page_size?: number }, signal?: AbortSignal): Promise<ServerPromptList> {
    return readEnvelope<ServerPromptList>(await fetch(`${base()}/items${query(params)}`, { signal }));
}

export async function fetchRecommendations(apiKey: string, kind: "image" | "video", limit: number, signal?: AbortSignal): Promise<ServerRecommendations> {
    return readEnvelope<ServerRecommendations>(await fetch(`${base()}/recommendations${query({ kind, limit })}`, authed(apiKey, { signal, cache: "no-store" })));
}

/** The user drew with or copied a prompt (drives "most used" and recommendations). Best effort. */
export async function reportPromptUse(apiKey: string, id: number): Promise<void> {
    await readEnvelope(await fetch(`${base()}/items/${id}/use`, authed(apiKey, { method: "POST", keepalive: true })));
}

export async function reportPromptFavorite(apiKey: string, id: number, favorited: boolean): Promise<void> {
    await readEnvelope(await fetch(`${base()}/items/${id}/favorite`, authed(apiKey, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favorited }), keepalive: true })));
}

export async function listMyPrompts(apiKey: string, params: { q?: string; scene?: string; page?: number; page_size?: number }, signal?: AbortSignal): Promise<ServerPromptList> {
    return readEnvelope<ServerPromptList>(await fetch(`${base()}/mine${query({ ...params, sort: "latest" })}`, authed(apiKey, { signal, cache: "no-store" })));
}

export async function createMyPrompt(apiKey: string, input: MyPromptInput): Promise<ServerPrompt> {
    return readEnvelope<ServerPrompt>(await fetch(`${base()}/mine`, authed(apiKey, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })));
}

export async function updateMyPrompt(apiKey: string, id: number, input: MyPromptInput): Promise<ServerPrompt> {
    return readEnvelope<ServerPrompt>(await fetch(`${base()}/mine/${id}`, authed(apiKey, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })));
}

export async function deleteMyPrompt(apiKey: string, id: number): Promise<void> {
    await readEnvelope(await fetch(`${base()}/mine/${id}`, authed(apiKey, { method: "DELETE" })));
}

/** Size limit of a cover image on the server. */
export const PROMPT_COVER_MAX_BYTES = 3 * 1024 * 1024;

export async function uploadPromptCover(apiKey: string, blob: Blob): Promise<string> {
    const form = new FormData();
    form.append("file", blob, `cover.${(blob.type.split("/")[1] || "png").replace("jpeg", "jpg")}`);
    const data = await readEnvelope<{ url: string }>(await fetch(`${base()}/covers`, authed(apiKey, { method: "POST", body: form })));
    return data.url;
}
