import { useEffect, useState } from "react";
import { App, Button, Input, Modal, Result } from "antd";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { useCopyText } from "@/hooks/use-copy-text";
import { asHtmlDocument } from "@/lib/publish-html";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import { MY_SITES_URL, publishSite, updateSite, type HostedSite } from "@/services/api/main-site-hosting";
import { useConfigStore } from "@/stores/use-config-store";

/** Publishes the HTML of a text node as a website (or a new version of the one published before). */
export function CanvasPublishSiteDialog({ open, html, defaultTitle, siteId, onClose, onPublished }: { open: boolean; html: string; defaultTitle: string; siteId?: number; onClose: () => void; onPublished: (site: HostedSite) => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const copyText = useCopyText();
    const apiKey = useConfigStore((state) => findMainSiteApiKey(state.config));
    const [title, setTitle] = useState(defaultTitle);
    const [busy, setBusy] = useState(false);
    const [site, setSite] = useState<HostedSite | null>(null);

    useEffect(() => {
        if (open) {
            setTitle(defaultTitle);
            setSite(null);
        }
    }, [open, defaultTitle]);

    const publish = async (asUpdate: boolean) => {
        setBusy(true);
        try {
            const page = asHtmlDocument(html, title.trim() || defaultTitle);
            const result = asUpdate && siteId ? await updateSite(apiKey, siteId, title.trim(), page) : await publishSite(apiKey, title.trim(), page);
            setSite(result);
            onPublished(result);
        } catch (error) {
            message.error((error as Error)?.message || t("publishSite.failed"));
        } finally {
            setBusy(false);
        }
    };

    const waiting = site && (site.status === "pending" || site.pending_version > 0);

    return (
        <Modal open={open} title={t("publishSite.title")} onCancel={onClose} footer={null} destroyOnHidden width={480}>
            {site ? (
                <Result
                    status={waiting ? "info" : "success"}
                    title={waiting ? t("publishSite.pending") : t("publishSite.done")}
                    subTitle={waiting ? site.status_reason || t("publishSite.pendingHint") : site.url}
                    extra={[
                        <Button key="copy" onClick={() => copyText(site.url, t("publishSite.copied"))}>
                            {t("publishSite.copy")}
                        </Button>,
                        <Button key="open" type="primary" href={waiting && site.preview_url ? site.preview_url : site.url} target="_blank" rel="noopener">
                            {waiting ? t("publishSite.preview") : t("publishSite.open")}
                        </Button>,
                    ]}
                />
            ) : !apiKey ? (
                <p className="py-4 text-sm">{t("publishSite.connect", { site: MAIN_SITE_NAME })}</p>
            ) : (
                <div className="grid gap-4 pt-2">
                    <div className="grid gap-1.5">
                        <span className="text-sm font-medium">{t("publishSite.name")}</span>
                        <Input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} />
                    </div>
                    <p className="m-0 text-xs leading-5 opacity-70">{t("publishSite.hint", { site: MAIN_SITE_NAME })}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button href={MY_SITES_URL()} target="_blank" rel="noopener">
                            {t("publishSite.manage")}
                        </Button>
                        {siteId ? (
                            <Button loading={busy} onClick={() => void publish(false)}>
                                {t("publishSite.asNew")}
                            </Button>
                        ) : null}
                        <Button type="primary" icon={<Globe className="size-4" />} loading={busy} onClick={() => void publish(Boolean(siteId))} data-testid="publish-site">
                            {siteId ? t("publishSite.update") : t("publishSite.publish")}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
