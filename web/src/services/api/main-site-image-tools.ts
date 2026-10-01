// Background removal and super-resolution run on the main site (/api/v1/image-tools), billed to the
// user's account: subscribers get a few free runs a day, the rest is charged per successful run.

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import { stripEnglishOriginal } from "@/lib/provider-errors";
import { extractApiError, humanizeApiError, networkErrorText } from "./errors";

export type ServerImageTool = "remove-bg" | "upscale";

export type ImageToolsQuota = {
    enabled: boolean;
    subscribed: boolean;
    free_daily: number;
    free_used: number;
    free_left: number;
    balance: number;
    prices: { remove_bg: number; upscale: number };
};

export type ServerImageToolOptions = { model?: "isnet" | "u2net"; scale?: 2 | 4 };

const base = () => `${MAIN_SITE_URL}/api/v1/image-tools`;

/** The tools answer in Chinese (balance, queue, unreadable image…); other errors go through the usual mapping. */
async function toolError(res: Response): Promise<Error> {
    const text = await res.text().catch(() => "");
    try {
        const body = JSON.parse(text) as { reason?: string; message?: string };
        if (body.reason?.startsWith("IMAGE_TOOLS_") && body.message) return new Error(stripEnglishOriginal(body.message));
    } catch {
        // Not our JSON envelope.
    }
    return new Error(humanizeApiError({ ...extractApiError(text), status: res.status }));
}

async function send(input: string, init: RequestInit) {
    try {
        return await fetch(input, init);
    } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        throw new Error(networkErrorText());
    }
}

export async function fetchImageToolsQuota(apiKey: string, signal?: AbortSignal): Promise<ImageToolsQuota> {
    const res = await send(`${base()}/quota`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal });
    if (!res.ok) throw await toolError(res);
    const body = (await res.json()) as { code: number; message?: string; data?: ImageToolsQuota };
    if (body.code !== 0 || !body.data) throw new Error(body.message || `HTTP ${res.status}`);
    return body.data;
}

/** Runs one tool on one image and resolves with the result; read the quota again for what it cost. */
export async function runServerImageTool(apiKey: string, tool: ServerImageTool, image: Blob, options: ServerImageToolOptions = {}, signal?: AbortSignal) {
    const form = new FormData();
    form.append("file", image, `image.${(image.type.split("/")[1] || "png").replace("jpeg", "jpg")}`);
    if (options.model) form.append("model", options.model);
    if (options.scale) form.append("scale", String(options.scale));
    const res = await send(`${base()}/${tool}`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal });
    if (!res.ok) throw await toolError(res);
    return res.blob();
}
