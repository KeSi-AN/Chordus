"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Toggles the `.dark` class on <html> and remembers the choice. */
export function ThemeToggle() {
  const toggle = () => {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this page.
    }
  };
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle dark mode">
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}
