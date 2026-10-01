import { expect, test } from "bun:test";

import { CONNECT_MESSAGE_TYPE, parseConnectMessage } from "../src/services/api/main-site-connect";

const STATE = "0123456789abcdef0123456789abcdef";
const valid = { type: CONNECT_MESSAGE_TYPE, state: STATE, apiKey: "sk-abc123", keyName: "无限画布" };
const event = (origin: string, data: unknown) => ({ origin, data }) as MessageEvent;

test("accepts the key from the main site with the matching state", () => {
    expect(parseConnectMessage(event("https://hivegpt.cn", valid), STATE)?.apiKey).toBe("sk-abc123");
});

test("rejects messages from any other origin", () => {
    expect(parseConnectMessage(event("https://evil.example", valid), STATE)).toBeNull();
    expect(parseConnectMessage(event("https://hivegpt.cn.evil.example", valid), STATE)).toBeNull();
    expect(parseConnectMessage(event("http://hivegpt.cn", valid), STATE)).toBeNull();
});

test("rejects a stale or foreign state and unrelated message types", () => {
    expect(parseConnectMessage(event("https://hivegpt.cn", { ...valid, state: "other" }), STATE)).toBeNull();
    expect(parseConnectMessage(event("https://hivegpt.cn", { ...valid, type: "something-else" }), STATE)).toBeNull();
    expect(parseConnectMessage(event("https://hivegpt.cn", "sk-abc123"), STATE)).toBeNull();
});

test("rejects malformed keys", () => {
    expect(parseConnectMessage(event("https://hivegpt.cn", { ...valid, apiKey: "" }), STATE)).toBeNull();
    expect(parseConnectMessage(event("https://hivegpt.cn", { ...valid, apiKey: "sk a" }), STATE)).toBeNull();
    expect(parseConnectMessage(event("https://hivegpt.cn", { ...valid, apiKey: "x".repeat(300) }), STATE)).toBeNull();
});

test("a sign-in without a key is accepted only when marked signed in and carrying no key at all", () => {
    const signIn = { type: CONNECT_MESSAGE_TYPE, state: STATE, signedIn: true };
    expect(parseConnectMessage(event("https://hivegpt.cn", signIn), STATE)).toMatchObject({ apiKey: "", signedIn: true });
    expect(parseConnectMessage(event("https://hivegpt.cn", { type: CONNECT_MESSAGE_TYPE, state: STATE }), STATE)).toBeNull();
    expect(parseConnectMessage(event("https://hivegpt.cn", { ...signIn, apiKey: "" }), STATE)).toBeNull();
    expect(parseConnectMessage(event("https://evil.example", signIn), STATE)).toBeNull();
    expect(parseConnectMessage(event("https://hivegpt.cn", { ...valid, signedIn: true }), STATE)).toMatchObject({ apiKey: "sk-abc123", signedIn: true });
});
