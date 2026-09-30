import localforage from "localforage";

import { runPromptSource, type RawPrompt } from "./prompt-source-runtime";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";
import i18n from "@/i18n";
import { proxiedImageUrl } from "@/constant/runtime-config";
import type { PromptSource } from "./prompt-source-presets";
import { dedupePrompts, displayTitle, promptTraits, recommendScore, type PromptModel, type PromptScene, type PromptTraits } from "@/lib/prompt-taxonomy";

export type Prompt = RawPrompt & {
    sourceId: string;
    category: string;
    githubUrl: string;
    /** Normalized scene / model / flags; see lib/prompt-taxonomy. */
    traits: PromptTraits;
};

export const ALL_PROMPTS_OPTION = "all";

export type PromptSort = "recommended" | "latest";
/** "gpt-image-2" = usable on this site's default model; "other" = written for another model. */
export type PromptModelFilter = typeof ALL_PROMPTS_OPTION | "gpt-image-2" | "other";

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    /** Entry count per scene for the current keyword / model / source filters. */
    sceneCounts: Partial<Record<PromptScene, number>>;
    total: number;
};

export function promptKey(item: Pick<Prompt, "sourceId" | "id">) {
    return `${item.sourceId}:${item.id}`;
}

export type PromptSourceStatus = {
    sourceId: string;
    count: number;
    lastSuccessAt: string;
    lastError: string;
};

export type PromptSourceRefreshResult = PromptSourceStatus & {
    sourceName: string;
    success: boolean;
};

export type PromptSourceRefreshSummary = {
    results: PromptSourceRefreshResult[];
    total: number;
    successCount: number;
    failureCount: number;
};

type SourceCache = PromptSourceStatus & {
    items: Prompt[];
    fetchedAt: number;
    signature: string;
};

const cacheTtlMs = 1000 * 60 * 60;
const promptCacheStore = localforage.createInstance({ name: "infinite-canvas", storeName: "prompt_cache" });
const loadingSources = new Map<string, Promise<PromptSourceRefreshResult>>();

function enabledSources() {
    return usePromptSourceStore.getState().sources.filter((source) => source.enabled);
}

function cacheKey(sourceId: string) {
    return `prompt-source:${sourceId}`;
}

function sourceSignature(source: PromptSource) {
    const value = `${source.name}\n${source.url}\n${source.homepage}`;
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
    return `${value.length}:${hash}`;
}

// GitHub README images are served through camo.githubusercontent.com; many of those
// proxy links now return 403 while the original still loads. The hex path segment is the original URL.
export function unwrapCamoUrl(url: string): string {
    const match = /^https:\/\/camo\.githubusercontent\.com\/[0-9a-f]+\/([0-9a-f]+)$/i.exec(url);
    if (!match || match[1].length % 2) return url;
    try {
        const decoded = new TextDecoder().decode(new Uint8Array(match[1].match(/../g)!.map((byte) => Number.parseInt(byte, 16))));
        return /^https?:\/\//i.test(decoded) ? decoded : url;
    } catch {
        return url;
    }
}

function displayImageUrl(url: string): string {
    return proxiedImageUrl(unwrapCamoUrl(url));
}

function withSourceMeta(source: PromptSource, items: RawPrompt[]): Prompt[] {
    return items.map((item) => {
        const tags = Array.isArray(item.tags) ? item.tags : [];
        return {
            ...item,
            title: displayTitle({ title: item.title, prompt: item.prompt, tags }),
            tags,
            coverUrl: displayImageUrl(item.coverUrl || ""),
            description: item.description || "",
            referenceImageUrls: Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls.map(displayImageUrl) : [],
            sourceId: source.id,
            category: source.name,
            githubUrl: item.sourceUrl || source.homepage,
            traits: promptTraits({ title: item.title, prompt: item.prompt, description: item.description, tags, imageModel: item.imageModel }),
        };
    });
}

async function readSourceCache(sourceId: string) {
    return promptCacheStore.getItem<SourceCache>(cacheKey(sourceId));
}

async function refreshSourceRecord(source: PromptSource): Promise<PromptSourceRefreshResult> {
    const previous = await readSourceCache(source.id);
    try {
        const items = withSourceMeta(source, await runPromptSource(source));
        const lastSuccessAt = new Date().toISOString();
        const cache: SourceCache = { sourceId: source.id, items, count: items.length, fetchedAt: Date.now(), lastSuccessAt, lastError: "", signature: sourceSignature(source) };
        await promptCacheStore.setItem(cacheKey(source.id), cache);
        return { sourceId: source.id, sourceName: source.name, count: items.length, lastSuccessAt, lastError: "", success: true };
    } catch (error) {
        const lastError = error instanceof Error ? error.message : String(error);
        const cache: SourceCache = {
            sourceId: source.id,
            items: previous?.items || [],
            count: previous?.items?.length || 0,
            fetchedAt: previous?.fetchedAt || 0,
            lastSuccessAt: previous?.lastSuccessAt || "",
            lastError,
            signature: previous?.signature || sourceSignature(source),
        };
        await promptCacheStore.setItem(cacheKey(source.id), cache);
        return { sourceId: source.id, sourceName: source.name, count: cache.count, lastSuccessAt: cache.lastSuccessAt, lastError, success: false };
    }
}

function getOrStartRefresh(source: PromptSource) {
    const current = loadingSources.get(source.id);
    if (current) return current;
    const loading = refreshSourceRecord(source).finally(() => loadingSources.delete(source.id));
    loadingSources.set(source.id, loading);
    return loading;
}

async function getSourcePrompts(source: PromptSource): Promise<Prompt[]> {
    const cached = await readSourceCache(source.id);
    if (cached) {
        const stale = cached.signature !== sourceSignature(source) || Date.now() - cached.fetchedAt >= cacheTtlMs;
        if (stale) void getOrStartRefresh(source).catch(() => undefined);
        return withSourceMeta(source, cached.items);
    }
    const result = await getOrStartRefresh(source);
    if (!result.success) throw new Error(result.lastError);
    return (await readSourceCache(source.id))?.items || [];
}

async function getAllPrompts(): Promise<Prompt[]> {
    const settled = await Promise.all(
        enabledSources().map(async (source) => {
            try {
                return await getSourcePrompts(source);
            } catch {
                return [];
            }
        }),
    );
    // NSFW and politically sensitive entries are never offered; duplicates from several sources are merged.
    return dedupePrompts(settled.flat().filter(isOffered));
}

export type PromptQuery = {
    keyword?: string;
    /** Legacy raw-tag filter (agent tools); the UI filters by scene instead. */
    tag?: string[];
    /** Source name ("category" in the original data model). */
    category?: string;
    scene?: PromptScene | typeof ALL_PROMPTS_OPTION;
    model?: PromptModelFilter;
    sort?: PromptSort;
    page?: number;
    pageSize?: number;
};

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, scene = ALL_PROMPTS_OPTION, model = ALL_PROMPTS_OPTION, sort = "recommended", page = 1, pageSize = 20 }: PromptQuery = {}): Promise<PromptListResponse> {
    const items = await getAllPrompts();
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.max(1, Math.min(100, pageSize));
    const base = { keyword: keyword.trim().toLowerCase(), category, model };
    const withoutSceneFilter = filterPrompts(items, { ...base, tags: tag, scene: ALL_PROMPTS_OPTION });
    const filtered = sortPrompts(filterPrompts(withoutSceneFilter, { ...base, tags: [], scene }), sort);
    const categories = enabledSources().map((source) => source.name);

    return {
        items: filtered.slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize),
        tags: collectTags(filterPrompts(items, { ...base, tags: [], scene })),
        categories,
        sceneCounts: countScenes(withoutSceneFilter),
        total: filtered.length,
    };
}

/** Applies the keyword / scene / model filters to an in-memory list (favorites, recents). */
export function filterPromptList(items: Prompt[], query: Pick<PromptQuery, "keyword" | "scene" | "model">) {
    return filterPrompts(items, { keyword: (query.keyword || "").trim().toLowerCase(), category: ALL_PROMPTS_OPTION, tags: [], scene: query.scene || ALL_PROMPTS_OPTION, model: query.model || ALL_PROMPTS_OPTION });
}

function sortPrompts(items: Prompt[], sort: PromptSort) {
    const decorated = items.map((item, index) => ({ item, index, score: sort === "latest" ? promptTime(item) : recommendScore(item) }));
    decorated.sort((a, b) => b.score - a.score || a.index - b.index);
    return decorated.map(({ item }) => item);
}

function promptTime(item: Prompt) {
    const time = Date.parse(item.updatedAt || item.createdAt || "");
    return Number.isNaN(time) ? 0 : time;
}

function countScenes(items: Prompt[]) {
    const counts: Partial<Record<PromptScene, number>> = {};
    for (const item of items) for (const scene of item.traits.scenes) counts[scene] = (counts[scene] || 0) + 1;
    return counts;
}

export async function fetchSourcePrompts(sourceId: string): Promise<Prompt[]> {
    const source = usePromptSourceStore.getState().sources.find((item) => item.id === sourceId);
    if (!source) throw new Error(i18n.t("prompts.sourceMissing"));
    return (await getSourcePrompts(source)).filter(isOffered);
}

export async function refreshSource(sourceId: string): Promise<PromptSourceRefreshResult> {
    const source = usePromptSourceStore.getState().sources.find((item) => item.id === sourceId);
    if (!source) throw new Error(i18n.t("prompts.sourceMissing"));
    const result = await getOrStartRefresh(source);
    if (!result.success) throw new Error(result.lastError);
    return result;
}

export async function refreshAllSources(): Promise<PromptSourceRefreshSummary> {
    const results = await Promise.all(enabledSources().map(getOrStartRefresh));
    return summarizeRefresh(results);
}

export async function refreshDueSources(maxAgeMs: number): Promise<PromptSourceRefreshSummary> {
    const sources = await Promise.all(
        enabledSources().map(async (source) => {
            const cached = await readSourceCache(source.id);
            const lastSuccess = cached?.lastSuccessAt ? new Date(cached.lastSuccessAt).getTime() : 0;
            return !lastSuccess || Boolean(cached?.lastError) || Date.now() - lastSuccess >= maxAgeMs || cached?.signature !== sourceSignature(source) ? source : null;
        }),
    );
    const results = await Promise.all(sources.filter((source): source is PromptSource => Boolean(source)).map(getOrStartRefresh));
    return summarizeRefresh(results);
}

export async function fetchPromptSourceStatuses(): Promise<Record<string, PromptSourceStatus>> {
    const entries = await Promise.all(
        usePromptSourceStore.getState().sources.map(async (source) => {
            const cache = await readSourceCache(source.id);
            return [source.id, { sourceId: source.id, count: cache?.items?.length || 0, lastSuccessAt: cache?.lastSuccessAt || "", lastError: cache?.lastError || "" }] as const;
        }),
    );
    return Object.fromEntries(entries);
}

function summarizeRefresh(results: PromptSourceRefreshResult[]): PromptSourceRefreshSummary {
    return {
        results,
        total: results.reduce((total, item) => total + item.count, 0),
        successCount: results.filter((item) => item.success).length,
        failureCount: results.filter((item) => !item.success).length,
    };
}

function filterPrompts(items: Prompt[], options: { keyword: string; category: string; tags: string[]; scene: string; model: PromptModelFilter }) {
    return items.filter((item) => {
        if (isActiveOption(options.category) && item.category !== options.category) return false;
        if (options.tags.length && !options.tags.some((tag) => item.tags.includes(tag))) return false;
        if (isActiveOption(options.scene) && !item.traits.scenes.includes(options.scene as PromptScene)) return false;
        if (options.model === "gpt-image-2" && !modelUsableHere(item.traits.model)) return false;
        if (options.model === "other" && modelUsableHere(item.traits.model)) return false;
        if (!options.keyword) return true;
        return [item.title, item.prompt, item.description, item.category, ...item.tags].join(" ").toLowerCase().includes(options.keyword);
    });
}

function isOffered(item: Prompt) {
    return !item.traits.nsfw && !item.traits.sensitive;
}

/** Prompts not tied to a specific model are treated as usable with GPT Image 2 as well. */
function modelUsableHere(model: PromptModel) {
    return model === "gpt-image-2" || model === "unknown";
}

function collectTags(items: Prompt[]) {
    return Array.from(new Set(items.flatMap((item) => item.tags).filter(Boolean)));
}

function isActiveOption(value: string) {
    return value && value !== ALL_PROMPTS_OPTION && value !== "all";
}

export function formatPromptDate(value: string, locale?: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
