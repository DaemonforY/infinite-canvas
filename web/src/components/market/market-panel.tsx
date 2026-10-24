import { useEffect, useState } from "react";
import { Alert, App, Button, Empty, Segmented, Select, Spin, Tag } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShoppingBag, Store } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { cn } from "@/lib/utils";
import { fetchMarketConfig, listingImage, listListings, listPurchases, listSelling, MARKET_QUERY_KEY, setListingListed, type Listing, type MarketSort } from "@/services/api/main-site-market";
import { useMainAccountStore } from "@/stores/use-main-account-store";
import { useSellDialogStore } from "@/stores/use-sell-dialog-store";
import { ListingDetailDialog } from "./listing-detail-dialog";

type View = "browse" | "purchased" | "selling";

function ListingCard({ listing, onOpen, footer }: { listing: Listing; onOpen: () => void; footer?: React.ReactNode }) {
    const { t } = useTranslation();
    return (
        <div className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:shadow-md dark:border-stone-800 dark:bg-stone-950" data-testid="listing-card">
            <button type="button" onClick={onOpen} className="relative block text-left">
                {listing.cover_url ? (
                    <img src={listingImage(listing.cover_url)} alt={listing.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                ) : (
                    <span className="grid aspect-[4/3] w-full place-items-center bg-stone-100 text-stone-400 dark:bg-stone-900">
                        <ShoppingBag className="size-8" />
                    </span>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white backdrop-blur">{listing.item_count > 1 ? t("market.pack", { count: listing.item_count }) : t("market.single")}</span>
                {listing.purchased ? <span className="absolute right-2 top-2 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[11px] text-white">{t("market.purchased")}</span> : null}
            </button>
            <button type="button" onClick={onOpen} className="flex-1 px-3.5 pb-2 pt-2.5 text-left">
                <div className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{listing.title}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                    <span className="truncate">{listing.seller_name}</span>
                    <span className="ml-auto shrink-0">{t("market.sold", { count: listing.sales_count })}</span>
                </div>
                <div className="mt-1.5 text-base font-semibold text-orange-600 dark:text-orange-400">${listing.price.toFixed(2)}</div>
            </button>
            {footer ? <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-100 px-3 py-2 dark:border-stone-800">{footer}</div> : null}
        </div>
    );
}

const STATUS_COLOR: Record<string, string> = { pending: "gold", active: "green", rejected: "red", hidden: "red", withdrawn: "default" };

/** 提示词市场: browse listings, what you bought, and what you sell. */
export function MarketPanel({ keyword }: { keyword: string }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const status = useMainAccountStore((state) => state.status);
    const openSell = useSellDialogStore((state) => state.open);
    const { signIn, waiting } = useMainSiteSignIn();
    const [view, setView] = useState<View>("browse");
    const [sort, setSort] = useState<MarketSort>("popular");
    const [openId, setOpenId] = useState<number | null>(null);
    const [debounced, setDebounced] = useState(keyword);
    const signedIn = status === "signedIn";

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(keyword.trim()), 300);
        return () => clearTimeout(timer);
    }, [keyword]);

    const config = useQuery({ queryKey: [MARKET_QUERY_KEY, "config"], queryFn: ({ signal }) => fetchMarketConfig(signal), staleTime: 60_000 });
    const browse = useQuery({ queryKey: [MARKET_QUERY_KEY, "browse", sort, debounced, status], queryFn: ({ signal }) => listListings({ q: debounced, sort, page_size: 60 }, signal), enabled: view === "browse" });
    const purchased = useQuery({ queryKey: [MARKET_QUERY_KEY, "purchases", status], queryFn: ({ signal }) => listPurchases(signal), enabled: view === "purchased" && signedIn });
    const selling = useQuery({ queryKey: [MARKET_QUERY_KEY, "selling", status], queryFn: ({ signal }) => listSelling(signal), enabled: view === "selling" && signedIn });

    const toggleListed = async (listing: Listing, listed: boolean) => {
        try {
            await setListingListed(listing.id, listed);
            message.success(listed ? t("market.selling.relisted") : t("market.selling.withdrawn"));
            void queryClient.invalidateQueries({ queryKey: [MARKET_QUERY_KEY] });
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const needSignIn = (view === "purchased" || view === "selling") && !signedIn;
    const query = view === "browse" ? browse : view === "purchased" ? purchased : selling;
    const items = (view === "browse" ? browse.data?.items : view === "purchased" ? purchased.data?.items : selling.data?.items) || [];
    const shown = view === "browse" ? items : items.filter((l) => !debounced || l.title.toLowerCase().includes(debounced.toLowerCase()));

    return (
        <div className="mt-2 space-y-3" data-testid="market-panel">
            {config.data && !config.data.enabled ? <Alert type="info" showIcon title={t("market.closed")} description={t("market.closedHint")} /> : null}
            <div className="flex flex-wrap items-center gap-2">
                <Segmented<View>
                    value={view}
                    onChange={setView}
                    options={[
                        { value: "browse", label: t("market.viewBrowse") },
                        { value: "purchased", label: t("market.viewPurchased") },
                        { value: "selling", label: t("market.viewSelling") },
                    ]}
                />
                {view === "browse" ? (
                    <Select<MarketSort>
                        value={sort}
                        onChange={setSort}
                        className="w-28"
                        options={[
                            { value: "popular", label: t("market.sortPopular") },
                            { value: "latest", label: t("market.sortLatest") },
                            { value: "price", label: t("market.sortPrice") },
                        ]}
                    />
                ) : null}
                <span className="flex-1" />
                {view === "selling" && signedIn ? (
                    <Button type="primary" icon={<Plus className="size-4" />} disabled={!config.data?.enabled} onClick={() => openSell({})} data-testid="market-sell">
                        {t("market.sellButton")}
                    </Button>
                ) : null}
            </div>

            {view === "selling" && selling.data ? (
                <div className="flex flex-wrap gap-6 rounded-xl bg-stone-50 px-4 py-3 text-sm dark:bg-stone-900" data-testid="market-earnings">
                    <span>
                        {t("market.selling.sales")} <b>{selling.data.summary.sales}</b>
                    </span>
                    <span>
                        {t("market.selling.earned")} <b>${selling.data.summary.earned.toFixed(2)}</b>
                    </span>
                    <span className="text-xs text-stone-500">{t("market.selling.earnedHint", { fee: Math.round((config.data?.fee_rate ?? 0.2) * 100) })}</span>
                </div>
            ) : null}

            {needSignIn ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-16" description={t("market.signInHint")}>
                    <Button type="primary" loading={waiting} onClick={signIn}>
                        {t("market.signIn")}
                    </Button>
                </Empty>
            ) : query.isLoading ? (
                <div className="flex h-60 items-center justify-center">
                    <Spin />
                </div>
            ) : !shown.length ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    className="py-16"
                    description={view === "browse" ? t("market.emptyBrowse") : view === "purchased" ? t("market.emptyPurchased") : t("market.emptySelling", { site: MAIN_SITE_NAME })}
                >
                    {view === "selling" && config.data?.enabled ? (
                        <Button type="primary" icon={<Store className="size-4" />} onClick={() => openSell({})}>
                            {t("market.sellButton")}
                        </Button>
                    ) : null}
                </Empty>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {shown.map((listing) => (
                        <ListingCard
                            key={listing.id}
                            listing={listing}
                            onOpen={() => setOpenId(listing.id)}
                            footer={
                                view === "selling" ? (
                                    <>
                                        <Tag color={STATUS_COLOR[listing.status]}>{t(`market.status.${listing.status}`)}</Tag>
                                        {listing.draft ? <Tag color="gold">{t("market.selling.changeInReview")}</Tag> : null}
                                        <span className="flex-1" />
                                        <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={() => openSell({ listing })} aria-label={t("myPrompts.edit")} />
                                        {listing.status === "active" || listing.status === "pending" || listing.status === "rejected" ? (
                                            <Button size="small" onClick={() => void toggleListed(listing, false)}>
                                                {t("market.selling.withdraw")}
                                            </Button>
                                        ) : listing.status === "withdrawn" ? (
                                            <Button size="small" onClick={() => void toggleListed(listing, true)}>
                                                {t("market.selling.relist")}
                                            </Button>
                                        ) : null}
                                        {listing.review_note ? <p className={cn("w-full text-xs", "text-red-600")}>{listing.review_note}</p> : null}
                                    </>
                                ) : undefined
                            }
                        />
                    ))}
                </div>
            )}
            <ListingDetailDialog listingId={openId} onClose={() => setOpenId(null)} />
        </div>
    );
}
