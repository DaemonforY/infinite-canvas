import { useState } from "react";
import { App, Button, Modal } from "antd";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AiToolOptionsForm, DEFAULT_AI_TOOL_SETTINGS, runAiTool, useImageToolsQuota } from "@/components/image-tools/ai-image-tools";

/** AI super-resolution of an image node on the HiveGPT server; the result becomes a new node. */
export function CanvasNodeSuperResolveDialog({ dataUrl, open, onClose, onDone }: { dataUrl: string; open: boolean; onClose: () => void; onDone: (blob: Blob) => Promise<void> | void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const { apiKey, quota, refresh } = useImageToolsQuota();
    const [settings, setSettings] = useState(DEFAULT_AI_TOOL_SETTINGS);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        try {
            const source = await (await fetch(dataUrl)).blob();
            const result = await runAiTool(apiKey, "upscale", settings, source, "image.png");
            await onDone(result.blob);
            message.success(t("toolbox.ai.done"));
        } catch (error) {
            message.error((error as Error)?.message || t("toolbox.failed"));
        } finally {
            setBusy(false);
            void refresh();
        }
    };

    return (
        <Modal title={t("canvas.projectPage.superResolve")} open={open} centered footer={null} onCancel={busy ? undefined : onClose} maskClosable={!busy} width={420}>
            <div className="grid gap-4 pt-2">
                <AiToolOptionsForm mode="upscale" value={settings} onChange={setSettings} quota={quota} connected={Boolean(apiKey)} />
                <Button type="primary" icon={<Sparkles className="size-4" />} loading={busy} disabled={!apiKey || !quota?.enabled} onClick={() => void run()}>
                    {t("toolbox.ai.run")}
                </Button>
            </div>
        </Modal>
    );
}
