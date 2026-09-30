// Per-session prompt drafts for the image / video workbenches.
//
// A "session" is either the unsaved draft ("new") or a generation log the user opened. Whatever is
// typed into the prompt box (and the attached references) is remembered per session, so switching
// to another log, another page, or reloading does not throw the text away. Pure helpers here; the
// persisted store is stores/use-workbench-draft-store.ts.

export const NEW_SESSION_KEY = "new";
export const MAX_DRAFTS = 40;
/** References without a storage key keep their data URL; skip huge ones so localStorage stays small. */
const MAX_INLINE_REFERENCE_CHARS = 400_000;

export type DraftReference = { id: string; dataUrl?: string; storageKey?: string };

export type WorkbenchDraft<R extends DraftReference = DraftReference> = {
    prompt: string;
    references: R[];
    updatedAt: number;
};

export function isEmptyDraft(draft: Pick<WorkbenchDraft, "prompt" | "references"> | undefined): boolean {
    return !draft || (!draft.prompt.trim() && draft.references.length === 0);
}

/** True when the box content differs from what the opened log already contains. */
export function differsFromBaseline(current: Pick<WorkbenchDraft, "prompt" | "references">, baseline: Pick<WorkbenchDraft, "prompt" | "references">): boolean {
    if (current.prompt !== baseline.prompt) return true;
    if (current.references.length !== baseline.references.length) return true;
    return current.references.some((item, index) => item.id !== baseline.references[index]?.id);
}

/** Strips resolvable image data (it lives in image storage) before persisting. */
export function serializeDraftReferences<R extends DraftReference>(references: R[]): R[] {
    return references.map((item) => (item.storageKey ? { ...item, dataUrl: "" } : item)).filter((item) => item.storageKey || (item.dataUrl || "").length <= MAX_INLINE_REFERENCE_CHARS);
}

/** Keeps the newest drafts; the "new" session draft is never evicted. */
export function pruneDrafts<R extends DraftReference>(drafts: Record<string, WorkbenchDraft<R>>, max = MAX_DRAFTS): Record<string, WorkbenchDraft<R>> {
    const entries = Object.entries(drafts);
    if (entries.length <= max) return drafts;
    const keep = new Set(
        entries
            .filter(([key]) => key !== NEW_SESSION_KEY)
            .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
            .slice(0, max - 1)
            .map(([key]) => key),
    );
    return Object.fromEntries(entries.filter(([key]) => key === NEW_SESSION_KEY || keep.has(key)));
}
