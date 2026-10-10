import { useEffect, useState } from "react";
import { BookOpenText, ChevronDown, ExternalLink, Newspaper, ScrollText, Sparkles } from "lucide-react";
import type { JapaneseExploration } from "../../types";
import { Card, Empty, Kicker, jsonFetch } from "../../page-shared";
import { readLanguageViewPosition, writeLanguageViewPosition } from "./language-view-memory";

type ReadingCategory = "exam" | "news" | "literature";

const READING_CATEGORIES: ReadonlyArray<{ id: ReadingCategory; label: string; note: string }> = [
  { id: "exam", label: "真题阅读", note: "按场次保留真题记录" },
  { id: "news", label: "新闻阅读", note: "日本新闻与时事材料" },
  { id: "literature", label: "赏析阅读", note: "从短童话和名作片段入门" },
];

const LITERATURE_STARTERS = [
  {
    title: "ごん狐",
    author: "新美南吉",
    level: "入门首选",
    note: "叙事直接，对话与动作线清楚，适合分段学习。",
    href: "https://www.aozora.gr.jp/cards/000121/card628.html",
  },
  {
    title: "手袋を買いに",
    author: "新美南吉",
    level: "入门首选",
    note: "场景具体，词汇温和，适合练叙事顺序与对话。",
    href: "https://www.aozora.gr.jp/cards/000121/card637.html",
  },
  {
    title: "注文の多い料理店",
    author: "宮沢賢治",
    level: "入门进阶",
    note: "情节有趣，重复表达多，适合观察语气和双关。",
    href: "https://www.aozora.gr.jp/cards/000081/files/43754_17659.html",
  },
  {
    title: "吾輩は猫である",
    author: "夏目漱石",
    level: "开篇赏析",
    note: "全文对当前偏难，先只学著名开篇和叙述口吻。",
    href: "https://www.aozora.gr.jp/cards/000148/card789.html",
  },
] as const;

export function ReadingBoard({
  exploration,
  onStartPassage,
  onStartRandom,
}: {
  exploration: JapaneseExploration | null | undefined;
  onStartPassage: (passageId: string, meta?: { sitting?: string; title?: string }) => void;
  onStartRandom: (level?: string) => void;
}) {
  const mileage = exploration?.readingMileage;
  const rememberedPosition = readLanguageViewPosition("reading");
  const [category, setCategory] = useState<ReadingCategory>(rememberedPosition?.category || "exam");
  const [library, setLibrary] = useState<{
    sittings: Array<{
      sitting: string;
      title: string;
      passageCount: number;
      questionCount: number;
      passages: Array<{
        id: string;
        sitting: string;
        mondai: number | string;
        section: string;
        title: string;
        preview: string;
        instruction?: string;
        questionCount: number;
        questionIds: Array<number | string>;
      }>;
    }>;
    totalPassages: number;
    totalQuestions: number;
    notes?: string[];
  } | null>(null);
  const [sittingFilter, setSittingFilter] = useState<string>(rememberedPosition?.sitting || "全部");
  const [sittingPickerOpen, setSittingPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    jsonFetch<{ data: NonNullable<typeof library> }>("/api/languages/reading-library?level=N2")
      .then((body) => {
        if (cancelled) return;
        setLibrary(body.data);
        setError("");
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "没读到阅读库");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!library || sittingFilter === "全部") return;
    if (library.sittings.some((row) => row.sitting === sittingFilter)) return;
    setSittingFilter("全部");
    writeLanguageViewPosition("reading", { category, sitting: "全部" });
  }, [category, library, sittingFilter]);

  const sittings = library?.sittings || [];
  const visible = sittingFilter === "全部"
    ? sittings
    : sittings.filter((row) => row.sitting === sittingFilter);

  return <div className="language-layout reading-library">
    <Card className="language-hero language-hero-fade">
      <div className="language-hero-copy">
        <Kicker>阅读看板</Kicker>
        <h2>真题、新闻与赏析阅读</h2>
        <div className="language-hero-grid">
          <div className="language-hero-main">
            <strong>{mileage?.totalQuestions ?? 0}</strong>
            <span>已练题数 · 不计入探索成就</span>
          </div>
          <div className="language-hero-side language-hero-side-4">
            <div><strong>{library?.totalPassages ?? "—"}</strong><span>库内篇目</span></div>
            <div><strong>{library?.totalQuestions ?? "—"}</strong><span>库内题数</span></div>
            <div><strong>{mileage?.totalPassages ?? 0}</strong><span>已练篇目</span></div>
            <div><strong>{mileage?.recent7Days?.length ?? 0}</strong><span>近 7 日有练</span></div>
          </div>
        </div>
        <div className="reading-category-tabs" role="tablist" aria-label="阅读类型">
          {READING_CATEGORIES.map((item) => <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={category === item.id}
            className={category === item.id ? "is-active" : ""}
            onClick={() => {
              setCategory(item.id);
              writeLanguageViewPosition("reading", { category: item.id, sitting: sittingFilter });
            }}
          >
            {item.id === "exam" ? <ScrollText size={16}/> : item.id === "news" ? <Newspaper size={16}/> : <BookOpenText size={16}/>}
            <span><strong>{item.label}</strong><small>{item.note}</small></span>
          </button>)}
        </div>
        {category === "exam" ? <div className="language-hero-actions">
          <button type="button" className="exam-chip primary" onClick={() => onStartRandom("N2")}><Sparkles size={14}/>随便练几篇</button>
        </div> : null}
      </div>
    </Card>

    {category === "exam" ? <Card className="reading-library-board">
      <div className="reading-sitting-nav">
        <div>
          <Kicker>按场次</Kicker>
          <h2>场次卡片</h2>
          <p>{loading ? "正在打开这一场的题…" : `${sittings.length} 场 · 点卡片开考该篇`}</p>
        </div>
        <div className={`reading-sitting-picker ${sittingPickerOpen ? "is-open" : ""}`}>
          <button type="button" className="reading-sitting-trigger" aria-expanded={sittingPickerOpen} onClick={() => setSittingPickerOpen((open) => !open)}>
            <span><small>当前场次</small><strong>{sittingFilter === "全部" ? "全部场次" : sittingFilter}</strong></span>
            <em>{sittings.length} 场可选</em>
            <ChevronDown size={17}/>
          </button>
          {sittingPickerOpen ? <div className="reading-sitting-options" aria-label="场次筛选">
            <button type="button" className={sittingFilter === "全部" ? "active" : ""} onClick={() => {
              setSittingFilter("全部");
              setSittingPickerOpen(false);
              writeLanguageViewPosition("reading", { category, sitting: "全部" });
            }}>全部场次</button>
            {sittings.map((row) => (
              <button type="button" key={row.sitting} className={sittingFilter === row.sitting ? "active" : ""} onClick={() => {
                setSittingFilter(row.sitting);
                setSittingPickerOpen(false);
                writeLanguageViewPosition("reading", { category, sitting: row.sitting });
              }}>
                {row.sitting}
              </button>
            ))}
          </div> : null}
        </div>
      </div>
      {error ? <Empty>{error}</Empty> : null}
      {!error && !loading && !visible.length ? <Empty>还没有校对好的阅读篇目。</Empty> : null}
      {visible.map((row) => (
        <section className="reading-sitting" key={row.sitting}>
          <header>
            <div>
              <span>{row.sitting}</span>
              <h3>{row.title}</h3>
              <small>{row.passageCount} 篇 · {row.questionCount} 题</small>
            </div>
          </header>
          <div className="reading-passage-grid">
            {row.passages.map((passage) => (
              <button
                type="button"
                className="reading-passage-card"
                key={passage.id}
                onClick={() => onStartPassage(passage.id, { sitting: passage.sitting, title: passage.title })}
              >
                <header>
                  <span>{passage.section || `第 ${passage.mondai} 大题`}</span>
                  <em>{passage.questionCount} 题</em>
                </header>
                <strong>{passage.title}</strong>
                <p>{passage.preview}</p>
                <footer>
                  <span>点开作答 · 真题原文</span>
                  <Sparkles size={14}/>
                </footer>
              </button>
            ))}
          </div>
        </section>
      ))}
    </Card> : null}

    {category === "news" ? <Card className="reading-library-board reading-source-empty">
      <Kicker>新闻阅读</Kicker>
      <h2>尚未接入可追溯的新闻原文</h2>
      <p>接入后显示日期、媒体、原文与个人阅读记录。</p>
    </Card> : null}

    {category === "literature" ? <Card className="reading-library-board literature-board">
      <div className="grammar-browser-head">
        <div>
          <Kicker>赏析阅读</Kicker>
          <h2>入门选段</h2>
          <p>先从童话和短开篇开始，实际阅读后再累积记录。</p>
        </div>
      </div>
      <div className="literature-grid">
        {LITERATURE_STARTERS.map((item) => <article key={item.title}>
          <header><span>{item.level}</span><small>{item.author}</small></header>
          <h3 lang="ja">{item.title}</h3>
          <p>{item.note}</p>
          <a href={item.href} target="_blank" rel="noopener noreferrer">青空文库原文 <ExternalLink size={14}/></a>
        </article>)}
      </div>
    </Card> : null}
  </div>;
}
