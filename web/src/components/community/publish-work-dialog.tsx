import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Modal, Result, Segmented, Select, Spin, Switch } from "antd";
import { Globe, ImagePlus, Images, LogIn, Plus, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";

import { ProfileForm } from "@/components/community/profile-form";
import { SiteImagePicker } from "@/components/community/site-image-picker";
import type { SiteImage } from "@/lib/site-images";
import { useShareLink } from "@/components/community/use-share-link";
import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { snapshotPage } from "@/lib/html-snapshot";
import { fitForUpload } from "@/lib/image-tools";
import { CommunityError, createCollection, getMySites, listCollections, publishWork, type Collection, type MySite, type Work, type WorkVisibility } from "@/services/api/community";
import { loadImageBlob } from "@/services/api/main-site-contests";
import { useCommunityMeStore } from "@/stores/use-community-me-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";
import { usePublishWorkStore, type PublishSite } from "@/stores/use-publish-work-store";

/** An image to publish; picked site images keep the prompt / model they were made with. */
type Item = { id: string; src: string; blob?: Blob; owned?: boolean; prompt?: string; model?: string; params?: Record<string, unknown>; source?: SiteImage["source"] };
type BatchResult = { works: Work[]; failed: number; error: string };

const MAX_IMAGES = 9;
// "每张单独发布": one work per image, at most this many in one go (the daily limit still applies).
const MAX_BATCH = 20;
const TAG_SUGGESTIONS = ["人像", "插画", "国风", "海报", "电商", "风景", "动漫", "建筑", "美食", "Logo", "3D", "摄影"];

function defaultTitle(prompt?: string, title?: string) {
    const text = (title || prompt || "").replace(/\s+/g, " ").trim();
    return text.length > 30 ? `${text.slice(0, 30)}…` : text;
}

/** Shared "发布作品" dialog: sign in, create the public profile if needed, then publish 1–9 images. */
export function PublishWorkDialog() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const payload = usePublishWorkStore((state) => state.payload);
    const close = usePublishWorkStore((state) => state.close);
    const status = useMainAccountStore((state) => state.status);
    const account = useMainAccountStore((state) => state.account);
    const profile = useCommunityMeStore((state) => state.profile);
    const refreshProfile = useCommunityMeStore((state) => state.refresh);
    const { signIn, waiting } = useMainSiteSignIn();
    const fileRef = useRef<HTMLInputElement>(null);

    const [items, setItems] = useState<Item[]>([]);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [prompt, setPrompt] = useState("");
    const [showPrompt, setShowPrompt] = useState(true);
    const [tags, setTags] = useState<string[]>([]);
    const [visibility, setVisibility] = useState<WorkVisibility>("public");
    const [collections, setCollections] = useState<Collection[]>([]);
    const [collectionId, setCollectionId] = useState<number | undefined>();
    const [newCollection, setNewCollection] = useState("");
    const [publishing, setPublishing] = useState(false);
    const [published, setPublished] = useState<Work | null>(null);
    const [batch, setBatch] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
    // Web-page works: the site presented, the user's sites to pick from, the cover being drawn.
    const [kind, setKind] = useState<"image" | "site">("image");
    const [site, setSite] = useState<PublishSite | null>(null);
    const [mySites, setMySites] = useState<MySite[] | null>(null);
    const [snapshotting, setSnapshotting] = useState(false);
    const share = useShareLink(`/w/${published?.id ?? ""}`);

    const open = Boolean(payload);

    useEffect(() => {
        if (!payload) return;
        setItems((payload.images || []).slice(0, MAX_IMAGES).map((src) => ({ id: nanoid(), src })));
        setTitle(defaultTitle(payload.prompt, payload.title));
        setDescription("");
        setPrompt(payload.prompt || "");
        setShowPrompt(true);
        setTags([]);
        setVisibility("public");
        setCollectionId(undefined);
        setNewCollection("");
        setPublished(null);
        setBatch(false);
        setProgress(null);
        setBatchResult(null);
        setKind(payload.site ? "site" : "image");
        setSite(payload.site || null);
        setMySites(null);
        if (payload.site && payload.html && !payload.images?.length) {
            // The cover is drawn from the page itself; the author can replace it.
            let cancelled = false;
            setSnapshotting(true);
            snapshotPage(payload.html)
                .then((blob) => !cancelled && setItems([{ id: nanoid(), src: URL.createObjectURL(blob), blob, owned: true }]))
                .catch(() => !cancelled && message.info(t("community.publish.site.snapshotFailed")))
                .finally(() => !cancelled && setSnapshotting(false));
            return () => {
                cancelled = true;
            };
        }
    }, [payload, message, t]);

    useEffect(() => {
        if (kind !== "site" || payload?.site || mySites !== null || status !== "signedIn") return;
        getMySites()
            .then(setMySites)
            .catch(() => setMySites([]));
    }, [kind, mySites, payload?.site, status]);

    useEffect(() => {
        if (open && status === "signedIn" && profile === undefined) void refreshProfile();
    }, [open, profile, refreshProfile, status]);

    useEffect(() => {
        if (!open || !profile) return;
        listCollections(profile.handle)
            .then(setCollections)
            .catch(() => setCollections([]));
    }, [open, profile]);

    // Object URLs of picked files are released when they leave the list or the dialog closes.
    const itemsRef = useRef(items);
    itemsRef.current = items;
    useEffect(() => {
        if (open) return;
        itemsRef.current.forEach((item) => item.owned && URL.revokeObjectURL(item.src));
    }, [open]);

    const maxItems = batch ? MAX_BATCH : MAX_IMAGES;

    const addFiles = (files: FileList | null) => {
        const picked = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        setItems((current) => [...current, ...picked.slice(0, maxItems - current.length).map((file) => ({ id: nanoid(), src: URL.createObjectURL(file), blob: file, owned: true }))]);
    };

    // Images picked from the site's generation history / assets.
    const addSiteImages = (images: SiteImage[]) => {
        setPickerOpen(false);
        const room = maxItems - items.length;
        const added = images.slice(0, room).map((image) => ({ id: nanoid(), src: image.src, prompt: image.prompt, model: image.model, params: image.params, source: image.source }));
        if (!added.length) return;
        setItems((current) => [...current, ...added]);
        const firstPrompt = added.find((item) => item.prompt)?.prompt || "";
        if (!prompt && firstPrompt) setPrompt(firstPrompt);
        if (!title && firstPrompt) setTitle(defaultTitle(firstPrompt));
        if (images.length > room) message.info(t("community.publish.picker.trimmed", { count: room }));
    };

    const remove = (id: string) =>
        setItems((current) =>
            current.filter((item) => {
                if (item.id === id && item.owned) URL.revokeObjectURL(item.src);
                return item.id !== id;
            }),
        );

    const addCollection = async () => {
        const name = newCollection.trim();
        if (!name) return;
        try {
            const created = await createCollection({ title: name, description: "", visibility: "public" });
            setCollections((current) => [created, ...current]);
            setCollectionId(created.id);
            setNewCollection("");
        } catch (error) {
            message.error((error as Error).message);
        }
    };

    // One work per image: its own prompt / model when it has them, the shared settings otherwise.
    const publishBatch = async () => {
        if (!payload) return;
        setPublishing(true);
        const works: Work[] = [];
        let failed = 0;
        let error = "";
        setProgress({ done: 0, total: items.length });
        for (const [i, item] of items.entries()) {
            try {
                const blob = item.blob || (await loadImageBlob(item.src));
                const ownPrompt = item.prompt || prompt;
                const work = await publishWork({
                    images: [await fitForUpload(blob, `image-${i + 1}`, 4096, 8 * 1024 * 1024)],
                    title: item.prompt ? defaultTitle(item.prompt) : title ? `${title} ${i + 1}` : "",
                    description,
                    prompt: ownPrompt,
                    showPrompt,
                    model: item.model || payload.model || "",
                    params: item.params || payload.params || {},
                    source: item.source === "image_workbench" ? "image_workbench" : payload.source,
                    tags,
                    visibility,
                    collectionId,
                });
                works.push(work);
            } catch (err) {
                failed += 1;
                error = (err as Error).message || t("community.publish.failed");
                // Over the daily limit: the rest would fail the same way.
                if (err instanceof CommunityError && err.reason === "COMMUNITY_TOO_MANY") {
                    failed += items.length - i - 1;
                    break;
                }
            }
            setProgress({ done: i + 1, total: items.length });
        }
        setPublishing(false);
        setProgress(null);
        setBatchResult({ works, failed, error });
        if (works.length) void refreshProfile();
    };

    const publish = async () => {
        if (!payload || !items.length) return;
        if (batch) return publishBatch();
        setPublishing(true);
        try {
            const images = await Promise.all(
                items.map(async (item, i) => {
                    const blob = item.blob || (await loadImageBlob(item.src));
                    // Large originals are shrunk so a 9-image post stays well inside the upload limit.
                    return fitForUpload(blob, `image-${i + 1}`, 4096, 8 * 1024 * 1024);
                }),
            );
            const work = await publishWork({
                images,
                title,
                description,
                prompt,
                showPrompt,
                model: payload.model || items.find((item) => item.model)?.model || "",
                params: payload.params || items.find((item) => item.params)?.params || {},
                source: kind === "site" ? "site" : payload.source === "canvas" && items.length && items.every((item) => item.source === "image_workbench") ? "image_workbench" : payload.source,
                tags,
                visibility,
                collectionId,
                remixOf: payload.remixOf,
                siteId: kind === "site" ? site?.id : undefined,
            });
            setPublished(work);
            void refreshProfile();
        } catch (error) {
            message.error((error as Error).message || t("community.publish.failed"));
        } finally {
            setPublishing(false);
        }
    };

    const renderBody = () => {
        if (batchResult) {
            const pending = batchResult.works.filter((w) => w.status === "pending").length;
            return (
                <Result
                    status={batchResult.works.length ? (batchResult.failed ? "warning" : "success") : "error"}
                    title={t("community.publish.batch.done", { count: batchResult.works.length })}
                    subTitle={
                        <span className="grid gap-1">
                            {pending ? <span>{t("community.publish.batch.pending", { count: pending })}</span> : null}
                            {batchResult.failed ? <span>{t("community.publish.batch.failed", { count: batchResult.failed, error: batchResult.error })}</span> : null}
                        </span>
                    }
                    extra={
                        profile ? (
                            <Button
                                type="primary"
                                onClick={() => {
                                    close();
                                    navigate(`/u/${profile.handle}`);
                                }}
                            >
                                {t("community.publish.batch.view")}
                            </Button>
                        ) : null
                    }
                />
            );
        }
        if (published) {
            const pending = published.status === "pending";
            return (
                <Result
                    status={pending ? "info" : "success"}
                    title={pending ? t("community.publish.pending") : t("community.publish.done")}
                    subTitle={pending ? published.review_reason || t("community.publish.pendingHint") : t("community.publish.doneHint")}
                    extra={[
                        <Button key="copy" onClick={share.copy}>
                            {t("community.copyLink")}
                        </Button>,
                        <Button
                            key="open"
                            type="primary"
                            onClick={() => {
                                close();
                                navigate(`/w/${published.id}`);
                            }}
                        >
                            {t("community.publish.view")}
                        </Button>,
                    ]}
                />
            );
        }
        if (status !== "signedIn") {
            return (
                <div className="grid gap-3 py-4 text-sm">
                    <p className="m-0">{t("community.publish.signIn", { site: MAIN_SITE_NAME })}</p>
                    <Button type="primary" icon={<LogIn className="size-4" />} loading={waiting} onClick={signIn}>
                        {t("account.signIn")}
                    </Button>
                </div>
            );
        }
        if (profile === undefined) {
            return (
                <div className="flex justify-center py-10">
                    <Spin />
                </div>
            );
        }
        if (profile === null) {
            return (
                <div className="grid gap-3">
                    <p className="m-0 text-sm text-stone-600 dark:text-stone-300">{t("community.publish.profileFirst")}</p>
                    <ProfileForm suggestedName={account?.username} onSaved={() => undefined} submitLabel={t("community.publish.profileContinue")} />
                </div>
            );
        }
        return (
            <div className="grid gap-4" data-testid="publish-form">
                {!payload?.site && !payload?.images?.length ? (
                    <Segmented
                        block
                        value={kind}
                        onChange={(v) => setKind(v as "image" | "site")}
                        options={[
                            { value: "image", label: t("community.publish.site.kindImage") },
                            { value: "site", label: t("community.publish.site.kindSite") },
                        ]}
                        data-testid="publish-kind"
                    />
                ) : null}
                {kind === "site" ? (
                    payload?.site ? (
                        <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/60 dark:bg-violet-950/30" data-testid="publish-site">
                            <Globe className="size-5 shrink-0 text-violet-500" />
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{payload.site.title}</div>
                                <a href={payload.site.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs">
                                    {payload.site.url}
                                </a>
                            </div>
                        </div>
                    ) : (
                        <label className="grid gap-1 text-sm">
                            <span className="font-medium">{t("community.publish.site.pick")}</span>
                            <Select
                                loading={mySites === null}
                                value={site?.id}
                                placeholder={t("community.publish.site.pickPlaceholder")}
                                notFoundContent={t("community.publish.site.none")}
                                onChange={(id) => {
                                    const picked = mySites?.find((s) => s.id === id);
                                    setSite(picked ? { id: picked.id, title: picked.title, url: picked.url } : null);
                                    if (picked && !title) setTitle(picked.title);
                                }}
                                options={(mySites || []).map((s) => ({
                                    value: s.id,
                                    disabled: !s.publishable,
                                    label: `${s.title || s.name}${s.reason ? `（${t(`community.publish.site.reasons.${s.reason}`)}）` : ""}`,
                                }))}
                                data-testid="publish-site-select"
                            />
                            <span className="text-xs text-stone-500">{t("community.publish.site.coverHint")}</span>
                        </label>
                    )
                ) : null}
                {snapshotting ? (
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                        <Spin size="small" />
                        {t("community.publish.site.snapshotting")}
                    </div>
                ) : null}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {items.map((item) => (
                        <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900">
                            <img src={item.src} alt="" className="size-full object-cover" />
                            <button type="button" className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white" aria-label={t("community.publish.removeImage")} onClick={() => remove(item.id)}>
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                    {items.length < maxItems ? (
                        <button
                            type="button"
                            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-xs text-stone-500 hover:border-stone-500 dark:border-stone-700"
                            onClick={() => fileRef.current?.click()}
                        >
                            <ImagePlus className="size-5" />
                            {t("community.publish.addImage")}
                        </button>
                    ) : null}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
                {kind === "image" ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button icon={<Images className="size-4" />} disabled={items.length >= maxItems} onClick={() => setPickerOpen(true)} data-testid="publish-pick-site">
                            {t("community.publish.picker.open")}
                        </Button>
                        <span className="text-xs text-stone-500">{t("community.publish.picker.hint")}</span>
                    </div>
                ) : null}
                {kind === "image" && !payload?.remixOf && items.length > 1 ? (
                    <div className="grid gap-1 text-sm">
                        <Segmented
                            block
                            value={batch ? "batch" : "one"}
                            onChange={(value) => setBatch(value === "batch")}
                            options={[
                                { value: "one", label: t("community.publish.batch.one"), disabled: items.length > MAX_IMAGES },
                                { value: "batch", label: t("community.publish.batch.each", { count: items.length }) },
                            ]}
                            data-testid="publish-batch"
                        />
                        <span className="text-xs text-stone-500">{batch ? t("community.publish.batch.eachHint") : t("community.publish.batch.oneHint")}</span>
                    </div>
                ) : null}
                <label className="grid gap-1 text-sm">
                    <span className="font-medium">{t("community.publish.title")}</span>
                    <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} data-testid="publish-title" />
                </label>
                <label className="grid gap-1 text-sm">
                    <span className="font-medium">{t("community.publish.description")}</span>
                    <Input.TextArea value={description} maxLength={1000} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                    <span className="flex items-center justify-between font-medium">
                        {t("community.publish.prompt")}
                        <span className="flex items-center gap-2 text-xs font-normal text-stone-500">
                            {t("community.publish.showPrompt")}
                            <Switch size="small" checked={showPrompt} onChange={setShowPrompt} />
                        </span>
                    </span>
                    <Input.TextArea value={prompt} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(e) => setPrompt(e.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                    <span className="font-medium">{t("community.publish.tags")}</span>
                    <Select mode="tags" value={tags} maxCount={6} onChange={setTags} options={TAG_SUGGESTIONS.map((tag) => ({ value: tag, label: tag }))} placeholder={t("community.publish.tagsPlaceholder")} />
                </label>
                <div className="grid gap-1 text-sm">
                    <span className="font-medium">{t("community.publish.visibility")}</span>
                    <Segmented block value={visibility} onChange={(v) => setVisibility(v as WorkVisibility)} options={(["public", "unlisted", "private"] as const).map((v) => ({ value: v, label: t(`community.visibility.${v}`) }))} />
                </div>
                <div className="grid gap-1 text-sm">
                    <span className="font-medium">{t("community.publish.collection")}</span>
                    <div className="flex gap-2">
                        <Select
                            allowClear
                            className="min-w-0 flex-1"
                            value={collectionId}
                            onChange={setCollectionId}
                            placeholder={t("community.publish.noCollection")}
                            options={collections.map((c) => ({ value: c.id, label: c.title }))}
                            data-testid="publish-collection"
                        />
                        <Input
                            className="!w-40"
                            value={newCollection}
                            maxLength={60}
                            placeholder={t("community.publish.newCollection")}
                            onChange={(e) => setNewCollection(e.target.value)}
                            onPressEnter={() => void addCollection()}
                            data-testid="publish-collection-new-name"
                        />
                        <Button icon={<Plus className="size-4" />} disabled={!newCollection.trim()} onClick={() => void addCollection()} aria-label={t("community.collections.new")} data-testid="publish-collection-new" />
                    </div>
                </div>
                <p className="m-0 text-xs leading-5 text-stone-500">{t("community.publish.rules")}</p>
                <Button type="primary" icon={<Send className="size-4" />} loading={publishing} disabled={!items.length || (kind === "site" && !site)} onClick={() => void publish()} data-testid="publish-submit">
                    {progress
                        ? t("community.publish.batch.progress", { done: progress.done, total: progress.total })
                        : batch
                          ? t("community.publish.batch.submit", { count: items.length })
                          : t("community.publish.submit")}
                </Button>
            </div>
        );
    };

    return (
        <Modal open={open} title={t("community.publish.dialogTitle")} onCancel={close} footer={null} width={600} destroyOnHidden>
            {renderBody()}
            <SiteImagePicker open={pickerOpen} max={Math.max(maxItems - items.length, 0)} onPick={addSiteImages} onClose={() => setPickerOpen(false)} />
        </Modal>
    );
}
