// AI 动画 jobs on the main site (/api/v1/animation-jobs, API key). The server calls the model with the
// user's key and keeps going after the tab is closed; the canvas polls for the SVG.

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import { stripEnglishOriginal } from "@/lib/provider-errors";
import type { AiTextMessage } from "@/services/api/image";
import { extractApiError, humanizeApiError, networkErrorText } from "./errors";

export type AnimationJobStatus = "pending" | "running" | "succeeded" | "failed" | "canceled";

export type AnimationJob = {
    id: number;
    status: AnimationJobStatus;
    model: string;
    meta: Record<string, unknown>;
    svg?: string;
    error?: string;
    chars: number;
    created_at: string;
    finished_at?: string;
};

export const isActiveJob = (job: Pick<AnimationJob, "status">) => job.status === "pending" || job.status === "running";

const base = () => `${MAIN_SITE_URL}/api/v1/animation-jobs`;

async function call<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${base()}${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${apiKey}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
    } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        throw new Error(networkErrorText());
    }
    const text = await res.text().catch(() => "");
    let body: { code?: number; message?: string; reason?: string; data?: T } = {};
    try {
        body = JSON.parse(text);
    } catch {
        // Not our JSON envelope (proxy error page…).
    }
    if (res.ok && body.code === 0 && body.data !== undefined) return body.data;
    if (body.reason?.startsWith("ANIMATION_JOB") && body.message) throw Object.assign(new Error(stripEnglishOriginal(body.message)), { reason: body.reason });
    throw new Error(humanizeApiError({ ...extractApiError(text), status: res.status }));
}

export function createAnimationJob(apiKey: string, input: { model: string; messages: AiTextMessage[]; meta: Record<string, unknown> }) {
    return call<AnimationJob>(apiKey, "", { method: "POST", body: JSON.stringify(input) });
}

export function getAnimationJob(apiKey: string, id: number) {
    return call<AnimationJob>(apiKey, `/${id}`);
}

export function listAnimationJobs(apiKey: string) {
    return call<{ jobs: AnimationJob[] }>(apiKey, "").then((data) => data.jobs || []);
}

export function cancelAnimationJob(apiKey: string, id: number) {
    return call<AnimationJob>(apiKey, `/${id}/cancel`, { method: "POST" });
}
