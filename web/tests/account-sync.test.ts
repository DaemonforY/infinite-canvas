import { expect, test } from "bun:test";

import { canonicalJson, favoritesFromDoc, mergeDraftsDocs, mergeFavoritesDocs, readDraftsDoc, readFavoritesDoc, type FavoritesDoc } from "../src/lib/account-sync";

type P = { id: string };
const now = Date.parse("2026-10-01T12:00:00Z");

test("favorites from two devices are unioned, newest first", () => {
    const phone: FavoritesDoc<P> = { v: 1, items: { a: { at: 1, prompt: { id: "a" } } } };
    const laptop: FavoritesDoc<P> = { v: 1, items: { b: { at: 2, prompt: { id: "b" } } } };
    expect(favoritesFromDoc(mergeFavoritesDocs(phone, laptop, now)).map((p) => p.id)).toEqual(["b", "a"]);
});

test("a later unfavorite wins over an older favorite, and vice versa", () => {
    const removedLater: FavoritesDoc<P> = { v: 1, items: { a: { at: 5, removed: true } } };
    const addedEarlier: FavoritesDoc<P> = { v: 1, items: { a: { at: 3, prompt: { id: "a" } } } };
    expect(favoritesFromDoc(mergeFavoritesDocs(addedEarlier, removedLater, now))).toEqual([]);
    expect(favoritesFromDoc(mergeFavoritesDocs(removedLater, addedEarlier, now))).toEqual([]);
    const readdedLater: FavoritesDoc<P> = { v: 1, items: { a: { at: 9, prompt: { id: "a" } } } };
    expect(favoritesFromDoc(mergeFavoritesDocs(removedLater, readdedLater, now)).map((p) => p.id)).toEqual(["a"]);
});

test("on equal timestamps a removal wins", () => {
    const added: FavoritesDoc<P> = { v: 1, items: { a: { at: 4, prompt: { id: "a" } } } };
    const removed: FavoritesDoc<P> = { v: 1, items: { a: { at: 4, removed: true } } };
    expect(favoritesFromDoc(mergeFavoritesDocs(added, removed, now))).toEqual([]);
});

test("old tombstones expire", () => {
    const oldRemoval: FavoritesDoc<P> = { v: 1, items: { a: { at: now - 100 * 24 * 3600 * 1000, removed: true } } };
    expect(Object.keys(mergeFavoritesDocs(oldRemoval, { v: 1, items: {} }, now).items)).toEqual([]);
});

test("server documents are read defensively", () => {
    expect(readFavoritesDoc({})).toEqual({ v: 1, items: {} });
    expect(readFavoritesDoc({ items: { a: { at: "x" }, b: { at: 1, prompt: { id: "b" } }, c: { at: 2, removed: true, prompt: { id: "c" } } } })).toEqual({
        v: 1,
        items: { b: { at: 1, prompt: { id: "b" } }, c: { at: 2, removed: true } },
    });
    expect(readDraftsDoc({ image: { prompt: "猫", at: 3 }, video: { prompt: 1 } })).toEqual({ v: 1, image: { prompt: "猫", at: 3 } });
});

test("drafts: newest per workbench wins, an emptied draft counts as a change", () => {
    const merged = mergeDraftsDocs({ v: 1, image: { prompt: "旧", at: 1 }, video: { prompt: "视频", at: 5 } }, { v: 1, image: { prompt: "新", at: 2 }, video: { prompt: "", at: 4 } });
    expect(merged).toEqual({ v: 1, image: { prompt: "新", at: 2 }, video: { prompt: "视频", at: 5 } });
    expect(mergeDraftsDocs({ v: 1, image: { prompt: "写了一半", at: 1 } }, { v: 1, image: { prompt: "", at: 2 } }).image).toEqual({ prompt: "", at: 2 });
});

test("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
});
