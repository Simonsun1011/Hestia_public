import { useId, type CSSProperties } from "react";
import type { HealthSectionData } from "../types";
import { Kicker } from "../page-shared";

const RECOVERY_DIMS = [
  { key: "detachmentFail" as const, label: "收工就能放下" },
  { key: "controlLoss" as const, label: "日程未被打乱" },
  { key: "mastery" as const, label: "解决过难事" },
  { key: "relaxation" as const, label: "有过真放松" },
];

/** 近况四维展示顺序：与「有没有真恢复」四格对齐（脱离→控制→掌控→放松） */
const REQ_DIM_ORDER = ["脱离", "控制", "掌控", "放松"];

function sortReqRows<T extends { dim: string }>(rows: T[] | undefined | null): T[] {
  if (!rows?.length) return [];
  return [...rows].sort((a, b) => {
    const ai = REQ_DIM_ORDER.indexOf(a.dim);
    const bi = REQ_DIM_ORDER.indexOf(b.dim);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

function TempBadge() {
  return (
    <span className="temp-test-badge" title="AI 起草 · 非正式 · 可改">
      试稿
    </span>
  );
}

type ReportBlock =
  | { kind: "lead"; text: string }
  | { kind: "dim"; title: string; score: string; tone: "bad" | "mid" | "good" | "neutral"; body: string };

function inferDimTone(title: string, scoreRaw: string): "bad" | "mid" | "good" | "neutral" {
  const nums = [...scoreRaw.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!nums.length) return "neutral";
  if (/受挫|倦怠|回避/.test(title) || (/满足/.test(scoreRaw) && /受挫/.test(scoreRaw))) {
    if (/满足/.test(scoreRaw) && /受挫/.test(scoreRaw) && nums.length >= 2) {
      const met = nums[0];
      const thwarted = nums[1];
      if (thwarted >= 5 || met <= 3) return "bad";
      if (met >= 7 && thwarted <= 3) return "good";
      return "mid";
    }
    const n = nums[0];
    if (/倦怠|受挫/.test(title)) {
      if (n >= 50) return "bad";
      if (n >= 30) return "mid";
      return "good";
    }
  }
  if (/总分|灵活|AAQ/.test(title)) {
    const n = nums[0];
    if (n >= 28) return "bad";
    if (n >= 20) return "mid";
    return "good";
  }
  // 恢复体验等：分越高越好
  const n = nums[0];
  if (n <= 2) return "bad";
  if (n <= 3) return "mid";
  return "good";
}

function parseScaleReport(report = ""): ReportBlock[] {
  const cleaned = report
    .split(/\n/)
    .map((line) => line.replace(/^>\s?/, "").trimEnd())
    .join("\n")
    .replace(/^\s*AI\s*临时试稿[^\n]*/gm, "")
    .trim();
  if (!cleaned) return [];

  const chunks = cleaned.split(/\n(?=【[^】]+】)/);
  const blocks: ReportBlock[] = [];
  for (const chunk of chunks) {
    const match = chunk.match(/^【([^·】]+?)(?:\s*[·・]\s*([^】]+))?】\s*\n?([\s\S]*)$/);
    if (match) {
      const title = match[1].trim();
      const score = (match[2] || "").trim();
      const body = match[3].replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
      blocks.push({
        kind: "dim",
        title,
        score,
        tone: inferDimTone(title, score || title),
        body,
      });
    } else {
      const text = chunk.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ kind: "lead", text });
    }
  }
  return blocks;
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          const inner = part.slice(2, -2);
          // 纯数字不加「关键词」高亮，避免把分数误当成维度名
          if (/^\d+(\.\d+)?$/.test(inner)) return <span key={index}>{inner}</span>;
          return <strong key={index} className="mind-report-em">{inner}</strong>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

/** 量表旁的解读报告：按【维度 · 分】展开，关键词高亮 */
function ScaleReport({
  title,
  period,
  report,
  tempTest,
}: {
  title: string;
  period?: string;
  report?: string;
  tempTest?: boolean;
}) {
  const blocks = parseScaleReport(report || "");
  return (
    <aside className="mind-scale-report">
      <header>
        <div>
          <Kicker>解读</Kicker>
          <h3>{title}</h3>
        </div>
        <div className="mind-scale-report-meta">
          {period ? <span>{period}</span> : null}
          {tempTest ? <TempBadge /> : null}
        </div>
      </header>
      {blocks.length ? (
        <div className="mind-report-body">
          {blocks.map((block, index) =>
            block.kind === "lead" ? (
              <p className="mind-report-lead" key={`lead-${index}`}>
                <RichText text={block.text} />
              </p>
            ) : (
              <section className={`mind-report-dim is-${block.tone}`} key={`${block.title}-${index}`}>
                <header>
                  <strong>{block.title}</strong>
                  {block.score ? <em>{block.score}</em> : null}
                </header>
                <p>
                  <RichText text={block.body} />
                </p>
              </section>
            ),
          )}
        </div>
      ) : (
        <p className="mind-scale-empty">还没有解读</p>
      )}
      {tempTest ? <footer>AI 临时试稿 · 非正式 · 可改</footer> : null}
    </aside>
  );
}

/** 工作强度柱：分越高越满（不是「越好」）；量纲 0–10 */
function workIntensityBarStyle(intensity: number | null, maxHeight = 88) {
  if (intensity == null) return { height: 4 };
  const clamped = Math.max(0, Math.min(10, intensity));
  return { height: clamped === 0 ? 3 : Math.max(10, (clamped / 10) * maxHeight) };
}

/** 库内仍写自主/胜任/联结；界面补上口语说明 */
function needDisplayHint(need: string) {
  const map: Record<string, string> = {
    自主: "自己能不能定",
    胜任: "能不能做成、看见进展",
    联结: "有没有被理解、真实连接",
  };
  return map[need] || need;
}

function NeedBar({ label, value, tone }: { label: "满足" | "受挫"; value: number | null; tone: "met" | "hard" }) {
  const percent = value == null ? 0 : Math.max(0, Math.min(100, value * 10));
  return (
    <div className={`mind-need-bar is-${tone}`}>
      <div className="mind-need-bar-head">
        <em>{label}</em>
        <b>{value ?? "—"}</b>
      </div>
      <div
        className="mind-need-track"
        role="progressbar"
        aria-label={`${label} ${value ?? "暂无"}`}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value ?? undefined}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function NeedGroup({
  need,
  hard,
  met,
  note,
}: {
  need: string;
  hard: number | null;
  met: number | null;
  note?: string;
}) {
  return (
    <li title={note || undefined}>
      <div className="mind-need-title">
        <strong>{need}</strong>
        <span>{needDisplayHint(need)}</span>
      </div>
      <div className="mind-need-values" aria-label={`${need}：满足 ${met ?? "暂无"}，受挫 ${hard ?? "暂无"}`}>
        <NeedBar label="满足" value={met} tone="met" />
        <NeedBar label="受挫" value={hard} tone="hard" />
      </div>
    </li>
  );
}

/**
 * 半圆仪表：上半弧进度；recovery 高分更好，avoidance 高分更僵
 */
function ArcDial({
  value,
  max,
  min = 0,
  size = 96,
  unit = "",
  scale = "recovery",
}: {
  value: number | null;
  max: number;
  min?: number;
  size?: number;
  unit?: string;
  scale?: "recovery" | "avoidance";
}) {
  const uid = `arc${useId().replace(/:/g, "")}`;
  const r = 34;
  const cx = 44;
  const cy = 40;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const span = Math.max(0.0001, max - min);
  const safe = value == null || !Number.isFinite(value) ? null : Math.max(min, Math.min(max, value));
  const pct = safe == null ? 0 : (safe - min) / span;
  const toneClass =
    scale === "avoidance"
      ? pct >= 0.7 ? "is-coral" : pct >= 0.4 ? "is-gold" : "is-teal"
      : pct <= 0.4 ? "is-coral" : pct <= 0.7 ? "is-gold" : "is-teal";
  const stops =
    scale === "avoidance"
      ? [
          { offset: "0%", color: "rgba(126,201,192,.98)" },
          { offset: "40%", color: "rgba(212,196,154,.95)" },
          { offset: "100%", color: "rgba(223,128,111,.98)" },
        ]
      : [
          { offset: "0%", color: "rgba(223,128,111,.98)" },
          { offset: "40%", color: "rgba(212,196,154,.95)" },
          { offset: "100%", color: "rgba(126,201,192,.98)" },
        ];
  const tip =
    scale === "avoidance"
      ? pct >= 0.7 ? stops[2].color : pct >= 0.4 ? stops[1].color : stops[0].color
      : pct <= 0.4 ? stops[0].color : pct <= 0.7 ? stops[1].color : stops[2].color;
  const height = Math.round(size * 0.72);
  return (
    <div className={`mind-arc is-semi ${toneClass} is-${scale}`} style={{ width: size, height }}>
      <svg viewBox="0 0 88 56" width={size} height={height} aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-grad`} gradientUnits="userSpaceOnUse" x1={cx - r} y1={cy} x2={cx + r} y2={cy}>
            {stops.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
        <path
          className="mind-arc-track"
          d={d}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          className="mind-arc-fill"
          d={d}
          fill="none"
          stroke={`url(#${uid}-grad)`}
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct * 100} 100`}
        />
      </svg>
      <div className="mind-arc-readout">
        <strong style={{ color: tip }}>{safe == null ? "—" : safe}</strong>
        {unit ? <span>{unit}</span> : null}
      </div>
    </div>
  );
}

/** 竖管仪表：CBI 单色液面，偏大 */
function TubeMeter({
  value,
  max = 100,
}: {
  value: number | null;
  max?: number;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(max, value)) / max * 100;
  return (
    <div className="mind-tube is-coral" aria-hidden="true">
      <div className="mind-tube-track">
        <i style={{ height: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MindPanel({
  mind,
  appleSleepMinutes,
  variant = "full",
}: {
  mind: HealthSectionData["mind"];
  mainlineNames?: string[];
  appleSleepMinutes: number | null;
  /** card = 竖卡预览；full = 展开完整页 */
  variant?: "card" | "full";
}) {
  const days = mind?.days ?? [];
  const signals = mind?.signals;
  const recoveryPercents = signals?.recoveryPercents?.percents;
  const recoveryScoredDays = signals?.recoveryPercents?.scoredDays ?? 0;
  const recoverySampleDays = signals?.recoveryPercents?.sampleDays;
  const sampleDays = signals?.sampleDays ?? 0;
  const hasRecoverySample = recoveryScoredDays > 0 || sampleDays > 0 || Boolean(mind?.recoveryTempTest);
  const intensitySampled = days.filter((day) => day.workIntensity != null);
  const latestIntensityDate = intensitySampled.at(-1)?.date ?? null;
  const recent7 = intensitySampled.slice(-7);
  const avg7 = recent7.length
    ? recent7.reduce((sum, day) => sum + Number(day.workIntensity), 0) / recent7.length
    : null;
  const latestSubjectiveSleep = mind?.recentAssessment?.subjectiveSleep?.rating
    ?? [...days].reverse().find((day) => day.sleep)?.sleep
    ?? null;
  const weeklyMindSnapshot = mind?.recentAssessment?.weeklyMindSnapshots?.[0] ?? null;
  const scales = mind?.scales ?? null;

  const recoveryBlock = hasRecoverySample ? (
    <div className="mind-recovery-wrap">
      <div className="mind-recovery-grid" aria-label="有没有真恢复 · 近两周四项有据日平均分">
        {RECOVERY_DIMS.map((dim) => {
          const pct = recoveryPercents?.[dim.key];
          const level = pct == null ? null : Math.max(0, Math.min(100, pct));
          const knownDays = recoverySampleDays?.[dim.key] ?? (pct == null ? 0 : recoveryScoredDays);
          return (
            <div
              className={`mind-recovery-cell${level != null ? " has-tide" : ""}`}
              key={dim.key}
              title="近 14 日只按有明确依据的日期平均；未知不会按 0 计算"
              style={level == null ? undefined : ({ "--recovery-level": `${level}%` } as CSSProperties)}
            >
              {level != null ? (
                <span className="mind-recovery-tide" aria-hidden="true">
                  <span className="mind-recovery-tide-fill" />
                  {level > 0 ? (
                    <span className="mind-recovery-tide-wave" />
                  ) : null}
                </span>
              ) : null}
              <div className="mind-recovery-cell-content">
                <Kicker>{dim.label}</Kicker>
                <div className="mind-recovery-value">
                  <strong>{pct == null ? "—" : `${pct}%`}</strong>
                </div>
                <small>{knownDays > 0 ? `${knownDays} 天有据` : "暂无可靠记录"}</small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : (
    <p className="mind-recovery-empty">近两周还没日志可算恢复分</p>
  );

  const intensityBlock = (
    <div className={`mind-energy-coarse${variant === "full" ? " is-detail" : ""}`}>
      <div className="mind-energy-coarse-head">
        <span title="定时日评合并多 AI 的本人时段与验收证据；自动任务不算，估错你改日志"><Kicker>工作强度</Kicker></span>
        <span className="mind-energy-average">{avg7 != null ? <><strong>{avg7.toFixed(1)}</strong><small>7 日均 / 10</small></> : "还没分数"}</span>
      </div>
      <div className="mind-energy-plot">
        <div className="mind-energy-axis" aria-hidden="true"><span>10</span><span>5</span><span>0</span></div>
        <div className="mind-energy-chart" role="img" aria-label="最近两周工作强度；黄点表示训练日，绿点表示休息日">
          {(days.length ? days : Array.from({ length: 14 }, (_, i) => ({ date: `pad-${i}`, workIntensity: null as number | null, sleep: null as string | null, trained: false, restDay: false, restReasons: [] }))).map((day) => {
            const style = workIntensityBarStyle(day.workIntensity, variant === "full" ? 118 : 88);
            const bucket = day.workIntensity == null ? null : Math.max(0, Math.min(10, day.workIntensity));
            const isLatest = day.date === latestIntensityDate;
            return (
              <div className={`mind-energy-col${isLatest ? " is-latest" : ""}`} key={day.date} title={day.date.startsWith("pad") ? "没记录" : `${day.date}${day.workIntensity != null ? ` · 工作强度 ${day.workIntensity}/10` : " · 没记录"}`}>
                <div className="mind-energy-bar-slot">
                  <span className="mind-energy-value" aria-hidden="true">{day.workIntensity ?? "—"}</span>
                  <div className={`mind-energy-bar${bucket == null ? " is-empty" : ` is-e${bucket}`}`} style={style} />
                </div>
                <span className="mind-energy-date">{day.date.startsWith("pad") ? "·" : day.date.slice(8)}</span>
                <span className="mind-energy-markers" aria-label={[day.trained ? "训练日" : "", day.restDay ? "休息日" : ""].filter(Boolean).join("、") || undefined}>
                  <i className={day.trained ? "is-trained" : ""} title={day.trained ? "这天练过" : undefined} />
                  <i className={day.restDay ? "is-rest" : ""} title={day.restDay ? "这天是休息日" : undefined} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mind-energy-legend" aria-label="图例"><span><i className="is-trained" />黄＝训练日</span><span><i className="is-rest" />绿＝休息日</span></div>
    </div>
  );

  const sleepBlock = (
    <div className="mind-sleep-row">
      <div className="mind-sleep-cell" title="iWatch 记的实际睡着时长；身体侧参考，不和日志工作强度合成一个数">
        <Kicker>iWatch 记的睡眠</Kicker>
        <strong>{appleSleepMinutes != null ? `${(appleSleepMinutes / 60).toFixed(1)} h` : "—"}</strong>
        <small>{appleSleepMinutes != null ? "iWatch · 实际睡着" : "要重新导一次苹果健康才有"}</small>
      </div>
      <div className="mind-sleep-cell" title="本人最近反馈优先；没有时再读取日志里的睡眠三档，与 iWatch 客观睡眠分开">
        <Kicker>自己感觉的睡眠</Kicker>
        <strong>{latestSubjectiveSleep || "—"}</strong>
        <small>差 / 一般 / 好</small>
      </div>
    </div>
  );

  const scalesBlock = (
    <section className="life-atelier-section mind-scales-section">
      <div className="life-section-head">
        <div>
          <Kicker>量表历史</Kicker>
          <h2>量表读数</h2>
        </div>
        {scales?.tempTest ? <TempBadge /> : null}
      </div>

      <div className="mind-scales is-tian">
        <div className="mind-scale-tian">
          <div
            className="mind-scale-card is-needs"
            title={weeklyMindSnapshot ? `截至 ${weeklyMindSnapshot.weekEnding} · ${weeklyMindSnapshot.confidence}` : undefined}
          >
            <div className="mind-scale-head">
              <div>
                <Kicker>心理状态</Kicker>
              </div>
            </div>
            {weeklyMindSnapshot?.needs?.length ? (
              <ul className="mind-need-groups">
                {weeklyMindSnapshot.needs.map((row) => (
                  <NeedGroup key={row.need} need={row.need} hard={row.thwarted} met={row.met} note={row.note} />
                ))}
              </ul>
            ) : (
              <p className="mind-scale-empty">本周还没有心理状态记录</p>
            )}
          </div>

          <div className="mind-scale-card is-req">
            <div className="mind-scale-head">
              <div>
                <Kicker>恢复体验</Kicker>
                <h3>近况四维</h3>
              </div>
            </div>
            {scales?.req?.rows?.length ? (
              <ul className="mind-arc-grid is-req">
                {sortReqRows(scales.req.rows).map((row) => (
                  <li key={row.dim} title={row.note || undefined}>
                    <ArcDial value={row.score} max={5} scale="recovery" size={108} />
                    <span>{row.dim}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mind-scale-empty">还没有恢复体验记录</p>
            )}
            <p className="mind-scale-meta is-footer">{scales?.req?.period || "—"} · 0–5 · 越高越好</p>
          </div>

          <ScaleReport
            title="恢复体验怎么读"
            period={scales?.req?.period}
            report={scales?.req?.report}
            tempTest={scales?.tempTest}
          />
        </div>

        <div className="mind-scale-tian">
          <div className="mind-scale-card is-aaq">
            <div className="mind-scale-head">
              <div>
                <Kicker>心理灵活性</Kicker>
                <h3>卡住时能不能转</h3>
              </div>
            </div>
            {scales?.aaq ? (
              <div className="mind-aaq-stage">
                <ArcDial value={scales.aaq.score} min={7} max={49} scale="avoidance" size={152} />
                <div className="mind-aaq-copy">
                  <span>自己打的分 · 7–49</span>
                  <p>{scales.aaq.blurb || "—"}</p>
                  <em className="mind-aaq-legend">低 ← 较能转 · 较易躲开 → 高</em>
                </div>
              </div>
            ) : (
              <p className="mind-scale-empty">还没有心理灵活性记录</p>
            )}
            <p className="mind-scale-meta is-footer">{scales?.aaq?.period || "—"} · 自己打的分 7–49 · 不做临床判读</p>
          </div>

          <div className="mind-scale-card is-cbi">
            <div className="mind-scale-head">
              <div>
                <Kicker>倦怠</Kicker>
                <h3>三面读数</h3>
              </div>
            </div>
            {scales?.cbi?.rows?.length ? (
              <ul className="mind-tube-grid">
                {scales.cbi.rows.map((row) => (
                  <li key={row.face} title={row.note || undefined}>
                    <TubeMeter value={row.score} max={100} />
                    <strong>{row.score ?? "—"}</strong>
                    <span>{row.face}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mind-scale-empty">还没有倦怠记录</p>
            )}
            <p className="mind-scale-meta is-footer">{scales?.cbi?.period || "—"} · 0–100</p>
          </div>

          <ScaleReport
            title="灵活度怎么读"
            period={scales?.aaq?.period}
            report={scales?.aaq?.report}
            tempTest={scales?.tempTest}
          />
          <ScaleReport
            title="倦怠怎么读"
            period={scales?.cbi?.period}
            report={scales?.cbi?.report}
            tempTest={scales?.tempTest}
          />
        </div>
      </div>
    </section>
  );

  const weeklyMindCompact = weeklyMindSnapshot?.needs?.length ? (
    <div
      className="mind-needs-card"
      title={`截至 ${weeklyMindSnapshot.weekEnding} · ${weeklyMindSnapshot.confidence}`}
    >
      <div className="mind-needs-card-head">
        <Kicker>心理状态</Kicker>
      </div>
      <ul className="mind-need-groups is-compact">
        {weeklyMindSnapshot.needs.map((row) => (
          <NeedGroup key={row.need} need={row.need} hard={row.thwarted} met={row.met} note={row.note} />
        ))}
      </ul>
    </div>
  ) : null;

  if (variant === "card") {
    return (
      <div className="health-mind-panel is-card">
        <div className="health-deck-inset">
          <div className="card-title mind-head-compact">
            <div>
              <Kicker>负荷与恢复</Kicker>
              <h2>今天有多累？收工后恢复得怎么样？</h2>
            </div>
          </div>
          {intensityBlock}
          <div className="mind-card-recovery">
            <div className="mind-sleep-stack-head">
              <Kicker>有没有真恢复</Kicker>
            </div>
            {recoveryBlock}
          </div>
        </div>
        {weeklyMindCompact ? <div className="health-deck-inset is-mind-needs">{weeklyMindCompact}</div> : null}
        <div className="health-deck-inset mind-sleep-stack">
          {sleepBlock}
        </div>
      </div>
    );
  }

  return (
    <div className="health-mind-panel">
          <div className="card-title mind-head-compact">
            <div>
              <Kicker>负荷与恢复</Kicker>
              <h2>今天有多累？收工后恢复得怎么样？</h2>
            </div>
          </div>

      <div className="mind-pulse-board">
        <div className="mind-pulse-energy">{intensityBlock}</div>
        <div className="mind-pulse-signals">
          <div className="mind-sleep-stack-head">
            <Kicker>有没有真恢复</Kicker>
          </div>
          {recoveryBlock}
        </div>
        <div className="mind-pulse-sleep">{sleepBlock}</div>
      </div>

      {scalesBlock}
    </div>
  );
}

export function mindBandSummary(_mind: HealthSectionData["mind"] | null | undefined) {
  return "心理状态";
}
