/**
 * 后台任务的运行状态：锁、发起占位、按时刻防重、运行回执、模型调用账本、额度暂停、子进程发起。
 *
 * 全部写在 00_本地工作台/运行状态/（gitignore）。这里是运行状态，不是事实数据：
 * 丢了只影响「最近几次运行怎样」的可见性，因此允许脚本丢弃自身历史（回执只留最近 50 条，运行目录只留 7 天）。
 *
 * 防重复提交（手机与 Mac 都能点「立即运行」）：
 * 1. 服务端发起前用 O_EXCL 建「发起占位」，同一范围同时只有一个请求能建成，其余直接告知「正在运行」；
 * 2. 子进程起来后用 O_EXCL 建锁并删掉占位；锁里记 pid，进程不在了或超过时限即视为残留；
 * 3. 定时触发前先记下这个时刻（.last-slot），每个时刻只发起一次，无论成败。
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { openSync, closeSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DIR_WORKBENCH } from "./vault-paths.mjs";

export const RUNTIME_REL = path.posix.join(DIR_WORKBENCH, "运行状态");
/** 锁的最长有效期。任务自己的总时长上限都比它短。 */
export const LOCK_FRESH_MS = 2 * 60 * 60 * 1000;
/** 发起占位的有效期：服务端建好占位到子进程建锁之间。 */
export const PENDING_FRESH_MS = 60 * 1000;
export const RECEIPT_KEEP = 50;
export const RUNS_KEEP_DAYS = 7;
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RUN_JOB_SCRIPT = path.join(APP_DIR, "scripts", "run-job.mjs");

export function runtimeDir(root) {
  return path.join(root, RUNTIME_REL);
}

function assertKey(key) {
  if (!KEY_RE.test(key)) throw new Error(`任务键不合法：${key}`);
}

function jobsDir(root) {
  return path.join(runtimeDir(root), "jobs");
}

export function tokyoIso(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}+09:00`;
}

export function todayTokyo(date = new Date()) {
  return tokyoIso(date).slice(0, 10);
}

export function tokyoHm(date = new Date()) {
  return tokyoIso(date).slice(11, 16);
}

export function addDays(ymd, days) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** 运行目录名：YYYYMMDD-HHmm（东京时间）。 */
export function runTagFor(date = new Date()) {
  const iso = tokyoIso(date);
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

/** 锁仍有效：时限内且持锁进程还在。返回 { pid, startedAt }；无效或不存在返回 null。 */
export async function liveLock(root, key, now = new Date()) {
  assertKey(key);
  const file = path.join(jobsDir(root), `${key}.lock`);
  try {
    const stat = await fs.stat(file);
    const [pid, startedAt] = (await fs.readFile(file, "utf8")).split("\n");
    const n = Number(pid);
    if (now.getTime() - stat.mtimeMs >= LOCK_FRESH_MS || !Number.isInteger(n) || n <= 0 || !pidAlive(n)) return null;
    return { pid: n, startedAt: startedAt?.trim() || null };
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

/** O_EXCL 建锁。已有有效锁返回 false；残留的锁（过期或进程已不在）覆盖。 */
export async function acquireLock(root, key, now = new Date()) {
  assertKey(key);
  const dir = jobsDir(root);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${key}.lock`);
  const body = `${process.pid}\n${tokyoIso(now)}\n`;
  try {
    const handle = await fs.open(file, "wx");
    await handle.writeFile(body);
    await handle.close();
    return true;
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }
  if (await liveLock(root, key, now)) return false;
  await fs.writeFile(file, body);
  return true;
}

export async function releaseLock(root, key) {
  assertKey(key);
  await fs.rm(path.join(jobsDir(root), `${key}.lock`), { force: true });
}

/** 进程意外退出时同步删锁（exit 事件里不能 await）。 */
export function releaseLockSync(root, key) {
  try {
    rmSync(path.join(jobsDir(root), `${key}.lock`), { force: true });
  } catch {
    /* 下次按 pid 判残留 */
  }
}

async function pendingFresh(file, now) {
  try {
    const stat = await fs.stat(file);
    return now.getTime() - stat.mtimeMs < PENDING_FRESH_MS ? stat : null;
  } catch {
    return null;
  }
}

/**
 * 发起占位。成功返回 true；已有新鲜占位返回 false。O_EXCL 保证同时到达的两次请求只有一个成功。
 */
export async function claimPending(root, key, now = new Date()) {
  assertKey(key);
  const dir = jobsDir(root);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${key}.pending`);
  try {
    closeSync(openSync(file, "wx"));
    await fs.writeFile(file, `${tokyoIso(now)}\n`);
    return true;
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }
  if (await pendingFresh(file, now)) return false;
  // 过期占位：先删再抢，仍用 O_EXCL，避免两个请求同时判定过期后都成功
  await fs.rm(file, { force: true });
  try {
    closeSync(openSync(file, "wx"));
    await fs.writeFile(file, `${tokyoIso(now)}\n`);
    return true;
  } catch {
    return false;
  }
}

export async function clearPending(root, key) {
  assertKey(key);
  await fs.rm(path.join(jobsDir(root), `${key}.pending`), { force: true });
}

/** 这个范围是否正在运行（有效的锁，或 60 秒内的发起占位）。 */
export async function runState(root, key, now = new Date()) {
  const lock = await liveLock(root, key, now);
  if (lock) return { running: true, startedAt: lock.startedAt };
  const file = path.join(jobsDir(root), `${key}.pending`);
  if (await pendingFresh(file, now)) {
    const startedAt = (await fs.readFile(file, "utf8").catch(() => "")).trim() || null;
    return { running: true, startedAt };
  }
  return { running: false, startedAt: null };
}

/** 所有正在运行的范围（键 → 开始时刻）。 */
export async function allRunning(root, now = new Date()) {
  let names = [];
  try {
    names = await fs.readdir(jobsDir(root));
  } catch {
    return {};
  }
  const keys = [...new Set(names.map((name) => /^(.+)\.(?:lock|pending)$/.exec(name)?.[1]).filter((key) => key && KEY_RE.test(key)))];
  const out = {};
  for (const key of keys) {
    const state = await runState(root, key, now);
    if (state.running) out[key] = state.startedAt;
  }
  return out;
}

// —— 按时刻防重 ——

export async function readLastSlot(root, job) {
  assertKey(job);
  return (await fs.readFile(path.join(jobsDir(root), `${job}.last-slot`), "utf8").catch(() => "")).trim();
}

export async function writeLastSlot(root, job, slot) {
  assertKey(job);
  await fs.mkdir(jobsDir(root), { recursive: true });
  await fs.writeFile(path.join(jobsDir(root), `${job}.last-slot`), `${slot}\n`);
}

// —— 回执 ——

function receiptFile(root, job) {
  assertKey(job);
  return path.join(runtimeDir(root), "receipts", `${job}.json`);
}

export async function readReceipts(root, job) {
  try {
    const doc = JSON.parse(await fs.readFile(receiptFile(root, job), "utf8"));
    return Array.isArray(doc?.runs) ? doc.runs : [];
  } catch {
    return [];
  }
}

/** 追加一条运行回执。写失败只打一行日志，不改变任务结果。 */
export async function appendReceipt(root, job, run) {
  try {
    const runs = [...(await readReceipts(root, job)), { ...run, message: [...String(run.message || "")].slice(0, 300).join("") }];
    await atomicWriteJson(receiptFile(root, job), { job, runs: runs.slice(-RECEIPT_KEEP) });
  } catch (err) {
    console.error(`回执写入失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

// —— 模型调用账本（Token 统计页读取） ——

/** 记一次模型调用。usage 为空（没跑到模型）不记。 */
export async function recordAiCall(root, entry) {
  if (!entry.usage) return;
  const now = entry.at ?? new Date();
  const month = todayTokyo(now).slice(0, 7);
  const file = path.join(runtimeDir(root), "ai-calls", `${month}.jsonl`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const line = JSON.stringify({ ts: now.toISOString(), job: entry.job, model: entry.model || entry.requested || null, requested: entry.requested || null, ok: Boolean(entry.ok), ...entry.usage });
  await fs.appendFile(file, `${line}\n`, "utf8");
}

// —— 额度暂停 ——

function quotaFile(root) {
  return path.join(runtimeDir(root), "quota-hold.json");
}

/** 疑似额度用尽后，定时任务暂停到 until（东京时间 ISO）。手动运行仍可发起，页面会提示。 */
export async function setQuotaHold(root, job, now = new Date(), hours = 5) {
  const until = tokyoIso(new Date(now.getTime() + hours * 3600_000));
  await atomicWriteJson(quotaFile(root), { job, at: tokyoIso(now), until });
  return until;
}

export async function readQuotaHold(root, now = new Date()) {
  try {
    const doc = JSON.parse(await fs.readFile(quotaFile(root), "utf8"));
    if (typeof doc?.until !== "string" || Date.parse(doc.until) <= now.getTime()) return null;
    return { job: String(doc.job || ""), at: String(doc.at || ""), until: doc.until };
  } catch {
    return null;
  }
}

export async function clearQuotaHold(root) {
  await fs.rm(quotaFile(root), { force: true });
}

// —— 运行目录（排障用的中间文件） ——

export function runDir(root, job, tag) {
  assertKey(job);
  return path.join(runtimeDir(root), "runs", job, tag);
}

export async function pruneRuns(root, job, today) {
  const dir = path.join(runtimeDir(root), "runs", job);
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  const cutoff = addDays(today, -RUNS_KEEP_DAYS).replaceAll("-", "");
  for (const name of names) {
    const match = /^(\d{8})-\d{4}/.exec(name);
    if (match && match[1] < cutoff) await fs.rm(path.join(dir, name), { recursive: true, force: true });
  }
}

// —— 写文件 ——

export async function atomicWriteFile(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    await fs.writeFile(tmp, content, { encoding: "utf8", flag: "wx" });
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

export async function atomicWriteJson(file, value) {
  await atomicWriteFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

// —— 发起子进程 ——

/**
 * 以独立子进程跑一个任务：node scripts/run-job.mjs <args…>。不等待，立即返回。
 * 日志写 运行状态/logs/<job>.log（每次覆盖）。
 */
export async function spawnJob(root, job, args = []) {
  assertKey(job);
  const logDir = path.join(runtimeDir(root), "logs");
  await fs.mkdir(logDir, { recursive: true });
  const fd = openSync(path.join(logDir, `${job}.log`), "w");
  try {
    const child = spawn(process.execPath, [RUN_JOB_SCRIPT, ...args], {
      cwd: APP_DIR,
      env: { ...process.env, INFANS_STUDIO_ROOT: root },
      stdio: ["ignore", fd, fd],
      detached: true,
    });
    child.on("error", (err) => console.error(`任务 ${job} 启动失败：${err.message}`));
    child.unref();
  } finally {
    closeSync(fd);
  }
}
