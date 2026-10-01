import { expect, test } from "bun:test";

import { posterCoverHeight, wrapText } from "../src/lib/share-poster";

// One unit per character keeps the arithmetic obvious.
const measure = (text: string) => Array.from(text).length;

test("text wraps by character and ends with an ellipsis when it runs out of lines", () => {
    expect(wrapText(measure, "月光下的古风庭院", 4, 3)).toEqual(["月光下的", "古风庭院"]);
    expect(wrapText(measure, "一二三四五六七八九十", 4, 2)).toEqual(["一二三四", "五六七…"]);
    expect(wrapText(measure, "  a   b  ", 10, 2)).toEqual(["a b"]);
    expect(wrapText(measure, "", 10, 2)).toEqual([]);
});

test("the cover keeps its aspect within limits", () => {
    expect(posterCoverHeight(1000, 1000)).toBe(952);
    expect(posterCoverHeight(1000, 3000)).toBe(Math.round(1.35 * 952));
    expect(posterCoverHeight(3000, 1000)).toBe(476);
    expect(posterCoverHeight(0, 0)).toBe(952);
});
