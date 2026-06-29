import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppTheme, ThemeMode, getTheme } from "./theme";
import { storage } from "@/src/utils/storage";

const STORAGE_KEY = "settings.theme_mode";

interface Ctx {
  mode: ThemeMode;
  theme: AppTheme;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeCtx = createContext<Ctx>({
  mode: "light",
  theme: getTheme("light"),
  toggle: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem<string>(STORAGE_KEY, "light");
      if (stored === "dark" || stored === "light") setModeState(stored);
      setHydrated(true);
    })();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    storage.setItem(STORAGE_KEY, m);
  }, []);

  const toggle = useCallback(() => {
    setModeState((cur) => {
      const next: ThemeMode = cur === "light" ? "dark" : "light";
      storage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, theme: getTheme(mode), toggle, setMode }), [mode, toggle, setMode]);

  if (!hydrated) return null;
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  return useContext(ThemeCtx);
}
