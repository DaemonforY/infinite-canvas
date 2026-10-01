// Signing in to the canvas with a HiveGPT account.
//
// The main site's connect popup sets an HttpOnly session cookie on the main site's host (path
// /api/v1/canvas). The canvas never sees the token: it calls those endpoints with
// credentials: "include" and the X-HiveGPT-Canvas header, and the main site only accepts them from
// the canvas origin.

import { MAIN_SITE_URL } from "@/constant/runtime-config";

export type MainSiteSubscription = { group_name: string; expires_at: string };

export type MainSiteAccount = {
    user_id: number;
    username: string;
    /** Masked, e.g. "ab***@qq.com". */
    email: string;
    avatar_url: string;
    balance: number;
    subscriptions: MainSiteSubscription[];
};

const CANVAS_HEADER = { "X-HiveGPT-Canvas": "1" };
const base = () => `${MAIN_SITE_URL}/api/v1/canvas`;

/** The signed-in account, or null when signed out (or the session expired). Throws on network errors. */
export async function fetchMainSiteAccount(signal?: AbortSignal): Promise<MainSiteAccount | null> {
    const res = await fetch(`${base()}/me`, { credentials: "include", headers: CANVAS_HEADER, signal });
    if (res.status === 401 || res.status === 403) return null;
    const body = (await res.json().catch(() => null)) as { code?: number; data?: MainSiteAccount } | null;
    if (!res.ok || body?.code !== 0 || !body.data) throw new Error(`account ${res.status}`);
    return { ...body.data, subscriptions: body.data.subscriptions || [] };
}

export async function signOutMainSite(): Promise<void> {
    await fetch(`${base()}/logout`, { method: "POST", credentials: "include", headers: CANVAS_HEADER }).catch(() => undefined);
}

/** Name shown in the account menu: username, else the masked email. */
export function accountDisplayName(account: Pick<MainSiteAccount, "username" | "email">): string {
    return account.username.trim() || account.email || "HiveGPT";
}

/** The subscription ending last, if any. */
export function latestSubscription(account: Pick<MainSiteAccount, "subscriptions">): MainSiteSubscription | null {
    return [...account.subscriptions].sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at))[0] || null;
}
