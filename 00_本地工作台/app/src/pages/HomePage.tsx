import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, LockKeyhole, Target } from "lucide-react";
import { formatHomeTodoSummary, stripTodoMetaPrefixes } from "../gantt-model";
import { projectWindowSwipeStep, projectWindowWheelStep } from "../project-workbench-model";
import { buildAiExecutionRows, buildCurrentExecutionRows, isTodoInNextTwoTokyoDays } from "../schedule-todo-model";
import { CardLink, Empty, Kicker, fmtTime, formatNearTermEventWhen, isNearTermTokyoInstant, jsonFetch, softNavigate, tokyoDateKey } from "../page-shared";
import { invalidateSection } from "../workbench-data-cache";
import type { CalendarEvent, CalendarSnapshot, HomePins, MarketLiveSnapshot, WorkbenchSummary } from "../types";
import { isResearchDomainId, RESEARCH_DOMAIN_HOME_META } from "./topics/domain-research-home";

const MARKET_HEATMAP_URL = "https://ectr.top/heatmaps";
/** 与服务端 `MARKET_REFRESH_MS` 对齐：首页在前台时拉最新缓存。 */
const MARKET_LIVE_POLL_MS = 300_000;
const BRIEF_STALE_CHECK_MS = 60 * 60_000;

function clipText(text: string, max = 22) {
  const next = text.replace(/\s+/g, " ").trim();
  return next.length <= max ? next : `${next.slice(0, max)}…`;
}

function formatMarketPercent(value: number | null) {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatMarketPriceParts(value: number | null, currency: string) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: currency === "CNY" ? 3 : 2,
  });
  const parts = formatter.formatToParts(value ?? 0);
  const currencyLabel = parts.find((part) => part.type === "currency")?.value || currency;
  return {
    currency: currencyLabel,
    amount: value == null ? "—" : parts.filter((part) => part.type !== "currency").map((part) => part.value).join("").trim(),
    label: value == null ? `${currencyLabel} —` : formatter.format(value),
  };
}

function HomeCardHeading({
  eyebrow,
  title,
  meta,
  lead = false,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  lead?: boolean;
}) {
  return <div className={`home-card-heading${lead ? " is-lead" : ""}`}>
    <div>
      {eyebrow ? <Kicker>{eyebrow}</Kicker> : null}
      <h2>{title}</h2>
    </div>
    {meta ? <div className="home-card-meta">{meta}</div> : null}
  </div>;
}

function DayTimeline({ calendar, compact = false, onSelect }: { calendar: CalendarSnapshot; compact?: boolean; onSelect?: (event: CalendarEvent) => void }) {
  const todayKey = tokyoDateKey(new Date());
  const events = calendar.events
    .filter((event) => isNearTermTokyoInstant(event.start))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, compact ? 4 : 12);
  if (!calendar.available) {
    const denied = calendar.permission === "denied";
    return <div className={`calendar-unavailable ${calendar.loading ? "loading" : ""}`} onClick={(event) => event.stopPropagation()}>{calendar.loading ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={18} />}<div><strong>{calendar.loading ? "正在读取苹果日历" : denied ? "日历权限未开启" : "苹果日历读取失败"}</strong><p>{calendar.message || (calendar.loading ? "本机尚无缓存时需要稍等片刻；之后会先显示缓存再后台更新。" : "可在日程页点「同步日历」重试。")}</p></div></div>;
  }
  if (!events.length) {
    return <Empty>因过竹院逢僧话<br />偷得浮生半日闲</Empty>;
  }
  return <div className="day-timeline">{events.map((event) => {
    const body = <><time>{formatNearTermEventWhen(event.start, event.allDay, todayKey)}</time><i /><div><strong>{event.title}</strong><small>{event.calendar}{event.recurring ? " · 重复" : ""}</small></div></>;
    return onSelect
      ? <button key={event.id} type="button" onClick={(e) => { e.stopPropagation(); onSelect(event); }}>{body}</button>
      : <div className="day-timeline-item" key={event.id}>{body}</div>;
  })}</div>;
}

const HOME_PROJECT_NAMES = ["小秘书", "月蔷薇洋装", "糖霜庭院"] as const;

function HomeProjectWindow({ data }: { data: WorkbenchSummary }) {
  const projects = useMemo(() => HOME_PROJECT_NAMES.flatMap((name) => {
    const project = data.projectManagement?.projects.find((item) => name === "小秘书"
      ? item.projectId === "infans-ai-system" || item.name === name
      : item.name === name);
    if (!project) return [];
    const current = [...(project.management?.doing || []), ...(project.management?.next || [])]
      .filter((task) => !task.done)
      .slice(0, 3)
      .map((task) => stripTodoMetaPrefixes(task.displayText || task.text));
    const version = name === "月蔷薇洋装" ? data.projects.flagship.version : null;
    return [{
      id: project.projectId || name,
      name: name === "月蔷薇洋装" ? "《月蔷薇洋装》" : name,
      status: project.status,
      version,
      current: current.length ? current : [project.management?.currentStatus || "项目资料已接入工作台。"],
      href: `/projects?project=${encodeURIComponent(project.projectId || name)}`,
    }];
  }), [data.projectManagement?.projects, data.projects.flagship.version]);
  const [activeIndex, setActiveIndex] = useState(0);
  const gestureRef = useRef({ x: 0, y: 0, swiped: false });
  const lastWheelAtRef = useRef(0);
  const activeProject = projects[activeIndex] || projects[0];
  const move = (step: number) => {
    if (projects.length < 2) return;
    setActiveIndex((current) => (current + step + projects.length) % projects.length);
  };
  if (!activeProject) return null;

  return (
    <section
      className="museum-card interactive-card project-hero home-quiet home-project-window"
      role="region"
      aria-roledescription="项目切换区"
      aria-label={`重点项目，当前第 ${activeIndex + 1} 项，共 ${projects.length} 项`}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        gestureRef.current = { x: event.clientX, y: event.clientY, swiped: false };
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== "touch") return;
        const dx = event.clientX - gestureRef.current.x;
        const dy = event.clientY - gestureRef.current.y;
        if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.35) gestureRef.current.swiped = true;
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch") return;
        const dx = event.clientX - gestureRef.current.x;
        const dy = event.clientY - gestureRef.current.y;
        const step = projectWindowSwipeStep(dx, dy);
        if (step) move(step);
      }}
      onWheel={(event) => {
        const step = projectWindowWheelStep(event.deltaX, event.deltaY);
        if (!step) return;
        event.preventDefault();
        const now = Date.now();
        if (now - lastWheelAtRef.current < 360) return;
        lastWheelAtRef.current = now;
        move(step);
      }}
    >
      <div className="project-orbit" />
      <a
        className="home-project-link"
        href={activeProject.href}
        aria-label={`打开${activeProject.name}`}
        onClick={(event) => {
          if (gestureRef.current.swiped) {
            event.preventDefault();
            gestureRef.current.swiped = false;
            return;
          }
          softNavigate(event, activeProject.href);
        }}
      />
      <div className="home-project-copy" key={activeProject.id}>
        <HomeCardHeading
          eyebrow={<>重点项目{activeProject.version ? ` · ${activeProject.version}` : ""}</>}
          title={activeProject.name}
        />
        <p className="project-hero-status">{activeProject.status}</p>
        <div className="home-pending">
          <span>当前推进</span>
          {activeProject.current.map((item) => <p key={item}><Target size={12} /><em>{clipText(item, 34)}</em></p>)}
        </div>
      </div>
      <div className="home-project-position" aria-label={`第 ${activeIndex + 1} 项，共 ${projects.length} 项`}>
        <div aria-hidden>{projects.map((project, index) => <i className={index === activeIndex ? "is-active" : ""} key={project.id} />)}</div>
      </div>
    </section>
  );
}

function HomeStockWindow({ live, liveStamp }: { live: MarketLiveSnapshot | null; liveStamp: string }) {
  const pages = [
    { id: "watchlist", title: "美股看板", rows: live?.stocks || [] },
    { id: "everbright", title: "A股看板", rows: live?.holdingStocks || [] },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const gestureRef = useRef({ x: 0, y: 0, swiped: false });
  const lastWheelAtRef = useRef(0);
  const activePage = pages[activeIndex];
  const move = (step: number) => setActiveIndex((current) => (current + step + pages.length) % pages.length);

  return <section
    className="museum-card interactive-card card-link stocks-pulse home-quiet home-aux home-stock-window"
    role="region"
    aria-roledescription="行情切换区"
    aria-label={`${activePage.title}，股市行情，当前第 ${activeIndex + 1} 页，共 ${pages.length} 页`}
    onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    }}
    onPointerDown={(event) => {
      if (event.pointerType !== "touch") return;
      gestureRef.current = { x: event.clientX, y: event.clientY, swiped: false };
    }}
    onPointerMove={(event) => {
      if (event.pointerType !== "touch") return;
      const dx = event.clientX - gestureRef.current.x;
      const dy = event.clientY - gestureRef.current.y;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.35) gestureRef.current.swiped = true;
    }}
    onPointerUp={(event) => {
      if (event.pointerType !== "touch") return;
      const dx = event.clientX - gestureRef.current.x;
      const dy = event.clientY - gestureRef.current.y;
      const step = projectWindowSwipeStep(dx, dy);
      if (step) move(step);
    }}
    onWheel={(event) => {
      const step = projectWindowWheelStep(event.deltaX, event.deltaY);
      if (!step) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelAtRef.current < 360) return;
      lastWheelAtRef.current = now;
      move(step);
    }}
  >
    <a
      className="card-stretch-link"
      href={MARKET_HEATMAP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="打开股市行情全景"
      onClick={(event) => {
        if (!gestureRef.current.swiped) return;
        event.preventDefault();
        gestureRef.current.swiped = false;
      }}
    />
    <div className="home-stock-copy" key={activePage.id}>
      <HomeCardHeading eyebrow="股市行情" title={activePage.title} meta={<span className="live-meta"><em>{liveStamp}</em></span>} />
      {/* 涨跌色：红跌绿涨（本人习惯；不是 A 股常见的红涨绿跌），勿改反 */}
      <div className="live-quotes">{activePage.rows.length ? activePage.rows.map((stock) => {
        const price = formatMarketPriceParts(stock.price, stock.currency);
        return <div
          key={stock.symbol}
          className={stock.changePercent == null ? "flat" : stock.changePercent >= 0 ? "up" : "down"}
          aria-label={`${stock.name}，${price.label}，${formatMarketPercent(stock.changePercent)}`}
        ><strong title={stock.name}>{stock.label || stock.symbol}</strong><span className="live-quote-currency" aria-hidden>{price.currency}</span><span className="live-quote-amount">{price.amount}</span><small>{formatMarketPercent(stock.changePercent)}</small></div>;
      }) : <Empty>{live?.message || "正在读行情…"}</Empty>}</div>
    </div>
    <div className="home-stock-position" aria-label={`第 ${activeIndex + 1} 页，共 ${pages.length} 页`}>
      <div aria-hidden>{pages.map((page, index) => <i className={index === activeIndex ? "is-active" : ""} key={page.id} />)}</div>
    </div>
  </section>;
}

export default function HomePage({ data, calendar, secretaryName, active = true, refreshSummary, onAskSecretary }: { data: WorkbenchSummary; calendar: CalendarSnapshot; secretaryName: string; active?: boolean; refreshSummary?: () => void; onAskSecretary?: (seedUser: string) => void }) {
  const todayKey = tokyoDateKey(new Date());
  const activeTodos = data.projectManagement
    ? [...buildCurrentExecutionRows(data.projectManagement.currentTodos), ...buildAiExecutionRows(data.projectManagement.currentTodos)].slice(0, 4)
    : data.todo.today.filter((item) => !item.done && isTodoInNextTwoTokyoDays(item.text, todayKey)).slice(0, 4);
  const nearEventCount = calendar.events.filter((event) => isNearTermTokyoInstant(event.start)).length;
  const [pins, setPins] = useState<HomePins>({ topicIds: [], likedCourseIds: [], researchDomainId: "image-management" });
  const [live, setLive] = useState<MarketLiveSnapshot | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    jsonFetch<HomePins>("/api/home-pins")
      .then((next) => { if (!cancelled) setPins(next); })
      .catch(() => { if (!cancelled) setPins({ topicIds: [], likedCourseIds: [], researchDomainId: "image-management" }); });
    return () => { cancelled = true; };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = () => jsonFetch<MarketLiveSnapshot>("/api/market-live").then((next) => { if (!cancelled) setLive(next); }).catch(() => { if (!cancelled) setLive({ available: false, stocks: [], holdingStocks: [], fx: [], refreshedAt: null, message: "行情暂不可用" }); });
    load();
    const timer = window.setInterval(load, MARKET_LIVE_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active]);
  useEffect(() => {
    if (!active || !refreshSummary) return;
    const maybeRefreshBrief = () => {
      const today = tokyoDateKey(new Date());
      if (data.market.date && data.market.date === today) return;
      invalidateSection("markets");
      refreshSummary();
    };
    const onVis = () => { if (document.visibilityState === "visible") maybeRefreshBrief(); };
    document.addEventListener("visibilitychange", onVis);
    const timer = window.setInterval(maybeRefreshBrief, BRIEF_STALE_CHECK_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(timer);
    };
  }, [active, data.market.date, refreshSummary]);
  const plan = data.health.todayPlan;
  const stale = data.health.staleMuscles ?? [];
  const staleShown = stale.slice(0, 4);
  const liveStamp = live?.refreshedAt ? `${fmtTime(live.refreshedAt)} 更新` : "读取中";
  const pinnedDomain = isResearchDomainId(pins.researchDomainId) ? RESEARCH_DOMAIN_HOME_META[pins.researchDomainId] : null;
  return <div className="home-dashboard">
    <section className="home-priority-grid">
      <CardLink className="agenda-todo-card home-lead" href="/schedule" label="打开日程安排">
        <HomeCardHeading
          eyebrow="今日"
          title="日程安排"
          meta={<>近 2 日 {nearEventCount} 项日程 · {activeTodos.length} 项待办</>}
          lead
        />
        <div className="agenda-todo-split">
          <div className="agenda-pane"><Kicker>日程</Kicker><DayTimeline calendar={calendar} compact /></div>
          <div className="todo-pane">
            <Kicker>待办</Kicker>
            {activeTodos.length
              ? <div className={`focus-list todo-count-${Math.min(activeTodos.length, 3)}`}>{activeTodos.slice(0, 3).map((task, i) => {
                  const summary = "displayText" in task && task.displayText
                    ? task.displayText
                    : formatHomeTodoSummary(task.text);
                  return <div key={`${task.text}-${i}`}><span>0{i + 1}</span><p>{summary}</p></div>;
                })}</div>
              : <Empty>今日事已了<br />闲看庭前花</Empty>}
          </div>
        </div>
      </CardLink>
      {pinnedDomain ? (
        <CardLink className={`topics-pin-card home-quiet home-knowledge-map-card home-domain-${pinnedDomain.id}`} href={`/topics?domain=${pinnedDomain.id}&branch=${pinnedDomain.defaultBranch}`} label={`打开置顶知识地图：${pinnedDomain.title}`}>
          <HomeCardHeading eyebrow="置顶知识地图" title={pinnedDomain.title} meta={pinnedDomain.mark} />
          <div className="home-map-current">
            <span>{pinnedDomain.focusLabel}</span>
            <strong>{pinnedDomain.focusTitle}</strong>
            <p>{pinnedDomain.focusText}</p>
          </div>
          <div className="home-map-bookmarks" aria-label={`${pinnedDomain.title}知识地图索引`}>
            {pinnedDomain.highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}
          </div>
          <small className="home-map-next">{pinnedDomain.nextLabel}</small>
        </CardLink>
      ) : (
        <CardLink className="topics-pin-card home-quiet home-knowledge-map-card is-empty" href="/topics" label="选择要置顶到首页的知识地图">
          <HomeCardHeading eyebrow="置顶知识地图" title="还没有置顶" />
          <Empty>在专题研究的母题小卡右上角点星，就会出现在这里。</Empty>
        </CardLink>
      )}
    </section>
    <section className="home-signal-grid">
      <HomeProjectWindow data={data} />
      <CardLink className="health-pulse home-quiet" href="/health" label="打开身心健康">
        <HomeCardHeading eyebrow="身心 · 今日" title={plan?.title || "今日训练"} />
        <p className="health-weekday">{plan?.weekday || "—"}</p>
        <div className="health-latest"><span>最近训练</span><strong>{data.health.latestTraining || "还没记过"}</strong></div>
        {staleShown.length ? (
          <>
            <div className="stale-grid-label">太久没练</div>
            <div className="stale-grid">
              {staleShown.map((item) => (
                <div key={item.id} className={item.status}>
                  <strong>{item.label}</strong>
                  <span>{item.daysSince} 天</span>
                </div>
              ))}
            </div>
            {stale.length > staleShown.length ? <small className="health-fresh">还有 {stale.length - staleShown.length} 块</small> : null}
          </>
        ) : <small className="health-fresh">各部位节奏正常 · {data.health.weight}</small>}
        {data.health.life?.overdueWeeks != null && data.health.life.overdueWeeks >= 4 ? (
          <small className="health-fresh">衡 · 已经 {data.health.life.overdueWeeks} 周没打分</small>
        ) : null}
      </CardLink>
    </section>
    <section className="home-finance-grid">
      <CardLink className="market-pulse home-quiet home-aux" href="/markets" label="打开金融资讯">
        <HomeCardHeading eyebrow="市场简报" title="金融资讯" meta={data.market.date ? `简报 ${data.market.date}` : "每天更新一次"} />
        <p>{data.market.status === "active" ? data.market.headline : "市场暂时安静"}</p>
        {data.market.topEvents?.length ? <ul className="market-top-events">{data.market.topEvents.map((event, eventIndex) => <li key={event.id || `${event.category}-${event.title}-${eventIndex}`}>{(event.signalTags?.length ? event.signalTags : [event.category]).map((tag, tagIndex) => <em key={`${tag}-${tagIndex}`} className="market-signal-tag" data-tag={tag}>{tag}</em>)}{event.title}</li>)}</ul> : null}
        {data.market.aiHotspots?.length ? <ul className="market-ai-hotspots">{data.market.aiHotspots.map((event, eventIndex) => <li key={event.id || `${event.category}-${event.title}-${eventIndex}`}><span>{event.category}</span>{event.title}</li>)}</ul> : null}
      </CardLink>
      <HomeStockWindow live={live} liveStamp={liveStamp} />
      <CardLink className="fx-pulse home-quiet home-aux" href={MARKET_HEATMAP_URL} label="打开汇率行情全景" external>
        <HomeCardHeading eyebrow="外汇行情" title="汇率看板" meta={<span className="live-meta"><em>{liveStamp}</em></span>} />
        <div className="fx-board">{live?.available && live.fx.length ? live.fx.map((row) => <div key={row.pair}><span>{row.label}</span><strong>{row.value}</strong><small>{row.pair}</small></div>) : <Empty>{live?.message || "正在读汇率…"}</Empty>}</div>
      </CardLink>
    </section>
  </div>;
}
