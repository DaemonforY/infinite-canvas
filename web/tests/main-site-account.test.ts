import { expect, test } from "bun:test";

import { accountDisplayName, isWatermarkFree, latestSubscription } from "../src/services/api/main-site-account";

test("the menu shows the username, else the masked email", () => {
    expect(accountDisplayName({ username: "小林", email: "ab***@qq.com" })).toBe("小林");
    expect(accountDisplayName({ username: " ", email: "ab***@qq.com" })).toBe("ab***@qq.com");
    expect(accountDisplayName({ username: "", email: "" })).toBe("HiveGPT");
});

test("the subscription ending last is shown", () => {
    expect(latestSubscription({ subscriptions: [] })).toBeNull();
    expect(
        latestSubscription({
            subscriptions: [
                { group_name: "A", expires_at: "2026-10-10T00:00:00Z" },
                { group_name: "B", expires_at: "2026-12-01T00:00:00Z" },
            ],
        })?.group_name,
    ).toBe("B");
});

test("创作会员 removes the watermark only while it lasts", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(isWatermarkFree(null, now)).toBe(false);
    expect(isWatermarkFree({}, now)).toBe(false);
    expect(isWatermarkFree({ no_watermark_until: "2026-11-09T00:00:00Z" }, now)).toBe(true);
    expect(isWatermarkFree({ no_watermark_until: "2026-10-09T11:59:59Z" }, now)).toBe(false);
    expect(isWatermarkFree({ no_watermark_until: "not a date" }, now)).toBe(false);
});
