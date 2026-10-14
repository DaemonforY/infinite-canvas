import localforage from "localforage";

import { deleteStoredImages } from "@/services/image-storage";
import { keysToDelete, type ComicProject } from "@/lib/comic";
import { listLibrary } from "./comic-library";

// Comic projects live in IndexedDB like the image workbench logs; images are stored once (image_files)
// and referenced by storageKey.

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "comic_projects" });

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
}

export async function deleteComic(project: ComicProject) {
    const others = (await listComics()).filter((item) => item.id !== project.id);
    const library = (await listLibrary()).map((entry) => entry.sheet);
    await deleteStoredImages(keysToDelete(project, others, library));
    await store.removeItem(project.id);
}

/** All episodes of the series a project belongs to (a project without a series is its own episode 1). */
export function seriesEpisodes(project: ComicProject, all: ComicProject[]) {
    const seriesId = project.series?.id || project.id;
    return all.filter((item) => (item.series?.id || item.id) === seriesId).sort((a, b) => (a.series?.episode || 1) - (b.series?.episode || 1));
}
