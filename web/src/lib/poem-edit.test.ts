import { describe, expect, test } from "bun:test";

import { createTextLayer, unrotate } from "./image-editor/text-layers";
import { applyEdits, isEdited, pushHistory, redoHistory, snapAngle, snapMove, undoHistory, type FracBox } from "./poem-edit";

const boxOf = (layer: { size: number; x: number; y: number }): FracBox => ({ x: layer.x, y: layer.y, w: layer.size, h: layer.size * 4 });

describe("applyEdits", () => {
    const title = createTextLayer({ id: "poem-title", text: "村居", x: 0.1, y: 0.1, size: 0.1 });
    const body = createTextLayer({ id: "poem-body", text: "草长莺飞", x: 0.6, y: 0.1, size: 0.04 });

    test("moves, scales around the centre, turns and retypes", () => {
        const [t, b] = applyEdits([title, body], { "poem-title": { dx: 0.05, dy: -0.02, scale: 2, rotation: 12 }, "poem-body": { text: "儿童散学" } }, boxOf);
        expect(t.size).toBeCloseTo(0.2);
        // Centre stays: box 0.1×0.4 at (0.1, 0.1) → 0.2×0.8 centred on (0.15, 0.3), then moved.
        expect(t.x).toBeCloseTo(0.05 + 0.05);
        expect(t.y).toBeCloseTo(-0.1 - 0.02);
        expect(t.rotation).toBe(12);
        expect(b.text).toBe("儿童散学");
        expect(b.x).toBe(0.6);
    });

    test("hidden texts are left out; blank text keeps the original; no edits = same layers", () => {
        const out = applyEdits([title, body], { "poem-title": { hidden: true }, "poem-body": { text: "  " } }, boxOf);
        expect(out.map((l) => l.id)).toEqual(["poem-body"]);
        expect(out[0].text).toBe("草长莺飞");
        const same = [title, body];
        expect(applyEdits(same, undefined, boxOf)).toBe(same);
        expect(isEdited({})).toBe(false);
        expect(isEdited({ "poem-title": { hidden: false } })).toBe(false);
        expect(isEdited({ "poem-title": { scale: 1.2 } })).toBe(true);
    });
});

describe("snapping", () => {
    test("pulls the nearest edge or centre onto the centre line or another block", () => {
        const s = snapMove({ x: 0.396, y: 0.2, w: 0.2, h: 0.1 }, [{ x: 0.7, y: 0.305, w: 0.1, h: 0.1 }], 0.01, 0.01);
        // Centre 0.496 → 0.5; bottom 0.3 → the other's top 0.305.
        expect(s.dx).toBeCloseTo(0.004);
        expect(s.dy).toBeCloseTo(0.005);
        expect(s.guides).toEqual([
            { axis: "x", at: 0.5 },
            { axis: "y", at: 0.305 },
        ]);
        expect(snapMove({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, [], 0.01, 0.01)).toEqual({ dx: 0, dy: 0, guides: [] });
    });

    test("angles: 15° steps with Shift, else onto right angles within 3°", () => {
        expect(snapAngle(22, true)).toBe(15);
        expect(snapAngle(2.4)).toBe(0);
        expect(snapAngle(-2)).toBe(0);
        expect(snapAngle(88)).toBe(90);
        expect(snapAngle(10.26)).toBe(10.3);
        expect(snapAngle(200)).toBe(-160);
        expect(snapAngle(-180)).toBe(180);
    });

    test("hit points are turned back into the block's frame", () => {
        const box = { x: 0, y: 0, w: 100, h: 20 };
        const [x, y] = unrotate({ rotation: 90 }, box, 50, 60);
        expect(x).toBeCloseTo(100);
        expect(y).toBeCloseTo(10);
        expect(unrotate({}, box, 3, 4)).toEqual([3, 4]);
    });
});

describe("history", () => {
    test("undo and redo walk the snapshots", () => {
        let h = pushHistory({ past: [], future: [] }, {});
        h = pushHistory(h, { a: { dx: 0.1 } });
        const current = { a: { dx: 0.2 } };
        const u = undoHistory(h, current)!;
        expect(u.edits).toEqual({ a: { dx: 0.1 } });
        const r = redoHistory(u.history, u.edits)!;
        expect(r.edits).toEqual(current);
        expect(undoHistory({ past: [], future: [] }, {})).toBeNull();
        expect(pushHistory(u.history, {}).future).toEqual([]);
    });
});
