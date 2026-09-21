import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function I18nDocument({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  useEffect(() => {
    const language = (i18n.resolvedLanguage ?? i18n.language ?? "en").split("-")[0];
    const direction = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.documentElement.dataset.locale = language;
  }, [i18n, i18n.language, i18n.resolvedLanguage]);
  return <>{children}</>;
}

