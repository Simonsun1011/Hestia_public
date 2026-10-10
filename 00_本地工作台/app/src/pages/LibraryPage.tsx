import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Film, Layers3, LibraryBig, LoaderCircle, Search, Sparkles } from "lucide-react";
import type { LibraryItem, LibrarySectionData } from "../types";
import { Empty, SourceLink } from "../page-shared";
import { isDisplayModeHiddenLibraryKind } from "../display-mode";

const Reader = lazy(() => import("./Reader"));
type LibraryKind = "game" | "animation" | "screen" | "book" | "writing";
type GameView = "culture" | "collection";
type MediaView = "collection" | "influence" | "recommendations";

const kindOrder: LibraryKind[] = ["game", "animation", "screen", "book", "writing"];
const kindNames: Record<LibraryKind, string> = {
  game: "游戏",
  animation: "动漫",
  screen: "影视",
  book: "书籍",
  writing: "我的写作",
};

/** 游戏平台筛选：有无条目都显示，方便以后补 PS / iOS */
const gamePlatformOrder = ["Steam", "NS", "PS", "PC客户端", "iOS", "其他"] as const;

function readLibrarySearch(displayMode = false) {
  const params = new URLSearchParams(window.location.search);
  const open = params.get("open");
  const kindParam = params.get("kind");
  const requestedKind: LibraryKind =
    kindParam === "book" || kindParam === "writing" || kindParam === "game" || kindParam === "animation" || kindParam === "screen"
      ? kindParam
      : open
        ? "writing"
        : "game";
  const writingHidden = displayMode && isDisplayModeHiddenLibraryKind(requestedKind);
  return {
    open: writingHidden ? null : open,
    kind: writingHidden ? "game" as const : requestedKind,
    query: params.get("q") ?? "",
    platform: params.get("platform") || "全部",
    region: params.get("region") || "全部",
    view: (params.get("view") === "culture" ? "culture" : "collection") as GameView,
    mediaView: (params.get("view") === "influence" || params.get("view") === "recommendations"
      ? params.get("view")
      : "collection") as MediaView,
  };
}

function writeLibraryOpen(id: string | null, kind: LibraryKind = "writing") {
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set("open", id);
    if (kind === "game") {
      url.searchParams.set("kind", "game");
      url.searchParams.set("view", "culture");
    } else {
      url.searchParams.set("kind", kind);
    }
  } else {
    url.searchParams.delete("open");
  }
  const qs = url.searchParams.toString();
  window.history.replaceState({}, "", qs ? `${url.pathname}?${qs}` : url.pathname);
}

function palette(seed: number) {
  const colors = [
    ["#243e42", "#78c5bc"],
    ["#4a332d", "#d6a26f"],
    ["#30384d", "#8ea9d5"],
    ["#3e343f", "#c79bb8"],
    ["#39402d", "#abbc72"],
    ["#423d32", "#d4c49a"],
  ];
  return colors[seed % colors.length];
}

function gameReleaseLabel(date?: string) {
  if (!date || date === "未标日期") return "发售未标";
  return date;
}

function CollectionCard({ item, onOpen }: { item: LibraryItem; onOpen?: () => void }) {
  const [base, accent] = palette(item.coverSeed);
  const [coverFailed, setCoverFailed] = useState(false);
  const hasCover = item.kind === "game" && Boolean(item.coverUrl) && !coverFailed;
  const openExternal = item.kind === "game" && item.externalUrl
    ? () => { window.open(item.externalUrl, "_blank", "noopener,noreferrer"); }
    : onOpen;

  const body = <>
    <div className="collection-top">
      <span>{item.kind === "game" ? gameReleaseLabel(item.date) : item.category}</span>
      <small>
        {item.kind === "game"
          ? (item.medium && item.medium !== "Steam" ? item.medium : "")
          : (item.date || item.status)}
      </small>
    </div>
    <div className="collection-copy">
      {item.kind === "game"
        ? <ScrollingPosterTitle title={item.title} />
        : <h3>{item.title}</h3>}
      {item.kind === "game"
        ? null
        : item.author ? <p>{item.author}</p> : <p>{item.description}</p>}
    </div>
    <footer>
      <span>{item.status}</span>
      {item.readTime
        ? <small>{item.readTime} 分钟</small>
        : <small>{item.kind === "game" ? item.category : item.tags[0]}</small>}
    </footer>
  </>;

  return (
    <div
      className={`collection-item kind-${item.kind}${hasCover ? " has-cover" : ""}${openExternal ? " openable" : ""}`}
      style={{ "--cover": base, "--cover-accent": accent } as React.CSSProperties}
    >
      {hasCover ? (
        <img
          className="collection-cover"
          src={item.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <div className="card-spine" aria-hidden="true" />
      )}
      {openExternal
        ? <button className="collection-card-body" type="button" onClick={openExternal}>{body}</button>
        : <div className="collection-card-body">{body}</div>}
    </div>
  );
}

function ScrollingPosterTitle({ title }: { title: string }) {
  const viewportRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return undefined;

    let frame = 0;
    let active = true;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (active) setScrolling(text.scrollWidth > viewport.clientWidth + 1);
      });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(text);
    void document.fonts?.ready.then(measure);
    measure();

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [title]);

  const duration = Math.max(9, Math.min(18, title.length * 0.72));
  return (
    <h3
      ref={viewportRef}
      className={`anime-poster-title${scrolling ? " is-scrolling" : ""}`}
      title={title}
      tabIndex={scrolling ? 0 : undefined}
    >
      <span
        className="anime-poster-title-track"
        style={{ "--anime-title-duration": `${duration}s` } as React.CSSProperties}
      >
        <span ref={textRef} className="anime-poster-title-copy">{title}</span>
        {scrolling ? <span className="anime-poster-title-copy" aria-hidden="true">{title}</span> : null}
      </span>
    </h3>
  );
}

function MediaPosterCard({ item, note = "" }: { item: LibraryItem; note?: string }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [base, accent] = palette(item.coverSeed);
  const hasCover = Boolean(item.coverUrl) && !coverFailed;
  const meta = [item.region || item.category, item.primaryGenre].filter(Boolean);
  return (
    <article
      className={`anime-poster-card${note ? " curated" : ""}`}
      style={{ "--anime-cover": base, "--anime-accent": accent } as React.CSSProperties}
      aria-label={[item.title, item.releaseYear, ...meta, note].filter(Boolean).join("，")}
    >
      <div className={`anime-poster-art${hasCover ? " has-image" : ""}`} aria-hidden="true">
        {hasCover ? (
          <img
            src={item.coverUrl}
            alt=""
            width={400}
            height={500}
            loading="lazy"
            decoding="async"
            onError={() => setCoverFailed(true)}
          />
        ) : null}
        <i /><i /><i />
        <span>{item.releaseYear ?? item.category}</span>
      </div>
      <div className="anime-poster-copy">
        <ScrollingPosterTitle title={item.title} />
        {meta.length ? <p>{meta.map((part) => <span key={part}>{part}</span>)}</p> : null}
        {note ? <blockquote>{note}</blockquote> : null}
      </div>
    </article>
  );
}

const mediaViewNames: Array<{ id: MediaView; label: string }> = [
  { id: "collection", label: "作品库" },
  { id: "influence", label: "影响我的" },
  { id: "recommendations", label: "我的推荐" },
];

const animeGenreOrder = ["历史修仙", "科幻机甲", "悬疑心理", "运动竞技", "校园恋爱", "日常治愈", "儿童合家欢", "战斗热血", "奇幻冒险"];
const animePeriodStart = (year: number) => Math.floor(year / 5) * 5;
const animePeriodLabel = (start: number) => `${start}—${start + 4}`;

export default function LibraryPage({ data, displayMode = false }: { data: LibrarySectionData; displayMode?: boolean }) {
  const [initial] = useState(() => readLibrarySearch(displayMode));
  const [kind, setKind] = useState<LibraryKind>(initial.kind);
  const [query, setQuery] = useState(initial.query);
  const [category, setCategory] = useState(initial.platform);
  const [region, setRegion] = useState(initial.region);
  const [openId, setOpenId] = useState<string | null>(initial.open);
  const [showAll, setShowAll] = useState(false);
  const [gameView, setGameView] = useState<GameView>(initial.view);
  const [mediaView, setMediaView] = useState<MediaView>(initial.mediaView);
  const [animePeriod, setAnimePeriod] = useState("全部年份");
  const [animeGenre, setAnimeGenre] = useState("全部类型");

  useEffect(() => {
    const onPop = () => {
      const next = readLibrarySearch(displayMode);
      setKind(next.kind);
      setQuery(next.query);
      setCategory(next.platform);
      setRegion(next.region);
      setOpenId(next.open);
      setGameView(next.view);
      setMediaView(next.mediaView);
      setAnimePeriod("全部年份");
      setAnimeGenre("全部类型");
      setShowAll(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [displayMode]);

  useEffect(() => {
    if (!displayMode) return;
    const params = new URLSearchParams(window.location.search);
    const requestedKind = params.get("kind");
    const writingRequested = requestedKind === "writing" || (!requestedKind && params.has("open"));
    if (kind === "writing") {
      setKind("game");
      setOpenId(null);
      setCategory("全部");
      setShowAll(false);
    }
    if (writingRequested) {
      params.delete("kind");
      params.delete("open");
      params.delete("view");
      const queryString = params.toString();
      window.history.replaceState({}, "", queryString ? `/library?${queryString}` : "/library");
    }
  }, [displayMode, kind]);

  const openWriting = (id: string) => {
    if (displayMode) return;
    setKind("writing");
    setOpenId(id);
    writeLibraryOpen(id);
  };
  const openCulture = (id: string) => {
    setKind("game");
    setGameView("culture");
    setOpenId(id);
    writeLibraryOpen(id, "game");
  };
  const closeReader = () => {
    setOpenId(null);
    writeLibraryOpen(null);
  };
  const moveReader = (id: string) => {
    if (displayMode && kind === "writing") return;
    setOpenId(id);
    writeLibraryOpen(id);
  };

  const visibleItems = useMemo(
    () => displayMode ? data.items.filter((item) => !isDisplayModeHiddenLibraryKind(item.kind)) : data.items,
    [data.items, displayMode],
  );
  const base = useMemo(() => visibleItems.filter((x) => x.kind === kind), [kind, visibleItems]);
  const categories = kind === "game"
    ? ["全部", ...gamePlatformOrder]
    : kind === "animation"
      ? ["全部", "看过", "正在看", "想看"]
    : kind === "screen"
      ? ["全部", "电影", "剧集", "纪录片"]
      : ["全部", ...new Set(base.map((x) => x.category))];
  const filtered = useMemo(() => base.filter((x) => (
    (category === "全部" || (kind === "animation" ? x.viewingStatus === category : x.category === category))
    && (kind !== "animation" || region === "全部" || x.region === region)
    && `${x.title} ${x.author ?? ""} ${x.description} ${x.tags.join(" ")} ${x.status} ${x.medium ?? ""} ${x.region ?? ""} ${x.releaseYear ?? ""} ${x.primaryGenre ?? ""}`.toLowerCase().includes(query.toLowerCase())
  )), [base, category, kind, query, region]);
  const ordered = kind === "game"
    ? [...filtered].sort((a, b) => {
      const play = (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0);
      if (play) return play;
      const handA = a.tags.includes("手录") ? 1 : 0;
      const handB = b.tags.includes("手录") ? 1 : 0;
      if (handA !== handB) return handB - handA;
      return a.title.localeCompare(b.title, "zh-CN");
    })
    : filtered;
  const shown = showAll ? ordered : ordered.slice(0, kind === "game" ? 48 : 36);
  const counts = {
    writing: visibleItems.filter((x) => x.kind === "writing").length,
    book: visibleItems.filter((x) => x.kind === "book").length,
    game: visibleItems.filter((x) => x.kind === "game").length,
    animation: visibleItems.filter((x) => x.kind === "animation").length,
    screen: visibleItems.filter((x) => x.kind === "screen").length,
  };
  const platformCounts = Object.fromEntries(
    gamePlatformOrder.map((platform) => [
      platform,
      visibleItems.filter((x) => x.kind === "game" && x.category === platform).length,
    ]),
  ) as Record<(typeof gamePlatformOrder)[number], number>;
  const unit = kind === "game" ? "款" : kind === "animation" || kind === "screen" ? "部" : "篇";
  const gameCultureCards = data.cultureArchive.cards.filter((card) => card.medium === "游戏");
  const animePeriodOptions = useMemo(() => [...new Set(
    base.filter((item) => item.releaseYear).map((item) => animePeriodStart(item.releaseYear ?? 0)),
  )].sort((a, b) => b - a), [base]);
  const animeItems = useMemo(
    () => filtered
      .filter((item) => animePeriod === "全部年份" || animePeriodStart(item.releaseYear ?? 0) === Number(animePeriod))
      .filter((item) => animeGenre === "全部类型" || item.primaryGenre === animeGenre)
      .sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || a.title.localeCompare(b.title, "zh-CN")),
    [animePeriod, animeGenre, filtered],
  );
  const animePeriodGroups = useMemo(() => {
    const groups = new Map<number, LibraryItem[]>();
    for (const item of animeItems) {
      const period = animePeriodStart(item.releaseYear ?? 0);
      if (!groups.has(period)) groups.set(period, []);
      groups.get(period)?.push(item);
    }
    return [...groups.entries()].sort(([left], [right]) => right - left);
  }, [animeItems]);
  const mediaCollectionItems = kind === "animation" ? animeItems : filtered;
  const curatedMediaItems = base.filter((item) => (
    mediaView === "influence" ? item.influence : item.recommended
  ));
  const mediaVisibleItems = mediaView === "collection" ? mediaCollectionItems : curatedMediaItems;

  const reader = openId && !(displayMode && kind === "writing") ? (
    <Suspense fallback={<div className="reader-loading"><LoaderCircle className="spin" />正在打开…</div>}>
      <Reader key={openId} id={openId} onClose={closeReader} onMove={moveReader} />
    </Suspense>
  ) : null;

  const setGameDisplay = (view: GameView) => {
    setGameView(view);
    setShowAll(false);
    const next = new URLSearchParams(window.location.search);
    next.delete("open");
    if (view === "culture") {
      next.set("view", "culture");
      next.delete("platform");
      setCategory("全部");
    } else {
      next.set("view", "collection");
    }
    const qs = next.toString();
    window.history.replaceState({}, "", qs ? `/library?${qs}` : "/library");
  };

  const setMediaDisplay = (view: MediaView) => {
    setMediaView(view);
    const next = new URLSearchParams(window.location.search);
    next.delete("open");
    if (view === "collection") next.delete("view");
    else next.set("view", view);
    const qs = next.toString();
    window.history.replaceState({}, "", qs ? `/library?${qs}` : "/library");
  };

  return (
    <>
      <div className="library-page">
        <div className="library-tabs library-tabs-5">
          {kindOrder.map((key) => (
            <button
              className={kind === key ? "active" : ""}
              key={key}
              disabled={displayMode && isDisplayModeHiddenLibraryKind(key)}
              onClick={() => {
                if (displayMode && isDisplayModeHiddenLibraryKind(key)) return;
                setKind(key);
                setCategory("全部");
                setRegion("全部");
                setShowAll(false);
                if (key === "animation" || key === "screen") {
                  setMediaView("collection");
                  setAnimePeriod("全部年份");
                  setAnimeGenre("全部类型");
                }
                if (key === "game") setGameView("collection");
                const next = new URLSearchParams(window.location.search);
                if (key === "game") {
                  next.delete("kind");
                  next.delete("view");
                } else {
                  next.set("kind", key);
                  next.delete("view");
                }
                next.delete("platform");
                next.delete("open");
                setOpenId(null);
                const qs = next.toString();
                window.history.replaceState({}, "", qs ? `/library?${qs}` : "/library");
              }}
            >
              <span>{kindNames[key]}</span>
              {displayMode && isDisplayModeHiddenLibraryKind(key) ? null : <strong>{counts[key]}</strong>}
            </button>
          ))}
        </div>
        {kind === "game" ? (
          <div className="game-view-switch" aria-label="游戏馆藏视图">
            <button className={gameView === "collection" ? "active" : ""} type="button" onClick={() => setGameDisplay("collection")}>
              <LibraryBig aria-hidden="true" size={15} /><span>游戏库</span>
            </button>
            <button className={gameView === "culture" ? "active" : ""} type="button" onClick={() => setGameDisplay("culture")}>
              <Layers3 aria-hidden="true" size={15} /><span>影响过我的作品</span>
            </button>
          </div>
        ) : null}
        {kind === "animation" || kind === "screen" ? (
          <div className="game-view-switch media-view-switch" aria-label={`${kindNames[kind]}馆藏视图`}>
            {mediaViewNames.map((view) => (
              <button
                aria-pressed={mediaView === view.id}
                className={mediaView === view.id ? "active" : ""}
                key={view.id}
                type="button"
                onClick={() => setMediaDisplay(view.id)}
              >
                {view.id === "collection" ? <LibraryBig aria-hidden="true" size={15} /> : null}
                {view.id === "influence" ? <Layers3 aria-hidden="true" size={15} /> : null}
                {view.id === "recommendations" ? <Sparkles aria-hidden="true" size={15} /> : null}
                <span>{view.id === "collection" ? `${kindNames[kind]}库` : view.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        {kind === "game" && gameView === "culture" ? (
          <section className="culture-reflections">
            <header>
              <div>
                <h2>影响过我的作品</h2>
                <p>不必补全。某部作品重新浮上来时，只问自己一个具体问题。</p>
              </div>
              <SourceLink path={data.cultureArchive.paths.gameOverview} label="查看全部记录" />
            </header>
            <div className="culture-reflection-grid">
              {gameCultureCards.map((card) => (
                <article className="culture-reflection-card" key={card.id}>
                  <h3>{card.title}</h3>
                  <blockquote>{card.originalJudgment}</blockquote>
                  {card.prompts[0] ? (
                    <div className="culture-reflection-prompt">
                      <small>想一想</small>
                      <p>{card.prompts[0]}</p>
                    </div>
                  ) : null}
                  <footer>
                    <button type="button" onClick={() => openCulture(card.id)}>查看记录 <ArrowRight size={14} /></button>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        ) : kind === "animation" || kind === "screen" ? (
          <section className="screen-library">
            {mediaView === "collection" ? (
              <div className="library-toolbar screen-toolbar">
                <div className="library-search">
                  <Search aria-hidden="true" size={15} />
                  <input
                    name="media-library-search"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label={`搜索${kindNames[kind]}`}
                    placeholder={`搜索${kindNames[kind]}…`}
                  />
                </div>
                <div className="screen-filter-groups">
                  {kind === "animation" ? (
                    <div className="category-scroll" aria-label="动漫地区筛选">
                      {["全部", "日漫", "国漫", "其他引进"].map((x) => (
                        <button className={region === x ? "active" : ""} key={x} onClick={() => { setRegion(x); setShowAll(false); }}>
                          {x}{x !== "全部" ? ` ${base.filter((item) => item.region === x).length}` : ""}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="category-scroll" aria-label={kind === "animation" ? "观看状态筛选" : "影视类型筛选"}>
                    {categories.map((x) => (
                      <button className={category === x ? "active" : ""} key={x} onClick={() => { setCategory(x); setShowAll(false); }}>
                        {x}{x !== "全部" ? ` ${base.filter((item) => kind === "animation" ? item.viewingStatus === x : item.category === x).length}` : ""}
                      </button>
                    ))}
                  </div>
                  {kind === "animation" ? (
                    <div className="anime-select-filters" aria-label="年份区间与主类型筛选">
                      <select aria-label="动漫年份区间" value={animePeriod} onChange={(event) => setAnimePeriod(event.target.value)}>
                        <option>全部年份</option>
                        {animePeriodOptions.map((period) => <option value={period} key={period}>{animePeriodLabel(period)}</option>)}
                      </select>
                      <select aria-label="动漫主类型" value={animeGenre} onChange={(event) => setAnimeGenre(event.target.value)}>
                        <option>全部类型</option>
                        {animeGenreOrder.map((genre) => <option value={genre} key={genre}>{genre}</option>)}
                      </select>
                    </div>
                  ) : null}
                </div>
                <span>{mediaCollectionItems.length} / {filtered.length} {unit}</span>
              </div>
            ) : (
              <p className="media-curated-note">
                {mediaView === "influence"
                  ? "只展示你已经明确说过影响在哪里的作品。"
                  : "只展示你已经明确说过喜欢或值得推荐的作品。"}
              </p>
            )}
            {mediaVisibleItems.length && mediaView === "collection" && kind === "animation" ? (
              <div className="media-decade-list">
                {animePeriodGroups.map(([period, items]) => (
                  <section className="media-poster-shelf media-decade-shelf" key={period}>
                    <header>
                      <strong>{animePeriodLabel(period)}</strong>
                      <span>{items.length} 部</span>
                    </header>
                    <div className="media-poster-strip">
                      {items.map((item) => <MediaPosterCard item={item} key={item.id} />)}
                    </div>
                  </section>
                ))}
              </div>
            ) : mediaVisibleItems.length ? (
              <div className="media-poster-shelf">
                <div className="media-poster-strip">
                  {mediaVisibleItems.map((item) => (
                    <MediaPosterCard item={item} key={item.id} note={mediaView === "collection" ? "" : item.description} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="screen-empty-frame">
                <Film aria-hidden="true" size={20} />
                <div><strong>这一组还没有作品</strong><span>{mediaView === "collection" ? "换一个筛选条件，就能继续浏览馆藏。" : "等你明确说过以后，再展示在这里。"}</span></div>
              </div>
            )}
          </section>
        ) : (
        <>
        <div className="library-toolbar">
          <div className="library-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`搜索${kindNames[kind]}`}
              placeholder={`搜索${kindNames[kind]}…`}
            />
          </div>
          <div className="category-scroll">
            {categories.map((x) => (
              <button
                className={category === x ? "active" : ""}
                key={x}
                onClick={() => {
                  setCategory(x);
                  setShowAll(false);
                  const next = new URLSearchParams(window.location.search);
                  if (kind === "game") {
                    if (x === "全部") next.delete("platform");
                    else next.set("platform", x);
                    const qs = next.toString();
                    window.history.replaceState({}, "", qs ? `/library?${qs}` : "/library");
                  }
                }}
              >
                {kind === "game" && x !== "全部"
                  ? `${x} ${platformCounts[x as keyof typeof platformCounts] ?? 0}`
                  : x}
              </button>
            ))}
          </div>
          <span>{shown.length} / {filtered.length} {unit}</span>
        </div>
        <div className={`collection-grid${kind === "game" ? " game-grid" : ""}`}>
          {shown.map((item) => (
            <CollectionCard
              key={item.id}
              item={item}
              onOpen={item.kind === "writing" ? () => openWriting(item.id) : undefined}
            />
          ))}
        </div>
        {shown.length < ordered.length
          ? <button className="load-more" onClick={() => setShowAll(true)}>展开全部 {ordered.length} 张馆藏卡牌</button>
          : null}
        {!shown.length ? <Empty>没有符合当前筛选的馆藏。</Empty> : null}
        </>
        )}
      </div>
      {createPortal(reader, document.body)}
    </>
  );
}
