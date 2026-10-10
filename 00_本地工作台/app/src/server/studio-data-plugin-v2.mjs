import fs from "node:fs/promises";
import path from "node:path";

import { readMarketBriefByDate, scanWorkbenchSection, scanWorkbenchSummary } from "./workbench-data.mjs";
import { listDialogueLogDays, readDialogueLogDay } from "./workbench-dialogue-logs.mjs";
import { readDevelopmentLog } from "./workbench-development-log.mjs";
import { readJapanActivities, readJapanActivityGuideImage, readJapanActivityPlaybook, writeJapanActivityInterest } from "./workbench-japan-activities.mjs";
import { readDefaultMusicQueue, readMusicDirectory, streamMusicTrack } from "./workbench-music.mjs";
import { createMusicPlaylist, deleteMusicPlaylist, readMusicPlaylists, updateMusicPlaylist } from "./workbench-music-playlists.mjs";
import { readRenewalExpiry } from "./workbench-renewals.mjs";
import { streamAnimeCover } from "./workbench-anime-covers.mjs";
import { readProjectManagement } from "./workbench-project-management.mjs";
import { animeCoversSupportDir } from "./vault-paths.mjs";

function studioRoot(baseDir = process.cwd()) { return path.resolve(process.env.INFANS_STUDIO_ROOT || path.join(baseDir, "../..")); }
function supportRoot(root) { return path.resolve(process.env.INFANS_SUPPORT_ROOT || path.join(root, "../Infans_Support")); }
function musicRoot(root) { return path.join(supportRoot(root), "20_媒体", "音乐示例"); }

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readBody(request, limit = 64 * 1024) {
  let raw = "";
  for await (const chunk of request) { raw += chunk; if (raw.length > limit) throw new Error("请求内容过大"); }
  return raw ? JSON.parse(raw) : {};
}

function fakeWeather() { return { available: true, location: "东京", temperatureC: 24, weatherCode: 1, condition: "晴", uvIndex: 4, uvLabel: "中等", refreshedAt: new Date().toISOString(), message: "演示天气" }; }
function fakeMarketLive() {
  return {
    available: true,
    stocks: [
      { symbol: "SPY", name: "S&P 500 ETF", label: "SPY", currency: "USD", price: 642.31, changePercent: 0.64 },
      { symbol: "QQQ", name: "Nasdaq 100 ETF", label: "QQQ", currency: "USD", price: 579.82, changePercent: 0.91 },
    ],
    holdingStocks: [
      { symbol: "AAPL", name: "Apple", label: "AAPL", currency: "USD", price: 224.3, changePercent: 0.72 },
      { symbol: "MSFT", name: "Microsoft", label: "MSFT", currency: "USD", price: 421.7, changePercent: -0.18 },
    ],
    fx: [{ pair: "USDJPY", label: "USD/JPY", value: 146.2 }],
    refreshedAt: new Date().toISOString(), message: "演示行情",
  };
}

function fakeCronTask(id, name, cadence, scheduleLabel, status, detail, nextRunLabel) {
  const ok = status === "ok";
  return {
    id, name, blurb: detail, scheduleLabel, cadence, dueToday: status === "pending", status,
    statusLabel: ok ? "正常" : "待安排", running: false, canRerun: false, agentInstalled: false, scriptInstalled: false,
    lastOkAt: ok ? "2026-08-29T21:00:00+09:00" : null, lastFailAt: null, outputDate: ok ? "2026-08-29" : null,
    detail, recentLines: ["清洁演示版只展示治理状态，不会运行真实定时任务。"], nextRunLabel,
    lastOutcomeState: ok ? "success" : "waiting", lastOutcomeLabel: ok ? "上次正常" : "尚未执行",
    lastOutcomeAt: ok ? "2026-08-29T21:00:00+09:00" : null, lastOutcomeSummary: ok ? "演示数据已更新" : detail,
    readinessStatus: status === "pending" ? "check" : "ready", readinessLabel: status === "pending" ? "等待人工安排" : "示例就绪",
    requirements: [{ id: `${id}-source`, label: "演示原件", state: "ready", detail: "数据来自 Studio 内的虚构样例。" }],
  };
}

function fakeCron() {
  const daily = [
    fakeCronTask("demo-project-index", "项目状态索引", "daily", "每天 09:00", "ok", "汇总五个演示项目的状态与待办。", "明天 09:00"),
    fakeCronTask("demo-market-brief", "金融资讯简报", "daily", "每天 18:00", "ok", "刷新公开市场示例，不读取券商账户。", "今天 18:00"),
  ];
  const weekly = [fakeCronTask("demo-weekly-review", "事业项目周复盘", "weekly", "每周日", "pending", "本周复盘尚未安排。", "今天 20:30")];
  const monthly = [
    fakeCronTask("demo-account-bill-review", "下一轮账号与账单", "monthly", "每月末", "pending", "下一轮账号与账单待安排；示例卡号均为虚构尾号。", "8 月 31 日"),
    fakeCronTask("demo-asset-month-end", "2026-08 月末盘点", "monthly", "每月末", "pending", "2026-08 月末盘点待安排；只核对演示账户、示例公司卡与虚构美股持仓。", "8 月 31 日"),
  ];
  const quarterly = [fakeCronTask("demo-renewal-review", "续费到期复核", "quarterly", "每季度末", "ok", "检查演示订阅与资格日期。", "9 月 30 日")];
  const assets = {
    snapshotDate: "2026-07-31",
    items: [
      { id: "demo-bank-a", label: "演示经营账户 A", present: true, group: "账户" },
      { id: "demo-card-2048", label: "示例公司卡 •••• 2048", present: true, group: "银行卡" },
      { id: "demo-us-stocks", label: "虚构美股组合", present: true, group: "投资" },
    ],
    groups: [
      { id: "accounts", label: "账号与账单", items: [{ id: "demo-bank-a", label: "演示经营账户 A", present: true, group: "账户" }, { id: "demo-card-2048", label: "示例公司卡 •••• 2048", present: true, group: "银行卡" }], missingCount: 0 },
      { id: "investments", label: "投资", items: [{ id: "demo-us-stocks", label: "虚构美股组合", present: true, group: "投资" }], missingCount: 0 },
    ],
    missingCount: 0, missingLabels: [],
    cycle: { state: "next-pending", targetMonthKey: "2026-08", opensAt: "2026-08-30", dueAt: "2026-09-03", lastCompletedMonthKey: "2026-07" },
    pastDue: false, alarm: false, detail: "2026-08 月末盘点待安排；所有账号、账单和银行卡名称均为假数据。",
  };
  const tasks = [...daily, ...weekly, ...monthly, ...quarterly];
  return {
    observedAt: new Date().toISOString(), today: "2026-08-30",
    summary: { ok: 3, failed: 0, running: 0, pending: 3, missing: 0, blocked: 0, materialAlarms: 0 },
    verdict: { level: "yellow", label: "3 项待安排" }, tasks,
    sections: {
      daily: { tasks: daily, freshness: [{ id: "demo-data", label: "演示数据", asOf: "2026-08-30", asOfLabel: "今天", alarm: false, detail: "全部来自清洁版样例。", readyPercent: 100 }] },
      weekly: { tasks: weekly, coverage: null },
      monthly: { tasks: monthly, coverage: { prevMonthKey: "2026-07", daysInMonth: 31, sleep: { id: "demo-sleep", label: "生活节奏", have: 26, total: 31, alarm: false, detail: "虚构覆盖率", readyPercent: 84 }, monthlyReviewExists: true, assets } },
      quarterly: { tasks: quarterly },
    },
    freshness: [], note: "清洁演示版不安装 launchd、不访问 NAS，也不会读取真实银行、账单或账号。",
  };
}

function fakeKitchenOrders() {
  return {
    version: 1,
    orders: [
      { id: "demo-order-1", guestName: "试吃客人 A", visitDate: "2026-09-06", note: "少糖", dishes: [{ id: "berry-mille", name: { ja: "苺ミルクレープ", zh: "草莓千层" } }, { id: "tea-pudding", name: { ja: "紅茶プリン", zh: "伯爵茶布丁" } }], createdAt: "2026-08-29T12:00:00+09:00", updatedAt: "2026-08-29T12:00:00+09:00", syncState: "archived", isNew: true, isUpdated: false },
      { id: "demo-order-2", guestName: "试吃客人 B", visitDate: "2026-09-07", note: "坚果过敏（演示）", dishes: [{ id: "lemon-tart", name: { ja: "レモンタルト", zh: "柠檬塔" } }], createdAt: "2026-08-29T15:20:00+09:00", updatedAt: "2026-08-30T08:10:00+09:00", syncState: "archived", isNew: false, isUpdated: true },
    ],
    syncedAt: new Date().toISOString(), syncStatus: "ready", discardedOrders: 0, recent: { new: 1, updated: 1 },
  };
}

async function sendLibraryCover(response, root, rawPath) {
  const relative = String(rawPath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const prefix = "60_艺术馆藏/我的游戏/封面/";
  const normalized = relative.startsWith(prefix) ? relative : path.posix.join(prefix, relative.replace(/^封面\//, ""));
  if (!normalized.startsWith(prefix) || normalized.includes("..") || normalized.includes("\0")) return json(response, { error: "封面路径不合法" }, 400);
  const absolute = path.resolve(root, normalized);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) return json(response, { error: "封面路径越界" }, 400);
  const bytes = await fs.readFile(absolute);
  const ext = path.extname(absolute).toLowerCase();
  response.statusCode = 200;
  response.setHeader("Content-Type", ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg");
  response.setHeader("Cache-Control", "public, max-age=86400");
  response.end(bytes);
}

export function studioDataPlugin() {
  let homePins = { topicIds: [], likedCourseIds: [], researchDomainId: "image-management" };
  let domainProgress = { schemaVersion: 1, cards: {}, choices: {}, recentCardIds: [], lastPositions: {} };
  return {
    name: "infans-studio-demo-data-v2", apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (!url.pathname.startsWith("/api/")) return next();
        const root = studioRoot();
        try {
          if (url.pathname === "/api/summary") return json(response, await scanWorkbenchSummary(root));
          if (url.pathname === "/api/project-management") return json(response, await readProjectManagement(root));
          if (url.pathname.startsWith("/api/sections/")) return json(response, await scanWorkbenchSection(root, decodeURIComponent(url.pathname.slice("/api/sections/".length))));
          if (url.pathname === "/api/weather") return json(response, fakeWeather());
          if (url.pathname === "/api/market-live") return json(response, fakeMarketLive());
          if (url.pathname === "/api/markets/brief") return json(response, await readMarketBriefByDate(root, url.searchParams.get("date") || ""));
          if (url.pathname === "/api/tools/development-log") return json(response, await readDevelopmentLog(root));
          if (url.pathname === "/api/tools/dialogue-logs") return json(response, url.searchParams.get("date") ? await readDialogueLogDay(root, url.searchParams.get("date")) : await listDialogueLogDays(root));
          if (url.pathname === "/api/tools/cron") return json(response, fakeCron());
          if (url.pathname === "/api/tools/cron/run") return json(response, { ok: true, message: "清洁演示版不会运行真实定时任务。" });
          if (url.pathname === "/api/tools/renewals") return json(response, await readRenewalExpiry(root));
          if (url.pathname === "/api/tools/kitchen-orders") return json(response, fakeKitchenOrders());
          if (url.pathname === "/api/tools/japan-activities") {
            if (request.method === "PATCH") return json(response, await writeJapanActivityInterest(root, await readBody(request)));
            return json(response, await readJapanActivities(root));
          }
          if (url.pathname === "/api/tools/japan-activity-guide") return json(response, await readJapanActivityPlaybook(root, url.searchParams.get("id") || ""));
          if (url.pathname === "/api/tools/japan-guide-image") {
            const result = await readJapanActivityGuideImage(root, url.searchParams.get("id") || "");
            response.statusCode = 200; response.setHeader("Content-Type", result.contentType); response.setHeader("Cache-Control", "private, max-age=86400"); response.end(result.bytes); return;
          }
          if (url.pathname === "/api/library-cover") return sendLibraryCover(response, root, url.searchParams.get("path") || "");
          if (url.pathname.startsWith("/api/anime-cover/")) return streamAnimeCover(request, response, animeCoversSupportDir(root), decodeURIComponent(url.pathname.slice("/api/anime-cover/".length)));
          if (url.pathname === "/api/tools/music" || url.pathname.startsWith("/api/tools/music/")) {
            const library = musicRoot(root);
            const part = url.pathname.slice("/api/tools/music".length) || "/";
            if (part === "/playlists") {
              if (request.method === "GET") return json(response, await readMusicPlaylists(root, library));
              const body = await readBody(request);
              if (request.method === "POST") return json(response, await createMusicPlaylist(root, library, body.name));
              if (request.method === "PUT") return json(response, await updateMusicPlaylist(root, library, body));
              if (request.method === "DELETE") return json(response, await deleteMusicPlaylist(root, library, body.playlistId));
              return json(response, { error: "不支持这个歌单操作" }, 405);
            }
            if (part === "/" && request.method === "GET") return json(response, await readMusicDirectory(library, url.searchParams.get("path") || ""));
            if (part === "/default" && request.method === "GET") return json(response, await readDefaultMusicQueue(library));
            if (part === "/stream" && (request.method === "GET" || request.method === "HEAD")) return streamMusicTrack(request, response, library, url.searchParams.get("path") || "");
            return json(response, { error: "找不到这个音乐接口" }, 404);
          }
          if (request.method === "PUT" && (url.pathname === "/api/home-pins" || url.pathname === "/api/domain-research-progress")) {
            const body = await readBody(request);
            if (url.pathname === "/api/home-pins") homePins = { ...homePins, ...body }; else domainProgress = { ...domainProgress, ...body };
            return json(response, url.pathname === "/api/home-pins" ? homePins : domainProgress);
          }
          if (url.pathname === "/api/home-pins") return json(response, homePins);
          if (url.pathname === "/api/domain-research-progress") return json(response, domainProgress);
          if (url.pathname === "/api/course-shelf") return json(response, { available: true, courses: [], warnings: [] });
          if (url.pathname === "/api/anki") return json(response, { available: false, due: 18, reviewCount: 0, durationMinutes: 0, message: "演示环境未连接 Anki" });
          return json(response, { error: "演示版未启用此本机接口" }, 404);
        } catch (error) {
          return json(response, { error: error instanceof Error ? error.message : "演示数据读取失败" }, Number(error?.statusCode) || 500);
        }
      });
    },
  };
}
