/**
 * 任务设置：每个后台任务开不开、什么时候跑、用哪个模型、活动采集勾选哪些类别与入选标准。
 *
 * 存在 00_本地工作台/设置/任务设置.json，由「实用工具 · 设置」写入。这是配置工具的文件，
 * 直接改、不留修改记录。写入走版本令牌（文件 mtime）：两台设备同时改，后到的一方被拒、提示刷新；
 * 写后回读校验，不一致即恢复写前内容。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { isModelChoice } from "./ai-runner.mjs";
import { addDays, atomicWriteFile, todayTokyo, tokyoHm } from "./job-runtime.mjs";
import { DIR_WORKBENCH } from "./vault-paths.mjs";

export const SETTINGS_REL = path.posix.join(DIR_WORKBENCH, "设置", "任务设置.json");

export const JOB_IDS = Object.freeze(["prices", "events"]);
export const JOB_LABELS = Object.freeze({ prices: "价格追踪", events: "东京活动" });
export const WEEKDAYS = Object.freeze(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
export const STANDARD_MAX = 400;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const KEY_RE = /^[a-z0-9-]+$/;

export const DEFAULT_SETTINGS = Object.freeze({
  pausedAll: false,
  /** extract：摘录、搜索词、同款判定这类低级任务；judge：买不买的建议、出门攻略。 */
  models: { extract: "haiku", judge: "sonnet" },
  jobs: {
    prices: { enabled: true, mode: "daily", weekday: "mon", times: ["09:00"] },
    events: { enabled: true, mode: "weekly", weekday: "mon", times: ["07:00"] },
  },
  events: { categories: null, standards: {} },
});

function normalizeTimes(raw) {
  if (!Array.isArray(raw)) return null;
  const times = raw.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (times.length < 1 || times.length > 4 || times.some((item) => !TIME_RE.test(item))) return null;
  const uniq = [...new Set(times)].sort();
  return uniq.length === times.length ? uniq : null;
}

function normalizeJob(raw, fallback) {
  const job = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: typeof job.enabled === "boolean" ? job.enabled : fallback.enabled,
    mode: job.mode === "daily" || job.mode === "weekly" ? job.mode : fallback.mode,
    weekday: WEEKDAYS.includes(job.weekday) ? job.weekday : fallback.weekday,
    times: normalizeTimes(job.times) ?? [...fallback.times],
  };
}

/** 文件内容 → 完整设置。缺的项用默认值补齐，非法的项回到默认值。 */
export function normalizeSettings(raw) {
  const doc = raw && typeof raw === "object" ? raw : {};
  const models = doc.models && typeof doc.models === "object" ? doc.models : {};
  const events = doc.events && typeof doc.events === "object" ? doc.events : {};
  const standards = {};
  for (const [key, text] of Object.entries(events.standards && typeof events.standards === "object" ? events.standards : {})) {
    if (KEY_RE.test(key) && typeof text === "string" && text.trim()) standards[key] = [...text.trim()].slice(0, STANDARD_MAX).join("");
  }
  return {
    pausedAll: doc.pausedAll === true,
    models: {
      extract: isModelChoice(models.extract) ? models.extract : DEFAULT_SETTINGS.models.extract,
      judge: isModelChoice(models.judge) ? models.judge : DEFAULT_SETTINGS.models.judge,
    },
    jobs: Object.fromEntries(JOB_IDS.map((id) => [id, normalizeJob(doc.jobs?.[id], DEFAULT_SETTINGS.jobs[id])])),
    events: {
      categories: Array.isArray(events.categories) ? [...new Set(events.categories.filter((key) => typeof key === "string" && KEY_RE.test(key)))] : null,
      standards,
    },
  };
}

export async function readSettings(root) {
  const file = path.join(root, SETTINGS_REL);
  let version = null;
  let raw = {};
  try {
    const text = await fs.readFile(file, "utf8");
    version = (await fs.stat(file)).mtimeMs;
    raw = JSON.parse(text);
  } catch {
    raw = {};
  }
  return { settings: normalizeSettings(raw), version };
}

/**
 * 校验一份完整的新设置（页面整体提交）。返回错误文案数组。
 * 与 normalizeSettings 不同：这里非法即拒，不悄悄回到默认值。
 */
export function validateSettingsInput(input) {
  const errors = [];
  if (!input || typeof input !== "object") return ["设置不是对象"];
  if (typeof input.pausedAll !== "boolean") errors.push("pausedAll 须为 true/false");
  if (!isModelChoice(input.models?.extract)) errors.push("摘录模型只能选 haiku 或 sonnet");
  if (!isModelChoice(input.models?.judge)) errors.push("判断模型只能选 haiku 或 sonnet");
  for (const id of JOB_IDS) {
    const job = input.jobs?.[id];
    if (!job || typeof job !== "object") { errors.push(`缺少 ${JOB_LABELS[id]} 的设置`); continue; }
    if (typeof job.enabled !== "boolean") errors.push(`${JOB_LABELS[id]}：enabled 须为 true/false`);
    if (job.mode !== "daily" && job.mode !== "weekly") errors.push(`${JOB_LABELS[id]}：频率只能是每天或每周`);
    if (!WEEKDAYS.includes(job.weekday)) errors.push(`${JOB_LABELS[id]}：星期不合法`);
    if (!normalizeTimes(job.times)) errors.push(`${JOB_LABELS[id]}：时刻须为 1–4 个不重复的 HH:mm`);
  }
  const events = input.events ?? {};
  if (events.categories !== null && !Array.isArray(events.categories)) errors.push("活动类别须为数组");
  for (const [key, text] of Object.entries(events.standards ?? {})) {
    if (!KEY_RE.test(key)) errors.push(`类别键不合法：${key}`);
    if (typeof text !== "string" || [...text.trim()].length > STANDARD_MAX) errors.push(`入选标准不超过 ${STANDARD_MAX} 字`);
  }
  return errors;
}

/** 整体写入。version 须与当前文件一致（文件不存在时为 null）。 */
export async function writeSettings(root, input, version) {
  const errors = validateSettingsInput(input);
  if (errors.length) return { ok: false, status: 400, error: errors[0] };
  const file = path.join(root, SETTINGS_REL);
  const current = await readSettings(root);
  if ((version ?? null) !== current.version) return { ok: false, status: 409, error: "设置已在别处修改，请刷新后再改" };
  const next = normalizeSettings(input);
  const before = await fs.readFile(file, "utf8").catch(() => null);
  await atomicWriteFile(file, `${JSON.stringify(next, null, 2)}\n`);
  const check = await readSettings(root);
  if (JSON.stringify(check.settings) !== JSON.stringify(next)) {
    if (before == null) await fs.rm(file, { force: true });
    else await atomicWriteFile(file, before);
    return { ok: false, status: 500, error: "写后校验不一致，已恢复原内容" };
  }
  return { ok: true, settings: check.settings, version: check.version };
}

/**
 * 最近一个已到的运行时刻，写成「YYYY-MM-DD HH:mm」（东京时间）；还没有到过的返回 null。
 * 每天：今天已过的最后一个时刻。每周：往回找最近的那个星期几（今天是那天但时刻未到，取上周那天的最后一个时刻）。
 * Mac 睡眠或工作台没开错过的时刻，醒来后补跑最近的一次。
 */
export function dueSlot(now, job) {
  const today = todayTokyo(now);
  const hm = tokyoHm(now);
  const past = job.times.filter((time) => time <= hm);
  const todaySlot = past.length ? past[past.length - 1] : null;
  if (job.mode === "daily") return todaySlot ? `${today} ${todaySlot}` : null;
  const target = WEEKDAYS.indexOf(job.weekday);
  for (let back = 0; back <= 7; back++) {
    const day = addDays(today, -back);
    if (new Date(`${day}T00:00:00Z`).getUTCDay() !== target) continue;
    if (back === 0) {
      if (todaySlot) return `${day} ${todaySlot}`;
      continue;
    }
    return `${day} ${job.times[job.times.length - 1]}`;
  }
  return null;
}

/** 下一个运行时刻「YYYY-MM-DD HH:mm」，用于页面显示。 */
export function nextSlot(now, job) {
  const today = todayTokyo(now);
  const hm = tokyoHm(now);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = addDays(today, ahead);
    if (job.mode === "weekly" && new Date(`${day}T00:00:00Z`).getUTCDay() !== WEEKDAYS.indexOf(job.weekday)) continue;
    const time = job.times.find((item) => ahead > 0 || item > hm);
    if (time) return `${day} ${time}`;
  }
  return null;
}
