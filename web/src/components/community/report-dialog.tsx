import { useState } from "react";
import { App, Input, Modal, Radio } from "antd";
import { useTranslation } from "react-i18next";

const REPORT_REASONS = ["porn", "violence", "politics", "copyright", "fraud", "spam", "other"] as const;

/** Report a work or a comment: pick a reason, add details, send. */
export function ReportDialog({ onSubmit, onClose }: { onSubmit: (reason: string, detail: string) => Promise<unknown>; onClose: () => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [reason, setReason] = useState<string>("");
    const [detail, setDetail] = useState("");
    const [sending, setSending] = useState(false);
    const send = async () => {
        if (!reason) return;
        setSending(true);
        try {
            await onSubmit(reason, detail);
            message.success(t("community.report.sent"));
            onClose();
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setSending(false);
        }
    };
    return (
        <Modal open title={t("community.report.title")} onCancel={onClose} onOk={() => void send()} okText={t("community.report.submit")} cancelText={t("common.cancel")} okButtonProps={{ disabled: !reason }} confirmLoading={sending} destroyOnHidden>
            <Radio.Group value={reason} onChange={(e) => setReason(e.target.value)} className="grid gap-1.5">
                {REPORT_REASONS.map((r) => (
                    <Radio key={r} value={r}>
                        {t(`community.report.reasons.${r}`)}
                    </Radio>
                ))}
            </Radio.Group>
            <Input.TextArea className="mt-3" value={detail} maxLength={500} autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("community.report.detail")} onChange={(e) => setDetail(e.target.value)} />
        </Modal>
    );
}
