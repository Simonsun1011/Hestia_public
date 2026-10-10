import { ExternalLink, Sparkles } from "lucide-react";
import type { JapaneseExploration } from "../../types";
import { Card, Empty } from "../../page-shared";
import { CourseProgressBooks } from "./CourseProgressBooks";
import { ProgressRail } from "./ProgressRail";
import { ALL_LEVELS, pct } from "./shared";

type CourseEvidence = JapaneseExploration["courseProgress"]["recentEvidence"][number];

function courseEvidenceLabel(item: CourseEvidence) {
  const book = item.lessonId.includes("-chukyu-") ? "初中級" : "初級";
  const lesson = Number(item.lessonId.match(/-(\d+)$/)?.[1] || 0);
  return `${book} · 第 ${lesson}-${item.st} 课`;
}

function modalityLabel(item: CourseEvidence) {
  return [
    item.modalities.speaking ? "开口练过" : "",
    item.modalities.listening ? "做过听辨" : "",
    item.modalities.output ? "自己表达过" : "",
  ].filter(Boolean).join(" · ");
}

export function ExplorationMatrix({
  exploration,
  panel,
  selectedLevels,
  onToggleLevel,
  onSelectMode,
  onStartSpecialLevels,
  onStartMistakeLevels,
  busy,
  error,
}: {
  exploration: JapaneseExploration;
  panel: "special" | "mistake" | null;
  selectedLevels: string[];
  onToggleLevel: (level: string) => void;
  onSelectMode: (kind: "formal" | "special" | "mistake") => void;
  onStartSpecialLevels: () => void;
  onStartMistakeLevels: () => void;
  busy?: boolean;
  error?: string;
}) {
  const scores = exploration.scores;
  const course = exploration.courseProgress;
  const summary = course.summary;
  const mockCount = scores?.mockCount ?? 0;
  const modes = [
    { kind: "formal" as const, label: "真题练习" },
    { kind: "special" as const, label: "专项练习" },
    { kind: "mistake" as const, label: "错题练习" },
  ];

  return <div className="exploration-board">
    <Card className="exploration-hero exploration-course-hero">
      <div className="exploration-hero-copy">
        <span className="exploration-eyebrow">教材学习进度</span>
        <h2>探索成就</h2>
        <div className="exploration-course-summary">
          <div className="exploration-course-total">
            <strong>{summary.masteredSt}<small> / {summary.stTotal} 个小节</small></strong>
            <span>达到掌握以上</span>
          </div>
          <div className="exploration-ability-grid" aria-label="教材学习概况">
            <div><strong>{summary.stWithEvidence}</strong><span>有分级记录</span></div>
            <div><strong>{summary.speakingSt}</strong><span>开口练过</span></div>
            <div><strong>{summary.listeningSt}</strong><span>做过听辨</span></div>
            <div><strong>{summary.outputSt}</strong><span>自己表达过</span></div>
          </div>
        </div>
      </div>
    </Card>

    <Card className="course-progress-card course-progress-card--compact">
      <div className="exploration-ladder-head">
        <div><h2>教材课次</h2></div>
        <span>每课一条进度；只有核验过的真实学习记录才会点亮</span>
      </div>
      <CourseProgressBooks books={course.books}/>
    </Card>

    <Card className="exploration-ladder exploration-jlpt-reference">
      <div className="exploration-ladder-head">
        <div>
          <span className="exploration-eyebrow">次级参考</span>
          <h2>JLPT 进度与考核</h2>
        </div>
        <span>词汇和考试成绩不会自动算成教材已经学过</span>
      </div>

      <div className="exploration-jlpt-summary">
        <div><strong>{pct(scores?.vocab)}</strong><span>词汇</span></div>
        <div><strong>{pct(scores?.grammar)}</strong><span>文法</span></div>
        <div><strong>{exploration.readingMileage?.totalPassages ?? 0} <small>篇</small></strong><span>阅读</span></div>
        <div><strong>—</strong><span>听力 · 尚无正式记录</span></div>
      </div>
      <p className="exploration-jlpt-assessment">
        <span>考核参考 {pct(scores?.total)}</span>
        <span>全卷 {pct(scores?.mock)} · {mockCount}/3{!mockCount ? " · 上限 80%" : ""}</span>
      </p>

      {!scores?.mistakeAligned ? <p className="muted">⚠ 错题 md 与 json 未对齐（{scores?.mdActiveMistakes}/{scores?.stateActiveMistakes}）</p> : null}

      <div className="exploration-hero-actions">
        {modes.map((mode) => (
          <button type="button" key={mode.kind} className={panel === mode.kind ? "exam-chip primary" : "exam-chip"} onClick={() => onSelectMode(mode.kind)}>
            {mode.kind === "formal" ? <ExternalLink size={14}/> : <Sparkles size={14}/>} {mode.label}
          </button>
        ))}
      </div>

      {panel === "special" || panel === "mistake" ? (
        <div className="exploration-level-panel">
          <p>{panel === "special" ? "专项：多选级别后开考。" : "错题：多选级别后开考；不选时默认全部。"}</p>
          <div className="exam-level-picks" aria-label="级别多选">
            {ALL_LEVELS.map((level) => <button key={level} type="button" className={selectedLevels.includes(level) ? "active" : ""} onClick={() => onToggleLevel(level)}>{level}</button>)}
          </div>
          <div className="exploration-hero-actions">
            <button type="button" className="exam-chip primary" disabled={busy} onClick={() => { if (panel === "special") onStartSpecialLevels(); else onStartMistakeLevels(); }}>
              {busy ? "正在出题…" : panel === "special" ? "开始专项" : "开始错题"}
            </button>
          </div>
          {error ? <Empty>{error}</Empty> : null}
        </div>
      ) : null}

      <div className="exploration-levels">
        {exploration.levels.map((row) => (
          <article className="exploration-level" key={row.level}>
            <header><strong>{row.level}</strong><span>{row.grammar.stageLabel || "门外汉"}</span></header>
            <ProgressRail value={row.vocab.progress ?? (row.vocab.total ? (row.vocab.learned || 0) / row.vocab.total : 0)} label="词汇" sub={row.vocab.label}/>
            <ProgressRail value={row.grammar.progress ?? 0} label="文法" sub={row.grammar.label}/>
            <div className="exploration-reading-note">{row.reading.label || "阅读练习栏 · 不计入探索成就"}</div>
          </article>
        ))}
      </div>

    </Card>

    {course.recentEvidence.length ? (
      <Card className="exploration-log">
        <div className="card-title"><div><h2>最近真正练过的内容</h2></div></div>
        <ul>{course.recentEvidence.map((item) => (
          <li key={item.recordId}>
            <strong>{item.date || item.verifiedAt}</strong>
            <span>{courseEvidenceLabel(item)} · {modalityLabel(item)}</span>
            <em>{item.level >= 2 ? "已经较熟" : "正在练"}</em>
          </li>
        ))}</ul>
      </Card>
    ) : null}

    {exploration.recentSessions.length ? (
      <Card className="exploration-log exploration-jlpt-log">
        <div className="card-title"><div><h2>最近 JLPT 考核</h2></div></div>
        <ul>{exploration.recentSessions.slice(0, 6).map((item) => (
          <li key={`${item.at}-${item.level}-${item.track}`}>
            <strong>{item.at}</strong><span>{item.level} · {item.track}</span><em>{item.correct != null && item.total != null ? `${item.correct}/${item.total}` : "—"}</em>
          </li>
        ))}</ul>
      </Card>
    ) : null}
  </div>;
}
