export const WORKBENCH_REFRESH_FEEDBACK_SUFFIX = "已经刷新啦～";

export function workbenchRefreshFeedbackText(secretaryName: string): string {
  const name = secretaryName.trim() || "小秘书";
  return `${name}${WORKBENCH_REFRESH_FEEDBACK_SUFFIX}`;
}
