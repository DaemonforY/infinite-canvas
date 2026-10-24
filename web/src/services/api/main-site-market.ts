// 提示词交易 on the main site (/api/v1/canvas/market). Browsing is anonymous; buying and selling use the
// canvas session (signed in with the HiveGPT account), since they move 余额. Prices are in 余额 ($).

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import { readFetchError } from "./errors";
import { mainSiteAssetUrl } from "./main-site-prompts";

export type MarketConfig = { enabled: boolean; fee_rate: number; min_price: number; max_price: number };

export type ListingItem = { position: number; title: string; prompt?: string; tags: string[]; kind: "image" | "video" | string; /** Seller only: the prompt in 「我的」 it came from. */ source_prompt_id?: number };

export type ListingStatus = "pending" | "active" | "rejected" | "hidden" | "withdrawn";

export type ListingDraft = { title: string; description: string; cover_url: string; sample_urls: string[]; price: number; items: ListingItem[] };

export type Listing = {
    id: number;
    seller_name: string;
    title: string;
    description: string;
    cover_url: string;
    sample_urls: string[];
    price: number;
    item_count: number;
    status: ListingStatus;
    review_note?: string;
    draft?: ListingDraft;
    sales_count: number;
    published_at?: string;
    created_at: string;
    updated_at: string;
    /** Full prompts only when unlocked (bought, or your own); otherwise titles and `teaser`. */
    items: ListingItem[];
    teaser?: string;
    unlocked: boolean;
    purchased: boolean;
    mine: boolean;
};

export type ListingInput = { title: string; description: string; cover_url: string; sample_urls: string[]; price: number; prompt_ids: number[] };

export type SellerSummary = { sales: number; earned: number };

export type MarketSort = "popular" | "latest" | "price";

const CANVAS_HEADER = { "X-HiveGPT-Canvas": "1" };
const JSON_HEADERS = { ...CANVAS_HEADER, "Content-Type": "application/json" };
const base = () => `${MAIN_SITE_URL}/api/v1/canvas/market`;

type Envelope<T> = { code: number | string; message?: string; data?: T };

async function read<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(await readFetchError(res));
    const body = (await res.json()) as Envelope<T>;
    if (body.code !== 0) throw new Error(body.message || `HTTP ${res.status}`);
    return body.data as T;
}

function call<T>(path: string, init: RequestInit = {}) {
    return fetch(`${base()}${path}`, { credentials: "include", ...init, headers: { ...CANVAS_HEADER, ...(init.headers || {}) } }).then((res) => read<T>(res));
}

/** Covers are stored on the main site under a relative path. */
export function listingImage(url: string) {
    return mainSiteAssetUrl(url);
}

export const fetchMarketConfig = (signal?: AbortSignal) => call<MarketConfig>("/config", { signal });

export function listListings(params: { q?: string; sort?: MarketSort; page?: number; page_size?: number }, signal?: AbortSignal) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
    return call<{ items: Listing[]; total: number }>(`/listings?${search}`, { signal });
}

export const getListing = (id: number, signal?: AbortSignal) => call<Listing>(`/listings/${id}`, { signal });

/** `price` is the price the buyer saw; a changed price is refused rather than charged. */
export const purchaseListing = (id: number, price: number) => call<Listing>(`/listings/${id}/purchase`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ price }) });

export const listPurchases = (signal?: AbortSignal) => call<{ items: Listing[] }>("/purchases", { signal });

export const listSelling = (signal?: AbortSignal) => call<{ items: Listing[]; summary: SellerSummary }>("/selling", { signal });

export const createListing = (input: ListingInput) => call<Listing>("/selling", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) });

export const updateListing = (id: number, input: ListingInput) => call<Listing>(`/selling/${id}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(input) });

export const setListingListed = (id: number, listed: boolean) => call<Listing>(`/selling/${id}/${listed ? "relist" : "withdraw"}`, { method: "POST" });

/** Uploads a cover / sample image; returns its main-site path. */
export async function uploadListingImage(blob: Blob): Promise<string> {
    const form = new FormData();
    form.append("file", blob, `sample.${(blob.type.split("/")[1] || "png").replace("jpeg", "jpg")}`);
    return (await call<{ url: string }>("/covers", { method: "POST", body: form })).url;
}

export const MARKET_QUERY_KEY = "prompt-market";
