// Main-site contests (HiveGPT activities) reached from the canvas.
// Listing is public; submission authenticates with the user's main-site API key
// (the canvas has no main-site web session), via POST /api/v1/contests/:id/key-entries.

import { MAIN_SITE_URL, isMainSiteBaseUrl } from "@/constant/runtime-config";
import type { AiConfig } from "@/stores/use-config-store";

export type MainSiteContest = {
    id: number;
    title: string;
    description: string;
    phase: string;
    submission_end_at: string;
    voting_end_at: string;
    max_entries_per_user: number;
    entry_count: number;
};

type Envelope<T> = { code: number | string; message?: string; data?: T };

/** Maximum upload size accepted by the main site. */
export const CONTEST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const OPEN_PHASES = new Set(["submitting", "submitting_voting"]);

async function readEnvelope<T>(res: Response): Promise<T> {
    let body: Envelope<T> | null = null;
    try {
        body = (await res.json()) as Envelope<T>;
    } catch {
        body = null;
    }
    if (!res.ok || !body || body.code !== 0) {
        throw new Error(body?.message || `HTTP ${res.status}`);
    }
    return body.data as T;
}

/** Contests currently accepting entries. */
export async function listOpenContests(signal?: AbortSignal): Promise<MainSiteContest[]> {
    const res = await fetch(`${MAIN_SITE_URL}/api/v1/contests`, { signal });
    const contests = await readEnvelope<MainSiteContest[]>(res);
    return (contests || []).filter((c) => OPEN_PHASES.has(c.phase));
}

/** API key of the first provider that points at the main-site gateway, if any. */
export function findMainSiteApiKey(config: AiConfig): string {
    for (const channel of config.channels || []) {
        const key = channel.apiKey?.trim();
        if (key && isMainSiteBaseUrl(channel.baseUrl)) return key;
    }
    return "";
}

export type ContestSubmission = {
    title: string;
    description?: string;
    prompt?: string;
    image: Blob;
};

/** Submits an entry; the entry is filed under the owner of apiKey. Returns the entry status. */
export async function submitContestEntry(contestId: number, apiKey: string, input: ContestSubmission): Promise<{ status: string }> {
    const form = new FormData();
    form.append("title", input.title);
    form.append("description", input.description || "");
    form.append("prompt", input.prompt || "");
    const type = input.image.type || "image/png";
    form.append("image", input.image, `canvas.${type.split("/")[1] || "png"}`);
    const res = await fetch(`${MAIN_SITE_URL}/api/v1/contests/${contestId}/key-entries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });
    return readEnvelope<{ status: string }>(res);
}

/** Loads any image URL the canvas uses (data:, blob:, or remote) as a Blob. */
export async function loadImageBlob(url: string): Promise<Blob> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
}

export function mainSiteContestUrl(contestId: number): string {
    return `${MAIN_SITE_URL}/contests/${contestId}?utm_source=canvas&utm_medium=contest-submit`;
}
