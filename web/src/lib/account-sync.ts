// Documents synced to the user's main-site account (/api/v1/app-state/:namespace), and how two
// devices' copies are merged. Pure functions — unit-tested in tests/account-sync.test.ts.
//
// Merging is per entry, newest timestamp wins. Removals are kept as tombstones so a favorite
// removed on one device is not brought back by another device that still has it.

export const FAVORITES_NAMESPACE = "canvas.favorites";
export const DRAFTS_NAMESPACE = "canvas.drafts";

/** Synced favorites cap; the server stores at most 1MB per document. */
export const MAX_SYNCED_FAVORITES = 300;
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_TOMBSTONES = 500;

export type FavoriteEntry<P> = { at: number; removed?: boolean; prompt?: P };
export type FavoritesDoc<P> = { v: 1; items: Record<string, FavoriteEntry<P>> };

export type DraftEntry = { prompt: string; at: number };
/** Only the new-session draft travels: log drafts refer to generation logs that live on one device. */
export type DraftsDoc = { v: 1; image?: DraftEntry; video?: DraftEntry };

export function emptyFavoritesDoc<P>(): FavoritesDoc<P> {
    return { v: 1, items: {} };
}

/** Accepts whatever the server returned (possibly `{}` for "nothing stored yet"). */
export function readFavoritesDoc<P>(value: unknown): FavoritesDoc<P> {
    const items = isRecord(value) && isRecord(value.items) ? value.items : {};
    const out: Record<string, FavoriteEntry<P>> = {};
    for (const [key, entry] of Object.entries(items)) {
        if (!isRecord(entry) || typeof entry.at !== "number") continue;
        if (entry.removed) out[key] = { at: entry.at, removed: true };
        else if (isRecord(entry.prompt)) out[key] = { at: entry.at, prompt: entry.prompt as P };
    }
    return { v: 1, items: out };
}

export function mergeFavoritesDocs<P>(a: FavoritesDoc<P>, b: FavoritesDoc<P>, now = Date.now()): FavoritesDoc<P> {
    const merged: Record<string, FavoriteEntry<P>> = { ...a.items };
    for (const [key, entry] of Object.entries(b.items)) {
        const current = merged[key];
        // Newest wins; on a tie a removal wins so "unfavorite" is never undone by accident.
        if (!current || entry.at > current.at || (entry.at === current.at && entry.removed && !current.removed)) merged[key] = entry;
    }
    return pruneFavoritesDoc({ v: 1, items: merged }, now);
}

export function pruneFavoritesDoc<P>(doc: FavoritesDoc<P>, now = Date.now()): FavoritesDoc<P> {
    const live = Object.entries(doc.items)
        .filter(([, entry]) => !entry.removed)
        .sort((x, y) => y[1].at - x[1].at);
    const tombstones = Object.entries(doc.items)
        .filter(([, entry]) => entry.removed && now - entry.at < TOMBSTONE_TTL_MS)
        .sort((x, y) => y[1].at - x[1].at)
        .slice(0, MAX_TOMBSTONES);
    return { v: 1, items: Object.fromEntries([...live.slice(0, MAX_SYNCED_FAVORITES), ...tombstones]) };
}

/** Live favorites, newest first. */
export function favoritesFromDoc<P>(doc: FavoritesDoc<P>): P[] {
    return Object.values(doc.items)
        .filter((entry): entry is FavoriteEntry<P> & { prompt: P } => !entry.removed && Boolean(entry.prompt))
        .sort((x, y) => y.at - x.at)
        .map((entry) => entry.prompt);
}

export function readDraftsDoc(value: unknown): DraftsDoc {
    const doc: DraftsDoc = { v: 1 };
    if (!isRecord(value)) return doc;
    for (const kind of ["image", "video"] as const) {
        const entry = value[kind];
        if (isRecord(entry) && typeof entry.prompt === "string" && typeof entry.at === "number") doc[kind] = { prompt: entry.prompt, at: entry.at };
    }
    return doc;
}

export function mergeDraftsDocs(a: DraftsDoc, b: DraftsDoc): DraftsDoc {
    const pick = (x?: DraftEntry, y?: DraftEntry) => (!x ? y : !y ? x : y.at > x.at ? y : x);
    const merged: DraftsDoc = { v: 1 };
    const image = pick(a.image, b.image);
    const video = pick(a.video, b.video);
    if (image) merged.image = image;
    if (video) merged.video = video;
    return merged;
}

/** Key-order independent JSON, to tell whether a merge changed what the server has (jsonb reorders keys). */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (isRecord(value)) {
        return `{${Object.keys(value)
            .filter((key) => value[key] !== undefined)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
