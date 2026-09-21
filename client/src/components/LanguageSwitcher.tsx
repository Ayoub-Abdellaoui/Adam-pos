import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { languages } from "@/i18n";
import { Globe2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = languages.some(language => language.code === i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";
  return <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 shrink-0 text-[#52745a] dark:text-gray-300" /><Select value={current} onValueChange={language => i18n.changeLanguage(language)}><SelectTrigger aria-label={t("language.label")} className="h-9 w-[118px] border-border bg-card text-xs font-medium text-foreground shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"><SelectValue /></SelectTrigger><SelectContent className="z-[100] border-border bg-popover text-popover-foreground shadow-xl dark:border-gray-600 dark:bg-gray-800 dark:text-white">{languages.map(language => <SelectItem key={language.code} value={language.code}>{language.nativeLabel}</SelectItem>)}</SelectContent></Select></div>;
}
