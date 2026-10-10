import type { ProductFeature, ProductFeatureModule, ProductFeaturePoint } from "./types";

export const DISPLAY_MODE_STORAGE_KEY = "infans-display-mode-v1";

const DISPLAY_MODE_HIDDEN_FEATURE_IDS = new Set(["global-identity", "assistant-private"]);
const DISPLAY_MODE_SENSITIVE_PROJECT_TEXT = /隐私|凭据|账号|银行卡|即时通讯/u;

export function readDisplayMode(storage: Pick<Storage, "getItem"> = window.localStorage) {
  try {
    return storage.getItem(DISPLAY_MODE_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeDisplayMode(enabled: boolean, storage: Pick<Storage, "setItem"> = window.localStorage) {
  try {
    storage.setItem(DISPLAY_MODE_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // 浏览器禁用本地存储时，本次打开期间仍由 React 状态保持。
  }
}

/** 清洁版不提供视频库，兼容调用一律视为不可展示。 */
export function isDisplayModeHiddenVideoPath(_value: string) {
  return true;
}

/**
 * 收藏可能在原文件移动后只剩旧路径。展示模式无法确认这类条目的当前位置，
 * 因此按隐私优先隐藏，避免旧标题继续出现在收藏列表。
 */
export function isDisplayModeHiddenVideoEntry(entry: { path?: string; folder?: string; available?: boolean }) {
  if (entry.available === false) return true;
  return [entry.path, entry.folder]
    .filter((value): value is string => typeof value === "string")
    .some(isDisplayModeHiddenVideoPath);
}

/** 清洁版不附带聊天数据；兼容调用始终隐藏。 */
export function isDisplayModeHiddenSecretaryChat(_chat: {
  private?: boolean;
  privacy?: string;
  privacyClass?: string;
  indexPolicy?: string;
}) {
  return true;
}

/** 艺术馆藏保留“我的写作”标签，但展示模式不进入文章列表或全文。 */
export function isDisplayModeHiddenLibraryKind(value: string) {
  return value === "writing";
}

export function isDisplayModeSensitiveProjectText(value: string) {
  return DISPLAY_MODE_SENSITIVE_PROJECT_TEXT.test(String(value || ""));
}

export function isDisplayModeHiddenProductFeature(feature: ProductFeature) {
  return DISPLAY_MODE_HIDDEN_FEATURE_IDS.has(feature.id);
}

function filterDisplayModeFeaturePoint(point: ProductFeaturePoint): ProductFeaturePoint | null {
  if (point.hiddenInDisplayMode) return null;
  const originalChildren = point.children || [];
  const children = originalChildren.flatMap((child) => {
    const filtered = filterDisplayModeFeaturePoint(child);
    return filtered ? [filtered] : [];
  });
  if (originalChildren.length && !children.length) return null;
  return children.length ? { ...point, children } : { text: point.text, hiddenInDisplayMode: false };
}

/** AI 协作项目看板的展示版能力树；不修改服务端原始数据。 */
export function filterDisplayModeProductModules(modules: ProductFeatureModule[]) {
  return modules.flatMap((module) => {
    const features = module.features
      .filter((feature) => !isDisplayModeHiddenProductFeature(feature))
      .map((feature) => ({
        ...feature,
        points: (feature.points || []).flatMap((point) => {
          const filtered = filterDisplayModeFeaturePoint(point);
          return filtered ? [filtered] : [];
        }),
      }));
    return features.length ? [{ ...module, features }] : [];
  });
}

export function isDisplayModeHiddenProjectTask(task: { featureId?: string | null; featureIds?: string[]; displayText?: string; text?: string }) {
  const featureIds = task.featureIds?.length ? task.featureIds : task.featureId ? [task.featureId] : [];
  return featureIds.some((featureId) => DISPLAY_MODE_HIDDEN_FEATURE_IDS.has(featureId))
    || isDisplayModeSensitiveProjectText(`${task.displayText || ""} ${task.text || ""}`);
}
