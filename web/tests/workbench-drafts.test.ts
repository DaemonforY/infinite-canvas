import { expect, test } from "bun:test";

import { differsFromBaseline, isEmptyDraft, NEW_SESSION_KEY, pruneDrafts, serializeDraftReferences, type WorkbenchDraft } from "../src/lib/workbench-drafts";

test("empty drafts are recognised", () => {
    expect(isEmptyDraft(undefined)).toBe(true);
    expect(isEmptyDraft({ prompt: "   ", references: [] })).toBe(true);
    expect(isEmptyDraft({ prompt: "一只猫", references: [] })).toBe(false);
    expect(isEmptyDraft({ prompt: "", references: [{ id: "r1" }] })).toBe(false);
});

test("a log session is only stored when the box differs from the log", () => {
    const log = { prompt: "原始提示词", references: [{ id: "a" }, { id: "b" }] };
    expect(differsFromBaseline({ prompt: "原始提示词", references: [{ id: "a" }, { id: "b" }] }, log)).toBe(false);
    expect(differsFromBaseline({ prompt: "原始提示词，加点雪", references: log.references }, log)).toBe(true);
    expect(differsFromBaseline({ prompt: log.prompt, references: [{ id: "a" }] }, log)).toBe(true);
    expect(differsFromBaseline({ prompt: log.prompt, references: [{ id: "b" }, { id: "a" }] }, log)).toBe(true);
});

test("stored references drop resolvable image data and oversized inline data", () => {
    const refs = serializeDraftReferences([
        { id: "stored", dataUrl: "blob:http://x/1", storageKey: "img-1" },
        { id: "inline", dataUrl: "data:image/png;base64,AAAA" },
        { id: "huge", dataUrl: `data:image/png;base64,${"A".repeat(500_000)}` },
    ]);
    expect(refs.map((item) => item.id)).toEqual(["stored", "inline"]);
    expect(refs[0].dataUrl).toBe("");
    expect(refs[1].dataUrl).toBe("data:image/png;base64,AAAA");
});

test("pruning keeps the newest drafts and never evicts the new-session draft", () => {
    const drafts: Record<string, WorkbenchDraft> = { [NEW_SESSION_KEY]: { prompt: "draft", references: [], updatedAt: 0 } };
    for (let i = 1; i <= 5; i += 1) drafts[`log-${i}`] = { prompt: `p${i}`, references: [], updatedAt: i };
    const pruned = pruneDrafts(drafts, 3);
    expect(Object.keys(pruned).sort()).toEqual(["log-4", "log-5", NEW_SESSION_KEY].sort());
    expect(pruneDrafts(drafts, 10)).toBe(drafts);
});
