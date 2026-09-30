import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Form, Input, Modal, Select, Switch } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME, mainSiteLink } from "@/constant/runtime-config";
import { createImageThumbnail } from "@/lib/image-thumbnail";
import { PROMPT_SCENES } from "@/lib/prompt-taxonomy";
import { findMainSiteApiKey, loadImageBlob } from "@/services/api/main-site-contests";
import { createMyPrompt, PROMPT_COVER_MAX_BYTES, updateMyPrompt, uploadPromptCover, type MyPromptInput } from "@/services/api/main-site-prompts";
import { useConfigStore } from "@/stores/use-config-store";
import { useMyPromptEditorStore } from "@/stores/use-my-prompt-editor-store";
import { FOR_YOU_QUERY_KEY, MY_PROMPTS_QUERY_KEY } from "./use-prompt-list";

type FormValues = { title: string; prompt: string; scenes: string[]; tags: string[]; share: boolean };

/** Covers are shown on cards; 1280px on the long edge is plenty and keeps uploads small. */
async function prepareCover(blob: Blob): Promise<Blob> {
    const resized = (await createImageThumbnail(blob, 1280).catch(() => undefined)) || blob;
    if (resized.size > PROMPT_COVER_MAX_BYTES) throw new Error("cover-too-large");
    return resized;
}

/**
 * Shared dialog: save a prompt to the user's own library on the main site ("我的"), optionally
 * shared with everyone after review. Opened from the library, the workbench and result images.
 */
export function MyPromptDialog() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const payload = useMyPromptEditorStore((state) => state.payload);
    const close = useMyPromptEditorStore((state) => state.close);
    const config = useConfigStore((state) => state.config);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const apiKey = useMemo(() => findMainSiteApiKey(config), [config]);
    const [form] = Form.useForm<FormValues>();
    const [saving, setSaving] = useState(false);
    // Cover: the existing server path, or a new picture (blob) to upload on save.
    const [coverUrl, setCoverUrl] = useState("");
    const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
    const [coverPreview, setCoverPreview] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);
    const item = payload?.item;
    const open = Boolean(payload);

    useEffect(() => {
        if (!payload) return;
        const current = payload.item;
        form.setFieldsValue({
            title: current?.title || payload.title || "",
            prompt: current?.prompt || payload.prompt || "",
            scenes: current ? current.traits.scenes.filter((scene) => scene !== "other") : payload.kind === "video" ? ["video"] : [],
            tags: current?.curatedTags || [],
            share: current ? current.visibility === "public" : false,
        });
        setCoverBlob(null);
        setCoverUrl(current?.coverPath || "");
        setCoverPreview(current?.coverUrl || payload.imageUrl || "");
        if (!current && payload.imageUrl) {
            loadImageBlob(payload.imageUrl)
                .then(setCoverBlob)
                .catch(() => setCoverPreview(""));
        }
    }, [payload, form]);

    useEffect(() => {
        if (!coverBlob) return;
        const url = URL.createObjectURL(coverBlob);
        setCoverPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [coverBlob]);

    const pickFile = (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            message.error(t("myPrompts.coverInvalid"));
            return;
        }
        setCoverBlob(file);
        setCoverUrl("");
    };

    const removeCover = () => {
        setCoverBlob(null);
        setCoverUrl("");
        setCoverPreview("");
    };

    const save = async () => {
        if (!payload || !apiKey) return;
        const values = await form.validateFields();
        setSaving(true);
        try {
            let cover = coverUrl;
            if (coverBlob) {
                const prepared = await prepareCover(coverBlob).catch(() => {
                    throw new Error(t("myPrompts.coverTooLarge"));
                });
                cover = await uploadPromptCover(apiKey, prepared);
            }
            const input: MyPromptInput = {
                title: values.title.trim(),
                prompt: values.prompt.trim(),
                kind: values.scenes[0] === "video" || payload.kind === "video" ? "video" : "image",
                scenes: values.scenes,
                tags: values.tags,
                cover_url: cover,
                share: values.share,
            };
            if (item?.serverId) await updateMyPrompt(apiKey, item.serverId, input);
            else await createMyPrompt(apiKey, input);
            void queryClient.invalidateQueries({ queryKey: [MY_PROMPTS_QUERY_KEY] });
            void queryClient.invalidateQueries({ queryKey: [FOR_YOU_QUERY_KEY] });
            message.success(values.share ? t("myPrompts.savedShared") : t("myPrompts.saved"), 4);
            close();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    };

    const rejected = item?.status === "rejected" || item?.status === "hidden";

    return (
        <Modal
            open={open}
            onCancel={close}
            width={620}
            destroyOnHidden
            title={item ? t("myPrompts.editTitle") : t("myPrompts.createTitle")}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            onOk={() => void save()}
            okButtonProps={{ loading: saving, disabled: !apiKey, "data-testid": "my-prompt-save" } as never}
        >
            <div className="space-y-4" data-testid="my-prompt-dialog">
                {!apiKey ? (
                    <Alert
                        type="warning"
                        showIcon
                        message={t("myPrompts.noKeyTitle", { site: MAIN_SITE_NAME })}
                        description={t("myPrompts.noKeyHint", { site: MAIN_SITE_NAME })}
                        action={
                            <div className="flex flex-col gap-2">
                                <Button size="small" type="primary" href={mainSiteLink("/keys", "my-prompts")} target="_blank" rel="noopener noreferrer">
                                    {t("config.mainSite.getKeyCta")}
                                </Button>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        close();
                                        openConfigDialog(false, "channels");
                                    }}
                                >
                                    {t("contestSubmit.openChannels")}
                                </Button>
                            </div>
                        }
                    />
                ) : null}
                {rejected && item?.reviewNote ? <Alert type="error" showIcon message={t("myPrompts.rejectedHint", { note: item.reviewNote })} /> : null}

                <div className="flex gap-4">
                    <div className="relative size-28 shrink-0 overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
                        {coverPreview ? (
                            <>
                                <img src={coverPreview} alt="" className="size-full object-cover" />
                                <button type="button" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/55 text-white hover:bg-red-600" onClick={removeCover} aria-label={t("myPrompts.removeCover")}>
                                    <Trash2 className="size-3.5" />
                                </button>
                            </>
                        ) : (
                            <button type="button" className="flex size-full flex-col items-center justify-center gap-1 text-xs text-stone-400" onClick={() => fileInput.current?.click()} data-testid="my-prompt-cover-pick">
                                <ImagePlus className="size-6" />
                                {t("myPrompts.addCover")}
                            </button>
                        )}
                        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(event) => pickFile(event.target.files?.[0] || undefined)} />
                    </div>
                    <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">{t("myPrompts.coverHint")}</p>
                </div>

                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="title" label={t("myPrompts.fieldTitle")}>
                        <Input maxLength={60} placeholder={t("myPrompts.titlePlaceholder")} data-testid="my-prompt-title" />
                    </Form.Item>
                    <Form.Item name="prompt" label={t("myPrompts.fieldPrompt")} rules={[{ required: true, whitespace: true, message: t("myPrompts.promptRequired") }]}>
                        <Input.TextArea rows={6} maxLength={8000} showCount data-testid="my-prompt-text" />
                    </Form.Item>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item name="scenes" label={t("myPrompts.fieldScenes")}>
                            <Select
                                mode="multiple"
                                maxCount={4}
                                allowClear
                                placeholder={t("myPrompts.scenesPlaceholder")}
                                options={PROMPT_SCENES.filter((scene) => scene !== "other").map((scene) => ({ value: scene, label: t(`prompts.scenes.${scene}`) }))}
                            />
                        </Form.Item>
                        <Form.Item name="tags" label={t("myPrompts.fieldTags")}>
                            <Select mode="tags" maxCount={8} tokenSeparators={[",", "，", " ", "#"]} placeholder={t("myPrompts.tagsPlaceholder")} open={false} suffixIcon={null} />
                        </Form.Item>
                    </div>
                    <Form.Item name="share" valuePropName="checked" label={t("myPrompts.fieldShare")} extra={t("myPrompts.shareHint")} className="mb-0">
                        <Switch data-testid="my-prompt-share" />
                    </Form.Item>
                </Form>
            </div>
        </Modal>
    );
}
