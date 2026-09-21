import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const nextTheme = theme === "dark" ? t("theme.light") : t("theme.dark");
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-9 w-9 border-slate-200 bg-white text-slate-600 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      aria-label={`${t("theme.toggle")} — ${nextTheme}`}
      title={`${t("theme.toggle")} — ${nextTheme}`}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
