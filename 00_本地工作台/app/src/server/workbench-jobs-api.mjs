/**
 * 后台任务的定时器与接口：设置、立即运行、价格追踪、Token 统计、宠物、活动攻略。
 *
 * 定时器跟着工作台进程走（pnpm dev 开着才会跑）：每分钟看一次设置，到了时刻且这个时刻还没发起过才发起。
 * 工作台没开、Mac 睡眠错过的时刻，下次开着时补跑最近的一次。第一次启动不补跑（不在朋友刚装好时就花额度）。
 */
import { readJapanActivities } from "./workbench-japan-activities.mjs";
import { readSources } from "./workbench-events-collect.mjs";
import { GUIDE_GLOBAL_KEY, guideKey } from "./workbench-events-guide.mjs";
import {
  allRunning, claimPending, clearQuotaHold, readLastSlot, readQuotaHold, readReceipts, runState, spawnJob, writeLastSlot,
} from "./job-runtime.mjs";
import { claudeBin } from "./ai-runner.mjs";
import { JOB_IDS, JOB_LABELS, dueSlot, nextSlot, readSettings, writeSettings } from "./workbench-settings.mjs";
import { createRegistration, parseScope, readPricesPage, scopeKey, updateRegistration } from "./workbench-prices.mjs";
import { readUsage } from "./workbench-usage.mjs";
import { readPets } from "./workbench-pets.mjs";

const TICK_MS = 60_000;
const SCHEDULER = Symbol.for("infans.jobScheduler");

/** 跑一次定时检查。返回发起了的任务列表（测试用）。 */
export async function schedulerTick(root, now = new Date(), spawn = spawnJob) {
  const { settings } = await readSettings(root);
  if (settings.pausedAll) return [];
  if (await readQuotaHold(root, now)) return [];
  const started = [];
  for (const id of JOB_IDS) {
    const job = settings.jobs[id];
    const slot = dueSlot(now, job);
    if (!slot) continue;
    const last = await readLastSlot(root, id);
    if (!last) {
      // 第一次见到这个任务：记下当前时刻，不补跑
      await writeLastSlot(root, id, slot);
      continue;
    }
    if (last === slot || !job.enabled) continue;
    // 另一个后台任务在跑就等下一分钟，不叠加消耗
    const running = await allRunning(root, now);
    if (Object.keys(running).some((key) => JOB_IDS.some((other) => key === other || key.startsWith(`${other}-`)))) break;
    if (!(await claimPending(root, id, now))) continue;
    await writeLastSlot(root, id, slot);
    await spawn(root, id, [id, "--trigger", "schedule"]);
    started.push(id);
  }
  return started;
}

/** 每个进程只起一个定时器（Vite 重载配置时插件会重新初始化）。 */
export function startScheduler(root) {
  const existing = globalThis[SCHEDULER];
  if (existing) clearInterval(existing);
  const tick = () => schedulerTick(root).catch((err) => console.error(`定时任务检查失败：${err instanceof Error ? err.message : String(err)}`));
  const timer = setInterval(tick, TICK_MS);
  timer.unref();
  globalThis[SCHEDULER] = timer;
  setTimeout(tick, 5_000).unref();
}

/** 设置页的完整数据。 */
export async function readSettingsPage(root, now = new Date()) {
  const { settings, version } = await readSettings(root);
  const { categories, errors } = await readSources(root);
  const jobs = [];
  for (const id of JOB_IDS) {
    const receipts = await readReceipts(root, id);
    jobs.push({
      id, label: JOB_LABELS[id], running: (await runState(root, id, now)).running,
      lastRun: receipts.at(-1) ?? null, nextRun: settings.pausedAll || !settings.jobs[id].enabled ? null : nextSlot(now, settings.jobs[id]),
    });
  }
  return { settings, version, jobs, quotaHold: await readQuotaHold(root, now), categories, sourceErrors: errors, claudeFound: Boolean(claudeBin()) };
}

/**
 * 保存设置。改了时刻之后，把「已发起过的时刻」对齐到新设置下最近一个已到的时刻，
 * 新时刻只影响以后，不会因为改了时间就立刻补跑一次。
 */
export async function saveSettings(root, body, now = new Date()) {
  const result = await writeSettings(root, body?.settings, body?.version ?? null);
  if (!result.ok) return result;
  for (const id of JOB_IDS) {
    const slot = dueSlot(now, result.settings.jobs[id]);
    if (slot) await writeLastSlot(root, id, slot);
  }
  return { ok: true, page: await readSettingsPage(root, now) };
}

/**
 * 立即运行。防重：同一范围已在运行或刚发起，直接告知；O_EXCL 的发起占位保证并发请求只有一个成功。
 * @returns {{ status: number, body: object }}
 */
export async function runNow(root, body, now = new Date(), spawn = spawnJob) {
  const job = body?.job;
  if (!JOB_IDS.includes(job)) return { status: 400, body: { error: "没有这个任务" } };
  let key = job;
  const args = [job, "--trigger", "manual"];
  if (job === "prices" && body.scope) {
    const scope = parseScope(body.scope);
    if (!scope) return { status: 400, body: { error: "范围不合法" } };
    if ((await runState(root, "prices", now)).running) return { status: 409, body: { error: "定时采集正在执行，这一份已包含在内" } };
    key = scopeKey(scope);
    args.push("--scope", body.scope);
  }
  if ((await runState(root, key, now)).running) return { status: 409, body: { error: "已经在运行了" } };
  if (!(await claimPending(root, key, now))) return { status: 409, body: { error: "已经在运行了" } };
  await spawn(root, job, args);
  const hold = await readQuotaHold(root, now);
  return { status: 202, body: { ok: true, message: hold ? "已发起；额度可能还没恢复，可能会失败" : "已发起" } };
}

/** 生成攻略（点了才做）。活动必须在当前清单里。 */
export async function startGuide(root, body, now = new Date(), spawn = spawnJob) {
  const id = String(body?.activityId || "").trim();
  if (!id) return { status: 400, body: { error: "没有指定活动" } };
  const snapshot = await readJapanActivities(root);
  const activity = snapshot.activities.find((item) => item.id === id);
  if (!activity) return { status: 404, body: { error: "找不到这个活动" } };
  if (!claudeBin()) return { status: 400, body: { error: "找不到 Claude Code CLI，先安装并登录 claude" } };
  const key = guideKey(id);
  if ((await runState(root, key, now)).running) return { status: 409, body: { error: "这份攻略正在生成" } };
  if ((await runState(root, GUIDE_GLOBAL_KEY, now)).running) return { status: 409, body: { error: "另一份攻略正在生成，稍后再点" } };
  if (!(await claimPending(root, key, now))) return { status: 409, body: { error: "这份攻略正在生成" } };
  await spawn(root, "guide", ["guide", "--id", id]);
  return { status: 202, body: { ok: true } };
}

async function readBody(request, limit = 64 * 1024) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > limit) throw Object.assign(new Error("请求内容过大"), { statusCode: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("请求不是合法 JSON"), { statusCode: 400 });
  }
}

/**
 * 处理新增的接口。不是这里的路径返回 false，交回原插件继续处理。
 * @param {{ url: URL, request: import("node:http").IncomingMessage, root: string, json: (body: unknown, status?: number) => void }} ctx
 */
export async function handleJobsApi({ url, request, root, json }) {
  const p = url.pathname;
  const method = request.method || "GET";
  const send = (result) => { json(result.body, result.status); return true; };
  if (p === "/api/tools/settings") {
    if (method === "GET") { json(await readSettingsPage(root)); return true; }
    if (method === "PUT") {
      const result = await saveSettings(root, await readBody(request));
      return send(result.ok ? { status: 200, body: result.page } : { status: result.status, body: { error: result.error } });
    }
  }
  if (p === "/api/tools/jobs/run" && method === "POST") return send(await runNow(root, await readBody(request)));
  if (p === "/api/tools/quota-hold" && method === "DELETE") { await clearQuotaHold(root); json({ ok: true }); return true; }
  if (p === "/api/tools/japan-activities/guide" && method === "POST") return send(await startGuide(root, await readBody(request)));
  if (p === "/api/tools/usage" && method === "GET") { json(await readUsage(root)); return true; }
  if (p === "/api/pets" && method === "GET") { json(await readPets(root)); return true; }
  if (p === "/api/tools/prices" && method === "GET") { json(await readPricesPage(root)); return true; }
  const create = /^\/api\/tools\/prices\/(items|searches)$/.exec(p);
  if (create && method === "POST") {
    const result = await createRegistration(root, create[1], await readBody(request));
    return send(result.ok ? { status: 201, body: { ok: true, slug: result.slug } } : { status: result.status, body: { error: result.error } });
  }
  const update = /^\/api\/tools\/prices\/(items|searches)\/([a-z0-9-]+)$/.exec(p);
  if (update && method === "PATCH") {
    const body = await readBody(request);
    const result = await updateRegistration(root, update[1], update[2], body, body?.version);
    return send(result.ok ? { status: 200, body: { ok: true } } : { status: result.status, body: { error: result.error } });
  }
  return false;
}
