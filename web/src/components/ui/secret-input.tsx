import { useState, type CSSProperties } from "react";
import { Input, type InputProps } from "antd";
import { Eye, EyeOff } from "lucide-react";

// API keys and connect tokens are not login passwords. A real <input type="password"> makes Chrome (and password
// managers) treat the page as a login form: every in-page navigation then pops "save password?" with whatever
// text box is nearby as the user name. This is a plain text input with the characters masked by CSS instead.

const masked: CSSProperties & { WebkitTextSecurity?: string } = { WebkitTextSecurity: "disc" };

export function SecretInput(props: Omit<InputProps, "type" | "suffix" | "styles">) {
    const [visible, setVisible] = useState(false);
    const Icon = visible ? Eye : EyeOff;
    return (
        <Input
            {...props}
            type="text"
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            // On the inner <input> (style would land on the affix wrapper).
            styles={{ input: visible ? undefined : masked }}
            suffix={
                <button type="button" tabIndex={-1} className="flex cursor-pointer items-center opacity-50 hover:opacity-80" onClick={() => setVisible((v) => !v)} aria-label={visible ? "隐藏" : "显示"}>
                    <Icon className="size-4" />
                </button>
            }
        />
    );
}
