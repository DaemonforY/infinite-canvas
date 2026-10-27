import { useEffect, useState } from "react";

const PHONE_QUERY = "(max-width: 639px)";

/** True below Tailwind's `sm` breakpoint, where layouts switch to their phone version. */
export function useIsPhone() {
    const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches);
    useEffect(() => {
        const query = window.matchMedia(PHONE_QUERY);
        const update = () => setPhone(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    return phone;
}
