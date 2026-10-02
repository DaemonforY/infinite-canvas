import { useEffect, useState } from "react";
import { App, Button, Empty, Form, Input, Modal, Select, Spin } from "antd";
import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME, mainSiteLink } from "@/constant/runtime-config";
import { enterContest, mainSiteAsset, type Work } from "@/services/api/community";
import { listSubmittableContests, mainSiteContestUrl, type MainSiteContest } from "@/services/api/main-site-contests";

type FormValues = { contestId?: number; title: string; description: string };

/** 「投稿参赛」 on the author's work page: enters one image of the work in a main-site contest. */
export function WorkContestDialog({ work, onClose, onEntered }: { work: Work; onClose: () => void; onEntered: () => void }) {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<FormValues>();
    const [contests, setContests] = useState<MainSiteContest[] | null>(null);
    const [loadError, setLoadError] = useState("");
    const [imageIndex, setImageIndex] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const media = work.media || [];
    const entered = new Set((work.contests || []).map((c) => c.contest_id));

    useEffect(() => {
        const controller = new AbortController();
        listSubmittableContests(controller.signal)
            .then(({ open }) => {
                setContests(open);
                const available = open.filter((c) => !entered.has(c.id));
                if (available.length === 1) form.setFieldValue("contestId", available[0].id);
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setLoadError((err as Error).message);
                setContests([]);
            });
        return () => controller.abort();
        // `entered` only picks the default choice; the list loads once.
    }, [form]);

    const submit = async () => {
        const values = await form.validateFields();
        setSubmitting(true);
        try {
            const entry = await enterContest(work.id, { contest_id: values.contestId!, image_index: imageIndex, title: values.title.trim(), description: values.description.trim() });
            onEntered();
            onClose();
            modal.success({
                title: t(entry.status === "pending" ? "community.contest.pendingTitle" : "community.contest.doneTitle"),
                content: t(entry.status === "pending" ? "community.contest.pendingHint" : "community.contest.doneHint", { site: MAIN_SITE_NAME }),
                okText: t("community.contest.viewContest"),
                closable: true,
                onOk: () => void window.open(mainSiteContestUrl(values.contestId!), "_blank", "noopener,noreferrer"),
            });
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            open
            onCancel={onClose}
            width={540}
            destroyOnHidden
            title={
                <span className="inline-flex items-center gap-2">
                    <Trophy className="size-4" />
                    {t("community.contest.title")}
                </span>
            }
            okText={t("community.contest.submit")}
            cancelText={t("common.cancel")}
            onOk={() => void submit()}
            okButtonProps={{ loading: submitting, disabled: !contests?.length }}
        >
            <div className="grid gap-4" data-testid="work-contest-dialog">
                {contests === null ? (
                    <div className="flex justify-center py-8">
                        <Spin />
                    </div>
                ) : !contests.length ? (
                    <Empty description={loadError || t("community.contest.none")}>
                        <Button href={mainSiteLink("/contests", "work-contest-empty")} target="_blank" rel="noopener noreferrer">
                            {t("community.contest.browse", { site: MAIN_SITE_NAME })}
                        </Button>
                    </Empty>
                ) : (
                    <>
                        {media.length > 1 ? (
                            <div>
                                <div className="mb-1.5 text-sm">{t("community.contest.pickImage")}</div>
                                <div className="flex gap-2 overflow-x-auto">
                                    {media.map((m, i) => (
                                        <button
                                            key={m.position}
                                            type="button"
                                            onClick={() => setImageIndex(i)}
                                            className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === imageIndex ? "border-violet-500" : "border-transparent opacity-60 hover:opacity-100"}`}
                                            aria-pressed={i === imageIndex}
                                        >
                                            <img src={mainSiteAsset(m.thumb_url)} alt="" className="size-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ title: (work.title || "").slice(0, 120), description: work.description || "" }}>
                            <Form.Item name="contestId" label={t("community.contest.contest")} rules={[{ required: true, message: t("community.contest.contestRequired") }]}>
                                <Select
                                    placeholder={t("community.contest.contestPlaceholder")}
                                    options={contests.map((c) => ({ value: c.id, label: entered.has(c.id) ? `${c.title}（${t("community.contest.alreadyEntered")}）` : c.title, disabled: entered.has(c.id) }))}
                                />
                            </Form.Item>
                            <Form.Item name="title" label={t("community.contest.entryTitle")} rules={[{ required: true, whitespace: true, message: t("community.contest.titleRequired") }]}>
                                <Input maxLength={120} showCount />
                            </Form.Item>
                            <Form.Item name="description" label={t("community.contest.description")}>
                                <Input.TextArea rows={2} maxLength={2000} />
                            </Form.Item>
                        </Form>
                        <p className="m-0 text-xs text-stone-500">{t(work.show_prompt ? "community.contest.promptShown" : "community.contest.promptHidden")}</p>
                    </>
                )}
            </div>
        </Modal>
    );
}
