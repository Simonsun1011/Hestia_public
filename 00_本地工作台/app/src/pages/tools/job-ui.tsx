import { LoaderCircle, Play } from "lucide-react";
import { fmtDateTime, jsonFetch } from "../../page-shared";

/** 后台任务的一次运行回执（运行状态/receipts/<job>.json 的一条）。 */
export type JobReceipt = {
  started_at: string;
  finished_at: string;
  trigger?: string;
  scope?: string;
  outcome: "ok" | "partial" | "failed" | "skipped";
  message: string;
  tokens?: { input: number; output: number; cache_read: number; cache_write: number } | null;
};

export const OUTCOME_LABELS: Record<JobReceipt["outcome"], string> = { ok: "成功", partial: "部分成功", failed: "失败", skipped: "跳过" };

export function sendJson<T>(url: string, method: string, body: unknown) {
  return jsonFetch<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function fmtTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return String(value);
}

export function fmtYen(value: number | null | undefined) {
  return value == null ? "—" : `¥${value.toLocaleString("ja-JP")}`;
}

export function ReceiptLine({ receipt }: { receipt: JobReceipt | null }) {
  if (!receipt) return <span className="job-receipt is-empty">还没有运行过</span>;
  return (
    <span className={`job-receipt is-${receipt.outcome}`}>
      <strong>{OUTCOME_LABELS[receipt.outcome]}</strong>
      <time dateTime={receipt.finished_at}>{fmtDateTime(receipt.finished_at)}</time>
      <span>{receipt.message}</span>
    </span>
  );
}

export function RunButton({ running, busy, onClick, label = "立即运行", small = false }: { running: boolean; busy?: boolean; onClick: () => void; label?: string; small?: boolean }) {
  const disabled = running || busy;
  return (
    <button type="button" className={`ghost-button job-run-button${small ? " small" : ""}`} onClick={onClick} disabled={disabled}>
      {disabled ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
      {running ? "运行中" : label}
    </button>
  );
}
