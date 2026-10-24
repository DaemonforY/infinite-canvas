import { useEffect, useState } from "react";
import { App, Button, Empty, Modal, Spin, Tag } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FolderDown, Lock, ShoppingBag, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { usePromptActions } from "@/components/prompts/use-prompt-actions";
import { PROMPT_FOLDERS_QUERY_KEY, MY_PROMPTS_QUERY_KEY } from "@/components/prompts/use-prompt-list";
import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { mainSiteLink } from "@/constant/runtime-config";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import { getListing, listingImage, MARKET_QUERY_KEY, purchaseListing, type Listing, type ListingItem } from "@/services/api/main-site-market";
import { createPromptFolder, importMyPrompts, listPromptFolders } from "@/services/api/main-site-prompts";
import type { Prompt } from "@/services/api/prompts";
import { useConfigStore } from "@/stores/use-config-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";

/** A bought prompt as a library prompt, so 用这个画 / 复制 (and {变量}) work the same way. */
export function listingItemToPrompt(listing: Listing, item: ListingItem): Prompt {
    const now = listing.updated_at;
    return {
        id: `market-${listing.id}-${item.position}`,
        title: item.title,
        prompt: item.prompt || "",
        description: "",
        coverUrl: listing.cover_url ? listingImage(listing.cover_url) : "",
        referenceImageUrls: [],
        tags: item.tags,
        preview: "",
        createdAt: now,
        updatedAt: now,
        sourceId: "market",
        category: "market",
        githubUrl: "",
        traits: { scenes: [item.kind === "video" ? "video" : "other"], model: "unknown", nsfw: false, sensitive: false, needsReference: false, lang: "zh" },
    };
}

/** 存到「我的」: copies a bought listing into a folder named after it (prompts already there are skipped). */
export async function saveListingToMine(apiKey: string, listing: Listing) {
    const name = `已购·${listing.title}`.slice(0, 20);
    let folderId: number;
    try {
        folderId = (await createPromptFolder(apiKey, name)).id;
    } catch {
        const existing = (await listPromptFolders(apiKey)).folders.find((folder) => folder.name.toLowerCase() === name.toLowerCase());
        if (!existing) throw new Error("folder");
        folderId = existing.id;
    }
    const items = listing.items.filter((item) => item.prompt).map((item) => ({ title: item.title, prompt: item.prompt!, tags: item.tags, kind: item.kind === "video" ? ("video" as const) : ("image" as const) }));
    return importMyPrompts(apiKey, items, folderId);
}

export function ListingDetailDialog({ listingId, onClose }: { listingId: number | null; onClose: () => void }) {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const actions = usePromptActions();
    const status = useMainAccountStore((state) => state.status);
    const account = useMainAccountStore((state) => state.account);
    const refreshAccount = useMainAccountStore((state) => state.refresh);
    const apiKey = useConfigStore((state) => findMainSiteApiKey(state.config));
    const { signIn, waiting } = useMainSiteSignIn();
    const detail = useQuery({ queryKey: [MARKET_QUERY_KEY, "listing", listingId, status], queryFn: ({ signal }) => getListing(listingId!, signal), enabled: listingId !== null });
    const [image, setImage] = useState("");
    const [buying, setBuying] = useState(false);
    const [saving, setSaving] = useState(false);
    const listing = detail.data;
    const images = listing ? [listing.cover_url, ...listing.sample_urls].filter(Boolean) : [];

    useEffect(() => setImage(""), [listingId]);

    const buy = () => {
        if (!listing) return;
        const balance = account?.balance ?? 0;
        if (balance < listing.price) {
            modal.confirm({
                title: t("market.buy.lowTitle"),
                content: t("market.buy.lowBalance", { price: listing.price.toFixed(2), balance: balance.toFixed(2) }),
                okText: t("market.buy.recharge"),
                cancelText: t("common.cancel"),
                onOk: () => void window.open(mainSiteLink("/purchase", "prompt-market"), "_blank", "noopener"),
            });
            return;
        }
        modal.confirm({
            title: t("market.buy.confirmTitle", { title: listing.title }),
            content: t("market.buy.confirm", { price: listing.price.toFixed(2), balance: balance.toFixed(2), after: (balance - listing.price).toFixed(2) }),
            okText: t("market.buy.ok"),
            cancelText: t("common.cancel"),
            onOk: async () => {
                setBuying(true);
                try {
                    const bought = await purchaseListing(listing.id, listing.price);
                    queryClient.setQueryData([MARKET_QUERY_KEY, "listing", listingId, status], bought);
                    void queryClient.invalidateQueries({ queryKey: [MARKET_QUERY_KEY] });
                    void refreshAccount();
                    message.success(t("market.buy.done"), 5);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : String(error), 6);
                    void detail.refetch();
                } finally {
                    setBuying(false);
                }
            },
        });
    };

    const saveToMine = async () => {
        if (!listing || !apiKey) {
            message.warning(t("market.buy.needKey"));
            return;
        }
        setSaving(true);
        try {
            const res = await saveListingToMine(apiKey, listing);
            void queryClient.invalidateQueries({ queryKey: [MY_PROMPTS_QUERY_KEY] });
            void queryClient.invalidateQueries({ queryKey: [PROMPT_FOLDERS_QUERY_KEY] });
            message.success(t("market.buy.saved", { created: res.created, duplicates: res.duplicates }), 5);
        } catch (error) {
            message.error(error instanceof Error && error.message !== "folder" ? error.message : t("market.buy.saveFailed"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={listingId !== null} onCancel={onClose} footer={null} width={820} destroyOnHidden title={listing?.title || t("market.title")}>
            {detail.isLoading ? (
                <div className="flex h-60 items-center justify-center">
                    <Spin />
                </div>
            ) : !listing ? (
                <Empty description={detail.error instanceof Error ? detail.error.message : t("market.notFound")} />
            ) : (
                <div className="grid gap-5 md:grid-cols-[320px_1fr]" data-testid="listing-detail">
                    <div className="space-y-2">
                        {images.length ? (
                            <>
                                <img src={listingImage(image || images[0])} alt="" className="aspect-square w-full rounded-xl object-cover" />
                                {images.length > 1 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {images.map((url) => (
                                            <button key={url} type="button" onClick={() => setImage(url)} className={`size-12 overflow-hidden rounded-md border-2 ${url === (image || images[0]) ? "border-sky-500" : "border-transparent"}`}>
                                                <img src={listingImage(url)} alt="" className="size-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="grid aspect-square w-full place-items-center rounded-xl bg-stone-100 text-stone-400 dark:bg-stone-900">
                                <ShoppingBag className="size-10" />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                            <Tag color={listing.item_count > 1 ? "purple" : "blue"}>{listing.item_count > 1 ? t("market.pack", { count: listing.item_count }) : t("market.single")}</Tag>
                            <span>{t("market.by", { name: listing.seller_name })}</span>
                            <span>· {t("market.sold", { count: listing.sales_count })}</span>
                        </div>
                        {listing.description ? <p className="whitespace-pre-wrap text-sm leading-6 text-stone-600 dark:text-stone-300">{listing.description}</p> : null}

                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
                            <span className="text-2xl font-semibold text-stone-950 dark:text-white">${listing.price.toFixed(2)}</span>
                            {listing.mine ? (
                                <span className="text-sm text-stone-500">{t("market.yours")}</span>
                            ) : listing.purchased ? (
                                <>
                                    <Tag color="green">{t("market.purchased")}</Tag>
                                    <Button icon={<FolderDown className="size-4" />} loading={saving} onClick={() => void saveToMine()} data-testid="listing-save-mine">
                                        {t("market.buy.saveToMine")}
                                    </Button>
                                </>
                            ) : status !== "signedIn" ? (
                                <Button type="primary" loading={waiting} onClick={signIn} data-testid="listing-sign-in">
                                    {t("market.signInToBuy")}
                                </Button>
                            ) : (
                                <>
                                    <Button type="primary" icon={<ShoppingBag className="size-4" />} loading={buying} onClick={buy} data-testid="listing-buy">
                                        {t("market.buy.button")}
                                    </Button>
                                    <span className="text-xs text-stone-500">{t("market.buy.balance", { balance: (account?.balance ?? 0).toFixed(2) })}</span>
                                </>
                            )}
                        </div>

                        <div>
                            <div className="mb-1.5 text-sm font-medium">{t("market.contents", { count: listing.items.length })}</div>
                            <div className="thin-scrollbar max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                                {listing.items.map((item, index) => (
                                    <div key={item.position} className="rounded-lg bg-stone-50 p-2.5 dark:bg-stone-900" data-testid="listing-item">
                                        <div className="flex items-center gap-2">
                                            {!listing.unlocked ? <Lock className="size-3.5 shrink-0 text-stone-400" /> : null}
                                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                                {index + 1}. {item.title}
                                            </span>
                                            {listing.unlocked && item.prompt ? (
                                                <>
                                                    <Button size="small" type="primary" icon={<Wand2 className="size-3.5" />} onClick={() => actions.draw(listingItemToPrompt(listing, item))}>
                                                        {t("prompts.useToDraw")}
                                                    </Button>
                                                    <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => actions.copy(listingItemToPrompt(listing, item))} aria-label={t("common.copyPrompt")} />
                                                </>
                                            ) : null}
                                        </div>
                                        {listing.unlocked ? (
                                            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-stone-600 dark:text-stone-300">{item.prompt}</p>
                                        ) : index === 0 && listing.teaser ? (
                                            <p className="mt-1 text-xs text-stone-400">{listing.teaser}</p>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                            {!listing.unlocked ? <p className="mt-2 text-xs text-stone-400">{t("market.lockedHint")}</p> : null}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
