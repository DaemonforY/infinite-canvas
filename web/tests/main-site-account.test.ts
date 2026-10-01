import { expect, test } from "bun:test";

import { accountDisplayName, latestSubscription } from "../src/services/api/main-site-account";

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
