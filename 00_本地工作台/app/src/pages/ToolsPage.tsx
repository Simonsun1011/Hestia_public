import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChefHat,
  ChevronRight,
  FileText,
  Hourglass,
  LoaderCircle,
  MessageCircleHeart,
  Music2,
  Radar,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import type { CronMonitorSnapshot, CronMonitorTask, DevelopmentLogDay, DevelopmentLogSnapshot, RhythmAssetGroup, RhythmCoverageRow, RhythmFreshnessRow } from "../types";
import { Card, CardButton, Empty, Kicker, fmtDateTime, jsonFetch, navigate } from "../page-shared";
import KitchenOrdersView from "./tools/KitchenOrdersView";
import MusicPlayerView from "./tools/MusicPlayerView";
import RenewalExpiryView from "./tools/RenewalExpiryView";
const DiaryModeView = lazy(() => import("./tools/DiaryModeView"));

type DevelopmentLogDayViewComponent = ComponentType<{ day: DevelopmentLogDay; onBack: () => void }>;
let developmentLogDayViewPromise: Promise<{ default: DevelopmentLogDayViewComponent }> | null = null;

function preloadDevelopmentLogDayView() {
  developmentLogDayViewPromise ||= import("./tools/DevelopmentLogDay");
  return developmentLogDayViewPromise;
}

type ToolId = "development-log" | "diary-mode" | "renewals" | "kitchen-orders" | "cron" | "music";

type ToolDefinition = {
  id: ToolId;
  name: string;
  kicker: string;
  icon: LucideIcon;
  tone: "teal" | "gold" | "mist";
};

const TOOLS: ToolDefinition[] = [
  {
    id: "development-log",
    name: "工作日志",
    kicker: "01",
    icon: FileText,
    tone: "teal",
  },
  {
    id: "diary-mode",
    name: "对话日志",
    kicker: "12",
    icon: MessageCircleHeart,
    tone: "gold",
  },
  {
    id: "cron",
    name: "异常雷达",
    kicker: "02",
    icon: Radar,
    tone: "mist",
  },
  {
    id: "music",
    name: "NAS 音乐",
    kicker: "04",
    icon: Music2,
    tone: "mist",
  },
  {
    id: "renewals",
    name: "续费到期",
    kicker: "09",
    icon: Hourglass,
    tone: "mist",
  },
  {
    id: "kitchen-orders",
    name: "私房菜单",
    kicker: "11",
    icon: ChefHat,
    tone: "gold",
  },
];

function parseToolId(pathname = window.location.pathname): ToolId | null {
  const match = pathname.match(/^\/tools\/([^/]+)\/?$/);
  if (!match) return null;
  return TOOLS.some((tool) => tool.id === match[1]) ? (match[1] as ToolId) : null;
}

function syncToolLocation(): ToolId | null {
  if (window.location.pathname === "/tools/game-dungeon") return null;
  const toolId = parseToolId();
  if (window.location.pathname.startsWith("/tools/") && !toolId) {
    window.history.replaceState({}, "", "/tools");
  }
  return toolId;
}

function ToolsLaunchpad({ onOpen }: { onOpen: (id: ToolId) => void }) {
  const columns = TOOLS.length > 5 ? 3 : Math.max(TOOLS.length, 1);
  return (
    <div
      className="tools-launch-grid"
      data-columns={String(columns)}
    >
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            type="button"
            className={`tools-app tone-${tool.tone}`}
            key={tool.id}
            onClick={() => onOpen(tool.id)}
          >
            <span className="tools-app-icon" aria-hidden="true">
              <Icon size={34} strokeWidth={1.6} />
            </span>
            <strong>{tool.name}</strong>
          </button>
        );
      })}
    </div>
  );
}

function DevelopmentLogView({ active }: { active: boolean }) {
  const [data, setData] = useState<DevelopmentLogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [DayView, setDayView] = useState<DevelopmentLogDayViewComponent | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await jsonFetch<DevelopmentLogSnapshot>("/api/tools/development-log"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读不到工作日志");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active]);

  const selectedDay = data?.days.find((day) => day.date === selectedDate) || null;
  const openDay = (date: string) => {
    setSelectedDate(date);
    void preloadDevelopmentLogDayView()
      .then((module) => setDayView(() => module.default))
      .catch((reason) => {
        setSelectedDate(null);
        setError(reason instanceof Error ? reason.message : "全文阅读器打不开");
      });
  };

  if (selectedDay) {
    return DayView
      ? <DayView day={selectedDay} onBack={() => setSelectedDate(null)} />
      : <Empty>正在打开 {selectedDay.date} 的完整日志。</Empty>;
  }

  return (
    <div className="development-log">
      <Card className="development-log-hero">
        <div>
          <Kicker>工具 01 · 只读</Kicker>
          <h2>工作日志</h2>
          <p>读取日志目录里每天唯一的原文件；一天一个卡片，点进去看全文。</p>
        </div>
        <div className="development-log-actions">
          <span>{data ? `${data.days.length} 天 · ${fmtDateTime(data.updatedAt)} 更新` : "正在读取"}</span>
          <button type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "spin" : ""} size={14} />
            刷新
          </button>
        </div>
      </Card>

      {error ? (
        <div className="vpn-warning">
          <AlertTriangle size={16} />
          <div><strong>暂时读不到日志</strong><span>{error}</span></div>
        </div>
      ) : null}

      {loading && !data ? <Empty>正在读取工作日志。</Empty> : null}
      {data ? (
        <ol className="development-log-day-list">
          {data.days.map((day) => (
            <li key={day.date}>
              <button
                type="button"
                className="development-log-day-card"
                onClick={() => openDay(day.date)}
                onPointerEnter={() => { void preloadDevelopmentLogDayView(); }}
                onFocus={() => { void preloadDevelopmentLogDayView(); }}
              >
                <time dateTime={day.date}>{day.date}</time>
                <div>
                  <strong>{day.description || `${day.date} 日志`}</strong>
                  <ul>
                    {day.headings.slice(0, 3).map((heading, index) => <li key={`${day.date}-${index}`}>{heading}</li>)}
                  </ul>
                  {day.headings.length > 3 ? <small>另有 {day.headings.length - 3} 个小节</small> : null}
                </div>
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function cronOutcomeClock(value: string | null) {
  return value?.match(/\b\d{2}:\d{2}(?::\d{2})?\b/)?.[0]?.slice(0, 5) || "";
}

function cronTodayLabel(task: CronMonitorTask, starting: boolean) {
  if (starting) return "正在执行…";
  if (task.status === "ok") {
    const clock = cronOutcomeClock(task.lastOkAt);
    if (task.id === "workbench-daily-release") {
      const action = task.versionOutcomeLabel?.startsWith("已升级版本号") ? "今天已升级" : "今天已执行";
      return `${action}${clock ? ` · ${clock}` : ""}`;
    }
    return `今天成功${clock ? ` · ${clock}` : ""}`;
  }
  if (task.status === "failed") {
    const clock = cronOutcomeClock(task.lastFailAt);
    return `今天失败${clock ? ` · ${clock}` : ""}`;
  }
  if (task.status === "pending") return "今天尚未执行";
  if (task.status === "waiting") return "今天未执行";
  return task.statusLabel;
}

function cronNextRunDisplay(value: string) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})$/);
  if (!match) return value;
  const [, year, month, day, clock] = match;
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()
  ];
  return `${Number(month)}/${Number(day)}（${weekday}）${clock}`;
}

function CronTaskRows({
  tasks,
  openId,
  setOpenId,
  startingIds,
  onRerun,
}: {
  tasks: CronMonitorTask[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  startingIds: Set<string>;
  onRerun: (task: CronMonitorTask) => void;
}) {
  if (!tasks.length) return null;
  const priority: Record<CronMonitorTask["status"], number> = { failed: 0, missed: 0, missing: 0, waiting: 1, running: 2, pending: 3, ok: 4, idle: 5 };
  const orderedTasks = [...tasks].sort((a, b) => priority[a.status] - priority[b.status]);
  const dailyGrid = tasks.every((task) => task.cadence === "daily");
  return (
    <ul className={`cron-task-list ${dailyGrid ? "is-daily-grid" : ""}`}>
      {orderedTasks.map((task) => {
        const open = openId === task.id;
        const starting = startingIds.has(task.id) || task.running;
        const canRerun = Boolean(task.canRerun) && !starting;
        const complex = task.cadence !== "daily";
        const missingConditions = task.requirements.filter((row) => row.state === "missing").length;
        const failedLastTime = task.lastOutcomeState === "failed" || task.lastOutcomeState === "waiting";
        const conditionTab = failedLastTime
          ? "上次缺少"
          : task.lastOutcomeState === "success"
            ? "下次需要"
            : "首次需要";
        const conditionSummary = failedLastTime && !missingConditions
          ? "运行条件没有缺项，失败原因看左侧执行结果"
          : task.readinessLabel;
        const dailyDetail = task.status === "ok"
          ? task.versionOutcomeLabel || "已经找到今天的成功记录。"
          : task.status === "pending" || task.status === "idle"
            ? task.nextRunLabel
            : task.lastOutcomeSummary;
        return (
          <li key={task.id} id={`cron-task-${task.id}`} data-cron-blocked={task.readinessStatus === "blocked" ? "true" : undefined} className={`cron-task is-${task.status} readiness-${task.readinessStatus} ${complex ? "is-complex" : "is-daily"}${open ? " is-open" : ""}${canRerun ? " is-rerunnable" : ""}${task.status === "ok" || task.status === "idle" ? " is-quiet" : ""}`}>
            <header className="cron-task-main">
              <div>
                <strong>{task.name}</strong>
                <small>{task.scheduleLabel} · {task.blurb}</small>
              </div>
              <span className="cron-task-badge">
                {cronTodayLabel(task, starting)}
              </span>
            </header>
            {complex ? (
              <div className="cron-task-layout">
                <section className={`cron-task-outcome outcome-${task.lastOutcomeState}`}>
                  <Kicker>执行结果</Kicker>
                  <strong>{task.lastOutcomeLabel}{task.lastOutcomeAt ? ` · ${task.lastOutcomeAt}` : ""}</strong>
                  <p>{task.lastOutcomeSummary}</p>
                  <div className="cron-next-run">
                    <span>下次执行</span>
                    <strong>{cronNextRunDisplay(task.nextRunLabel)}</strong>
                  </div>
                </section>
                <section className={`cron-task-conditions is-${task.readinessStatus}`}>
                  <div className="cron-condition-tabs" aria-label="运行条件">
                    <span className="is-active">{conditionTab}</span>
                  </div>
                  <strong>{conditionSummary}</strong>
                  <ul>
                    {task.requirements.map((row) => (
                      <li key={row.id} className={`is-${row.state}`}>
                        <span>{row.state === "ready" ? "齐" : row.state === "missing" ? "缺" : row.state === "optional" ? "选" : "查"}</span>
                        <div><strong>{row.label}</strong><small>{row.detail}</small></div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            ) : (
              <p className="cron-daily-detail">{dailyDetail}</p>
            )}
            <footer className="cron-task-actions">
              {canRerun ? (
                <button type="button" className="cron-rerun-one" onClick={() => { onRerun(task); setOpenId(task.id); }}>
                  <RefreshCw size={13} />重跑这一次
                </button>
              ) : null}
              {task.recentLines.length ? (
                <button type="button" onClick={() => setOpenId(open ? null : task.id)} aria-expanded={open}>
                  {open ? "收起依据" : "查看运行依据"}
                </button>
              ) : null}
            </footer>
            {open && task.recentLines.length ? (
              <pre className="cron-task-log" aria-label={`${task.name} 最近日志`}>
                {task.recentLines.join("\n")}
              </pre>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function MaterialMeter({ percent, alarm }: { percent: number; alarm?: boolean }) {
  const value = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <div className={`cron-meter ${alarm ? "is-alarm" : ""}`} aria-hidden="true">
      <span className="cron-meter-track">
        <span className="cron-meter-fill" style={{ width: `${value}%` }} />
      </span>
      <em>{value}%</em>
    </div>
  );
}

function MaterialRows({
  rows,
  mode,
}: {
  rows: Array<RhythmFreshnessRow | RhythmCoverageRow>;
  mode: "freshness" | "coverage";
}) {
  if (!rows.length) {
    return mode === "freshness" ? <p className="cron-muted">还没有原料数据</p> : null;
  }

  return (
    <ul className="cron-material-list">
      {rows.map((row) => {
        const coverage = row as RhythmCoverageRow;
        const freshness = row as RhythmFreshnessRow;
        const value = mode === "coverage"
          ? (coverage.have != null && coverage.total != null ? `${coverage.have}/${coverage.total}` : "")
          : freshness.asOfLabel;
        const percent = row.readyPercent
          ?? (coverage.have != null && coverage.total
            ? Math.round((100 * coverage.have) / coverage.total)
            : 0);
        const className = [
          row.alarm ? "is-alarm" : "",
        ].filter(Boolean).join(" ");

        const body = (
          <>
            <span className="cron-material-label">
              {row.alarm ? "要看 · " : ""}
              {row.label}
            </span>
            <span className="cron-material-value">{value}</span>
            <MaterialMeter percent={percent} alarm={row.alarm} />
            <small>
              {row.detail}
            </small>
          </>
        );

        return (
          <li key={row.id} className={className}>
            <div className="cron-material-hit is-static">{body}</div>
          </li>
        );
      })}
    </ul>
  );
}

function AssetChecklist({ assets }: { assets: NonNullable<NonNullable<CronMonitorSnapshot["sections"]>["monthly"]["coverage"]>["assets"] }) {
  const groups = assets.groups?.length
    ? assets.groups
    : [{ id: "all", label: "清单", items: assets.items, missingCount: assets.missingCount }] as RhythmAssetGroup[];
  const cycle = assets.cycle;
  const isNextPending = cycle?.state === "next-pending";
  const isOverdue = cycle?.state === "overdue";
  const shortDate = (value?: string) => {
    if (!value) return "—";
    const [, month, day] = value.split("-").map(Number);
    return `${month}/${day}`;
  };
  const cycleTitle = isNextPending
    ? `${cycle.targetMonthKey} 月末盘点待安排`
    : isOverdue
      ? `${cycle.targetMonthKey} 月末盘点已逾期`
      : cycle
        ? `${cycle.targetMonthKey} 月末盘点进行中`
        : "月末盘点清单";
  const cycleSchedule = isNextPending
    ? `${shortDate(cycle.opensAt)} 开放 · ${shortDate(cycle.dueAt)} 前完成`
    : isOverdue
      ? `已过 ${shortDate(cycle?.dueAt)} 截止`
      : cycle
        ? `${shortDate(cycle.dueAt)} 前完成`
        : assets.detail;
  return (
    <section
      id="cron-gap-assets"
      className={`cron-asset-block ${assets.alarm ? "is-alarm" : ""} ${isNextPending ? "is-next-pending" : ""}`}
      aria-labelledby="cron-assets-title"
    >
      <header className="cron-asset-head">
        <div>
          <Kicker>{isNextPending ? "下一轮账号与账单" : "本轮账号与账单"}</Kicker>
          <h4 id="cron-assets-title">{cycleTitle}</h4>
        </div>
        <strong>{cycleSchedule}</strong>
      </header>
      {isNextPending ? (
        <div className="cron-asset-history">
          <span>上次完成依据 · {cycle.lastCompletedMonthKey}</span>
          <strong>{assets.detail}</strong>
        </div>
      ) : null}
      <div className={`cron-asset-groups ${isNextPending ? "is-history" : ""}`}>
        {groups.map((group) => (
          <section key={group.id} className={`cron-asset-group group-${group.id} ${group.missingCount ? "is-miss" : "is-ok"}`}>
            <header className="cron-asset-group-head">
              <span>{group.label}</span>
              <strong>{group.missingCount ? `缺 ${group.missingCount}` : "已齐"}</strong>
            </header>
            <ul className="cron-asset-chips">
              {group.items.map((item) => (
                <li key={item.id} className={item.present ? "is-ok" : "is-miss"}>
                  <span aria-hidden="true">{item.present ? "✓" : "缺"}</span>
                  {item.label}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function CronMonitorView({ active }: { active: boolean }) {
  const [data, setData] = useState<CronMonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [startingIds, setStartingIds] = useState<Set<string>>(() => new Set());
  const [runNote, setRunNote] = useState("");

  const load = async () => {
    try {
      const next = await jsonFetch<CronMonitorSnapshot>("/api/tools/cron");
      setData(next);
      setStartingIds((prev) => {
        if (!prev.size) return prev;
        const nextSet = new Set<string>();
        for (const id of prev) {
          const task = next.tasks.find((item) => item.id === id);
          // 锁还在就继续显示「正在重跑」；跑完后交给状态徽章。
          if (task?.running) nextSet.add(id);
        }
        return nextSet;
      });
    } catch (reason) {
      setData({
        observedAt: new Date().toISOString(),
        today: "",
        summary: { ok: 0, failed: 0, running: 0, pending: 0, missing: 0 },
        tasks: [],
        note: "看定时与原料。",
        error: reason instanceof Error ? reason.message : "读不到异常雷达状态",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [active]);

  const summary = data?.summary;
  const verdict = data?.verdict;
  const attentionCount = data?.tasks.filter((task) => ["failed", "missed", "missing"].includes(task.status) || task.readinessStatus === "blocked").length || 0;
  const heroRisk = verdict?.level === "red" || attentionCount > 0;
  const headline = loading && !data
    ? "正在读取"
    : attentionCount
      ? `${attentionCount} 个任务需要看`
      : (summary?.running
        ? `${summary.running} 个正在跑`
        : "暂无异常");

  const daily = data?.sections?.daily;
  const weekly = data?.sections?.weekly;
  const monthly = data?.sections?.monthly;
  const quarterly = data?.sections?.quarterly;
  const monthlyAssets = monthly?.coverage?.assets;
  const dailyTasks = daily?.tasks || (data?.tasks || []).filter((task) => task.cadence === "daily");
  const appleHealthSync = (daily?.freshness || data?.freshness || []).find((row) => row.id === "apple-health-sync") || null;
  const dailyFailedCount = dailyTasks.filter((task) => task.canRerun).length;

  const rerunTasks = async (payload: { id?: string; failedToday?: boolean; cadence?: "daily" }) => {
    const ids = payload.id ? [payload.id] : dailyTasks.filter((task) => task.canRerun).map((task) => task.id);
    if (!ids.length && !payload.failedToday) {
      setRunNote("没有需要重跑的任务");
      return;
    }
    setStartingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    setRunNote(payload.failedToday ? "正在重跑今天没成功的…" : "正在重跑…");
    try {
      const result = await jsonFetch<{ ok: boolean; message: string }>("/api/tools/cron/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setRunNote(result.message || "已提交重跑");
      window.setTimeout(() => { void load(); }, 1200);
      window.setTimeout(() => {
        setStartingIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        void load();
      }, 10_000);
    } catch (reason) {
      setStartingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setRunNote(reason instanceof Error ? reason.message : "重跑失败");
    }
  };

  const jumpToMaterialGap = () => {
    const task = data?.tasks.find((item) => item.readinessStatus === "blocked" || ["failed", "missed", "missing"].includes(item.status));
    const target = task ? `cron-task-${task.id}` : "cron-gap-materials";
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById(target)?.scrollIntoView({ behavior, block: "start" });
  };

  return (
    <div className="cron-rhythm">
      <Card className={`cron-status-hero ${heroRisk ? "has-risk" : verdict?.level === "yellow" ? "is-warn" : "ok"}`}>
        <div className="vpn-status-copy">
          <Kicker>工具 02 · 异常雷达</Kicker>
          <div className="vpn-title-row">
            <span className="vpn-emblem">
              <Radar size={27} />
            </span>
            <div>
              <h2>异常雷达</h2>
              <p>正常的事保持安静，只让漏跑、失败、原料过期和盘点缺口先浮出来。</p>
            </div>
          </div>
        </div>
        <div className="vpn-service-state">
          <span className="live-dot" />
          <small>日本时间 {data?.today || "—"}</small>
          <strong>{headline}</strong>
          <button onClick={() => void load()} disabled={loading} title="立即刷新">
            <RefreshCw className={loading ? "spin" : ""} size={14} />
            立即刷新
          </button>
        </div>
      </Card>

      {data?.error ? (
        <div className="vpn-warning">
          <AlertTriangle size={16} />
          <div>
            <strong>暂时读不到状态</strong>
            <span>{data.error}</span>
          </div>
        </div>
      ) : null}

      <section className="vpn-summary-grid cron-summary-grid">
        <Card>
          <span>最近顺利</span>
          <strong className="teal">{summary?.ok ?? 0}</strong>
          <small>今天已有成功依据</small>
        </Card>
        <Card>
          <span>定时要看</span>
          <strong className={(summary?.failed || 0) > 0 ? "red" : "teal"}>{summary?.failed ?? 0}</strong>
          <small>失败或该跑未成</small>
        </Card>
        <CardButton
          className={(summary?.blocked || 0) > 0 ? "cron-gap-card is-hot" : "cron-gap-card"}
          onClick={jumpToMaterialGap}
          label="跳到下次未就绪的任务"
        >
          <span>下次未就绪</span>
          <strong className={(summary?.blocked || 0) > 0 ? "red" : "teal"}>{summary?.blocked ?? 0}</strong>
          <small>按任务合并条件缺口</small>
        </CardButton>
        <Card>
          <span>正在跑 / 未装</span>
          <strong className={(summary?.running || summary?.missing || 0) > 0 ? "gold" : "teal"}>
            {(summary?.running ?? 0) + (summary?.missing ?? 0)}
          </strong>
          <small>锁还在或 LaunchAgent 缺失</small>
        </Card>
      </section>

      <Card className="cron-task-panel cron-section">
        <div className="card-title">
          <div>
            <Kicker>每天</Kicker>
            <h3>日更任务</h3>
          </div>
          <span>{data?.noteExtras || "原料只报日期，不催上传"}</span>
        </div>
        <div className="cron-section-body is-task-led" id="cron-gap-materials">
          <div className="cron-section-main">
            <div className="cron-task-head">
              <Kicker className="is-gold">第一眼只看今天有没有跑成</Kicker>
              <button
                type="button"
                className="cron-rerun-all"
                disabled={!dailyFailedCount || loading}
                onClick={() => void rerunTasks({ failedToday: true, cadence: "daily" })}
                title={dailyFailedCount ? `重跑今天没成功的 ${dailyFailedCount} 个` : "今天没有失败的任务"}
              >
                <RefreshCw size={13} />
                重跑今天没成功的
                {dailyFailedCount ? ` · ${dailyFailedCount}` : ""}
              </button>
            </div>
            {runNote ? <p className="cron-run-note">{runNote}</p> : null}
            {appleHealthSync?.alarm ? (
              <MaterialRows
                rows={[appleHealthSync]}
                mode="freshness"
              />
            ) : null}
            <CronTaskRows
              tasks={dailyTasks}
              openId={openId}
              setOpenId={setOpenId}
              startingIds={startingIds}
              onRerun={(task) => void rerunTasks({ id: task.id })}
            />
          </div>
        </div>
      </Card>

      <div id="cron-gap-weekly">
      <Card className="cron-task-panel cron-section">
        <div className="card-title">
          <div>
            <Kicker>每周 / 隔周</Kicker>
            <h3>周更与两周更任务</h3>
          </div>
          <span>{weekly?.coverage ? `本周自 ${weekly.coverage.weekStart}` : ""}</span>
        </div>
        <div className="cron-section-body is-task-led">
          <div className="cron-section-main">
            <Kicker className="is-gold">左看执行结果，右看条件</Kicker>
            <CronTaskRows
              tasks={weekly?.tasks || []}
              openId={openId}
              setOpenId={setOpenId}
              startingIds={startingIds}
              onRerun={(task) => void rerunTasks({ id: task.id })}
            />
          </div>
        </div>
      </Card>
      </div>

      <div id="cron-gap-monthly">
      <Card className="cron-task-panel cron-section">
        <div className="card-title">
          <div>
            <Kicker>每月</Kicker>
            <h3>月更任务</h3>
          </div>
          <span>
            {monthly?.coverage
              ? `对照 ${monthly.coverage.prevMonthKey}${monthly.coverage.monthlyReviewExists ? " · 上月回顾已有" : " · 上月回顾还没有"}`
              : ""}
          </span>
        </div>
        <div className="cron-section-body is-task-led">
          <div className="cron-section-main">
            <Kicker className="is-gold">左看执行结果，右看条件</Kicker>
            <CronTaskRows
              tasks={monthly?.tasks || []}
              openId={openId}
              setOpenId={setOpenId}
              startingIds={startingIds}
              onRerun={(task) => void rerunTasks({ id: task.id })}
            />
            {monthlyAssets ? <AssetChecklist assets={monthlyAssets} /> : null}
          </div>
        </div>
      </Card>
      </div>

      <Card className="cron-task-panel cron-section">
        <div className="card-title">
          <div>
            <Kicker>每季度</Kicker>
            <h3>季度验证</h3>
          </div>
          <span>没有真实恢复证据，就不算链路已经验证</span>
        </div>
        <div className="cron-section-body is-task-led">
          <div className="cron-section-main">
            <Kicker className="is-gold">左看执行结果，右看条件</Kicker>
            <CronTaskRows
              tasks={quarterly?.tasks || []}
              openId={openId}
              setOpenId={setOpenId}
              startingIds={startingIds}
              onRerun={(task) => void rerunTasks({ id: task.id })}
            />
          </div>
        </div>
      </Card>

      {!data?.tasks.length && !loading ? <Empty>还没有任务数据</Empty> : null}
      {data?.note ? <p className="cron-footnote">{data.note}</p> : null}
    </div>
  );
}

const TOOL_VIEWS: Record<Exclude<ToolId, "cron" | "diary-mode">, ComponentType<{ active: boolean }>> = {
  "development-log": DevelopmentLogView,
  renewals: RenewalExpiryView,
  "kitchen-orders": KitchenOrdersView,
  music: MusicPlayerView,
};

export default function ToolsPage({ active = true }: { active?: boolean }) {
  const [toolId, setToolId] = useState<ToolId | null>(() => syncToolLocation());

  useEffect(() => {
    const sync = () => {
      if (window.location.pathname === "/tools/game-dungeon") {
        window.history.replaceState({}, "", "/schedule?view=japan");
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      }
      setToolId(syncToolLocation());
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const openTool = (id: ToolId) => {
    navigate(`/tools/${id}`);
    setToolId(id);
  };
  const backToLaunchpad = () => {
    navigate("/tools");
    setToolId(null);
  };

  if (!toolId) {
    return (
      <div className="tools-page tools-launchpad">
        <ToolsLaunchpad onOpen={openTool} />
      </div>
    );
  }

  const tool = TOOLS.find((item) => item.id === toolId)!;
  return (
    <div className="tools-page">
      <div className="tools-detail-bar">
        <button type="button" className="tools-back" onClick={backToLaunchpad}>
          <ArrowLeft size={15} />
          <span>工具</span>
        </button>
        <div className="tools-detail-title">
          <Kicker>工具 {tool.kicker}</Kicker>
          <strong>{tool.name}</strong>
        </div>
      </div>
      {toolId === "cron" ? (
        <CronMonitorView active={active} />
      ) : toolId === "diary-mode" ? (
        <Suspense fallback={<Empty>正在打开对话日志。</Empty>}>
          <DiaryModeView active={active} secretaryName="小秘书" secretaryAvatarSrc="/infans-studio-logo.v2.png" />
        </Suspense>
      ) : (
        (() => {
          const View = TOOL_VIEWS[toolId];
          return <View active={active} />;
        })()
      )}
    </div>
  );
}
