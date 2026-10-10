import { useEffect, useRef, useState, type ComponentType, type RefObject } from "react";
import { ArrowLeft, BookMarked, CalendarDays, ChevronRight, ExternalLink, EyeOff, Heart, Languages, LoaderCircle, MapPin, RefreshCw, Sparkles, Ticket } from "lucide-react";

import { Card, Empty, Kicker, fmtDateTime, jsonFetch } from "../../page-shared";
import type { JapanActivitiesSnapshot } from "../../types";
import GuideOfficialImage from "./GuideOfficialImage";

type FilterTag = string;
/** 有攻略在生成时，每隔这么久刷新一次看是否完成。 */
const GUIDE_POLL_MS = 8000;

type ActivityGuideComponent = ComponentType<{ id: string; onBack: () => void; backLabel: string }>;
let activityGuidePromise: Promise<{ default: ActivityGuideComponent }> | null = null;

function preloadActivityGuide() {
  activityGuidePromise ||= import("./JapanActivityGuide");
  return activityGuidePromise;
}

function fmtUpdateDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "更新日待补";
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function JapanPlaybookShelf({
  playbooks,
  onOpen,
  carouselRef,
}: {
  playbooks: JapanActivitiesSnapshot["playbooks"];
  onOpen: (id: string) => void;
  carouselRef: RefObject<HTMLOListElement | null>;
}) {
  return (
    <section id="japan-playbook-shelf" className="japan-playbook-shelf-shell" aria-labelledby="japan-playbook-shelf-title">
      <Card className="japan-playbook-shelf">
        <header>
          <div>
            <Kicker>出门前的行动册 · 最近更新在前</Kicker>
            <h3 id="japan-playbook-shelf-title">选择一份攻略</h3>
          </div>
          <div className="japan-playbook-shelf-meta">
            <strong>{playbooks.length} 份</strong>
            <small>向右滑动查看更多 <ChevronRight size={14} aria-hidden="true" /></small>
          </div>
        </header>
        {playbooks.length ? (
          <ol ref={carouselRef} className="japan-playbook-carousel" aria-label="按更新时间从新到旧排列的攻略">
            {playbooks.map((playbook, index) => (
              <li key={playbook.id}>
                <button
                  type="button"
                  className="japan-playbook-card"
                  onClick={() => onOpen(playbook.id)}
                  onPointerEnter={() => { void preloadActivityGuide(); }}
                  onFocus={() => { void preloadActivityGuide(); }}
                >
                  <span className="japan-playbook-card-meta">
                    <span>{index === 0 ? "最近更新" : "继续翻阅"}</span>
                    <time dateTime={playbook.updatedAt}>{fmtUpdateDay(playbook.updatedAt)}</time>
                  </span>
                  <GuideOfficialImage {...playbook} guideId={playbook.id} className="is-playbook-card" />
                  <h3>{playbook.name}</h3>
                  <p>{playbook.dateLabel}</p>
                  <span className="japan-playbook-card-status">{playbook.status}</span>
                  <span className="japan-playbook-card-action">打开完整攻略 <ChevronRight size={16} aria-hidden="true" /></span>
                </button>
              </li>
            ))}
          </ol>
        ) : <Empty>攻略集还是空的。</Empty>}
      </Card>
    </section>
  );
}

export default function JapanActivitiesView({ active, homeRequest = 0 }: { active: boolean; homeRequest?: number }) {
  const [data, setData] = useState<JapanActivitiesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guideId, setGuideId] = useState<string | null>(null);
  const [guideOrigin, setGuideOrigin] = useState<"playbooks" | "activities" | "attended">("playbooks");
  const [GuideView, setGuideView] = useState<ActivityGuideComponent | null>(null);
  const [showPlaybooks, setShowPlaybooks] = useState(false);
  const [savingInterestId, setSavingInterestId] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<FilterTag>("全部");
  const [showHidden, setShowHidden] = useState(false);
  const [requestedGuides, setRequestedGuides] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [collecting, setCollecting] = useState(false);
  const guideInFlight = useRef(new Set<string>());
  const playbookCarouselRef = useRef<HTMLOListElement>(null);
  const playbookScrollLeftRef = useRef(0);
  const pageScrollYRef = useRef(0);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await jsonFetch<JapanActivitiesSnapshot>("/api/tools/japan-activities"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读不到日本活动");
    } finally {
      setLoading(false);
    }
  };

  const setMark = async (activityId: string, mark: { interested: boolean } | { hidden: boolean }) => {
    setSavingInterestId(activityId);
    setError("");
    try {
      setData(await jsonFetch<JapanActivitiesSnapshot>("/api/tools/japan-activities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId, ...mark }),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "没能保存感兴趣状态");
    } finally {
      setSavingInterestId(null);
    }
  };

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active]);

  const generateGuide = async (activityId: string) => {
    // 连点只发一次；跨设备的重复由服务端拒绝
    if (guideInFlight.current.has(activityId)) return;
    guideInFlight.current.add(activityId);
    setNotice("");
    setRequestedGuides((prev) => new Set(prev).add(activityId));
    try {
      await jsonFetch("/api/tools/japan-activities/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId }) });
      setNotice("攻略生成中，一两分钟后出现在卡片上");
    } catch (reason) {
      setRequestedGuides((prev) => { const next = new Set(prev); next.delete(activityId); return next; });
      setNotice(reason instanceof Error ? reason.message : "没能开始生成");
      // 以服务端为准：别处已在生成时，卡片显示「生成中」
      void load();
    } finally {
      guideInFlight.current.delete(activityId);
    }
  };

  const collectNow = async () => {
    setCollecting(true);
    setNotice("");
    try {
      const result = await jsonFetch<{ message: string }>("/api/tools/jobs/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job: "events" }) });
      setNotice(`活动采集${result.message}，完成后点「刷新卡片」`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "没能开始采集");
    } finally {
      setCollecting(false);
    }
  };

  // 有攻略在生成：定时刷新，生成完（hasPlaybook）或失败（不再 running）后停止
  const pendingGuide = Boolean(data?.activities.some((activity) => activity.guideRunning || (requestedGuides.has(activity.id) && !activity.hasPlaybook)));
  useEffect(() => {
    if (!active || !pendingGuide) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await jsonFetch<JapanActivitiesSnapshot>("/api/tools/japan-activities");
        setData(next);
        setRequestedGuides((prev) => {
          const kept = new Set([...prev].filter((id) => { const item = next.activities.find((activity) => activity.id === id); return item && !item.hasPlaybook && item.guideRunning; }));
          return kept.size === prev.size ? prev : kept;
        });
      } catch {
        /* 下一轮再试 */
      }
    }, GUIDE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, pendingGuide]);

  useEffect(() => {
    if (guideId || !showPlaybooks) return;
    const frame = requestAnimationFrame(() => {
      if (playbookCarouselRef.current) playbookCarouselRef.current.scrollLeft = playbookScrollLeftRef.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [guideId, showPlaybooks, data?.playbooks.length]);

  useEffect(() => {
    if (!guideId) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    return () => cancelAnimationFrame(frame);
  }, [guideId]);

  useEffect(() => {
    if (!homeRequest) return;
    setGuideId(null);
    setShowPlaybooks(true);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: pageScrollYRef.current, left: 0, behavior: "auto" })));
  }, [homeRequest]);

  const closeGuide = () => {
    setGuideId(null);
    setShowPlaybooks(true);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: pageScrollYRef.current, left: 0, behavior: "auto" })));
  };

  const openPlaybook = (id: string, origin: "playbooks" | "activities" | "attended" = "playbooks") => {
    pageScrollYRef.current = window.scrollY;
    playbookScrollLeftRef.current = playbookCarouselRef.current?.scrollLeft ?? playbookScrollLeftRef.current;
    setGuideOrigin(origin);
    setGuideId(id);
    void preloadActivityGuide()
      .then((module) => setGuideView(() => module.default))
      .catch((reason) => {
        setGuideId(null);
        setError(reason instanceof Error ? reason.message : "攻略页打不开");
      });
  };

  if (guideId) {
    const backLabel = guideOrigin === "activities" ? "返回未过期活动" : guideOrigin === "attended" ? "返回日本活动" : "返回攻略集";
    return GuideView
      ? <GuideView id={guideId} onBack={closeGuide} backLabel={backLabel} />
      : <div className="activity-guide-detail"><button type="button" className="activity-guide-back" onClick={closeGuide}><ArrowLeft size={16} />{backLabel}</button><Empty>正在小秘书里打开完整攻略。</Empty></div>;
  }

  const filters = data?.filters?.length ? data.filters : ["全部"];
  const activeFilter = filters.includes(filterTag) ? filterTag : "全部";
  const shown = data?.activities.filter((activity) => showHidden || !activity.hidden) ?? [];
  const hiddenCount = data?.activities.filter((activity) => activity.hidden).length ?? 0;
  const visibleActivities = shown.filter((activity) => activeFilter === "全部" || activity.filterTag === activeFilter);
  const filterCount = (tag: FilterTag) => tag === "全部" ? shown.length : shown.filter((activity) => activity.filterTag === tag).length;

  return (
    <section className="japan-activities" aria-labelledby="japan-activities-title">
      <Card className="japan-activities-hero">
        <div>
          <Kicker>每周导览·官方来源</Kicker>
          <h2 id="japan-activities-title">日本活动</h2>
          <p>每周从官方来源自动采集。先翻介绍卡；真想去时点「生成攻略」。</p>
        </div>
        <div className="japan-activities-stamps">
          <div className="japan-activities-stamp">
            <span>{data ? shown.length : "—"}</span>
            <small>未过期的</small>
            <button type="button" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "spin" : ""} size={13} />
              刷新卡片
            </button>
          </div>
          <div className="japan-activities-stamp">
            <span>{data?.playbooks.length ?? "—"}</span>
            <small>攻略集</small>
            <button
              type="button"
              aria-expanded={showPlaybooks}
              aria-controls="japan-playbook-shelf"
              onClick={() => {
                if (showPlaybooks) playbookScrollLeftRef.current = playbookCarouselRef.current?.scrollLeft ?? playbookScrollLeftRef.current;
                setShowPlaybooks((visible) => !visible);
              }}
              disabled={!data?.playbooks.length}
            >
              <BookMarked size={13} />
              {showPlaybooks ? "收起攻略" : "展开攻略"}
            </button>
          </div>
          <div className="japan-activities-stamp">
            <span>{data?.attended.length ?? "—"}</span>
            <small>参加过的</small>
            <button type="button" onClick={() => {
              if (!data?.attended[0]) return;
              pageScrollYRef.current = window.scrollY;
              setShowPlaybooks(true);
              openPlaybook(data.attended[0].id, "attended");
            }} disabled={!data?.attended.length}>
              <Ticket size={13} />
              查看记录
            </button>
          </div>
        </div>
      </Card>

      {showPlaybooks && data ? (
        <JapanPlaybookShelf
          playbooks={data.playbooks}
          carouselRef={playbookCarouselRef}
          onOpen={(id) => openPlaybook(id, "playbooks")}
        />
      ) : null}

      {error ? <div className="vpn-warning"><Ticket size={16} /><div><strong>暂时读不到活动卡</strong><span>{error}</span></div></div> : null}
      {loading && !data ? <Empty>正在读取最新活动。</Empty> : null}

      {data ? (
        <>
          <div className="japan-activities-meta">
            <span>{data.scope}</span>
            <small>原件更新 {fmtDateTime(data.updatedAt)}{data.collectedAt ? ` · 自动采集 ${fmtDateTime(data.collectedAt)}` : ""}</small>
            <button type="button" className="japan-collect-now" onClick={() => void collectNow()} disabled={collecting}>
              <RefreshCw className={collecting ? "spin" : ""} size={13} />立即采集
            </button>
            {hiddenCount ? (
              <button type="button" className="japan-collect-now" aria-pressed={showHidden} onClick={() => setShowHidden((value) => !value)}>
                <EyeOff size={13} />{showHidden ? "收起已隐藏" : `已隐藏 ${hiddenCount}`}
              </button>
            ) : null}
          </div>
          {notice ? <p className="japan-activities-notice" role="status">{notice}</p> : null}
          <div className="japan-activity-filters" role="group" aria-label="按活动类别筛选">
            {filters.map((tag) => (
              <button
                type="button"
                key={tag}
                aria-pressed={activeFilter === tag}
                className={activeFilter === tag ? "is-active" : ""}
                onClick={() => setFilterTag(tag)}
              >
                <span>{tag}</span>
                <small>{filterCount(tag)}</small>
              </button>
            ))}
          </div>
          <div className="japan-activity-grid">
            {visibleActivities.map((activity) => (
              <article className={`japan-activity-ticket${activity.hidden ? " is-hidden" : ""}`} key={activity.id}>
                <div className="japan-activity-date">
                  <CalendarDays size={17} aria-hidden="true" />
                  <span>{activity.dateLabel}</span>
                  <small>{activity.region}</small>
                </div>
                <div className="japan-activity-copy">
                  <header>
                    <div className="japan-activity-tags">
                      <span>{activity.category}</span>
                      <span className={`pressure-${activity.languagePressure}`}><Languages size={12} />语言压力 {activity.languagePressure}</span>
                      {activity.hasPlaybook ? <span className="is-guide-ready"><BookMarked size={12} />攻略已做</span> : null}
                    </div>
                    <div className="japan-activity-marks">
                      <button
                        type="button"
                        className="japan-activity-interest"
                        aria-label={activity.hidden ? "取消隐藏" : "不感兴趣，隐藏"}
                        title={activity.hidden ? "取消隐藏" : "不感兴趣，隐藏"}
                        aria-pressed={activity.hidden}
                        disabled={savingInterestId === activity.id}
                        onClick={() => void setMark(activity.id, { hidden: !activity.hidden })}
                      >
                        <EyeOff size={15} />
                      </button>
                      <button
                        type="button"
                        className={`japan-activity-interest${activity.interested ? " is-interested" : ""}`}
                        aria-label={activity.interested ? "取消感兴趣" : "标记感兴趣"}
                        title={activity.interested ? "取消感兴趣" : "标记感兴趣"}
                        aria-pressed={activity.interested}
                        disabled={savingInterestId === activity.id}
                        onClick={() => void setMark(activity.id, { interested: !activity.interested })}
                      >
                        <Heart size={activity.interested ? 17 : 15} fill={activity.interested ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </header>
                  <h3>{activity.name}</h3>
                  <p className="japan-activity-place"><MapPin size={14} />{activity.place}</p>
                  {activity.origin === "collected" ? (
                    <dl>
                      <div><dt>费用／时间</dt><dd>{activity.cost}<br />{activity.registration}</dd></div>
                      <div><dt>简介</dt><dd>{activity.why}</dd></div>
                    </dl>
                  ) : (
                    <dl>
                      <div><dt>费用／报名</dt><dd>{activity.cost}<br />{activity.registration}</dd></div>
                      <div><dt>语言／中文友好</dt><dd>{activity.language}<br />{activity.chineseFriendly}</dd></div>
                      <div><dt>为什么可能适合你</dt><dd>{activity.why}</dd></div>
                    </dl>
                  )}
                  <footer>
                    <div className="japan-activity-card-actions">
                      {activity.hasPlaybook ? (
                        <button type="button" onClick={() => openPlaybook(activity.id, "activities")}>
                          <BookMarked size={13} />打开攻略
                        </button>
                      ) : activity.guideRunning || requestedGuides.has(activity.id) ? (
                        <button type="button" disabled>
                          <LoaderCircle className="spin" size={13} />攻略生成中
                        </button>
                      ) : (
                        <button type="button" onClick={() => void generateGuide(activity.id)}>
                          <Sparkles size={13} />生成攻略
                        </button>
                      )}
                      <a href={activity.officialUrl} target="_blank" rel="noreferrer">
                        {activity.sourceLabel}<ExternalLink size={13} />
                      </a>
                    </div>
                    <small>核验于 {fmtDateTime(activity.verifiedAt)}</small>
                  </footer>
                </div>
              </article>
            ))}
          </div>
          {!visibleActivities.length ? <Empty>{activeFilter === "全部" ? "目前没有尚未过期的活动。" : `这一轮还没有找到${activeFilter}活动。`}</Empty> : null}
        </>
      ) : null}
    </section>
  );
}
