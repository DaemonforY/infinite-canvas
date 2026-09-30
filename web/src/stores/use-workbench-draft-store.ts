import { create } from "zustand";
import { persist } from "zustand/middleware";

import { NEW_SESSION_KEY, pruneDrafts, serializeDraftReferences, type DraftReference, type WorkbenchDraft } from "@/lib/workbench-drafts";

export type WorkbenchKind = "image" | "video";

type DraftStore = {
    drafts: Record<WorkbenchKind, Record<string, WorkbenchDraft>>;
    saveDraft: (kind: WorkbenchKind, key: string, prompt: string, references: DraftReference[]) => void;
    removeDraft: (kind: WorkbenchKind, key: string) => void;
};

export const useWorkbenchDraftStore = create<DraftStore>()(
    persist(
        (set) => ({
            drafts: { image: {}, video: {} },
            saveDraft: (kind, key, prompt, references) =>
                set((state) => ({
                    drafts: {
                        ...state.drafts,
                        [kind]: pruneDrafts({ ...state.drafts[kind], [key]: { prompt, references: serializeDraftReferences(references), updatedAt: Date.now() } }),
                    },
                })),
            removeDraft: (kind, key) =>
                set((state) => {
                    if (!(key in state.drafts[kind])) return state;
                    const next = { ...state.drafts[kind] };
                    delete next[key];
                    return { drafts: { ...state.drafts, [kind]: next } };
                }),
        }),
        {
            name: "infinite-canvas:workbench_drafts_v1",
            partialize: (state) => ({ drafts: state.drafts }),
            merge: (persisted, current) => {
                const saved = (persisted as Partial<DraftStore> | undefined)?.drafts;
                return { ...current, drafts: { image: saved?.image || {}, video: saved?.video || {} } };
            },
        },
    ),
);

export function readWorkbenchDraft<R extends DraftReference>(kind: WorkbenchKind, key: string = NEW_SESSION_KEY): WorkbenchDraft<R> | undefined {
    return useWorkbenchDraftStore.getState().drafts[kind][key] as WorkbenchDraft<R> | undefined;
}
