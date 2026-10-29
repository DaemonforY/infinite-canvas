// 诗词灵感 on the main site (/api/v1/poems): the public-domain poem corpus. Anonymous (limited per IP);
// the model calls of 诗画 run on the user's own channel, so nothing here is billed.

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import type { PoemCandidate } from "@/lib/poem";
import { readFetchError } from "./errors";

export type MainSitePoem = PoemCandidate & { collection: string; notes?: string; tags: string[]; famous: boolean };

const base = () => `${MAIN_SITE_URL}/api/v1/poems`;

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}, signal?: AbortSignal): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "" || value === false || value === 0) continue;
        query.set(key, value === true ? "1" : String(value));
    }
    const res = await fetch(`${base()}${path}${query.size ? `?${query}` : ""}`, { signal });
    if (!res.ok) throw new Error(await readFetchError(res, "诗词库暂时打不开"));
    const body = (await res.json()) as { code: number; message?: string; data: T };
    if (body.code !== 0) throw new Error(body.message || "诗词库暂时打不开");
    return body.data;
}

export type PoemSearch = { q?: string; dynasty?: string; collection?: string; author?: string; famous?: boolean; random?: boolean; offset?: number };

export function searchPoems(query: PoemSearch, signal?: AbortSignal) {
    return get<{ items: MainSitePoem[]; has_more: boolean }>("", query, signal);
}

export function getPoem(id: number, signal?: AbortSignal) {
    return get<MainSitePoem>(`/${id}`, {}, signal);
}

/** Poems containing the most of the words (the corpus half of 按画面找). */
export function poemCandidates(words: string[], dynasty?: string, signal?: AbortSignal) {
    return get<{ items: MainSitePoem[] }>("/candidates", { words: words.join(","), dynasty }, signal);
}
