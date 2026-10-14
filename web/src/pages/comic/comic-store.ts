import localforage from "localforage";

import { deleteStoredImages } from "@/services/image-storage";
import { keysToDelete, type ComicProject, type ComicSyncData, type ComicTombstone } from "@/lib/comic";
import { libraryStore, listLibrary, type LibraryCharacter } from "./comic-library";

// Comic projects live in IndexedDB like the image workbench logs; images are stored once (image_files)
// and referenced by storageKey.

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "comic_projects" });
/** Deleted comics and 我的角色 entries ("project:<id>" / "character:<id>" → time), so deletions sync too. */
const tombstones = localforage.createInstance({ name: "infinite-canvas", storeName: "comic_deleted" });

export const COMICS_CHANGED_EVENT = "hivegpt:comics-changed";
export const COMICS_SYNCED_EVENT = "hivegpt:comics-synced";

/** Tells cloud sync that comics changed here (it syncs a while later). */
export function notifyComicsChanged() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(COMICS_CHANGED_EVENT));
}

export async function addTombstone(kind: "project" | "character", id: string) {
    await tombstones.setItem(`${kind}:${id}`, Date.now());
    notifyComicsChanged();
}

export async function listComics() {
    const items: ComicProject[] = [];
    await store.iterate<ComicProject, void>((value) => {
        if (value?.id) items.push(value);
    });
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readComic(id: string) {
    return store.getItem<ComicProject>(id);
}

export async function saveComic(project: ComicProject) {
    await store.setItem(project.id, project);
    notifyComicsChanged();
}

export async function deleteComic(project: ComicProject) {
    const others = (await listComics()).filter((item) => item.id !== project.id);
    const library = (await listLibrary()).map((entry) => entry.sheet);
    await deleteStoredImages(keysToDelete(project, others, library));
    await store.removeItem(project.id);
    await addTombstone("project", project.id);
}

/** All episodes of the series a project belongs to (a project without a series is its own episode 1). */
export function seriesEpisodes(project: ComicProject, all: ComicProject[]) {
    const seriesId = project.series?.id || project.id;
    return all.filter((item) => (item.series?.id || item.id) === seriesId).sort((a, b) => (a.series?.episode || 1) - (b.series?.episode || 1));
}

// ---------------------------------------------------------------------------------------------
// Cloud sync (services/app-sync.ts, domain "comic"): everything on this device, and replacing it all with
// the merged copy.

export async function readComicSyncData(): Promise<ComicSyncData> {
    const deleted: ComicTombstone[] = [];
    const libraryDeleted: ComicTombstone[] = [];
    await tombstones.iterate<number, void>((deletedAt, key) => {
        const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
        (kind === "project" ? deleted : libraryDeleted).push({ id, deletedAt });
    });
    return { projects: await listComics(), deleted, library: await listLibrary(), libraryDeleted };
}

export async function writeComicSyncData(data: ComicSyncData) {
    await store.clear();
    for (const project of data.projects) await store.setItem(project.id, project);
    await libraryStore.clear();
    for (const entry of data.library as LibraryCharacter[]) await libraryStore.setItem(entry.id, entry);
    await tombstones.clear();
    for (const item of data.deleted) await tombstones.setItem(`project:${item.id}`, item.deletedAt);
    for (const item of data.libraryDeleted) await tombstones.setItem(`character:${item.id}`, item.deletedAt);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(COMICS_SYNCED_EVENT));
}
