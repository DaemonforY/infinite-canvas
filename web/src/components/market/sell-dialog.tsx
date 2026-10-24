import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Checkbox, Input, InputNumber, Modal, Spin } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { createImageThumbnail } from "@/lib/image-thumbnail";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import { createListing, fetchMarketConfig, listingImage, MARKET_QUERY_KEY, updateListing, uploadListingImage } from "@/services/api/main-site-market";
import { listMyPrompts, PROMPT_COVER_MAX_BYTES } from "@/services/api/main-site-prompts";
import { useConfigStore } from "@/stores/use-config-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";
import { useSellDialogStore, type SellPick } from "@/stores/use-sell-dialog-store";

const MAX_IMAGES = 7; // a cover and up to 6 samples
const MAX_ITEMS = 50;

/**
 * 上架出售: pick prompts from 「我的」, set a title, a price and sample images, and submit the listing
 * for review. Editing a live listing sends the change for review while the old version keeps selling.
 */
export function SellDialog() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const payload = useSellDialogStore((state) => state.payload);
    const close = useSellDialogStore((state) => state.close);
    const status = useMainAccountStore((state) => state.status);
    const { signIn, waiting } = useMainSiteSignIn();
    const config = useQuery({ queryKey: [MARKET_QUERY_KEY, "config"], queryFn: ({ signal }) => fetchMarketConfig(signal), enabled: Boolean(payload), staleTime: 60_000 });
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState<number | null>(null);
    const [picks, setPicks] = useState<SellPick[]>([]);
    const [images, setImages] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const listing = payload?.listing;

    useEffect(() => {
        if (!payload) return;
        const source = listing?.draft || listing;
        setTitle(source?.title || payload.picks?.[0]?.title || "");
        setDescription(source?.description || "");
        setPrice(source?.price ?? null);
        const fromListing = (source?.items || []).filter((item) => item.source_prompt_id).map((item) => ({ id: item.source_prompt_id!, title: item.title, prompt: item.prompt || "" }));
        setPicks(listing ? fromListing : (payload.picks || []).slice(0, MAX_ITEMS));
        const startImages = source ? [source.cover_url, ...source.sample_urls] : (payload.picks || []).map((pick) => pick.coverUrl || "");
        setImages([...new Set(startImages.filter(Boolean))].slice(0, MAX_IMAGES));
    }, [payload, listing]);

    const cfg = config.data;
    const earn = price && cfg ? Math.floor(price * (1 - cfg.fee_rate) * 100) / 100 : 0;
    const missingSources = listing ? (listing.draft || listing).items.length - picks.length : 0;

    const addImages = async (files: FileList | null) => {
        const list = [...(files || [])].filter((file) => file.type.startsWith("image/")).slice(0, MAX_IMAGES - images.length);
        if (!list.length) return;
        setUploading(true);
        try {
            for (const file of list) {
                const resized = (await createImageThumbnail(file, 1600).catch(() => undefined)) || file;
                if (resized.size > PROMPT_COVER_MAX_BYTES) {
                    message.error(t("market.sell.imageTooLarge"));
                    continue;
                }
                const url = await uploadListingImage(resized);
                setImages((current) => [...current, url].slice(0, MAX_IMAGES));
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setUploading(false);
        }
    };

    const submit = async () => {
        if (!cfg || !price) return;
        if (!title.trim()) return void message.warning(t("market.sell.titleRequired"));
        if (!picks.length) return void message.warning(t("market.sell.promptsRequired"));
        setSaving(true);
        try {
            const input = { title: title.trim(), description: description.trim(), cover_url: images[0] || "", sample_urls: images.slice(1), price, prompt_ids: picks.map((pick) => pick.id) };
            const saved = listing ? await updateListing(listing.id, input) : await createListing(input);
            message.success(saved.draft ? t("market.sell.changeSubmitted") : t("market.sell.submitted"), 5);
            void queryClient.invalidateQueries({ queryKey: [MARKET_QUERY_KEY] });
            close();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error), 6);
        } finally {
            setSaving(false);
        }
    };

    const signedIn = status === "signedIn";
    const closed = cfg && !cfg.enabled;

    return (
        <Modal
            open={Boolean(payload)}
            onCancel={close}
            width={720}
            destroyOnHidden
            title={listing ? t("market.sell.editTitle") : t("market.sell.title")}
            okText={listing ? t("market.sell.submitChange") : t("market.sell.submit")}
            cancelText={t("common.cancel")}
            onOk={() => void submit()}
            okButtonProps={{ loading: saving, disabled: !signedIn || !cfg || Boolean(closed) || uploading, "data-testid": "sell-submit" } as never}
        >
            <div className="space-y-4" data-testid="sell-dialog">
                {!signedIn ? (
                    <Alert
                        type="warning"
                        showIcon
                        title={t("market.signInTitle", { site: MAIN_SITE_NAME })}
                        description={t("market.signInHint")}
                        action={
                            <Button size="small" type="primary" loading={waiting} onClick={signIn}>
                                {t("market.signIn")}
                            </Button>
                        }
                    />
                ) : null}
                {closed ? <Alert type="info" showIcon title={t("market.closed")} /> : null}
                {listing && listing.status === "active" ? <Alert type="info" showIcon title={t("market.sell.liveEditHint")} /> : null}
                {missingSources > 0 ? <Alert type="warning" showIcon title={t("market.sell.missingSources", { count: missingSources })} /> : null}

                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium">{t("market.sell.fieldTitle")}</span>
                        <Input value={title} maxLength={40} showCount onChange={(event) => setTitle(event.target.value)} placeholder={t("market.sell.titlePlaceholder")} data-testid="sell-title" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium">{t("market.sell.fieldPrice")}</span>
                        <InputNumber
                            className="!w-full"
                            prefix="$"
                            min={cfg?.min_price}
                            max={cfg?.max_price}
                            step={0.1}
                            precision={2}
                            value={price}
                            onChange={(value) => setPrice(value)}
                            data-testid="sell-price"
                        />
                    </label>
                </div>
                {cfg ? (
                    <p className="-mt-2 text-xs text-stone-500 dark:text-stone-400" data-testid="sell-earn">
                        {t("market.sell.priceHint", { min: cfg.min_price.toFixed(2), max: cfg.max_price.toFixed(2), fee: Math.round(cfg.fee_rate * 100), earn: earn.toFixed(2) })}
                    </p>
                ) : null}
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("market.sell.fieldDescription")}</span>
                    <Input.TextArea rows={3} maxLength={500} showCount value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("market.sell.descriptionPlaceholder")} />
                </label>

                <div>
                    <div className="mb-1 text-sm font-medium">{t("market.sell.fieldImages")}</div>
                    <div className="flex flex-wrap gap-2">
                        {images.map((url, index) => (
                            <div key={url} className="relative size-20 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
                                <img src={listingImage(url)} alt="" className="size-full object-cover" />
                                {index === 0 ? <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-center text-[10px] text-white">{t("market.sell.cover")}</span> : null}
                                <button type="button" className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/55 text-white" onClick={() => setImages(images.filter((u) => u !== url))} aria-label={t("common.delete")}>
                                    <X className="size-3" />
                                </button>
                            </div>
                        ))}
                        {images.length < MAX_IMAGES ? (
                            <button type="button" disabled={uploading || !signedIn} className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-xs text-stone-400 dark:border-stone-700" onClick={() => fileInput.current?.click()}>
                                {uploading ? <Spin size="small" /> : <ImagePlus className="size-5" />}
                                {t("market.sell.addImage")}
                            </button>
                        ) : null}
                        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addImages(event.target.files).then(() => (event.target.value = ""))} />
                    </div>
                    <p className="mt-1 text-xs text-stone-400">{t("market.sell.imagesHint")}</p>
                </div>

                <div>
                    <div className="mb-1 flex items-center justify-between text-sm font-medium">
                        <span>{t("market.sell.fieldPrompts", { count: picks.length })}</span>
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => setPickerOpen(true)} disabled={picks.length >= MAX_ITEMS} data-testid="sell-pick">
                            {t("market.sell.pick")}
                        </Button>
                    </div>
                    <div className="thin-scrollbar max-h-52 space-y-1.5 overflow-y-auto">
                        {picks.map((pick, index) => (
                            <div key={pick.id} className="flex items-start gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-sm dark:bg-stone-900">
                                <span className="text-stone-400">{index + 1}.</span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium">{pick.title}</div>
                                    <div className="line-clamp-1 text-xs text-stone-500">{pick.prompt}</div>
                                </div>
                                <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => setPicks(picks.filter((p) => p.id !== pick.id))} aria-label={t("common.delete")} />
                            </div>
                        ))}
                    </div>
                    <p className="mt-1 text-xs text-stone-400">{t("market.sell.rules")}</p>
                </div>
            </div>
            <PromptPicker open={pickerOpen} chosen={picks} onClose={() => setPickerOpen(false)} onPick={(more) => setPicks([...picks, ...more.filter((m) => !picks.some((p) => p.id === m.id))].slice(0, MAX_ITEMS))} />
        </Modal>
    );
}

/** Pick more prompts from 「我的」 (API key, like the rest of 「我的」). */
function PromptPicker({ open, chosen, onClose, onPick }: { open: boolean; chosen: SellPick[]; onClose: () => void; onPick: (picks: SellPick[]) => void }) {
    const { t } = useTranslation();
    const apiKey = useConfigStore((state) => findMainSiteApiKey(state.config));
    const [keyword, setKeyword] = useState("");
    const [selected, setSelected] = useState<Map<number, SellPick>>(new Map());
    const list = useQuery({
        queryKey: ["sell-picker", apiKey, keyword],
        queryFn: ({ signal }) => listMyPrompts(apiKey, { q: keyword.trim(), page_size: 60, sort: "used" }, signal),
        enabled: open && Boolean(apiKey),
    });
    const chosenIds = useMemo(() => new Set(chosen.map((p) => p.id)), [chosen]);

    useEffect(() => {
        if (open) setSelected(new Map());
    }, [open]);

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={t("market.sell.pickTitle")}
            okText={t("market.sell.pickAdd", { count: selected.size })}
            cancelText={t("common.cancel")}
            okButtonProps={{ disabled: !selected.size }}
            onOk={() => {
                onPick([...selected.values()]);
                onClose();
            }}
            width={560}
            destroyOnHidden
        >
            {!apiKey ? (
                <Alert type="warning" showIcon title={t("myPrompts.noKeyTitle", { site: MAIN_SITE_NAME })} />
            ) : (
                <div className="space-y-2">
                    <Input.Search allowClear placeholder={t("market.sell.pickSearch")} onSearch={setKeyword} />
                    {list.isLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <Spin />
                        </div>
                    ) : (
                        <div className="thin-scrollbar max-h-[50vh] space-y-1 overflow-y-auto">
                            {(list.data?.items || []).map((item) => {
                                const used = chosenIds.has(item.id);
                                return (
                                    <label key={item.id} className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-900 ${used ? "opacity-50" : ""}`}>
                                        <Checkbox
                                            disabled={used}
                                            checked={used || selected.has(item.id)}
                                            onChange={(event) =>
                                                setSelected((current) => {
                                                    const next = new Map(current);
                                                    if (event.target.checked) next.set(item.id, { id: item.id, title: item.title, prompt: item.prompt, coverUrl: item.cover_url });
                                                    else next.delete(item.id);
                                                    return next;
                                                })
                                            }
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{item.title}</div>
                                            <div className="line-clamp-1 text-xs text-stone-500">{item.prompt}</div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
