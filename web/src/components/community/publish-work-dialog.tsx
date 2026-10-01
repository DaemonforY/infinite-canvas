import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Modal, Result, Segmented, Select, Spin, Switch } from "antd";
import { ImagePlus, LogIn, Plus, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";

import { ProfileForm } from "@/components/community/profile-form";
import { useShareLink } from "@/components/community/use-share-link";
import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { fitForUpload } from "@/lib/image-tools";
import { createCollection, listCollections, publishWork, type Collection, type Work, type WorkVisibility } from "@/services/api/community";
import { loadImageBlob } from "@/services/api/main-site-contests";
import { useCommunityMeStore } from "@/stores/use-community-me-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";
import { usePublishWorkStore } from "@/stores/use-publish-work-store";

type Item = { id: string; src: string; blob?: Blob; owned?: boolean };

const MAX_IMAGES = 9;
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
    }, [payload]);

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

    const addFiles = (files: FileList | null) => {
        const picked = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        setItems((current) => [...current, ...picked.slice(0, MAX_IMAGES - current.length).map((file) => ({ id: nanoid(), src: URL.createObjectURL(file), blob: file, owned: true }))]);
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

    const publish = async () => {
        if (!payload || !items.length) return;
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
                model: payload.model || "",
                params: payload.params || {},
                source: payload.source,
                tags,
                visibility,
                collectionId,
                remixOf: payload.remixOf,
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
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {items.map((item) => (
                        <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900">
                            <img src={item.src} alt="" className="size-full object-cover" />
                            <button type="button" className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white" aria-label={t("community.publish.removeImage")} onClick={() => remove(item.id)}>
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                    {items.length < MAX_IMAGES ? (
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
                    <Select
                        allowClear
                        value={collectionId}
                        onChange={setCollectionId}
                        placeholder={t("community.publish.noCollection")}
                        options={collections.map((c) => ({ value: c.id, label: c.title }))}
                        popupRender={(menu) => (
                            <>
                                {menu}
                                <div className="flex gap-1 border-t border-stone-200 p-2 dark:border-stone-700">
                                    <Input size="small" value={newCollection} maxLength={60} placeholder={t("community.publish.newCollection")} onChange={(e) => setNewCollection(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => void addCollection()} />
                                </div>
                            </>
                        )}
                    />
                </div>
                <p className="m-0 text-xs leading-5 text-stone-500">{t("community.publish.rules")}</p>
                <Button type="primary" icon={<Send className="size-4" />} loading={publishing} disabled={!items.length} onClick={() => void publish()} data-testid="publish-submit">
                    {t("community.publish.submit")}
                </Button>
            </div>
        );
    };

    return (
        <Modal open={open} title={t("community.publish.dialogTitle")} onCancel={close} footer={null} width={600} destroyOnHidden>
            {renderBody()}
        </Modal>
    );
}
