import { MAIN_SITE_API_BASE_URL } from "@/constant/runtime-config";
import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";

import { apiText, humanizeApiPayload, readFetchError } from "./errors";

// Image generation through the main site's async image tasks: submit, then poll for the result.
// A long synchronous request dies when a phone or iPad backgrounds the tab or the network drops
// for a moment, and the image (already generated and paid for) is lost. A task keeps running on
// the server; polling is many short requests that survive those gaps, and the finished image is
// kept there for about a day. Only the main site's gateway offers this; other channels, or a main
// site without async tasks (404), use the normal synchronous request.

export type ImageTaskPath = "/images/generations" | "/images/edits";
type TaskOptions = { signal?: AbortSignal };
type ImageTask = { id?: string; task_id?: string; status?: string; result?: unknown; error?: unknown };

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 10_000;
// Server-side tasks time out after 10 minutes; leave room for queueing and offline gaps.
const TASK_DEADLINE_MS = 15 * 60_000;
const DOWNLOAD_ATTEMPTS = 3;
const UNSUPPORTED_KEY = "infinite-canvas:image-task-unsupported";

const unsupported = new Set<string>(readUnsupported());

function readUnsupported(): string[] {
    try {
        const raw = sessionStorage.getItem(UNSUPPORTED_KEY);
        return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
        return [];
    }
}

function rememberUnsupported(base: string) {
    unsupported.add(base);
    try {
        sessionStorage.setItem(UNSUPPORTED_KEY, JSON.stringify([...unsupported]));
    } catch {
        // storage blocked: remembered for this page only
    }
}

function originOf(url: string) {
    try {
        return new URL(url).origin;
    } catch {
        return "";
    }
}

/** Async tasks are a main-site feature: only its gateway is asked (and only until it says 404). */
export function supportsImageTasks(baseUrl: string, mainSiteBaseUrl = MAIN_SITE_API_BASE_URL) {
    const origin = originOf(baseUrl.trim());
    return Boolean(origin) && origin === originOf(mainSiteBaseUrl || "") && !unsupported.has(origin);
}

function abortError(signal?: AbortSignal) {
    return signal?.reason instanceof Error ? signal.reason : new DOMException(apiText("requestCanceled"), "AbortError");
}

/** Waits ms, or less when the page becomes visible again (polling right away after coming back). */
function wait(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(abortError(signal));
        const done = () => {
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
            signal?.removeEventListener("abort", onAbort);
        };
        const timer = window.setTimeout(() => {
            done();
            resolve();
        }, ms);
        const onVisible = () => {
            if (document.visibilityState === "visible") {
                done();
                resolve();
            }
        };
        const onAbort = () => {
            done();
            reject(abortError(signal));
        };
        document.addEventListener("visibilitychange", onVisible);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

function authHeaders(config: AiConfig): Record<string, string> {
    return { Authorization: `Bearer ${config.apiKey}` };
}

/**
 * Runs one image request as a main-site task. Returns the same JSON the synchronous endpoint
 * would ({ data: [...] }), or null when tasks aren't available here and the caller should send
 * the request synchronously. Network failures while polling are retried until the deadline.
 */
export async function runImageTask(config: AiConfig, path: ImageTaskPath, body: FormData | Record<string, unknown>, options?: TaskOptions): Promise<Record<string, unknown> | null> {
    const origin = originOf(config.baseUrl.trim());
    if (!supportsImageTasks(config.baseUrl)) return null;

    const isForm = body instanceof FormData;
    const submit = await fetch(buildApiUrl(config.baseUrl, `${path}/async`), {
        method: "POST",
        headers: { ...authHeaders(config), ...(isForm ? {} : { "Content-Type": "application/json" }) },
        body: isForm ? body : JSON.stringify(body),
        signal: options?.signal,
    });
    if (submit.status === 404 || submit.status === 405) {
        rememberUnsupported(origin);
        return null;
    }
    if (!submit.ok) throw new Error(await readFetchError(submit, apiText("requestFailed")));
    const created = (await submit.json()) as ImageTask;
    const taskId = created.task_id || created.id;
    if (!taskId) throw new Error(apiText("noImageReturned"));

    const deadline = Date.now() + TASK_DEADLINE_MS;
    let delay = POLL_INTERVAL_MS;
    while (Date.now() < deadline) {
        await wait(delay, options?.signal);
        let response: Response;
        try {
            response = await fetch(buildApiUrl(config.baseUrl, `/images/tasks/${encodeURIComponent(taskId)}`), {
                headers: authHeaders(config),
                cache: "no-store",
                signal: options?.signal,
            });
        } catch (error) {
            if (options?.signal?.aborted) throw abortError(options.signal);
            // Offline or the tab was suspended: the task keeps running, ask again shortly.
            delay = Math.min(delay * 2, MAX_POLL_INTERVAL_MS);
            void error;
            continue;
        }
        if (response.status === 404) throw new Error(apiText("imageTaskExpired"));
        if (response.status === 429 || response.status >= 500) {
            delay = Math.min(delay * 2, MAX_POLL_INTERVAL_MS);
            continue;
        }
        if (!response.ok) throw new Error(await readFetchError(response, apiText("requestFailed")));
        delay = POLL_INTERVAL_MS;
        const task = (await response.json()) as ImageTask;
        if (task.status === "completed") {
            const result = (task.result && typeof task.result === "object" ? task.result : {}) as Record<string, unknown>;
            return await inlineImageUrls(result, options);
        }
        if (task.status === "failed") throw new Error(humanizeApiPayload({ error: task.error }, apiText("requestFailed")));
    }
    throw new Error(apiText("imageTaskTimeout"));
}

/**
 * Task results link to images the server keeps for about a day. Download them now (a few tries)
 * and hand back data URLs, as the synchronous endpoint does, so a saved canvas never points at
 * an expired link. If every try fails the link is kept: the canvas can still load it later.
 */
async function inlineImageUrls(result: Record<string, unknown>, options?: TaskOptions) {
    const data = Array.isArray(result.data) ? (result.data as Array<Record<string, unknown>>) : [];
    const items = await Promise.all(
        data.map(async (item) => {
            const url = typeof item.url === "string" ? item.url : "";
            if (!url || typeof item.b64_json === "string") return item;
            const dataUrl = await downloadAsDataUrl(url, options);
            return dataUrl ? { ...item, b64_json: dataUrl.replace(/^data:[^,]+,/, ""), url: undefined } : item;
        }),
    );
    return { ...result, data: items };
}

async function downloadAsDataUrl(url: string, options?: TaskOptions) {
    for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
        if (attempt > 0) await wait(POLL_INTERVAL_MS * attempt, options?.signal);
        try {
            const response = await fetch(url, { signal: options?.signal });
            if (!response.ok) continue;
            const blob = await response.blob();
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ""));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            if (options?.signal?.aborted) throw abortError(options.signal);
            void error;
        }
    }
    return "";
}
