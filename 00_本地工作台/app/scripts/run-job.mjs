#!/usr/bin/env node
/**
 * 后台任务的唯一执行入口。工作台的定时器与「立即运行」都以独立子进程调用它，也可以在终端手动跑：
 *
 *   node scripts/run-job.mjs prices [--scope items/<slug>] [--trigger manual|schedule]
 *   node scripts/run-job.mjs events [--trigger manual|schedule]
 *   node scripts/run-job.mjs guide --id <活动 id>
 *
 * 每个任务有总时长上限，超时即终止整个进程（连同模型子进程），回执记为失败，锁随进程退出释放。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { killAllGroups } from "../src/server/ai-runner.mjs";
import { appendReceipt, clearPending, tokyoIso } from "../src/server/job-runtime.mjs";
import { readJapanActivities } from "../src/server/workbench-japan-activities.mjs";
import { runEvents, RUN_BUDGET_MS as EVENTS_BUDGET } from "../src/server/workbench-events-collect.mjs";
import { guideKey, runGuide } from "../src/server/workbench-events-guide.mjs";
import { parseScope, runPrices, RUN_BUDGET_MS as PRICES_BUDGET, scopeKey } from "../src/server/workbench-prices.mjs";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(process.env.INFANS_STUDIO_ROOT || path.join(APP_DIR, "../.."));

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] ?? null : null;
}

const job = process.argv[2];
const trigger = arg("trigger") === "schedule" ? "schedule" : "manual";
/** 进程级总时长：任务自己的预算之外再留 5 分钟收尾。 */
const HARD_LIMIT_MS = { prices: PRICES_BUDGET, events: EVENTS_BUDGET, guide: 8 * 60 * 1000 };

function watchdog(name, receiptJob) {
  const startedAt = tokyoIso();
  const timer = setTimeout(async () => {
    console.error(`${name} 超出总时长，终止`);
    killAllGroups();
    await appendReceipt(root, receiptJob, { started_at: startedAt, finished_at: tokyoIso(), trigger, scope: "all", outcome: "failed", message: "超出总时长，已终止" });
    process.exit(1);
  }, HARD_LIMIT_MS[name] + 5 * 60 * 1000);
  timer.unref();
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    killAllGroups();
    process.exit(signal === "SIGTERM" ? 143 : 130);
  });
}

async function main() {
  if (job === "prices") {
    const rawScope = arg("scope");
    const only = rawScope ? parseScope(rawScope) : null;
    if (rawScope && !only) {
      console.error("scope 不合法");
      return 2;
    }
    watchdog("prices", "prices");
    const result = await runPrices({ root, only, trigger });
    console.log(`${result.outcome}：${result.message}`);
    // 子进程没起来锁就退出的情况：占位由锁获取时清掉，这里兜底
    await clearPending(root, scopeKey(only));
    return result.outcome === "failed" ? 1 : 0;
  }
  if (job === "events") {
    watchdog("events", "events");
    const result = await runEvents({ root, trigger });
    console.log(`${result.outcome}：${result.message}`);
    await clearPending(root, "events");
    return result.outcome === "failed" ? 1 : 0;
  }
  if (job === "guide") {
    const id = arg("id");
    if (!id) {
      console.error("缺少 --id");
      return 2;
    }
    watchdog("guide", "guide");
    // 活动信息从清单里查，不接收命令行传来的名称与链接
    const snapshot = await readJapanActivities(root);
    const activity = snapshot.activities.find((item) => item.id === id);
    if (!activity) {
      await clearPending(root, guideKey(id));
      await appendReceipt(root, "guide", { started_at: tokyoIso(), finished_at: tokyoIso(), trigger, scope: id, outcome: "failed", message: "活动清单里没有这个活动" });
      console.error("活动清单里没有这个活动");
      return 1;
    }
    const result = await runGuide({ root, activity });
    console.log(`${result.outcome}：${result.message}`);
    await clearPending(root, guideKey(id));
    return result.outcome === "failed" ? 1 : 0;
  }
  console.error("用法：run-job.mjs prices|events|guide …");
  return 2;
}

main().then((code) => process.exit(code), (err) => {
  console.error(err);
  process.exit(1);
});
