export type PageScene = { image: string; position: string; shade?: string };
export type WorkbenchThemeIcon = "moon" | "sun";
export type WorkbenchTheme = "night" | "day";

const DAY_SHADE = "linear-gradient(90deg,rgba(238,243,240,.96) 0%,rgba(238,243,240,.90) 37%,rgba(238,243,240,.64) 62%,rgba(238,243,240,.18) 100%)";
const DAY_SHADE_SOFT = "linear-gradient(90deg,rgba(238,243,240,.91) 0%,rgba(238,243,240,.77) 48%,rgba(238,243,240,.28) 70%,rgba(238,243,240,.08) 100%)";

export const PAGE_SCENES_BY_THEME: Record<WorkbenchTheme, Record<string, PageScene>> = {
  night: {
    "/": { image: "/theme/schedule-studio.v1.avif?rev=1", position: "76% center", shade: "linear-gradient(90deg,rgba(4,10,13,.68) 0%,rgba(4,10,13,.55) 50%,rgba(4,10,13,.18) 69%,rgba(4,10,13,.06) 100%)" },
    "/schedule": { image: "/theme/home-songyu-summer.v1.avif?rev=3", position: "clamp(90px, 12vw, 230px) center" },
    "/projects": { image: "/theme/projects-hanli.v1.avif?rev=3", position: "72% center" },
    "/health": { image: "/theme/health-ziling.v1.avif?rev=3", position: "78% 24%" },
    "/languages": { image: "/theme/languages-nangongwan.v1.avif?rev=3", position: "clamp(90px, 12vw, 230px) center", shade: "linear-gradient(90deg,rgba(4,10,13,.97) 0%,rgba(5,12,15,.9) 34%,rgba(5,12,15,.52) 62%,rgba(4,10,13,.14) 100%)" },
    "/topics": { image: "/theme/topics-hanli-infant.v1.avif?rev=3", position: "72% 28%", shade: "linear-gradient(90deg,rgba(4,10,13,.96) 0%,rgba(5,12,15,.88) 36%,rgba(5,12,15,.48) 64%,rgba(4,10,13,.16) 100%)" },
    "/library": { image: "/theme/library-songyu.v1.avif?rev=3", position: "76% center" },
    "/markets": { image: "/theme/markets-yinyue.v1.avif?rev=3", position: "72% center" },
    "/markets/assets": { image: "/theme/assets-liuyu.v1.avif?rev=3", position: "74% center" },
    "/tools": { image: "/theme/tools-shijie.v1.avif?rev=3", position: "76% center" },
  },
  day: {
    "/": { image: "/theme/schedule-studio-day.v1.avif?rev=1", position: "76% center", shade: DAY_SHADE_SOFT },
    "/schedule": { image: "/theme/home-songyu-summer.v1.avif?rev=3", position: "clamp(90px, 12vw, 230px) center", shade: DAY_SHADE },
    "/projects": { image: "/theme/projects-hanli.v1.avif?rev=3", position: "72% center", shade: DAY_SHADE },
    "/health": { image: "/theme/health-ziling.v1.avif?rev=3", position: "78% 24%", shade: DAY_SHADE },
    "/languages": { image: "/theme/languages-nangongwan-day.v1.avif?rev=1", position: "clamp(90px, 12vw, 230px) center", shade: DAY_SHADE },
    "/topics": { image: "/theme/topics-hanli-infant.v1.avif?rev=3", position: "72% 28%", shade: DAY_SHADE },
    "/library": { image: "/theme/library-songyu.v1.avif?rev=3", position: "76% center", shade: DAY_SHADE_SOFT },
    "/markets": { image: "/theme/markets-yinyue-day.v1.avif?rev=1", position: "72% center", shade: DAY_SHADE },
    "/markets/assets": { image: "/theme/assets-liuyu-day.v1.avif?rev=1", position: "74% center", shade: DAY_SHADE_SOFT },
    "/tools": { image: "/theme/tools-shijie-day.v1.avif?rev=1", position: "76% center", shade: DAY_SHADE },
  },
};

export const WORKBENCH_THEMES = [
  { id: "night", name: "玄夜", fullName: "玄夜仙境 · 玉夜冷青", color: "#060d10", colorScheme: "dark", icon: "moon" },
  { id: "day", name: "晴岚", fullName: "晴岚仙境 · 云白玉青", color: "#eef3f0", colorScheme: "light", icon: "sun" },
] as const;

export function readInitialTheme(): WorkbenchTheme {
  try { return window.localStorage.getItem("infans-workbench-theme") === "day" ? "day" : "night"; }
  catch { return "night"; }
}

export function applyWorkbenchTheme(theme: WorkbenchTheme) {
  const definition = WORKBENCH_THEMES.find((item) => item.id === theme) || WORKBENCH_THEMES[0];
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = definition.colorScheme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", definition.color);
  try { window.localStorage.setItem("infans-workbench-theme", theme); } catch { /* 受限存储时仅当前会话生效。 */ }
}

export function getPageScene(theme: WorkbenchTheme, path: string): PageScene {
  return PAGE_SCENES_BY_THEME[theme][path] || PAGE_SCENES_BY_THEME[theme]["/"];
}
