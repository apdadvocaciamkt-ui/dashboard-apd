"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("apd-theme", next);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 text-xs text-brand-muted transition-colors hover:border-brand-accent hover:text-brand-text"
    >
      {theme === "dark" ? "Modo claro" : "Modo escuro"}
    </button>
  );
}
