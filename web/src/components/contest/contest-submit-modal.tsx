import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Empty, Form, Image, Input, Modal, Select, Spin } from "antd";
import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME, mainSiteLink } from "@/constant/runtime-config";
import { CONTEST_IMAGE_MAX_BYTES, findMainSiteApiKey, listOpenContests, loadImageBlob, mainSiteContestUrl, submitContestEntry, type MainSiteContest } from "@/services/api/main-site-contests";
import { useConfigStore } from "@/stores/use-config-store";
import { useContestSubmitStore } from "@/stores/use-contest-submit-store";

type FormValues = { contestId?: number; title: string; description: string; prompt: string };

function defaultTitle(prompt?: string, title?: string): string {
    const source = (title || prompt || "").replace(/\s+/g, " ").trim();
    return source.length > 40 ? `${source.slice(0, 40)}…` : source;
}

/** Shared dialog: submit a canvas image to a main-site contest using the main-site API key. */
export function ContestSubmitModal() {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const payload = useContestSubmitStore((state) => state.payload);
    const close = useContestSubmitStore((state) => state.close);
    const config = useConfigStore((state) => state.config);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [form] = Form.useForm<FormValues>();
    const [contests, setContests] = useState<MainSiteContest[] | null>(null);
    const [loadError, setLoadError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const open = Boolean(payload);
    const apiKey = useMemo(() => findMainSiteApiKey(config), [config]);

    useEffect(() => {
        if (!payload) return;
        const controller = new AbortController();
        setContests(null);
        setLoadError("");
        form.setFieldsValue({ contestId: undefined, title: defaultTitle(payload.prompt, payload.title), description: "", prompt: payload.prompt || "" });
        listOpenContests(controller.signal)
            .then((list) => {
                setContests(list);
                if (list.length === 1) form.setFieldValue("contestId", list[0].id);
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                setLoadError(error instanceof Error ? error.message : String(error));
                setContests([]);
            });
        return () => controller.abort();
    }, [payload, form]);

    const submit = async () => {
        if (!payload || !apiKey) return;
        const values = await form.validateFields();
        setSubmitting(true);
        try {
            const blob = await loadImageBlob(payload.imageUrl).catch(() => {
                throw new Error(t("contestSubmit.imageLoadFailed"));
            });
            if (blob.size > CONTEST_IMAGE_MAX_BYTES) throw new Error(t("contestSubmit.imageTooLarge"));
            const result = await submitContestEntry(values.contestId!, apiKey, { title: values.title.trim(), description: values.description, prompt: values.prompt, image: blob });
            const contestId = values.contestId!;
            close();
            modal.success({
                title: result.status === "pending" ? t("contestSubmit.pendingTitle") : t("contestSubmit.successTitle"),
                content: result.status === "pending" ? t("contestSubmit.pendingHint") : t("contestSubmit.successHint", { site: MAIN_SITE_NAME }),
                okText: t("contestSubmit.viewContest"),
                onOk: () => {
                    window.open(mainSiteContestUrl(contestId), "_blank", "noopener,noreferrer");
                },
                closable: true,
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSubmitting(false);
        }
    };

    const noKey = !apiKey;
    const noContests = contests !== null && contests.length === 0;

    return (
        <Modal
            open={open}
            onCancel={close}
            width={560}
            destroyOnHidden
            title={
                <span className="inline-flex items-center gap-2">
                    <Trophy className="size-4" />
                    {t("contestSubmit.title", { site: MAIN_SITE_NAME })}
                </span>
            }
            okText={t("contestSubmit.submit")}
            cancelText={t("common.cancel")}
            onOk={() => void submit()}
            okButtonProps={{ loading: submitting, disabled: noKey || !contests?.length }}
        >
            {payload ? (
                <div className="space-y-4" data-testid="contest-submit-modal">
                    <div className="flex justify-center rounded-lg bg-stone-100 p-2 dark:bg-stone-800">
                        <Image src={payload.imageUrl} alt="" className="max-h-56 object-contain" preview={false} />
                    </div>

                    {noKey ? (
                        <Alert
                            type="warning"
                            showIcon
                            message={t("contestSubmit.noKeyTitle", { site: MAIN_SITE_NAME })}
                            description={t("contestSubmit.noKeyHint", { site: MAIN_SITE_NAME })}
                            action={
                                <div className="flex flex-col gap-2">
                                    <Button size="small" type="primary" href={mainSiteLink("/keys", "contest-submit")} target="_blank" rel="noopener noreferrer">
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

                    {contests === null ? (
                        <div className="flex justify-center py-6">
                            <Spin />
                        </div>
                    ) : noContests ? (
                        <Empty description={loadError ? t("contestSubmit.loadFailed", { error: loadError }) : t("contestSubmit.noContests")}>
                            <Button href={mainSiteLink("/contests", "contest-submit-empty")} target="_blank" rel="noopener noreferrer">
                                {t("contestSubmit.browseContests", { site: MAIN_SITE_NAME })}
                            </Button>
                        </Empty>
                    ) : (
                        <Form form={form} layout="vertical" requiredMark={false} disabled={noKey}>
                            <Form.Item name="contestId" label={t("contestSubmit.contest")} rules={[{ required: true, message: t("contestSubmit.contestRequired") }]}>
                                <Select placeholder={t("contestSubmit.contestPlaceholder")} options={contests.map((c) => ({ value: c.id, label: c.title }))} />
                            </Form.Item>
                            <Form.Item name="title" label={t("contestSubmit.entryTitle")} rules={[{ required: true, whitespace: true, message: t("contestSubmit.titleRequired") }, { max: 120 }]}>
                                <Input maxLength={120} showCount />
                            </Form.Item>
                            <Form.Item name="description" label={t("contestSubmit.description")}>
                                <Input.TextArea rows={2} maxLength={2000} placeholder={t("contestSubmit.descriptionPlaceholder")} />
                            </Form.Item>
                            <Form.Item name="prompt" label={t("contestSubmit.prompt")} extra={t("contestSubmit.promptHint")}>
                                <Input.TextArea rows={3} maxLength={4000} />
                            </Form.Item>
                        </Form>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}
