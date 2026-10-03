import { describe, expect, test } from "bun:test";

import { formatClipDuration } from "./site-videos";

describe("formatClipDuration", () => {
    test("minutes and zero-padded seconds", () => {
        expect(formatClipDuration(0)).toBe("0:00");
        expect(formatClipDuration(5200)).toBe("0:05");
        expect(formatClipDuration(83_000)).toBe("1:23");
        expect(formatClipDuration(-10)).toBe("0:00");
    });
});
