import { Fragment, lazy, Suspense, useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  AlertTriangle, BookMarked, BriefcaseBusiness, CalendarDays, CheckCircle2, CloudSun,
  HeartPulse, Home, Languages, LibraryBig, LineChart, LockKeyhole, Moon,
  MoreHorizontal, RefreshCw, Sun, Wrench, X, type LucideIcon,
} from "lucide-react";
import type {
  CalendarSnapshot, HealthSectionData, HomePins, LanguagesSectionData,
  LibrarySectionData, MarketsSectionData, WeatherSnapshot, WorkbenchSummary, WriteAction,
} from "./types";
import { invalidateSection, refreshSection, useSectionData } from "./workbench-data-cache";
import { jsonFetch, navigate, softNavigate, isNearTermTokyoInstant } from "./page-shared";
import { buildAiExecutionRows, buildCurrentExecutionRows, isTodoInNextTwoTokyoDays } from "./schedule-todo-model";
import HomePage from "./pages/HomePage";
import { ProfileSwitcher } from "./shell/ProfileSwitcher";
import { applyWorkbenchTheme, getPageScene, readInitialTheme, WORKBENCH_THEMES, type WorkbenchTheme, type WorkbenchThemeIcon } from "./studio-theme";
import "./styles.css";
import "./theme.css";

const LazySchedulePage = lazy(() => import("./pages/SchedulePage"));
const LazyProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const LazyHealthPage = lazy(() => import("./pages/HealthPage"));
const LazyLanguagesPage = lazy(() => import("./pages/LanguagesPage"));
const LazyLibraryPage = lazy(() => import("./pages/LibraryPage"));
const LazyTopicsPage = lazy(() => import("./pages/TopicsPage"));
const LazyMarketsPage = lazy(() => import("./pages/MarketsPage"));
const LazyAssetsPage = lazy(() => import("./pages/AssetsPage"));
const LazyToolsPage = lazy(() => import("./pages/ToolsPage"));

const NAV_ITEMS: Array<{ path: string; label: string; icon: LucideIcon; index: string }> = [
  { path: "/", label: "首页", icon: Home, index: "01" },
  { path: "/schedule", label: "日程安排", icon: CalendarDays, index: "02" },
  { path: "/projects", label: "事业顺利", icon: BriefcaseBusiness, index: "03" },
  { path: "/health", label: "身心健康", icon: HeartPulse, index: "04" },
  { path: "/languages", label: "语言学习", icon: Languages, index: "05" },
  { path: "/markets", label: "金融资讯", icon: LineChart, index: "06" },
  { path: "/topics", label: "专题研究", icon: BookMarked, index: "07" },
  { path: "/library", label: "艺术馆藏", icon: LibraryBig, index: "08" },
  { path: "/markets/assets", label: "资产管理", icon: LockKeyhole, index: "09" },
  { path: "/tools", label: "实用工具", icon: Wrench, index: "10" },
];

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/": { title: "Infans Studio", description: "把行动、事业、身体、学习和研究放进同一套可追溯的工作框架" },
  "/schedule": { title: "日程安排", description: "今日行动、长期主线与近期安排，都按时间收在这里" },
  "/projects": { title: "事业顺利", description: "项目通过统一原件、稳定编号、状态与证据进入同一套治理模式" },
  "/health": { title: "身心健康", description: "演示身体、心理与生活平衡的结构化记录方式" },
  "/languages": { title: "日语突破", description: "从教材课次出发，把沟通任务、文法和变形真正练会" },
  "/markets": { title: "金融资讯", description: "只看真正改变判断的大事，以及它们可能怎样传导" },
  "/topics": { title: "专题研究", description: "用知识地图看见领域全貌，把真正关心的问题逐渐弄清楚" },
  "/library": { title: "艺术馆藏", description: "书籍、游戏、动漫、影视与非私密学习材料" },
  "/markets/assets": { title: "资产管理", description: "资产、投资、收入与支出的完整功能演示；全部为虚构数据" },
  "/tools": { title: "实用工具", description: "围绕项目与 Mac 单机工作流保留的必要工具" },
};

const PRIMARY = new Set(["/", "/schedule", "/projects", "/health", "/languages", "/markets"]);
const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => PRIMARY.has(item.path));
const MORE_NAV_ITEMS = NAV_ITEMS.filter((item) => !PRIMARY.has(item.path));
const SECTION_BY_ROUTE = { "/health": "health", "/languages": "languages", "/library": "library", "/topics": "library", "/markets": "markets" } as const;

function routePath() {
  const path = window.location.pathname;
  if (path === "/tools" || path.startsWith("/tools/")) return "/tools";
  return path in PAGE_META ? path : "/";
}

function RouteSkeleton() { return <div className="route-skeleton" aria-label="正在载入页面"/>; }
function RouteError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="route-error"><AlertTriangle size={18}/><div><strong>这一页的数据没读到</strong><p>{message}</p></div><button onClick={retry}>重新读取</button></div>;
}
function SectionState<T>({ data, error, loading, retry, render }: { data: T | null; error: string; loading: boolean; retry: () => void; render: (data: T) => React.ReactNode }) {
  if (!data && (loading || !error)) return <RouteSkeleton/>;
  if (!data) return <RouteError message={error} retry={retry}/>;
  return <>{error ? <div className="route-stale"><AlertTriangle size={14}/>刷新没成功，还显示旧数据。<button onClick={retry}>重试</button></div> : null}{render(data)}</>;
}

function HealthRoute({ demoAction }: { demoAction: () => void }) {
  const state = useSectionData("health");
  return <SectionState<HealthSectionData> {...state} render={(data) => <LazyHealthPage data={data} onImport={demoAction} onImportFromDownloads={demoAction} importing={false} onAskCoach={demoAction} onWritePreview={demoAction}/>}/>;
}
function LanguagesRoute({ demoAction }: { demoAction: () => void }) {
  const state = useSectionData("languages");
  return <SectionState<LanguagesSectionData> {...state} render={(data) => <LazyLanguagesPage data={data} onLanguageReactorImport={demoAction} onOpenExamAi={demoAction} onSectionRefresh={() => { invalidateSection("languages"); state.retry(); }}/>}/>;
}
function LibraryRoute() {
  const state = useSectionData("library");
  useEffect(() => {
    const kind = new URLSearchParams(window.location.search).get("kind");
    if (kind === "topic" || kind === "course") navigate(kind === "course" ? "/topics?tab=archive" : "/topics");
  }, []);
  return <SectionState<LibrarySectionData> {...state} render={(data) => <LazyLibraryPage data={data}/>}/>;
}
function TopicsRoute({ demoAction }: { demoAction: () => void }) {
  const state = useSectionData("library");
  const [pins, setPins] = useState<HomePins>({ topicIds: [], likedCourseIds: [], researchDomainId: "image-management" });
  useEffect(() => { jsonFetch<HomePins>("/api/home-pins").then(setPins).catch(() => undefined); }, []);
  const savePins = async (next: HomePins) => {
    setPins(next);
    try { setPins(await jsonFetch<HomePins>("/api/home-pins", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) })); } catch { /* 演示环境保留本页状态。 */ }
  };
  return <SectionState<LibrarySectionData> {...state} render={(data) => <LazyTopicsPage
    data={data}
    pinnedTopicIds={pins.topicIds}
    likedCourseIds={pins.likedCourseIds}
    pinnedDomainId={pins.researchDomainId}
    onTogglePin={(id) => void savePins({ ...pins, topicIds: pins.topicIds.includes(id) ? pins.topicIds.filter((item) => item !== id) : [...pins.topicIds, id].slice(0, 12) })}
    onToggleLike={(id) => void savePins({ ...pins, likedCourseIds: pins.likedCourseIds.includes(id) ? pins.likedCourseIds.filter((item) => item !== id) : [...pins.likedCourseIds, id].slice(0, 24) })}
    onToggleDomainPin={(id) => void savePins({ ...pins, researchDomainId: pins.researchDomainId === id ? null : id })}
    onAskSecretary={demoAction}
  />}/>;
}
function MarketsRoute() { const state = useSectionData("markets"); return <SectionState<MarketsSectionData> {...state} render={(data) => <LazyMarketsPage data={data}/>}/>; }

function createDemoCalendar(): CalendarSnapshot {
  const base = new Date();
  const at = (hour: number, minute: number) => { const date = new Date(base); date.setHours(hour, minute, 0, 0); return date.toISOString(); };
  return {
    available: true, permission: "granted", calendars: ["Infans Studio 演示"], loading: false,
    message: "演示日程，不读取本机日历",
    events: [
      { id: "sample", calendar: "Infans Studio 演示", title: "秋季样衣评审", start: at(9, 30), end: at(10, 30), allDay: false, recurring: false, editable: false },
      { id: "japanese", calendar: "Infans Studio 演示", title: "日语接待口语练习", start: at(14, 0), end: at(14, 45), allDay: false, recurring: false, editable: false },
      { id: "stream", calendar: "Infans Studio 演示", title: "守望先锋专题直播", start: at(20, 0), end: at(22, 0), allDay: false, recurring: false, editable: false },
    ],
  };
}

const THEME_ICONS = { moon: Moon, sun: Sun } as const;
function ThemeGlyph({ icon }: { icon: WorkbenchThemeIcon }) { const Icon = THEME_ICONS[icon]; return <Icon size={14} aria-hidden="true"/>; }
function ThemeSwitch({ theme, refreshing, onThemeChange, onReload, className = "" }: { theme: WorkbenchTheme; refreshing: boolean; onThemeChange: (theme: WorkbenchTheme) => void; onReload: () => void; className?: string }) {
  return <div className={`theme-switch${className ? ` ${className}` : ""}`} role="group" aria-label="工作台主题与刷新">{WORKBENCH_THEMES.map((item, index) => <Fragment key={item.id}>{index === 1 ? <button type="button" className="theme-reload-ring" onClick={onReload} disabled={refreshing} aria-label="刷新工作台"><RefreshCw className={refreshing ? "is-spinning" : undefined} size={13}/></button> : null}<button type="button" className={`theme-choice${theme === item.id ? " active" : ""}`} onClick={() => onThemeChange(item.id)} aria-pressed={theme === item.id}><ThemeGlyph icon={item.icon}/><em>{item.name}</em></button></Fragment>)}</div>;
}

function TopbarStatus() {
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { jsonFetch<WeatherSnapshot>("/api/weather").then(setWeather).catch(() => undefined); }, []);
  const time = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const date = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "long" }).format(now);
  return <div className={`topbar-status ${weather?.available ? "" : "unavailable"}`} aria-label="东京时间与天气"><span>东京时间</span><span>{weather?.condition || "演示天气"}</span><strong>{time}</strong><strong><CloudSun size={20}/>{weather?.temperatureC != null ? `${weather.temperatureC}°` : "—"}</strong><small>{date}</small><small>UV {weather?.uvIndex ?? "—"} · {weather?.uvLabel || "—"}</small></div>;
}

function App() {
  const [path, setPath] = useState(routePath);
  const [data, setData] = useState<WorkbenchSummary | null>(null);
  const [error, setError] = useState("");
  const [calendar] = useState(createDemoCalendar);
  const [theme, setTheme] = useState<WorkbenchTheme>(readInitialTheme);
  const [refreshing, setRefreshing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState("");

  const load = () => jsonFetch<WorkbenchSummary>("/api/summary").then((next) => { setData(next); setError(""); }).catch((reason) => setError(reason instanceof Error ? reason.message : "读取失败"));
  const demoAction = () => setToast("清洁版保留了界面，但不会连接私人数据或聊天能力");
  const refresh = async () => {
    setRefreshing(true);
    const section = SECTION_BY_ROUTE[path as keyof typeof SECTION_BY_ROUTE];
    try { await Promise.all([load(), ...(section ? [refreshSection(section)] : [])]); setToast("演示数据已刷新"); }
    catch { setToast("刷新失败，请稍后再试"); }
    finally { setRefreshing(false); }
  };
  useEffect(() => {
    load();
    const pop = () => setPath(routePath());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => { applyWorkbenchTheme(theme); }, [theme]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3400); return () => window.clearTimeout(timer); }, [toast]);

  const fallback = error ? <RouteError message={error} retry={() => void load()}/> : <RouteSkeleton/>;
  const writeDemo = async (_action: WriteAction) => { demoAction(); };
  const routeContent = () => {
    if (path === "/schedule") return data ? <LazySchedulePage data={data} onWritePreview={writeDemo}/> : fallback;
    if (path === "/projects") return data ? <LazyProjectsPage data={data} onWritePreview={writeDemo}/> : fallback;
    if (path === "/health") return <HealthRoute demoAction={demoAction}/>;
    if (path === "/languages") return <LanguagesRoute demoAction={demoAction}/>;
    if (path === "/markets") return <MarketsRoute/>;
    if (path === "/topics") return <TopicsRoute demoAction={demoAction}/>;
    if (path === "/library") return <LibraryRoute/>;
    if (path === "/markets/assets") return <LazyAssetsPage demoMode/>;
    if (path === "/tools") return <LazyToolsPage/>;
    return data ? <HomePage data={data} calendar={calendar} secretaryName="Infans Studio" active refreshSummary={load}/> : fallback;
  };

  const scene = getPageScene(theme, path);
  const sceneStyle = { "--page-scene": `url("${scene.image}")`, "--page-scene-position": scene.position, "--page-scene-shade": scene.shade || "linear-gradient(90deg,rgba(4,10,13,.98) 0%,rgba(5,12,15,.91) 37%,rgba(5,12,15,.56) 63%,rgba(4,10,13,.20) 100%)" } as CSSProperties;
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const todoCount = data ? data.projectManagement ? buildCurrentExecutionRows(data.projectManagement.currentTodos).length + buildAiExecutionRows(data.projectManagement.currentTodos).length : data.todo.today.filter((item) => !item.done && isTodoInNextTwoTokyoDays(item.text, today)).length : 0;
  const eventCount = calendar.events.filter((event) => isNearTermTokyoInstant(event.start)).length;
  const homeIntro = <div className="home-intro"><h2>{greeting}，欢迎来到 Studio</h2><div><span>近 2 日 {eventCount} 项日程</span><span>{todoCount} 项待处理</span></div></div>;
  const moreActive = MORE_NAV_ITEMS.some((item) => path === item.path);
  const handleHomeClick = (event: ReactMouseEvent<HTMLAnchorElement>) => { if (path !== "/") { softNavigate(event, "/"); return; } event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return <div className={`app-shell${data ? " is-ready" : " is-booting"}`} data-theme={theme} style={sceneStyle}>
    <a className="skip-link" href="#main-content">跳到主内容</a>
    <aside className="sidebar">
      <div className="brand"><img className="studio-mark" src="/infans-studio-logo.v2.png" alt="" aria-hidden="true"/><a className="brand-home" href="/" onClick={handleHomeClick}><strong>Infans Studio</strong><small><span>清洁版</span></small></a></div>
      <nav className="sidebar-nav-desktop">{NAV_ITEMS.map((item) => <a className={path === item.path ? "active" : ""} href={item.path} key={item.path} onClick={item.path === "/" ? handleHomeClick : (event) => softNavigate(event, item.path)}><item.icon size={17}/><span>{item.label}</span><small>{item.index}</small></a>)}</nav>
      <nav className="sidebar-nav-mobile" aria-label="手机导航">{PRIMARY_NAV_ITEMS.map((item) => <a className={path === item.path ? "active" : ""} href={item.path} key={item.path} onClick={(event) => { setMoreOpen(false); if (item.path === "/") handleHomeClick(event); else softNavigate(event, item.path); }}><item.icon size={17}/><span>{item.label}</span></a>)}<button type="button" className={`nav-more${moreOpen || moreActive ? " active" : ""}`} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={17}/><span>更多</span></button></nav>
      <div className="sidebar-footer"><ProfileSwitcher/><ThemeSwitch theme={theme} refreshing={refreshing} onThemeChange={setTheme} onReload={() => void refresh()}/><div className="studio-demo-note">所有人物、项目与财务均为演示数据</div></div>
    </aside>
    <main id="main-content" className="workspace" tabIndex={-1}>
      <div className="workspace-backdrop" aria-hidden="true"><div className="workspace-backdrop-scene"/><div className="workspace-backdrop-veil"/><div className="workspace-backdrop-fireflies"/></div>
      <header className={`topbar${path === "/" ? " topbar-home" : ""}`}>{path === "/" ? homeIntro : <div className="page-heading"><h1>{PAGE_META[path].title}</h1><p>{PAGE_META[path].description}</p></div>}<TopbarStatus/><div className="top-actions"><span className="studio-demo-badge">DEMO</span></div></header>
      <div className="page-stack"><div className="page is-active"><Suspense fallback={<RouteSkeleton/>}>{routeContent()}</Suspense></div></div>
    </main>
    <AnimatePresence>{moreOpen ? <motion.div className="more-sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setMoreOpen(false)}><motion.div className="more-sheet" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}><header><strong>更多</strong><button type="button" onClick={() => setMoreOpen(false)}><X size={17}/></button></header><section className="more-sheet-grid">{MORE_NAV_ITEMS.map((item) => <a className={path === item.path ? "active" : ""} href={item.path} key={item.path} onClick={(event) => { setMoreOpen(false); softNavigate(event, item.path); }}><item.icon size={20}/><span>{item.label}</span></a>)}</section><div className="more-sheet-theme"><ThemeSwitch className="theme-switch-mobile" theme={theme} refreshing={refreshing} onThemeChange={setTheme} onReload={() => void refresh()}/></div></motion.div></motion.div> : null}</AnimatePresence>
    {toast ? <div className={`toast${toast.includes("失败") ? " error" : ""}`} role="status">{toast.includes("失败") ? <AlertTriangle size={15}/> : <CheckCircle2 size={15}/>} {toast}</div> : null}
  </div>;
}

const appRoot = createRoot(document.getElementById("root")!);
appRoot.render(<MotionConfig reducedMotion="user"><App/></MotionConfig>);
