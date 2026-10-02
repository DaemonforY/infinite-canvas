import { describe, expect, test } from "bun:test";

import { labelIndexes, niceMax, periodChange, shortDay } from "../src/lib/creator-stats";

describe("creator stats helpers", () => {
    test("period change", () => {
        expect(periodChange(5, 5)).toEqual({ kind: "same" });
        expect(periodChange(3, 0)).toEqual({ kind: "new" });
        expect(periodChange(15, 10)).toEqual({ kind: "up", percent: 50 });
        expect(periodChange(0, 4)).toEqual({ kind: "down", percent: 100 });
    });

    test("chart labels and axis", () => {
        expect(labelIndexes(0)).toEqual([]);
        expect(labelIndexes(4)).toEqual([0, 1, 2, 3]);
        const thirty = labelIndexes(30);
        expect(thirty[0]).toBe(0);
        expect(thirty[thirty.length - 1]).toBe(29);
        expect(thirty.length).toBeLessThanOrEqual(6);
        expect([0, 1, 3, 7, 12, 99, 101].map(niceMax)).toEqual([1, 1, 5, 10, 20, 100, 200]);
        expect(shortDay("2026-10-02")).toBe("10-02");
    });
});
