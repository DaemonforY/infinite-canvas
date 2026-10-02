import { useEffect, useState } from "react";
import { Badge, Empty, Popover, Spin } from "antd";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { AuthorAvatar } from "@/components/community/author-avatar";
import { authorName, listNotifications, mainSiteAsset, markNotificationsRead, type CommunityNotification } from "@/services/api/community";
import { useCommunityMeStore } from "@/stores/use-community-me-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";

const POLL_MS = 60_000;
const COMMENT_KINDS = new Set(["comment", "reply", "comment_hidden"]);

/** Bell with the unread count; opening it lists the latest notices and marks them read. */
export function NotificationBell({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { t } = useTranslation();
    const signedIn = useMainAccountStore((state) => state.status === "signedIn");
    const unread = useCommunityMeStore((state) => state.unread);
    const refresh = useCommunityMeStore((state) => state.refresh);
    const [open, setOpen] = useState(false);
    const [list, setList] = useState<CommunityNotification[] | null>(null);

    useEffect(() => {
        if (!signedIn) return;
        const timer = window.setInterval(() => void refresh(), POLL_MS);
        return () => window.clearInterval(timer);
    }, [refresh, signedIn]);

    useEffect(() => {
        if (!open) return;
        setList(null);
        listNotifications()
            .then((items) => {
                setList(items);
                if (items.some((n) => !n.read)) void markNotificationsRead().then(() => useCommunityMeStore.setState({ unread: 0 }));
            })
            .catch(() => setList([]));
    }, [open]);

    if (!signedIn) return null;

    const text = (n: CommunityNotification) => {
        const actor = n.actor ? authorName(n.actor) : t("community.notifications.someone");
        return t(`community.notifications.kinds.${n.kind}`, { actor, work: n.work_title || t("community.untitled"), detail: n.detail || "" });
    };

    const content = (
        <div className="w-80 max-w-[85vw]" data-testid="notifications">
            {list === null ? (
                <div className="flex justify-center py-6">
                    <Spin size="small" />
                </div>
            ) : list.length ? (
                <div className="grid max-h-[60vh] gap-1 overflow-y-auto">
                    {list.map((n) => (
                        <Link
                            key={n.id}
                            to={n.work_id ? `/w/${n.work_id}${COMMENT_KINDS.has(n.kind) ? "#comments" : ""}` : n.actor ? `/u/${n.actor.handle}` : "/explore"}
                            onClick={() => setOpen(false)}
                            className={`flex items-center gap-2.5 rounded-lg p-2 text-sm !text-inherit hover:bg-stone-100 dark:hover:bg-stone-800 ${n.read ? "" : "bg-violet-50 dark:bg-violet-900/20"}`}
                        >
                            {n.actor ? <AuthorAvatar author={n.actor} size={28} /> : <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs dark:bg-stone-700">HG</span>}
                            <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 leading-5">{text(n)}</span>
                                <span className="text-xs text-stone-500">{new Date(n.created_at).toLocaleString()}</span>
                            </span>
                            {n.work_thumb_url ? <img src={mainSiteAsset(n.work_thumb_url)} alt="" className="size-9 shrink-0 rounded object-cover" /> : null}
                        </Link>
                    ))}
                </div>
            ) : (
                <Empty description={t("community.notifications.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
        </div>
    );

    return (
        <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" content={content} title={t("community.notifications.title")}>
            <button type="button" className={className} style={style} aria-label={t("community.notifications.title")} title={t("community.notifications.title")} data-testid="notification-bell">
                <Badge count={unread} size="small" offset={[2, -2]}>
                    <Bell className="size-4" />
                </Badge>
            </button>
        </Popover>
    );
}
