import localforage from "localforage";
import { nanoid } from "nanoid";

import type { ComicCharacter, ComicImage } from "@/lib/comic";

// 我的角色: characters with a chosen design sheet, kept for other stories and later episodes. Stored on this
// device next to the comic projects; the sheet image is shared by key (deleting a comic keeps images the
// library still uses, see comic-store).

export type LibraryCharacter = { id: string; name: string; role: string; look: string; sheet: ComicImage; styleName: string; createdAt: number; updatedAt: number };

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "comic_characters" });

export async function listLibrary() {
    const items: LibraryCharacter[] = [];
    await store.iterate<LibraryCharacter, void>((value) => {
        if (value?.id) items.push(value);
    });
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Saves (or updates, when it came from the library) a character with its chosen sheet; returns the library id. */
export async function saveToLibrary(character: ComicCharacter, styleName: string) {
    const sheet = character.sheet >= 0 ? character.sheets[character.sheet] : undefined;
    if (!sheet) throw new Error("no sheet");
    const existing = character.libraryId ? await store.getItem<LibraryCharacter>(character.libraryId) : null;
    const now = Date.now();
    const entry: LibraryCharacter = { id: existing?.id || nanoid(), name: character.name, role: character.role, look: character.look, sheet, styleName, createdAt: existing?.createdAt || now, updatedAt: now };
    await store.setItem(entry.id, entry);
    return entry.id;
}

export async function removeFromLibrary(id: string) {
    await store.removeItem(id);
}

/** A library character as a project character, its sheet already chosen. */
export function fromLibrary(entry: LibraryCharacter): ComicCharacter {
    return { id: nanoid(), name: entry.name, role: entry.role, look: entry.look, sheets: [entry.sheet], sheet: 0, libraryId: entry.id };
}

/** Puts library characters into a cast: a character of the same name takes the sheet and look, others are added. */
export function mergeCast(cast: ComicCharacter[], picked: LibraryCharacter[]) {
    const next = [...cast];
    for (const entry of picked) {
        const index = next.findIndex((character) => character.name === entry.name);
        if (index < 0) next.push(fromLibrary(entry));
        else {
            const character = next[index];
            next[index] = { ...character, look: entry.look, role: entry.role || character.role, sheets: [...character.sheets, entry.sheet], sheet: character.sheets.length, libraryId: entry.id };
        }
    }
    return next;
}
