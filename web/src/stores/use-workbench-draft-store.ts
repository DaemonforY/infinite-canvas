import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DraftEntry } from "@/lib/account-sync";
import { differsFromBaseline, NEW_SESSION_KEY, pruneDrafts, serializeDraftReferences, type DraftReference, type WorkbenchDraft } from "@/lib/workbench-drafts";

export type WorkbenchKind = "image" | "video";

type DraftStore = {
    drafts: Record<WorkbenchKind, Record<string, WorkbenchDraft>>;
    /** When the new-session draft was last emptied; an emptied draft syncs as `{ prompt: "" }`. */
    clearedAt: Record<WorkbenchKind, number>;
    /** Bumped when a newer new-session draft arrived from the account, so an open page can refresh. */
    remoteRevision: Record<WorkbenchKind, number>;
    saveDraft: (kind: WorkbenchKind, key: string, prompt: string, references: DraftReference[]) => void;
    removeDraft: (kind: WorkbenchKind, key: string) => void;
    /** Applies the account's new-session draft if it is newer than the local one. */
    applyRemoteNewDraft: (kind: WorkbenchKind, entry: DraftEntry) => void;
};

export const useWorkbenchDraftStore = create<DraftStore>()(
    persist(
        (set) => ({
            drafts: { image: {}, video: {} },
            clearedAt: { image: 0, video: 0 },
            remoteRevision: { image: 0, video: 0 },
            saveDraft: (kind, key, prompt, references) =>
                set((state) => {
                    const current = state.drafts[kind][key];
                    // Re-saving identical content must not make this device's copy look newer than another's.
                    if (current && !differsFromBaseline({ prompt, references }, current)) return state;
                    return {
                        drafts: {
                            ...state.drafts,
                            [kind]: pruneDrafts({ ...state.drafts[kind], [key]: { prompt, references: serializeDraftReferences(references), updatedAt: Date.now() } }),
                        },
                    };
                }),
            removeDraft: (kind, key) =>
                set((state) => {
                    if (!(key in state.drafts[kind])) return state;
                    const next = { ...state.drafts[kind] };
                    delete next[key];
                    return { drafts: { ...state.drafts, [kind]: next }, clearedAt: key === NEW_SESSION_KEY ? { ...state.clearedAt, [kind]: Date.now() } : state.clearedAt };
                }),
            applyRemoteNewDraft: (kind, entry) =>
                set((state) => {
                    const local = localNewDraftEntry(state, kind);
                    if (entry.at <= local.at) return state;
                    const current = state.drafts[kind][NEW_SESSION_KEY];
                    const next = { ...state.drafts[kind] };
                    // Reference images stay on the device that added them; only the text travels.
                    if (entry.prompt) next[NEW_SESSION_KEY] = { prompt: entry.prompt, references: current?.references || [], updatedAt: entry.at };
                    else delete next[NEW_SESSION_KEY];
                    return {
                        drafts: { ...state.drafts, [kind]: next },
                        clearedAt: entry.prompt ? state.clearedAt : { ...state.clearedAt, [kind]: entry.at },
                        remoteRevision: { ...state.remoteRevision, [kind]: state.remoteRevision[kind] + 1 },
                    };
                }),
        }),
        {
            name: "infinite-canvas:workbench_drafts_v1",
            partialize: (state) => ({ drafts: state.drafts, clearedAt: state.clearedAt }),
            merge: (persisted, current) => {
                const saved = persisted as Partial<DraftStore> | undefined;
                return {
                    ...current,
                    drafts: { image: saved?.drafts?.image || {}, video: saved?.drafts?.video || {} },
                    clearedAt: { image: saved?.clearedAt?.image || 0, video: saved?.clearedAt?.video || 0 },
                };
            },
        },
    ),
);

/** The new-session draft as it is synced: its text, or "" with the time it was emptied. */
export function localNewDraftEntry(state: Pick<DraftStore, "drafts" | "clearedAt">, kind: WorkbenchKind): DraftEntry {
    const draft = state.drafts[kind][NEW_SESSION_KEY];
    return draft ? { prompt: draft.prompt, at: draft.updatedAt } : { prompt: "", at: state.clearedAt[kind] || 0 };
}

export function readWorkbenchDraft<R extends DraftReference>(kind: WorkbenchKind, key: string = NEW_SESSION_KEY): WorkbenchDraft<R> | undefined {
    return useWorkbenchDraftStore.getState().drafts[kind][key] as WorkbenchDraft<R> | undefined;
}
