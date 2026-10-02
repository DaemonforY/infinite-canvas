// Creative community (works, profiles, collections, follows) stored on the main site. The canvas
// calls /api/v1/canvas/community/* with the HiveGPT session cookie (see main-site-account.ts);
// reading works signed out. Images are public files under the main site.

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import { stripEnglishOriginal } from "@/lib/provider-errors";
import { extractApiError, humanizeApiError, networkErrorText } from "./errors";

export type CommunityAuthor = { handle: string; display_name: string; avatar_url: string; followed_by_me: boolean };

export type CommunityProfile = CommunityAuthor & {
    bio: string;
    works_count: number;
    followers_count: number;
    following_count: number;
    likes_received: number;
    created_at: string;
    is_me: boolean;
};

export type WorkMedia = { position: number; url: string; thumb_url: string; mime_type: string; width: number; height: number; size_bytes: number };

export type WorkVisibility = "public" | "unlisted" | "private";

export type Work = {
    id: number;
    author: CommunityAuthor;
    title: string;
    description: string;
    prompt: string;
    show_prompt: boolean;
    model: string;
    params: Record<string, unknown>;
    source: string;
    tags: string[];
    visibility: WorkVisibility;
    status: "approved" | "pending" | "rejected" | "hidden";
    review_reason?: string;
    featured: boolean;
    cover_url: string;
    cover_thumb_url: string;
    cover_width: number;
    cover_height: number;
    image_count: number;
    like_count: number;
    favorite_count: number;
    remix_count: number;
    view_count: number;
    liked_by_me: boolean;
    favorited_by_me: boolean;
    is_mine: boolean;
    media?: WorkMedia[];
    /** Contests the work is entered in (work page only). */
    contests?: WorkContest[];
    /** image, or site: the work presents one of the author's hosted sites (images are screenshots). */
    kind?: WorkKind;
    site?: WorkSite;
    created_at: string;
};

export type WorkKind = "image" | "site";
/** url is set while the site is live (always for its author). */
export type WorkSite = { id: number; name: string; title: string; status: string; url?: string };
/** One of the signed-in user's sites in the "publish a web page" picker. */
export type MySite = { id: number; name: string; title: string; url: string; publishable: boolean; reason?: "not_live" | "password" | "published"; work_id?: number };

export type WorkContest = { contest_id: number; title: string; entry_id: number; status: "approved" | "pending"; final_rank?: number };

export type Collection = {
    id: number;
    author?: CommunityAuthor;
    title: string;
    description: string;
    visibility: "public" | "private";
    works_count: number;
    cover_urls: string[];
    is_mine: boolean;
    updated_at: string;
};

export type CommunityNotification = {
    id: number;
    kind: "follow" | "like" | "favorite" | "remix" | "featured" | "rejected" | "hidden";
    actor?: CommunityAuthor;
    work_id?: number;
    work_title?: string;
    work_thumb_url?: string;
    detail?: string;
    read: boolean;
    created_at: string;
};

export type Feed = "recommended" | "latest" | "following" | "favorites";
/** `at` (unix seconds) is sent back with later pages so the order holds while scrolling. */
export type WorksPage = { works: Work[]; next_offset: number; has_more: boolean; at?: number };
export type InteractionState = { like_count: number; favorite_count: number; liked_by_me: boolean; favorited_by_me: boolean };

/** Scene tags offered as filters (works may carry others). */
export const COMMUNITY_TAGS = ["人像", "插画", "国风", "海报", "电商", "风景", "动漫", "建筑", "美食", "Logo", "3D", "摄影"];

const base = () => `${MAIN_SITE_URL}/api/v1/canvas/community`;
const CANVAS_HEADER = { "X-HiveGPT-Canvas": "1" };

/** Absolute URL of a main-site path (media URLs come back as /api/v1/community/media/...). */
export function mainSiteAsset(url: string): string {
    if (!url) return "";
    return url.startsWith("/") ? `${MAIN_SITE_URL}${url}` : url;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${base()}${path}`, { ...init, credentials: "include", headers: { ...CANVAS_HEADER, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
    } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        throw new Error(networkErrorText());
    }
    const text = await res.text().catch(() => "");
    let body: { code?: number; message?: string; reason?: string; data?: T } = {};
    try {
        body = JSON.parse(text);
    } catch {
        // Not JSON (proxy error page…).
    }
    if (res.ok && body.code === 0) return body.data as T;
    if ((body.reason?.startsWith("COMMUNITY") || body.reason?.startsWith("CANVAS")) && body.message) throw new CommunityError(stripEnglishOriginal(body.message), body.reason, res.status);
    throw new CommunityError(humanizeApiError({ ...extractApiError(text), status: res.status }), body.reason || "", res.status);
}

export class CommunityError extends Error {
    constructor(
        message: string,
        readonly reason: string,
        readonly status: number,
    ) {
        super(message);
    }
}

export const isSignInRequired = (error: unknown) => error instanceof CommunityError && (error.status === 401 || error.reason === "CANVAS_SESSION_INVALID");

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export function listWorks(params: { feed?: Feed; tag?: string; kind?: WorkKind | ""; user?: string; collection?: number; offset?: number; limit?: number; at?: number }, signal?: AbortSignal) {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "" && value !== 0) q.set(key, String(value));
    return call<WorksPage>(`/works?${q}`, { signal });
}

export const getWork = (id: number, signal?: AbortSignal) => call<Work>(`/works/${id}`, { signal });
/** Other authors' works like this one (shared tags, same model), for the work page. */
export const getRelatedWorks = (id: number, limit = 12) => call<{ works: Work[] }>(`/works/${id}/related?limit=${limit}`).then((data) => data.works || []);
export const getProfile = (handle: string, signal?: AbortSignal) => call<CommunityProfile>(`/users/${encodeURIComponent(handle)}`, { signal });
export type CreatorCounts = { views: number; likes: number; favorites: number; remixes: number; followers: number };
export type CreatorStats = {
    days: number;
    totals: CreatorCounts & { works: number; public_works: number };
    period: CreatorCounts;
    previous: CreatorCounts;
    series: (CreatorCounts & { day: string })[];
    top_works: { work: Work; period_views: number; period_likes: number; period_favorites: number; period_remixes: number }[];
    /** First day views and remixes were counted per day ("" before any). */
    tracked_since: string;
};
/** The signed-in author's numbers over the last 7, 30 or 90 days. */
export const getCreatorStats = (days: number, signal?: AbortSignal) => call<CreatorStats>(`/me/stats?days=${days}`, { signal });
/** The signed-in user's hosted sites, saying which can be published as a web-page work. */
export const getMySites = () => call<{ sites: MySite[] }>("/me/sites").then((data) => data.sites || []);
export const getMyCommunity = () => call<{ profile: CommunityProfile | null; unread_notifications: number }>("/me");
export const listCollections = (handle: string) => call<Collection[]>(`/users/${encodeURIComponent(handle)}/collections`);
export const getCollection = (id: number) => call<Collection>(`/collections/${id}`);
export const listFollows = (handle: string, which: "followers" | "following", offset = 0) => call<CommunityProfile[]>(`/users/${encodeURIComponent(handle)}/${which}?offset=${offset}`);

export function saveProfile(input: { handle: string; display_name: string; bio: string; avatar?: Blob | null; clearAvatar?: boolean }) {
    const form = new FormData();
    form.set("handle", input.handle);
    form.set("display_name", input.display_name);
    form.set("bio", input.bio);
    if (input.avatar) form.set("avatar", input.avatar, "avatar");
    if (input.clearAvatar) form.set("clear_avatar", "true");
    return call<CommunityProfile>("/me/profile", { method: "PUT", body: form });
}

export type PublishInput = {
    images: Blob[];
    title: string;
    description: string;
    prompt: string;
    showPrompt: boolean;
    model: string;
    params: Record<string, unknown>;
    source: "canvas" | "image_workbench" | "tools" | "site";
    tags: string[];
    visibility: WorkVisibility;
    collectionId?: number;
    remixOf?: number;
    /** A web-page work presenting this site (images are its screenshots). */
    siteId?: number;
};

export function publishWork(input: PublishInput) {
    const form = new FormData();
    input.images.forEach((image, i) => form.append("images", image, `image-${i + 1}`));
    form.set("title", input.title);
    form.set("description", input.description);
    form.set("prompt", input.prompt);
    form.set("show_prompt", String(input.showPrompt));
    form.set("model", input.model);
    form.set("params", JSON.stringify(input.params));
    form.set("source", input.source);
    form.set("tags", JSON.stringify(input.tags));
    form.set("visibility", input.visibility);
    if (input.collectionId) form.set("collection_id", String(input.collectionId));
    if (input.remixOf) form.set("remix_of", String(input.remixOf));
    if (input.siteId) form.set("site_id", String(input.siteId));
    return call<Work>("/works", { method: "POST", body: form });
}

export const updateWork = (id: number, input: { title: string; description: string; show_prompt: boolean; tags: string[]; visibility: WorkVisibility }) => call<Work>(`/works/${id}`, json("PUT", input));
export const deleteWork = (id: number) => call<{ ok: boolean }>(`/works/${id}`, { method: "DELETE" });
export const setLike = (id: number, on: boolean) => call<InteractionState>(`/works/${id}/like`, { method: on ? "PUT" : "DELETE" });
export const setFavorite = (id: number, on: boolean) => call<InteractionState>(`/works/${id}/favorite`, { method: on ? "PUT" : "DELETE" });
export const setFollow = (handle: string, on: boolean) => call<CommunityProfile>(`/users/${encodeURIComponent(handle)}/follow`, { method: on ? "PUT" : "DELETE" });
/** Enters one image of the signed-in user's work in a main-site contest (no API key needed). */
export const enterContest = (workId: number, input: { contest_id: number; image_index: number; title: string; description: string }) =>
    call<{ id: number; status: string }>(`/works/${workId}/contest-entries`, json("POST", input));
export const countRemix = (id: number) => call<{ ok: boolean }>(`/works/${id}/remix`, { method: "POST" }).catch(() => undefined);
export const reportWork = (id: number, reason: string, detail: string) => call<{ ok: boolean }>(`/works/${id}/report`, json("POST", { reason, detail }));
export const createCollection = (input: { title: string; description: string; visibility: "public" | "private" }) => call<Collection>("/collections", json("POST", input));
export const updateCollection = (id: number, input: { title: string; description: string; visibility: "public" | "private" }) => call<Collection>(`/collections/${id}`, json("PUT", input));
export const deleteCollection = (id: number) => call<{ ok: boolean }>(`/collections/${id}`, { method: "DELETE" });
export const setCollectionItem = (id: number, workId: number, on: boolean) => call<{ ok: boolean }>(`/collections/${id}/works/${workId}`, { method: on ? "PUT" : "DELETE" });
export const workCollections = (workId: number) => call<number[]>(`/works/${workId}/collections`);
export const listNotifications = () => call<CommunityNotification[]>("/notifications");
export const markNotificationsRead = () => call<{ ok: boolean }>("/notifications/read", { method: "POST" });

/** Name shown for an author: display name, else @handle. */
export const authorName = (author: Pick<CommunityAuthor, "display_name" | "handle">) => author.display_name.trim() || `@${author.handle}`;

/** Rules shared with the server: 3–20 lowercase letters, digits, underscores, starting with a letter. */
export const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

/** Card height for a masonry column of the given width (cover aspect, clamped). */
export function cardHeight(work: Pick<Work, "cover_width" | "cover_height">, width: number): number {
    if (!work.cover_width || !work.cover_height) return width;
    const ratio = Math.min(1.8, Math.max(0.56, work.cover_height / work.cover_width));
    return Math.round(width * ratio);
}

export function compactCount(n: number): string {
    if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}
