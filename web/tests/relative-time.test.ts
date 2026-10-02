import { describe, expect, test } from "bun:test";

import { relativeTime } from "../src/lib/relative-time";

describe("relative time", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
    test("recent times read as now / minutes / hours / days ago", () => {
        expect(relativeTime(ago(20), "en-US", now)).toBe("now");
        expect(relativeTime(ago(5 * 60), "en-US", now)).toBe("5 minutes ago");
        expect(relativeTime(ago(3 * 3600), "en-US", now)).toBe("3 hours ago");
        expect(relativeTime(ago(86400), "en-US", now)).toBe("yesterday");
        expect(relativeTime(ago(5 * 60), "zh-CN", now)).toBe("5分钟前");
    });
    test("older times show the date", () => {
        expect(relativeTime(ago(40 * 86400), "en-US", now)).toBe(new Date(now - 40 * 86400 * 1000).toLocaleDateString("en-US"));
    });
});
