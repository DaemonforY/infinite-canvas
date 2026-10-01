import { useEffect, useState } from "react";
import { App, Button, Input, Upload } from "antd";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AuthorAvatar } from "@/components/community/author-avatar";
import { HANDLE_PATTERN, saveProfile, type CommunityProfile } from "@/services/api/community";
import { useCommunityMeStore } from "@/stores/use-community-me-store";

/** Create or edit the viewer's public profile (用户名、昵称、简介、头像). */
export function ProfileForm({ profile, suggestedName, onSaved, submitLabel }: { profile?: CommunityProfile | null; suggestedName?: string; onSaved: (profile: CommunityProfile) => void; submitLabel?: string }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const setProfile = useCommunityMeStore((state) => state.setProfile);
    const [handle, setHandle] = useState(profile?.handle || "");
    const [displayName, setDisplayName] = useState(profile?.display_name || suggestedName || "");
    const [bio, setBio] = useState(profile?.bio || "");
    const [avatar, setAvatar] = useState<File | null>(null);
    const [preview, setPreview] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!avatar) return setPreview("");
        const url = URL.createObjectURL(avatar);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [avatar]);

    const handleOk = HANDLE_PATTERN.test(handle) && !handle.includes("__");

    const save = async () => {
        if (!handleOk) return;
        setSaving(true);
        try {
            const saved = await saveProfile({ handle, display_name: displayName, bio, avatar });
            setProfile(saved);
            onSaved(saved);
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid gap-3" data-testid="profile-form">
            <div className="flex items-center gap-3">
                <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={(file) => (setAvatar(file), false)}>
                    <button type="button" className="relative" aria-label={t("community.profile.avatar")}>
                        {preview ? (
                            <img src={preview} alt="" className="size-14 rounded-full object-cover" />
                        ) : (
                            <AuthorAvatar author={profile ? { ...profile, display_name: displayName || profile.display_name } : { avatar_url: "", display_name: displayName, handle }} size={56} />
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
                            <Camera className="size-3" />
                        </span>
                    </button>
                </Upload>
                <div className="text-xs leading-5 text-stone-500">{t("community.profile.avatarHint")}</div>
            </div>
            <label className="grid gap-1 text-sm">
                <span className="font-medium">{t("community.profile.handle")}</span>
                <Input addonBefore="@" value={handle} maxLength={20} placeholder="xiaolin" status={handle && !handleOk ? "error" : undefined} onChange={(e) => setHandle(e.target.value.trim().toLowerCase())} data-testid="profile-handle" />
                <span className={`text-xs ${handle && !handleOk ? "text-red-500" : "text-stone-500"}`}>{t("community.profile.handleRule")}</span>
            </label>
            <label className="grid gap-1 text-sm">
                <span className="font-medium">{t("community.profile.displayName")}</span>
                <Input value={displayName} maxLength={20} onChange={(e) => setDisplayName(e.target.value)} data-testid="profile-display-name" />
            </label>
            <label className="grid gap-1 text-sm">
                <span className="font-medium">{t("community.profile.bio")}</span>
                <Input.TextArea value={bio} maxLength={200} autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("community.profile.bioPlaceholder")} onChange={(e) => setBio(e.target.value)} />
            </label>
            <Button type="primary" loading={saving} disabled={!handleOk} onClick={() => void save()} data-testid="profile-save">
                {submitLabel || t("common.save")}
            </Button>
        </div>
    );
}
