import localforage from "localforage";

import { deleteStoredImages } from "@/services/image-storage";
import type { PoemProject } from "@/lib/poem";

// 诗画 projects live in IndexedDB like comics; images are stored once (image_files) and referenced by storageKey.

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "poem_projects" });

export async function listPoems() {
    const items: PoemProject[] = [];
    await store.iterate<PoemProject, void>((value) => {
        if (value?.id) items.push(value);
    });
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function readPoem(id: string) {
    return store.getItem<PoemProject>(id);
}

export async function savePoem(project: PoemProject) {
    await store.setItem(project.id, { ...project, updatedAt: Date.now() });
}

export async function deletePoem(project: PoemProject) {
    const keys = [...project.drawings.map((d) => d.image.storageKey), project.poster?.storageKey].filter((key): key is string => Boolean(key));
    await deleteStoredImages(keys);
    await store.removeItem(project.id);
}
