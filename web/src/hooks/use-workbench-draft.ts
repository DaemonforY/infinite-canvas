import { useCallback, useEffect, useRef } from "react";

import { differsFromBaseline, isEmptyDraft, NEW_SESSION_KEY, type DraftReference, type WorkbenchDraft } from "@/lib/workbench-drafts";
import { ensureImagePreview, resolveImageUrl } from "@/services/image-storage";
import { useWorkbenchDraftStore, type WorkbenchKind } from "@/stores/use-workbench-draft-store";

type Snapshot<R extends DraftReference> = { prompt: string; references: R[] };

/**
 * Keeps the prompt box of a workbench session (the unsaved draft, or an opened log) in the draft
 * store. Saves are debounced while typing but flushed right away when the session changes or the
 * page unmounts, so nothing typed is lost. Nothing is saved until `markHydrated()` is called, so the
 * initial empty state cannot overwrite a stored draft.
 */
export function useWorkbenchDraft<R extends DraftReference>({
    kind,
    sessionKey,
    prompt,
    references,
    baseline,
}: {
    kind: WorkbenchKind;
    sessionKey: string;
    prompt: string;
    references: R[];
    /** What the opened log contains; unchanged log sessions are not stored. */
    baseline?: Snapshot<R>;
}) {
    const hydrated = useRef(false);
    const pending = useRef<{ key: string; run: () => void } | null>(null);

    const flush = useCallback(() => {
        const job = pending.current;
        pending.current = null;
        job?.run();
    }, []);

    const baselinePrompt = baseline?.prompt;
    const baselineReferences = baseline?.references;

    useEffect(() => {
        if (!hydrated.current) return;
        if (pending.current && pending.current.key !== sessionKey) flush();
        const snapshot: Snapshot<R> = { prompt, references };
        const base = baselinePrompt === undefined ? undefined : { prompt: baselinePrompt, references: baselineReferences || [] };
        const key = sessionKey;
        pending.current = {
            key,
            run: () => {
                const { saveDraft, removeDraft } = useWorkbenchDraftStore.getState();
                const unchanged = key === NEW_SESSION_KEY ? isEmptyDraft(snapshot) : !base || !differsFromBaseline(snapshot, base);
                if (unchanged) removeDraft(kind, key);
                else saveDraft(kind, key, snapshot.prompt, snapshot.references);
            },
        };
        const timer = window.setTimeout(flush, 400);
        return () => window.clearTimeout(timer);
    }, [kind, sessionKey, prompt, references, baselinePrompt, baselineReferences, flush]);

    // Leaving the page (route change) keeps the last keystrokes.
    useEffect(() => {
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            flush();
        };
    }, [flush]);

    return {
        markHydrated: () => {
            hydrated.current = true;
        },
        /** Drops the stored draft of a session (e.g. when the user starts a fresh one on purpose). */
        discard: (key: string) => {
            if (pending.current?.key === key) pending.current = null;
            useWorkbenchDraftStore.getState().removeDraft(kind, key);
        },
    };
}

/** Resolves stored reference images of a draft back to displayable URLs. */
export async function restoreDraftReferences<R extends DraftReference>(draft: WorkbenchDraft<R> | undefined): Promise<R[]> {
    if (!draft?.references.length) return [];
    return Promise.all(
        draft.references.map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl || "") };
        }),
    );
}
