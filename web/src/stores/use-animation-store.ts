// AI 动画 history and generations, outside the page so a generation survives navigating away.
// Generations on the main site's gateway run as server jobs (they also survive closing the tab and
// show up on the user's other devices); other channels stream in this tab.

import localforage from "localforage";
import { nanoid } from "nanoid";
import { create } from "zustand";

import { isMainSiteBaseUrl } from "@/constant/runtime-config";
import i18n from "@/i18n";
import { animationTitle, sanitizeSvg, type AnimationBrief } from "@/lib/animation/svg";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { cancelAnimationJob, createAnimationJob, getAnimationJob, isActiveJob, listAnimationJobs, type AnimationJob } from "@/services/api/main-site-animation";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import { resolveModelRequestConfig, useConfigStore, type AiConfig } from "@/stores/use-config-store";

export type AnimationVersion = { id: string; svg: string; instruction: string; createdAt: number; jobId?: number };

export type AnimationPending = {
    mode: "create" | "revise";
    instruction: string;
    startedAt: number;
    chars: number;
    /** Server job; absent while it is being created or for in-tab generations. */
    jobId?: number;
    local?: boolean;
};

export type AnimationLog = {
    id: string;
    createdAt: number;
    title: string;
    brief: AnimationBrief;
    model: string;
    versions: AnimationVersion[];
    siteId?: number;
    pending?: AnimationPending;
    error?: string;
};

/** What a job carries so any device can file its result. */
type JobMeta = { logId: string; mode: "create" | "revise"; instruction: string; brief: AnimationBrief; title: string; model: string };

export type JobOutcome = { log: AnimationLog; status: "succeeded" | "failed" | "canceled" };

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "animation_logs" });
const LOGS_KEY = "logs";
const HANDLED_KEY = "handled_jobs";
const MAX_LOGS = 60;
const MAX_HANDLED = 300;
const localRuns = new Map<string, AbortController>();

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

type AnimationStore = {
    logs: AnimationLog[];
    loaded: boolean;
    handled: number[];
    load: () => Promise<void>;
    /** Starts a first draft (no logId) or a revision of logId. Resolves with the log id; rejects when a first draft could not start. */
    start: (input: { logId?: string; brief: AnimationBrief; model: string; instruction: string; messages: AiTextMessage[]; config: AiConfig }) => Promise<string>;
    cancel: (logId: string) => Promise<void>;
    /** Files a finished server job into the history once; returns what happened, or null if nothing did. */
    applyJob: (job: AnimationJob) => JobOutcome | null;
    trackJob: (job: AnimationJob) => void;
    setProgress: (logId: string, chars: number) => void;
    update: (logId: string, patch: Partial<AnimationLog>) => void;
    remove: (logId: string) => void;
};

function save(logs: AnimationLog[], handled?: number[]) {
    void store.setItem(LOGS_KEY, logs.slice(0, MAX_LOGS)).catch(() => undefined);
    if (handled) void store.setItem(HANDLED_KEY, handled.slice(-MAX_HANDLED)).catch(() => undefined);
}

function readMeta(job: AnimationJob): JobMeta | null {
    const meta = job.meta as Partial<JobMeta>;
    if (!meta || typeof meta.logId !== "string" || !meta.brief) return null;
    return { logId: meta.logId, mode: meta.mode === "revise" ? "revise" : "create", instruction: String(meta.instruction || ""), brief: meta.brief, title: String(meta.title || ""), model: String(meta.model || job.model) };
}

function logFromMeta(meta: JobMeta, createdAt: number): AnimationLog {
    return { id: meta.logId, createdAt, title: meta.title || animationTitle(meta.brief.prompt) || t("workbench.untitled"), brief: meta.brief, model: meta.model, versions: [] };
}

/** The main-site key when the model's channel is the main site's gateway, else "" (stream in this tab). */
function serverJobKey(config: AiConfig, model: string) {
    const request = resolveModelRequestConfig(config, model);
    if (request.apiFormat !== "openai" || !isMainSiteBaseUrl(request.baseUrl)) return { key: "", model: request.model };
    return { key: request.apiKey.trim(), model: request.model };
}

export const useAnimationStore = create<AnimationStore>((set, get) => {
    const patch = (logId: string, change: (log: AnimationLog) => AnimationLog, persist = true) => {
        const logs = get().logs.map((log) => (log.id === logId ? change(log) : log));
        set({ logs });
        if (persist) save(logs);
    };

    const fileResult = (logId: string, svg: string, instruction: string, jobId?: number) => {
        const result = sanitizeSvg(svg);
        patch(logId, (log) =>
            "error" in result
                ? { ...log, pending: undefined, error: t(`animation.errors.${result.error}`) }
                : { ...log, pending: undefined, error: undefined, versions: [...log.versions, { id: nanoid(), svg: result.svg, instruction, createdAt: Date.now(), jobId }] },
        );
        return !("error" in result);
    };

    const runInTab = async (logId: string, input: { model: string; instruction: string; messages: AiTextMessage[]; config: AiConfig }) => {
        const controller = new AbortController();
        localRuns.set(logId, controller);
        try {
            // onDelta receives the whole answer so far, not just the new piece.
            const answer = await requestImageQuestion({ ...input.config, model: input.model, systemPrompt: "" }, input.messages, (text) => get().setProgress(logId, text.length), { signal: controller.signal });
            fileResult(logId, answer, input.instruction);
        } catch (error) {
            patch(logId, (log) => ({ ...log, pending: undefined, error: controller.signal.aborted ? undefined : (error as Error)?.message || t("workbench.generationFailed") }));
        } finally {
            localRuns.delete(logId);
        }
    };

    return {
        logs: [],
        loaded: false,
        handled: [],

        load: async () => {
            if (get().loaded) return;
            const [logs, handled] = await Promise.all([store.getItem<AnimationLog[]>(LOGS_KEY), store.getItem<number[]>(HANDLED_KEY)]);
            // An in-tab generation cannot outlive the tab that ran it.
            const restored = (logs || []).map((log) => (log.pending?.local ? { ...log, pending: undefined, error: t("animation.interrupted") } : log));
            set({ logs: restored, handled: handled || [], loaded: true });
        },

        start: async ({ logId, brief, model, instruction, messages, config }) => {
            await get().load();
            const id = logId || nanoid();
            const pending: AnimationPending = { mode: logId ? "revise" : "create", instruction, startedAt: Date.now(), chars: 0 };
            if (logId) {
                patch(id, (log) => ({ ...log, pending, error: undefined }));
            } else {
                const log: AnimationLog = { id, createdAt: Date.now(), title: animationTitle(brief.prompt) || t("workbench.untitled"), brief, model, versions: [], pending };
                const logs = [log, ...get().logs];
                set({ logs });
                save(logs);
            }
            const server = serverJobKey(config, model);
            if (!server.key) {
                patch(id, (log) => ({ ...log, pending: log.pending && { ...log.pending, local: true } }));
                void runInTab(id, { model, instruction, messages, config });
                return id;
            }
            const meta: JobMeta = { logId: id, mode: pending.mode, instruction, brief, title: get().logs.find((log) => log.id === id)?.title || "", model };
            try {
                const job = await createAnimationJob(server.key, { model: server.model, messages, meta });
                patch(id, (log) => ({ ...log, pending: log.pending && { ...log.pending, jobId: job.id } }));
            } catch (error) {
                // A first draft that never started leaves no record; the caller shows the reason.
                if (!logId) {
                    const logs = get().logs.filter((log) => log.id !== id);
                    set({ logs });
                    save(logs);
                    throw error;
                }
                patch(id, (log) => ({ ...log, pending: undefined, error: (error as Error)?.message || t("workbench.generationFailed") }));
            }
            return id;
        },

        cancel: async (logId) => {
            const log = get().logs.find((item) => item.id === logId);
            if (!log?.pending) return;
            localRuns.get(logId)?.abort();
            const jobId = log.pending.jobId;
            if (log.versions.length) {
                patch(logId, (item) => ({ ...item, pending: undefined }));
            } else {
                // A canceled first draft has nothing to keep.
                set({ logs: get().logs.filter((item) => item.id !== logId) });
                save(get().logs);
            }
            if (jobId) {
                const key = findMainSiteApiKey(useConfigStore.getState().config);
                set({ handled: [...get().handled, jobId] });
                save(get().logs, get().handled);
                if (key) await cancelAnimationJob(key, jobId).catch(() => undefined);
            }
        },

        trackJob: (job) => {
            if (!isActiveJob(job) || get().handled.includes(job.id)) return;
            if (get().logs.some((log) => log.pending?.jobId === job.id)) return;
            const meta = readMeta(job);
            if (!meta) return;
            const pending: AnimationPending = { mode: meta.mode, instruction: meta.instruction, startedAt: Date.parse(job.created_at) || Date.now(), chars: job.chars, jobId: job.id };
            const existing = get().logs.find((log) => log.id === meta.logId);
            if (existing) {
                patch(existing.id, (log) => ({ ...log, pending, error: undefined }));
            } else {
                const logs = [{ ...logFromMeta(meta, pending.startedAt), pending }, ...get().logs];
                set({ logs });
                save(logs);
            }
        },

        applyJob: (job) => {
            if (isActiveJob(job)) return null;
            // Already filed (or its record was deleted) — unless a record here is still waiting for it.
            const waiting = get().logs.some((item) => item.pending?.jobId === job.id);
            if (get().handled.includes(job.id) && !waiting) return null;
            const handled = get().handled.includes(job.id) ? get().handled : [...get().handled, job.id];
            set({ handled });
            const meta = readMeta(job);
            let log = get().logs.find((item) => item.pending?.jobId === job.id) || (meta ? get().logs.find((item) => item.id === meta.logId) : undefined);
            if (!log && meta && job.status === "succeeded") {
                log = logFromMeta(meta, Date.parse(job.created_at) || Date.now());
                set({ logs: [log, ...get().logs] });
            }
            if (!log) {
                save(get().logs, handled);
                return null;
            }
            const logId = log.id;
            const ownsPending = log.pending?.jobId === job.id;
            if (job.status === "succeeded" && job.svg) {
                fileResult(logId, job.svg, meta?.instruction || "", job.id);
            } else if (ownsPending || !log.versions.length) {
                patch(logId, (item) => ({ ...item, pending: ownsPending ? undefined : item.pending, error: job.status === "failed" ? stripErrorEnglish(job.error) || t("workbench.generationFailed") : item.error }));
            }
            save(get().logs, handled);
            const filed = get().logs.find((item) => item.id === logId);
            return filed ? { log: filed, status: job.status as JobOutcome["status"] } : null;
        },

        setProgress: (logId, chars) => patch(logId, (log) => (log.pending ? { ...log, pending: { ...log.pending, chars } } : log), false),

        update: (logId, change) => patch(logId, (log) => ({ ...log, ...change })),

        remove: (logId) => {
            void get().cancel(logId);
            const logs = get().logs.filter((log) => log.id !== logId);
            set({ logs });
            save(logs);
        },
    };
});

/** Server messages end with the English original in parentheses; the canvas shows the Chinese part. */
function stripErrorEnglish(message?: string) {
    return (message || "").replace(/（[A-Za-z][^（）]*）\s*$/, "").trim();
}

/** Reads the user's server jobs: resumes running ones and files the ones that ended while away. */
export async function syncAnimationJobs(): Promise<JobOutcome[]> {
    const state = useAnimationStore.getState();
    await state.load();
    const key = findMainSiteApiKey(useConfigStore.getState().config);
    if (!key) return [];
    const jobs = await listAnimationJobs(key);
    const outcomes: JobOutcome[] = [];
    for (const job of jobs) {
        if (isActiveJob(job)) {
            useAnimationStore.getState().trackJob(job);
            continue;
        }
        if (useAnimationStore.getState().handled.includes(job.id)) continue;
        // The list leaves out SVGs; fetch the ones still to file.
        const full = job.status === "succeeded" ? await getAnimationJob(key, job.id).catch(() => null) : job;
        const outcome = full && useAnimationStore.getState().applyJob(full);
        if (outcome) outcomes.push(outcome);
    }
    return outcomes;
}

/** Polls the jobs this device is waiting for; returns those that ended. */
export async function pollAnimationJobs(): Promise<JobOutcome[]> {
    const key = findMainSiteApiKey(useConfigStore.getState().config);
    const waiting = useAnimationStore.getState().logs.filter((log) => log.pending?.jobId);
    if (!key || !waiting.length) return [];
    const outcomes: JobOutcome[] = [];
    await Promise.all(
        waiting.map(async (log) => {
            const jobId = log.pending!.jobId!;
            try {
                const job = await getAnimationJob(key, jobId);
                if (isActiveJob(job)) {
                    useAnimationStore.getState().setProgress(log.id, job.chars);
                    return;
                }
                const outcome = useAnimationStore.getState().applyJob(job);
                if (outcome) outcomes.push(outcome);
            } catch (error) {
                // Gone (cleaned up after 7 days) — stop waiting; other errors retry on the next poll.
                if ((error as { reason?: string })?.reason === "ANIMATION_JOB_NOT_FOUND") useAnimationStore.getState().update(log.id, { pending: undefined, error: (error as Error).message });
            }
        }),
    );
    return outcomes;
}
