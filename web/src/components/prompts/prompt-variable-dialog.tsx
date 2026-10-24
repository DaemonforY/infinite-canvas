import { useEffect, useMemo, useState } from "react";
import { Input, Modal } from "antd";
import { useTranslation } from "react-i18next";

import { fillPromptVariables, promptVariables } from "@/lib/prompt-variables";
import { usePromptVariableStore } from "@/stores/use-prompt-variable-store";
import { usePromptActions } from "./use-prompt-actions";

/** Fill in the {变量} of a template prompt, then draw with it or copy it. */
export function PromptVariableDialog() {
    const { t } = useTranslation();
    const request = usePromptVariableStore((state) => state.request);
    const close = usePromptVariableStore((state) => state.close);
    const actions = usePromptActions();
    const variables = useMemo(() => (request ? promptVariables(request.item.prompt) : []), [request]);
    const [values, setValues] = useState<Record<string, string>>({});

    useEffect(() => setValues({}), [request]);

    const filled = request ? fillPromptVariables(request.item.prompt, values) : "";
    const confirm = () => {
        if (!request) return;
        close();
        if (request.action === "draw") actions.draw(request.item, filled);
        else actions.copy(request.item, filled);
    };

    return (
        <Modal
            open={Boolean(request)}
            onCancel={close}
            onOk={confirm}
            destroyOnHidden
            width={560}
            title={t("myPrompts.variables.title")}
            okText={request?.action === "copy" ? t("common.copyPrompt") : t("prompts.useToDraw")}
            cancelText={t("common.cancel")}
            okButtonProps={{ "data-testid": "prompt-variables-ok" } as never}
        >
            <div className="space-y-3" data-testid="prompt-variable-dialog">
                <p className="text-xs text-stone-500 dark:text-stone-400">{t("myPrompts.variables.hint")}</p>
                {variables.map((variable, index) => (
                    <label key={variable.name} className="block">
                        <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200">{variable.name}</span>
                        <Input
                            autoFocus={index === 0}
                            value={values[variable.name] || ""}
                            placeholder={variable.defaultValue || t("myPrompts.variables.placeholder", { name: variable.name })}
                            onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))}
                            onPressEnter={confirm}
                        />
                    </label>
                ))}
                <div className="rounded-lg bg-stone-50 p-3 text-xs leading-5 whitespace-pre-wrap text-stone-600 dark:bg-stone-900 dark:text-stone-300" data-testid="prompt-variables-preview">
                    {filled}
                </div>
            </div>
        </Modal>
    );
}
