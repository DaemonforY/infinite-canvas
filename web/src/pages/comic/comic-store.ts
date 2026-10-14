import localforage from "localforage";

import { deleteStoredImages } from "@/services/image-storage";
import type { ComicImage, ComicProject } from "@/lib/comic";

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

export function comicImages(project: ComicProject): ComicImage[] {
    return [...project.characters.flatMap((character) => [...character.sheets, ...(character.photo ? [character.photo] : [])]), ...project.pages.map((page) => page.image)];
}

export async function deleteComic(project: ComicProject) {
    await deleteStoredImages(
        comicImages(project)
            .map((image) => image.storageKey)
            .filter((key): key is string => Boolean(key)),
    );
    await store.removeItem(project.id);
}
