import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Input, Modal, Popconfirm, Spin, Tag } from "antd";
import { MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { AuthorAvatar } from "@/components/community/author-avatar";
import { relativeTime } from "@/lib/relative-time";
import { ProfileForm } from "@/components/community/profile-form";
import { ReportDialog } from "@/components/community/report-dialog";
import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { addComment, authorName, deleteComment, isSignInRequired, listComments, listReplies, reportComment, type Work, type WorkComment } from "@/services/api/community";
import { useCommunityMeStore } from "@/stores/use-community-me-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";

const MAX_LENGTH = 500;

type Replying = { target: WorkComment; parentId: number };

/** The work page's comments: newest top-level comments first, each with one level of replies. */
export function WorkComments({ work, onTotal }: { work: Work; onTotal?: (total: number) => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const location = useLocation();
    const { signIn } = useMainSiteSignIn();
    const signedIn = useMainAccountStore((state) => state.status === "signedIn");
    const profile = useCommunityMeStore((state) => state.profile);
    const refreshProfile = useCommunityMeStore((state) => state.refresh);
    const [comments, setComments] = useState<WorkComment[]>([]);
    const [total, setTotal] = useState(work.comment_count || 0);
    const [enabled, setEnabled] = useState(true);
    const [closed, setClosed] = useState(Boolean(work.comments_closed));
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [draft, setDraft] = useState("");
    const [posting, setPosting] = useState(false);
    const [replying, setReplying] = useState<Replying | null>(null);
    const [reporting, setReporting] = useState(0);
    const [settingUp, setSettingUp] = useState(false);
    const offsetRef = useRef(0);
    const rootRef = useRef<HTMLDivElement>(null);

    const onTotalRef = useRef(onTotal);
    useEffect(() => {
        onTotalRef.current = onTotal;
    });
    const changeTotal = useCallback((next: number) => {
        setTotal(next);
        onTotalRef.current?.(next);
    }, []);

    const load = useCallback(
        async (reset: boolean) => {
            setLoading(true);
            setError("");
            try {
                const page = await listComments(work.id, reset ? 0 : offsetRef.current);
                offsetRef.current = page.next_offset;
                setEnabled(page.enabled);
                setClosed(page.closed);
                setHasMore(page.has_more);
                changeTotal(page.total);
                const items = page.comments || [];
                setComments((current) => (reset ? items : [...current, ...items.filter((c) => !current.some((x) => x.id === c.id))]));
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setLoading(false);
            }
        },
        [changeTotal, work.id],
    );

    useEffect(() => {
        offsetRef.current = 0;
        setComments([]);
        setReplying(null);
        void load(true);
    }, [load, signedIn]);

    useEffect(() => {
        if (signedIn && profile === undefined) void refreshProfile();
    }, [profile, refreshProfile, signedIn]);

    // Notification links open the page at #comments (once, after the first page loads).
    const jumpedRef = useRef(false);
    useEffect(() => {
        if (location.hash !== "#comments" || loading || jumpedRef.current) return;
        jumpedRef.current = true;
        rootRef.current?.scrollIntoView({ block: "start" });
    }, [loading, location.hash]);

    const needSignIn = (err: unknown) => {
        if (!isSignInRequired(err)) return false;
        message.info(t("community.comments.signIn"));
        signIn();
        return true;
    };

    const post = async (body: string, replyTo?: Replying) => {
        const text = body.trim();
        if (!text) return false;
        setPosting(true);
        try {
            const saved = await addComment(work.id, text, replyTo?.target.id || 0);
            if (saved.status === "pending") message.info(t("community.comments.pendingNotice"));
            if (saved.status === "approved") changeTotal(total + 1);
            if (replyTo) {
                setComments((list) =>
                    list.map((c) =>
                        c.id === replyTo.parentId ? { ...c, replies: [...(c.replies || []), saved], reply_count: c.reply_count + (saved.status === "approved" ? 1 : 0) } : c,
                    ),
                );
            } else {
                setComments((list) => [saved, ...list]);
            }
            return true;
        } catch (err) {
            if (!needSignIn(err)) message.error((err as Error).message);
            return false;
        } finally {
            setPosting(false);
        }
    };

    const remove = async (comment: WorkComment) => {
        try {
            await deleteComment(comment.id);
            if (comment.status === "approved") changeTotal(Math.max(0, total - 1));
            setComments((list) => {
                if (!comment.parent_id) {
                    return list.flatMap((c) => (c.id !== comment.id ? [c] : c.replies?.length ? [{ ...c, status: "removed" as const, body: "", author: undefined, can_delete: false, is_mine: false }] : []));
                }
                return list.map((c) =>
                    c.id === comment.parent_id ? { ...c, replies: (c.replies || []).filter((r) => r.id !== comment.id), reply_count: Math.max(0, c.reply_count - (comment.status === "approved" ? 1 : 0)) } : c,
                );
            });
            message.success(t("community.comments.deleted"));
        } catch (err) {
            message.error((err as Error).message);
        }
    };

    const expand = async (parent: WorkComment) => {
        try {
            const page = await listReplies(parent.id, 0);
            setComments((list) => list.map((c) => (c.id === parent.id ? { ...c, replies: page.replies || [] } : c)));
        } catch (err) {
            message.error((err as Error).message);
        }
    };

    if (!enabled) return null;

    const composer = () => {
        if (closed) return <p className="!m-0 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-500 dark:bg-stone-800">{t("community.comments.closed")}</p>;
        if (!signedIn)
            return (
                <button type="button" onClick={signIn} className="w-full rounded-lg border border-dashed border-stone-300 px-3 py-3 text-left text-sm text-stone-500 hover:border-violet-400 dark:border-stone-700" data-testid="comments-sign-in">
                    {t("community.comments.signIn")}
                </button>
            );
        if (profile === null)
            return (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
                    <span className="text-stone-600 dark:text-stone-300">{t("community.comments.profileFirst")}</span>
                    <Button size="small" type="primary" onClick={() => setSettingUp(true)}>
                        {t("community.comments.setUpProfile")}
                    </Button>
                </div>
            );
        return (
            <div className="grid gap-2">
                <Input.TextArea
                    value={draft}
                    maxLength={MAX_LENGTH}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    placeholder={t("community.comments.placeholder")}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void post(draft).then((ok) => ok && setDraft(""));
                    }}
                    data-testid="comment-input"
                />
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-stone-400">{t("community.comments.rules")}</span>
                    <span className="ml-auto text-xs tabular-nums text-stone-400">
                        {draft.length} / {MAX_LENGTH}
                    </span>
                    <Button type="primary" loading={posting} disabled={!draft.trim()} onClick={() => void post(draft).then((ok) => ok && setDraft(""))} data-testid="comment-submit">
                        {t("community.comments.submit")}
                    </Button>
                </div>
            </div>
        );
    };

    const canReply = signedIn && profile !== null && !closed;

    return (
        <section ref={rootRef} id="comments" className="mx-auto mt-10 max-w-3xl scroll-mt-20" data-testid="work-comments">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <MessageCircle className="size-4" />
                {t("community.comments.title", { count: total })}
            </h2>
            {composer()}
            <div className="mt-4 grid gap-4">
                {comments.map((comment) => (
                    <div key={comment.id} data-testid="comment">
                        <CommentRow
                            comment={comment}
                            canReply={canReply}
                            onReply={() => setReplying({ target: comment, parentId: comment.id })}
                            onDelete={() => void remove(comment)}
                            onReport={() => setReporting(comment.id)}
                        />
                        {comment.replies?.length || (replying && replying.parentId === comment.id) ? (
                            <div className="ml-10 mt-2 grid gap-3 border-l-2 border-stone-100 pl-3 dark:border-stone-800">
                                {(comment.replies || []).map((reply) => (
                                    <CommentRow
                                        key={reply.id}
                                        comment={reply}
                                        small
                                        canReply={canReply}
                                        onReply={() => setReplying({ target: reply, parentId: comment.id })}
                                        onDelete={() => void remove(reply)}
                                        onReport={() => setReporting(reply.id)}
                                    />
                                ))}
                                {comment.reply_count > (comment.replies?.length || 0) ? (
                                    <button type="button" className="w-fit text-xs !text-violet-600 hover:underline dark:!text-violet-300" onClick={() => void expand(comment)} data-testid="comment-expand">
                                        {t("community.comments.moreReplies", { count: comment.reply_count - (comment.replies?.length || 0) })}
                                    </button>
                                ) : null}
                                {replying && replying.parentId === comment.id ? (
                                    <ReplyBox
                                        name={replying.target.author ? authorName(replying.target.author) : ""}
                                        posting={posting}
                                        onCancel={() => setReplying(null)}
                                        onSubmit={(body) => void post(body, replying).then((ok) => ok && setReplying(null))}
                                    />
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
            {loading ? (
                <div className="flex justify-center py-6">
                    <Spin size="small" />
                </div>
            ) : error ? (
                <div className="py-4 text-center text-sm text-stone-500">
                    {error}{" "}
                    <Button size="small" type="link" onClick={() => void load(!comments.length)}>
                        {t("community.retry")}
                    </Button>
                </div>
            ) : hasMore ? (
                <div className="mt-4 flex justify-center">
                    <Button onClick={() => void load(false)}>{t("community.comments.more")}</Button>
                </div>
            ) : !comments.length && !closed ? (
                <p className="!mb-0 py-6 text-center text-sm text-stone-400">{t("community.comments.empty")}</p>
            ) : null}

            {reporting ? <ReportDialog onSubmit={(reason, detail) => reportComment(reporting, reason, detail)} onClose={() => setReporting(0)} /> : null}
            {settingUp ? (
                <Modal open title={t("community.comments.setUpProfile")} footer={null} onCancel={() => setSettingUp(false)} destroyOnHidden>
                    <ProfileForm onSaved={() => setSettingUp(false)} submitLabel={t("common.save")} />
                </Modal>
            ) : null}
        </section>
    );
}

function CommentRow({ comment, small, canReply, onReply, onDelete, onReport }: { comment: WorkComment; small?: boolean; canReply: boolean; onReply: () => void; onDelete: () => void; onReport: () => void }) {
    const { t, i18n } = useTranslation();
    if (comment.status === "removed") {
        return <p className="!m-0 text-sm italic text-stone-400">{t("community.comments.removed")}</p>;
    }
    const author = comment.author;
    return (
        <div className="flex gap-2.5">
            {author ? (
                <Link to={`/u/${author.handle}`} className="shrink-0">
                    <AuthorAvatar author={author} size={small ? 24 : 32} />
                </Link>
            ) : null}
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                    {author ? (
                        <Link to={`/u/${author.handle}`} className="font-medium !text-stone-700 hover:underline dark:!text-stone-200">
                            {authorName(author)}
                        </Link>
                    ) : null}
                    <span>{relativeTime(comment.created_at, i18n.language)}</span>
                    {comment.status === "pending" ? (
                        <Tag color="orange" className="!m-0 !text-[11px]">
                            {t("community.comments.pending")}
                        </Tag>
                    ) : null}
                </div>
                <p className="!m-0 !mt-0.5 whitespace-pre-wrap break-words text-sm leading-6" data-testid="comment-body">
                    {comment.reply_to ? (
                        <span className="text-stone-500">
                            {t("community.comments.replyTo")}{" "}
                            <Link to={`/u/${comment.reply_to.handle}`} className="!text-violet-600 dark:!text-violet-300">
                                @{authorName(comment.reply_to).replace(/^@/, "")}
                            </Link>
                            ：
                        </span>
                    ) : null}
                    {comment.body}
                </p>
                <div className="mt-0.5 flex gap-3 text-xs text-stone-400">
                    {canReply && comment.status === "approved" ? (
                        <button type="button" className="!text-stone-400 hover:!text-violet-600" onClick={onReply} data-testid="comment-reply">
                            {t("community.comments.reply")}
                        </button>
                    ) : null}
                    {comment.can_delete ? (
                        <Popconfirm title={t("community.comments.deleteConfirm")} okText={t("community.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")} onConfirm={onDelete}>
                            <button type="button" className="!text-stone-400 hover:!text-rose-600" data-testid="comment-delete">
                                {t("community.delete")}
                            </button>
                        </Popconfirm>
                    ) : null}
                    {!comment.is_mine && comment.status === "approved" ? (
                        <button type="button" className="!text-stone-400 hover:!text-stone-600 dark:hover:!text-stone-200" onClick={onReport}>
                            {t("community.report.action")}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function ReplyBox({ name, posting, onCancel, onSubmit }: { name: string; posting: boolean; onCancel: () => void; onSubmit: (body: string) => void }) {
    const { t } = useTranslation();
    const [body, setBody] = useState("");
    return (
        <div className="grid gap-2" data-testid="reply-box">
            <Input.TextArea
                autoFocus
                value={body}
                maxLength={MAX_LENGTH}
                autoSize={{ minRows: 1, maxRows: 5 }}
                placeholder={t("community.comments.replyPlaceholder", { name: name.replace(/^@/, "") })}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(body);
                }}
            />
            <div className="flex justify-end gap-2">
                <Button size="small" onClick={onCancel}>
                    {t("common.cancel")}
                </Button>
                <Button size="small" type="primary" loading={posting} disabled={!body.trim()} onClick={() => onSubmit(body)} data-testid="reply-submit">
                    {t("community.comments.reply")}
                </Button>
            </div>
        </div>
    );
}
