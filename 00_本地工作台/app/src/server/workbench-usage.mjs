/**
 * Token 统计（实用工具 · Token 统计）：只算 Claude。
 *
 * 两个来源，都只读：
 * 1. Claude Code 本机会话日志 ~/.claude/projects/<项目>/<会话>.jsonl：assistant 行的 message.usage。
 *    同一条消息常被拆成多行、每行带同样的 usage，按 message.id 只计一次（各项取最大值）。
 * 2. 工作台后台任务（价格追踪、活动采集、攻略）的调用账本：运行状态/ai-calls/*.jsonl。
 *    后台任务不留会话，所以不会和第 1 项重复。
 *
 * 不折算金额（订阅制按额度算，不按金额）。给出最近 5 小时与 7 天的用量，方便看会不会碰到订阅的用量上限。
 * 结果按文件 mtime 缓存在内存里，没变的日志不重读。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runtimeDir, todayTokyo, addDays } from "./job-runtime.mjs";

const WINDOW_DAYS = 30;
const KINDS = ["input", "output", "cache_read", "cache_write"];
const JOB_LABELS = { prices: "价格追踪", events: "东京活动", guide: "活动攻略" };

export function claudeProjectsRoot(env = process.env, home = os.homedir()) {
  return String(env.INFANS_CLAUDE_PROJECTS || "").trim() || path.join(home, ".claude", "projects");
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** 一份会话日志 → { cwd, messages: Map<id, {ts, model, input, output, cache_read, cache_write}> }。坏行跳过。 */
export function parseClaudeSession(text) {
  const messages = new Map();
  let cwd = null;
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!cwd && typeof row.cwd === "string") cwd = row.cwd;
    if (row.type !== "assistant") continue;
    const msg = row.message;
    const usage = msg?.usage;
    const id = typeof msg?.id === "string" ? msg.id : null;
    if (!id || !usage || typeof usage !== "object") continue;
    const next = {
      ts: typeof row.timestamp === "string" ? row.timestamp : "",
      model: typeof msg.model === "string" ? msg.model : null,
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cache_read: num(usage.cache_read_input_tokens),
      cache_write: num(usage.cache_creation_input_tokens),
    };
    const prev = messages.get(id);
    if (!prev) messages.set(id, next);
    else for (const kind of KINDS) prev[kind] = Math.max(prev[kind], next[kind]);
  }
  return { cwd, messages };
}

async function walkJsonl(dir, cutoffMs) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkJsonl(full, cutoffMs)));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat && stat.mtimeMs >= cutoffMs) out.push({ file: full, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return out;
}

const cache = new Map();

async function claudeMessages(projectsRoot, cutoffMs) {
  const files = await walkJsonl(projectsRoot, cutoffMs);
  const seen = new Set(files.map((item) => item.file));
  for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);
  const all = new Map();
  for (const item of files) {
    let entry = cache.get(item.file);
    if (!entry || entry.size !== item.size || entry.mtimeMs !== item.mtimeMs) {
      const text = await fs.readFile(item.file, "utf8").catch(() => "");
      entry = { size: item.size, mtimeMs: item.mtimeMs, ...parseClaudeSession(text) };
      cache.set(item.file, entry);
    }
    for (const [id, message] of entry.messages) {
      // 续接的会话会把旧消息带进新文件：全局按 message.id 去重
      const prev = all.get(id);
      if (!prev) all.set(id, { ...message, cwd: entry.cwd });
      else for (const kind of KINDS) prev[kind] = Math.max(prev[kind], message[kind]);
    }
  }
  return [...all.values()];
}

async function jobCalls(root, months) {
  const out = [];
  for (const month of months) {
    const text = await fs.readFile(path.join(runtimeDir(root), "ai-calls", `${month}.jsonl`), "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        out.push({ ts: String(row.ts || ""), model: row.model || row.requested || null, job: String(row.job || ""), input: num(row.input), output: num(row.output), cache_read: num(row.cache_read), cache_write: num(row.cache_write) });
      } catch {
        /* 坏行跳过 */
      }
    }
  }
  return out;
}

function empty() {
  return { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0, messages: 0 };
}

function add(bucket, row) {
  for (const kind of KINDS) bucket[kind] += row[kind];
  bucket.total += row.input + row.output + row.cache_read + row.cache_write;
  bucket.messages += 1;
}

/** 模型 id → 简短的家族名（claude-haiku-4-5-20251001 → Haiku）。 */
export function modelFamily(model) {
  const text = String(model || "").toLowerCase();
  for (const family of ["fable", "opus", "sonnet", "haiku"]) if (text.includes(family)) return family[0].toUpperCase() + family.slice(1);
  return model ? String(model) : "未知";
}

function projectLabel(cwd, root) {
  if (!cwd) return "未知";
  if (path.resolve(cwd).startsWith(path.resolve(root))) return "Infans 工作台";
  return path.basename(cwd) || cwd;
}

export async function readUsage(root, now = new Date(), opts = {}) {
  const projectsRoot = opts.projectsRoot ?? claudeProjectsRoot();
  const today = todayTokyo(now);
  const startDay = addDays(today, -(WINDOW_DAYS - 1));
  const cutoffMs = Date.parse(`${startDay}T00:00:00+09:00`);
  const rootExists = await fs.stat(projectsRoot).then(() => true, () => false);
  const sessions = rootExists ? await claudeMessages(projectsRoot, cutoffMs - 86400000) : [];
  const months = [...new Set([startDay.slice(0, 7), today.slice(0, 7)])];
  const jobs = await jobCalls(root, months);
  const rows = [
    ...sessions.map((row) => ({ ...row, project: projectLabel(row.cwd, root), job: null })),
    ...jobs.map((row) => ({ ...row, project: "Infans 后台任务", job: row.job })),
  ].filter((row) => {
    const ms = Date.parse(row.ts);
    return Number.isFinite(ms) && ms >= cutoffMs && ms <= now.getTime() + 60_000;
  });

  const daily = new Map();
  for (let i = 0; i < WINDOW_DAYS; i++) daily.set(addDays(startDay, i), empty());
  const windows = { last5h: empty(), today: empty(), last7d: empty(), last30d: empty() };
  const byModel = new Map();
  const byProject = new Map();
  const byJob = new Map();
  const nowMs = now.getTime();
  for (const row of rows) {
    const ms = Date.parse(row.ts);
    const day = todayTokyo(new Date(ms));
    if (daily.has(day)) add(daily.get(day), row);
    add(windows.last30d, row);
    if (nowMs - ms <= 7 * 86400000) add(windows.last7d, row);
    if (nowMs - ms <= 5 * 3600000) add(windows.last5h, row);
    if (day === today) add(windows.today, row);
    const family = modelFamily(row.model);
    if (!byModel.has(family)) byModel.set(family, empty());
    add(byModel.get(family), row);
    if (!byProject.has(row.project)) byProject.set(row.project, empty());
    add(byProject.get(row.project), row);
    if (row.job) {
      const label = JOB_LABELS[row.job] || row.job;
      if (!byJob.has(label)) byJob.set(label, empty());
      add(byJob.get(label), row);
    }
  }
  const sorted = (map, key) => [...map].map(([name, bucket]) => ({ [key]: name, ...bucket })).filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
  return {
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    sourceFound: rootExists,
    windows,
    daily: [...daily].map(([date, bucket]) => ({ date, ...bucket })),
    byModel: sorted(byModel, "model"),
    byProject: sorted(byProject, "project").slice(0, 12),
    byJob: sorted(byJob, "job"),
  };
}
