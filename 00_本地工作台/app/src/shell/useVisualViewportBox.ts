import { useEffect, useState, type CSSProperties, type RefObject } from "react";

type ViewportBoxMode = "fullscreen" | "exam-sheet";
type VisualBox = { top: number; left: number; width: number; height: number };

export function useIsNarrowViewport(maxWidth = 900) {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${maxWidth}px)`).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [maxWidth]);
  return narrow;
}

function readVisualBox(): VisualBox {
  const viewport = window.visualViewport;
  return viewport
    ? {
        top: Math.round(viewport.offsetTop),
        left: Math.round(viewport.offsetLeft),
        width: Math.max(1, Math.round(viewport.width)),
        height: Math.max(1, Math.round(viewport.height)),
      }
    : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

function writeCssVars(box: VisualBox, mode: ViewportBoxMode) {
  const root = document.documentElement;
  const height = mode === "exam-sheet"
    ? Math.min(Math.round(box.height * 0.46), 420, Math.max(220, box.height - 24))
    : box.height;
  root.style.setProperty("--ai-vv-top", `${mode === "exam-sheet" ? box.top + box.height - height : box.top}px`);
  root.style.setProperty("--ai-vv-left", `${box.left}px`);
  root.style.setProperty("--ai-vv-width", `${box.width}px`);
  root.style.setProperty("--ai-vv-height", `${height}px`);
}

function clearCssVars() {
  for (const name of ["--ai-vv-top", "--ai-vv-left", "--ai-vv-width", "--ai-vv-height"]) {
    document.documentElement.style.removeProperty(name);
  }
}

export function useVisualViewportBox(
  elementRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  mode: ViewportBoxMode = "fullscreen",
) {
  useEffect(() => {
    if (!enabled) {
      clearCssVars();
      return;
    }
    const sync = () => writeCssVars(readVisualBox(), mode);
    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      clearCssVars();
      void elementRef;
    };
  }, [elementRef, enabled, mode]);
}

export function useVisualViewportBackdropStyle(
  enabled: boolean,
  alignItems: CSSProperties["alignItems"] = "flex-end",
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();
  useEffect(() => {
    if (!enabled) {
      setStyle(undefined);
      return;
    }
    const sync = () => {
      const box = readVisualBox();
      setStyle({ position: "fixed", top: box.top, left: box.left, width: box.width, height: box.height, alignItems });
    };
    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.addEventListener("resize", sync);
    return () => {
      window.visualViewport?.removeEventListener("resize", sync);
      window.removeEventListener("resize", sync);
    };
  }, [enabled, alignItems]);
  return style;
}
