import fs from "node:fs/promises";
import path from "node:path";

import { FIXED_EXPENSES_FILE, RENEWAL_EXPIRY_SOURCE } from "./vault-paths.mjs";

const START = "<!-- INFANS_RENEWAL_EXPIRY_JSON_START -->";
const END = "<!-- INFANS_RENEWAL_EXPIRY_JSON_END -->";

function tokyoDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return null;
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

function daysBetween(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

function parseEmbeddedJson(markdown) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start < 0 || end <= start) throw new Error("续费到期原件缺少数据区");
  const block = markdown.slice(start + START.length, end);
  const fenced = block.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!fenced) throw new Error("续费到期数据区不完整");
  return JSON.parse(fenced[1]);
}

function safeMetadataText(value, fallback = "") {
  return String(value || fallback)
    .replace(/\b\d{8,}\b/g, "已隐藏")
    .replace(/\b(?:PIN|CVV)\b\s*[:：-]?\s*\S+/gi, "已隐藏");
}

function nextMonthlyDate(today, dueDay) {
  const [year, month, day] = today.split("-").map(Number);
  const candidateFor = (y, m) => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(Math.max(1, dueDay), last)).padStart(2, "0")}`;
  };
  let y = year;
  let m = month;
  let candidate = candidateFor(y, m);
  if (day > Number(candidate.slice(-2))) {
    m += 1;
    if (m > 12) { y += 1; m = 1; }
    candidate = candidateFor(y, m);
  }
  return candidate;
}

function modeFromFixedExpense(item) {
  const note = String(item?.note || "");
  return /连续扣款|直接扣|从.+扣|经.+扣/.test(note) ? "automatic" : "manual";
}

function categoryFromFixedExpense(item) {
  if (item?.subgroup === "subscription") return "订阅与服务";
  if (item?.subgroup === "deduction") return "还款与扣费";
  return "生活合同";
}

function groupFor(item) {
  if (!item.date) return "pending";
  if (item.recurring && item.mode === "automatic") return "automatic";
  if (item.daysUntil < 0) return "overdue";
  if (item.daysUntil <= 30) return "within30";
  if (item.daysUntil <= 90) return "within90";
  return "later";
}

function normalizeManagedItem(raw, today) {
  if (!raw?.id || !raw?.name) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || "")) ? raw.date : null;
  const mode = raw.mode === "automatic" ? "automatic" : "manual";
  const daysUntil = date ? daysBetween(today, date) : null;
  const item = {
    id: String(raw.id),
    name: safeMetadataText(raw.name),
    category: safeMetadataText(raw.category, "其他"),
    date,
    mode,
    leadDays: Math.max(0, Number(raw.leadDays) || 0),
    source: safeMetadataText(raw.source, "续费到期原件"),
    note: safeMetadataText(raw.note),
    recurring: false,
    daysUntil,
  };
  return { ...item, group: groupFor(item) };
}

function normalizeFixedExpense(raw, today) {
  const dueDay = Number(raw?.dueDay);
  if (!raw?.id || !raw?.name || raw?.kind !== "monthly" || !Number.isInteger(dueDay)) return null;
  const date = nextMonthlyDate(today, dueDay);
  const mode = modeFromFixedExpense(raw);
  const item = {
    id: `fixed-${raw.id}`,
    name: safeMetadataText(raw.name),
    category: categoryFromFixedExpense(raw),
    date,
    mode,
    leadDays: mode === "automatic" ? 0 : 3,
    source: "生活账单·固定开销（只读派生）",
    note: mode === "automatic" ? `原件记载每月约 ${dueDay} 日扣费。` : `原件记载每月约 ${dueDay} 日处理，自动与否尚无足够证据。`,
    recurring: true,
    daysUntil: daysBetween(today, date),
  };
  return { ...item, group: groupFor(item) };
}

export async function readRenewalExpiry(vaultRoot, options = {}) {
  const today = options.today || tokyoDay();
  const [managedMarkdown, fixedText] = await Promise.all([
    fs.readFile(path.join(vaultRoot, RENEWAL_EXPIRY_SOURCE), "utf8"),
    fs.readFile(path.join(vaultRoot, FIXED_EXPENSES_FILE), "utf8"),
  ]);
  const managed = parseEmbeddedJson(managedMarkdown);
  const fixed = JSON.parse(fixedText);
  const items = [
    ...(Array.isArray(managed.items) ? managed.items.map((item) => normalizeManagedItem(item, today)) : []),
    ...(Array.isArray(fixed.items) ? fixed.items.map((item) => normalizeFixedExpense(item, today)) : []),
  ].filter(Boolean).sort((a, b) => {
    if (a.date == null) return 1;
    if (b.date == null) return -1;
    return a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "zh-CN");
  });
  const counts = items.reduce((acc, item) => {
    acc[item.group] = (acc[item.group] || 0) + 1;
    return acc;
  }, {});
  return {
    observedAt: new Date().toISOString(),
    today,
    updatedAt: String(managed.updatedAt || ""),
    counts,
    items,
    sourcePath: RENEWAL_EXPIRY_SOURCE,
  };
}
