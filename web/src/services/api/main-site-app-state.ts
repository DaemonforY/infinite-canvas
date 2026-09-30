// Per-user documents stored on the main site (/api/v1/app-state/:namespace), authenticated with the
// user's API key like contest submissions. Used to sync prompt favorites and drafts across devices.

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import { readFetchError } from "./errors";

export type AppStateDoc = { value: unknown; version: number };

type Envelope<T> = { code: number | string; message?: string; data?: T };

async function readEnvelope<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(await readFetchError(res));
    const body = (await res.json()) as Envelope<T>;
    if (body.code !== 0) throw new Error(body.message || `HTTP ${res.status}`);
    return body.data as T;
}

export async function getAppState(namespace: string, apiKey: string, signal?: AbortSignal): Promise<AppStateDoc> {
    const res = await fetch(`${MAIN_SITE_URL}/api/v1/app-state/${encodeURIComponent(namespace)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal, cache: "no-store" });
    const data = await readEnvelope<{ value: unknown; version: number }>(res);
    return { value: data.value ?? {}, version: data.version || 0 };
}

/** Writes value if the server still has baseVersion; otherwise returns the current document with conflict=true. */
export async function putAppState(namespace: string, apiKey: string, value: unknown, baseVersion: number, signal?: AbortSignal): Promise<AppStateDoc & { conflict: boolean }> {
    const res = await fetch(`${MAIN_SITE_URL}/api/v1/app-state/${encodeURIComponent(namespace)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value, base_version: baseVersion }),
        signal,
    });
    const data = await readEnvelope<{ value: unknown; version: number; conflict: boolean }>(res);
    return { value: data.value ?? {}, version: data.version || 0, conflict: Boolean(data.conflict) };
}

export type AppBlob = { id: string; mime_type: string; size_bytes: number };

/** Stores an image on the account; the same bytes return the same id. */
export async function uploadAppBlob(apiKey: string, blob: Blob, signal?: AbortSignal): Promise<AppBlob> {
    const form = new FormData();
    form.append("file", blob, `reference.${(blob.type.split("/")[1] || "png").replace("jpeg", "jpg")}`);
    const res = await fetch(`${MAIN_SITE_URL}/api/v1/app-state/blobs`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal });
    return readEnvelope<AppBlob>(res);
}

/** Downloads an image stored on the account (owner only). */
export async function downloadAppBlob(apiKey: string, id: string, signal?: AbortSignal): Promise<Blob> {
    const res = await fetch(`${MAIN_SITE_URL}/api/v1/app-state/blobs/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    if (!res.ok) throw new Error(await readFetchError(res));
    return res.blob();
}

/** Size limit of one synced image on the server. */
export const APP_BLOB_MAX_BYTES = 10 * 1024 * 1024;
