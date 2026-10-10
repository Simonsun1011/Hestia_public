import type { JapaneseExamKind, LanguageReactorItem } from "../../types";

export type HubSection = "course" | "exploration" | "vocabulary" | "grammar" | "reading" | "collection";
export type ExamScope = {
  kind: JapaneseExamKind;
  level: string;
  track: string;
  label: string;
  mode: string;
  pointIds?: string[];
  passageId?: string;
};

export type JapaneseExamBootstrap = {
  mode: "japaneseExam";
  suggestedScope: { level: string; track: string; label: string };
  examSessionId?: string | null;
  seedAssistant?: string;
  seedUser?: string;
};

export const ALL_LEVELS = ["N5", "N4", "N3", "N2"] as const;
export const DEFAULT_EXAM_HALL_URL = "http://127.0.0.1:3000/";
export const ANKIWEB_DECKS_URL = "https://ankiweb.net/decks";

export const EXAM_MODE_META: Array<{ kind: JapaneseExamKind; label: string; blurb: string }> = [
  { kind: "formal", label: "真题练习", blurb: "独立电子考场" },
  { kind: "special", label: "专项练习", blurb: "就地多选级别" },
  { kind: "mistake", label: "错题练习", blurb: "就地多选级别" },
];

/** 手机经工作台私有域名访问时，改走电子考场的 Tailscale HTTPS 端口。 */
export function reachableExamHallUrl(url: string) {
  try {
    const target = new URL(url, window.location.origin);
    const targetIsLoopback = target.hostname === "127.0.0.1" || target.hostname === "localhost";
    const pageIsLoopback = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
    if (targetIsLoopback && !pageIsLoopback) {
      target.protocol = "https:";
      target.hostname = window.location.hostname;
      target.port = "8444";
    }
    return target.toString();
  } catch {
    return DEFAULT_EXAM_HALL_URL;
  }
}

/** 本机优先唤起 Chrome app 全屏；手机 / Tailscale 直连同一台 Mac。 */
export async function openExamHall(url: string) {
  const reachableUrl = reachableExamHallUrl(url);
  const onLoopback = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  if (onLoopback && window.location.protocol === "http:") {
    try {
      const response = await fetch("/api/tools/launch-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: reachableUrl }),
      });
      if (response.ok) return;
    } catch {
      /* fall through */
    }
  }
  window.open(reachableUrl, "_blank", "noopener,noreferrer");
}

export function mediaOffset(value: number | null) {
  if (value === null) return "";
  const total = Math.max(0, Math.floor(value / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function usableReactorTranslation(item: LanguageReactorItem) {
  const translation = item.translation?.trim() || "";
  if (translation && !/^[（(][^）)]+[）)]\s*$/.test(translation)) return translation;
  if (item.wordTranslations?.length) return item.wordTranslations.join("；");
  return translation || "暂无翻译";
}

export function pct(n: number | undefined) {
  return `${Math.round((Number(n) || 0) * 1000) / 10}%`;
}

export function lvLabel(lv = 0) {
  if (lv >= 3) return "精通";
  if (lv === 2) return "掌握";
  if (lv === 1) return "入门";
  return "门外汉";
}

export function modeLabel(kind: JapaneseExamKind) {
  return EXAM_MODE_META.find((item) => item.kind === kind)?.label || "练习";
}

export function modeSeed(kind: JapaneseExamKind, level: string) {
  if (kind === "formal") {
    return `已打开电子考场真题。交卷后可复制「本次考试分析」回来讲评并记下这场成绩。`;
  }
  if (kind === "special") {
    return `专项练习：在探索成就页多选级别直接开考，或在文法 Tab 的待练清单里跨级选卡。`;
  }
  if (kind === "mistake") {
    return `错题练习：在探索成就页多选级别后开考；未选级别会默认全选。`;
  }
  if (kind === "reading") {
    return `按现在页面，建议做 **${level} 阅读短练**（不计入探索成就）。`;
  }
  return `按现在页面，建议考 **${level}**。`;
}
