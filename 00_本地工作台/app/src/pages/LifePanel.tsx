import { useId } from "react";
import type { HealthSectionData, RecentWellbeingAssessment } from "../types";
import { Empty, Kicker } from "../page-shared";

const GAUGE_LABELS = [
  { key: "health" as const, label: "健康" },
  { key: "work" as const, label: "工作" },
  { key: "play" as const, label: "游戏" },
  { key: "love" as const, label: "情感" },
];

type GaugeKey = (typeof GAUGE_LABELS)[number]["key"];

function TempBadge({
  label = "试稿",
  title = "AI 起草 · 非正式 · 可改",
}: {
  label?: string;
  title?: string;
} = {}) {
  return (
    <span className="temp-test-badge" title={title}>
      {label}
    </span>
  );
}

function buildGaugeRows(life: HealthSectionData["life"]) {
  const gauges = life?.gauges ?? [];
  const latest = gauges[0] ?? null;
  const weekly = life?.weeklyGauges ?? [];
  const current = weekly[0] ?? latest;
  const previous = weekly[1] ?? null;
  const shortWeek = (date: string) => date.slice(5).replace("-", "/");
  if (!current) {
    return {
      latest: null,
      values: [] as Array<{
        key: GaugeKey;
        label: string;
        value: number | null;
        previousValue: number | null;
        trend: "up" | "down" | "steady" | null;
        change: number | null;
        historyTitle: string;
      }>,
      lowestKey: null as GaugeKey | null,
    };
  }

  const values = GAUGE_LABELS.map((item) => {
    const value = current[item.key];
    const previousValue = previous?.[item.key] ?? null;
    const change = value != null && previousValue != null ? value - previousValue : null;
    const trend = change == null
      ? null
      : change === 0
        ? "steady"
        : change > 0 ? "up" : "down";
    return {
      ...item,
      value,
      previousValue,
      trend,
      change,
      historyTitle: change == null
        ? `${item.label} ${value == null ? "—" : `${value}%`} · 暂无上周对照`
        : `${item.label} ${value}% · ${weekly[0] && previous ? `${shortWeek(weekly[0].weekEnding)} 较 ${shortWeek(previous.weekEnding)}` : "较前一周"}${trend === "steady" ? "基本持平" : `${change > 0 ? "增加" : "减少"} ${Math.abs(change)} 点`}`,
    };
  });
  const lowest = values
    .filter((item) => item.value != null)
    .sort((a, b) => Number(a.value) - Number(b.value))[0];
  return { latest, values, lowestKey: lowest?.key ?? null };
}

type Mainline = HealthSectionData["life"]["mainlines"][number];
type Disposition = Mainline["disposition"];

const DISPOSITION_GROUPS: Array<{ key: Disposition; label: string }> = [
  { key: "多投入", label: "多投入" },
  { key: "保持", label: "保持" },
  { key: "少投入", label: "少投入" },
  { key: "停", label: "停" },
  { key: null, label: "还没定" },
];

function groupMainlinesByDisposition(mainlines: Mainline[]) {
  return DISPOSITION_GROUPS
    .map((group) => ({
      ...group,
      lines: mainlines.filter((line) =>
        group.key == null ? line.disposition == null : line.disposition === group.key,
      ),
    }))
    .filter((group) => group.lines.length > 0);
}

function mainlineChipTitle(line: Mainline) {
  return [
    [line.prefix, line.category].filter(Boolean).join(" · ") || null,
    line.energy,
    line.reason || (line.lastActionDays != null ? `${line.lastActionDays} 天前有动作` : null),
    line.offMainline ? "已经不在待办情况里了" : null,
  ].filter(Boolean).join(" · ");
}

function LifeGauges({
  values,
  lowestKey,
  animated = false,
}: {
  values: ReturnType<typeof buildGaugeRows>["values"];
  lowestKey: GaugeKey | null;
  animated?: boolean;
}) {
  return (
    <div className={`life-gauges${animated ? " is-animated" : ""}`} aria-label="健康、工作、游戏、情感四项打分">
      {values.map((item, index) => (
        <div
          className={`life-gauge${lowestKey === item.key ? " is-lowest" : ""}`}
          key={item.key}
          title={item.historyTitle}
          style={animated ? { animationDelay: `${index * 70}ms` } : undefined}
        >
          <span>{item.label}</span>
          <div className="life-gauge-track" aria-label={item.historyTitle}>
            <i style={{ height: `${Math.max(0, Math.min(100, Number(item.value) || 0))}%` }} />
          </div>
          <div className="life-gauge-reading">
            <strong>{item.value == null ? "—" : `${item.value}`}</strong>
            {item.change != null ? (
              <small className={`life-gauge-delta${item.trend ? ` is-${item.trend}` : ""}`}>
                {item.trend === "up" ? `↑${Math.abs(item.change)}` : item.trend === "down" ? `↓${Math.abs(item.change)}` : "—"}
              </small>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function MainlineDispositionGroups({
  mainlines,
  dense = false,
}: {
  mainlines: Mainline[];
  dense?: boolean;
}) {
  const groups = groupMainlinesByDisposition(mainlines);
  return (
    <div className={`life-disposition-groups${dense ? " is-dense" : ""}`}>
      {groups.map((group) => (
        <div className="life-disposition-group" key={group.label}>
          <span className={`life-disposition-label${group.key ? ` is-${group.key}` : " is-none"}`}>{group.label}</span>
          <div className="life-mainline-chips">
            {group.lines.map((line) => (
              <span
                className={`life-mainline-chip${line.energy ? ` is-${line.energy}` : ""}`}
                key={`${line.prefix}-${line.item}`}
                title={mainlineChipTitle(line)}
              >
                <strong>{line.item}</strong>
                {line.energy ? <em>{line.energy}</em> : null}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const ODYSSEY_DIMS = ["手头条件", "想不想干", "有没有把握", "跟自己合不合"] as const;

function OdysseyColumns({
  plans,
}: {
  plans: NonNullable<HealthSectionData["life"]["odyssey"]>["plans"];
}) {
  return (
    <div className="life-odyssey" aria-label="三个方向对比" title="不算总分、不替你选">
      <div className="life-odyssey-head">
        <Kicker>奥德赛</Kicker>
        <span>三个方向对比 · 不算总分、不替你选</span>
      </div>
      <div className="life-odyssey-grid">
        {plans.map((plan) => {
          const scoreMap = new Map(plan.scores.map((row) => [row.dim, row]));
          return (
            <div className="life-odyssey-col" key={plan.id}>
              <strong>{plan.id} · {plan.title}</strong>
              <p>{plan.blurb && !/待填/.test(plan.blurb) ? plan.blurb : "还没写一句话"}</p>
              <ul>
                {ODYSSEY_DIMS.map((dim) => {
                  const row = scoreMap.get(dim);
                  const score = row?.score;
                  const note = row?.note || "";
                  return (
                    <li key={dim} title={note || undefined}>
                      <span>{dim}</span>
                      <div className="life-odyssey-bar" aria-hidden="true">
                        <i style={{ width: score == null ? "0%" : `${Math.max(0, Math.min(10, score)) * 10}%` }} />
                      </div>
                      <em>{score == null ? "—" : score}</em>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TwoQuestions({ surprise, refuel, lead = false }: { surprise: string; refuel: string; lead?: boolean }) {
  if (!surprise && !refuel) return null;
  return (
    <div className={`life-two-questions${lead ? " is-lead life-atelier-lead is-split" : " health-deck-inset"}`}>
      {surprise ? (
        <p>
          <span className="life-q-label">最意外</span>
          <span className="life-q-body">{surprise}</span>
        </p>
      ) : null}
      {refuel ? (
        <p>
          <span className="life-q-label">优先提升</span>
          <span className="life-q-body">{refuel}</span>
        </p>
      ) : null}
    </div>
  );
}

function recentRecoverySummary(balance: NonNullable<RecentWellbeingAssessment["entries"][number]["balance"]>) {
  if (
    balance.judgment === "时间结构强烈偏工作，恢复证据不足"
    && balance.unknown === "是否主动享受、进入心流或已经耗竭"
  ) {
    return "从最近的记录看，你大部分时间都在工作，暂时没看到真正放松下来的时候。至于你是享受其中、进入了心流，还是已经累了，现在还看不出来。";
  }
  return `${balance.judgment}${balance.unknown ? `。${balance.unknown}` : ""}`;
}

const CHOICE_STEPS = [
  { key: "generate" as const, label: "生成", step: "01" },
  { key: "narrow" as const, label: "收窄", step: "02" },
  { key: "choose" as const, label: "选定", step: "03" },
  { key: "letGo" as const, label: "放手", step: "04" },
];

/** 好时光 · 半圆读数（回能青绿 / 耗能珊瑚） */
function LineLeanDial({
  line,
  lean,
  dates,
  note,
}: {
  line: string;
  lean: "回能" | "耗能" | "中性" | null;
  dates: string[];
  note: string;
}) {
  const value = lean === "回能" ? 0.82 : lean === "耗能" ? 0.18 : 0.5;
  const uid = `lean${useId().replace(/:/g, "")}`;
  const r = 34;
  const cx = 44;
  const cy = 40;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const tip =
    lean === "回能" ? "rgba(126,201,192,.98)"
      : lean === "耗能" ? "rgba(223,128,111,.98)"
        : "rgba(212,196,154,.95)";
  const fillStops =
    lean === "回能"
      ? [
          { offset: "0%", color: "rgba(90,170,160,.75)" },
          { offset: "100%", color: "rgba(126,201,192,.98)" },
        ]
      : lean === "耗能"
        ? [
            { offset: "0%", color: "rgba(223,128,111,.98)" },
            { offset: "100%", color: "rgba(190,90,78,.85)" },
          ]
        : [
            { offset: "0%", color: "rgba(212,196,154,.7)" },
            { offset: "100%", color: "rgba(212,196,154,.95)" },
          ];
  return (
    <article className={`life-lean-tile is-${lean || "中性"}`}>
      <div className="life-lean-dial" aria-hidden="true">
        <svg viewBox="0 0 88 56" width="120" height="76">
          <defs>
            <linearGradient id={`${uid}-g`} gradientUnits="userSpaceOnUse" x1={cx - r} y1={cy} x2={cx + r} y2={cy}>
              {fillStops.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
          <path
            d={d}
            fill="none"
            stroke="rgba(255,255,255,.1)"
            strokeWidth="7"
            strokeLinecap="round"
            pathLength={100}
          />
          <path
            d={d}
            fill="none"
            stroke={`url(#${uid}-g)`}
            strokeWidth="7"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${value * 100} 100`}
          />
        </svg>
        <div className="life-lean-scale">
          <span>耗</span>
          <span>回</span>
        </div>
        <strong style={{ color: tip }}>{lean || "—"}</strong>
      </div>
      <h3>{line}</h3>
      <span>{dates.length ? dates.join(" · ") : "还没日期"}</span>
      {note ? <p>{note}</p> : null}
    </article>
  );
}

function goodTimesSummary(toolbox: NonNullable<HealthSectionData["life"]["toolbox"]>) {
  const recharge = toolbox.goodTimes.find((row) => row.lean === "回能");
  const drain = toolbox.goodTimes.find((row) => row.lean === "耗能");
  if (!recharge && !drain) return "";
  return [
    recharge ? `回能 · ${recharge.line}` : null,
    drain ? `耗能 · ${drain.line}` : null,
  ].filter(Boolean).join(" / ");
}

export default function LifePanel({
  life,
  variant = "full",
  compact,
}: {
  life: HealthSectionData["life"];
  /** card = 竖卡预览：两问 + 四格 + 在推进的事项；full = 展开完整页 */
  variant?: "card" | "full";
  /** @deprecated 用 variant="card" */
  compact?: boolean;
}) {
  const mode = compact ? "card" : variant;
  const { latest, values, lowestKey } = buildGaugeRows(life);
  const isTrial = life?.gaugeLifecycle?.status !== "formal";
  const mainlines = life?.mainlines ?? [];
  const surprise = latest?.surprise && !/^[…\.．\s]+$/.test(latest.surprise) ? latest.surprise : "";
  const refuel = latest?.refuel && !/^[…\.．\s]+$/.test(latest.refuel) ? latest.refuel : "";
  const plans = life?.odyssey?.plans ?? [];
  const toolbox = life?.toolbox ?? null;
  const lowestLabel = lowestKey
    ? GAUGE_LABELS.find((item) => item.key === lowestKey)?.label
    : null;
  const lowestValue = lowestKey
    ? values.find((item) => item.key === lowestKey)?.value
    : null;
  const cardGoodTimes = toolbox ? goodTimesSummary(toolbox) : "";
  const recentEntries = life?.recentAssessment?.entries ?? [];
  const recentBalance = recentEntries[0]?.balance ?? null;
  const recentKnownGoodTime = recentEntries
    .flatMap((entry) => entry.goodTimes.map((row) => ({ entry, row })))
    .find(({ row }) => !/暂不判断|未知/.test(row.judgment));
  const currentSurprise = recentKnownGoodTime
    ? `${recentKnownGoodTime.entry.sourceDate.slice(5).replace("-", "/")} · ${recentKnownGoodTime.row.judgment}`
    : surprise;
  const currentRefuel = recentBalance
    ? recentRecoverySummary(recentBalance)
    : refuel;

  if (mode === "card") {
    return (
      <div className="health-life-panel is-card">
        <TwoQuestions surprise={currentSurprise} refuel={currentRefuel} lead />

        <div className="health-deck-inset">
          <div className="card-title life-card-head">
            <div>
              <Kicker>时间与精力投入</Kicker>
            </div>
            <div className="life-gauge-head-meta">
              {isTrial ? <TempBadge label="试运行" title="试运行数据 · 暂不进入正式长期趋势" /> : null}
              {lowestLabel && lowestValue != null ? (
                <span className="life-card-lowest">最低 · {lowestLabel} {lowestValue}%</span>
              ) : null}
            </div>
          </div>
          {values.length ? (
            <LifeGauges values={values} lowestKey={lowestKey} animated />
          ) : (
            <p className="life-muted">本周还没记录</p>
          )}
        </div>

        <div className="health-deck-inset">
          <div className="life-card-lines-head">
            <Kicker>在推进的事项</Kicker>
            <span>{mainlines.length ? `${mainlines.length} 条` : ""}</span>
          </div>
          {mainlines.length ? (
            <MainlineDispositionGroups mainlines={mainlines} dense />
          ) : (
            <p className="life-muted">还没写在推的事</p>
          )}
          {cardGoodTimes ? (
            <p className="life-card-goodtimes" title="点进完整页看依据">
              {toolbox?.tempTest ? <TempBadge /> : null}
              {cardGoodTimes}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="health-life-panel is-full">
      <TwoQuestions surprise={currentSurprise} refuel={currentRefuel} lead />

      <div className="life-gauge-compass">
        <div className="health-deck-inset life-gauges-block">
          <div className="life-section-head">
            <div>
              <Kicker>时间与精力投入</Kicker>
            </div>
            <div className="life-gauge-head-meta">
              {isTrial ? <TempBadge label="试运行" title="试运行数据 · 暂不进入正式长期趋势" /> : null}
              {lowestLabel && lowestValue != null ? (
                <span className="life-card-lowest">最低 · {lowestLabel} {lowestValue}%</span>
              ) : null}
            </div>
          </div>
          {values.length ? (
            <LifeGauges values={values} lowestKey={lowestKey} animated />
          ) : (
            <Empty>本周还没记录。</Empty>
          )}
        </div>

        <div className="life-compass-stack">
          <blockquote className="life-quote-panel is-work">
            <Kicker>工作观</Kicker>
            <p>{life?.compass?.filled ? (life.compass.workview || "—") : "还没写工作观"}</p>
          </blockquote>
          <blockquote className="life-quote-panel is-life">
            <Kicker>人生观</Kicker>
            <p>{life?.compass?.filled ? (life.compass.lifeview || "—") : "还没写人生观"}</p>
          </blockquote>
        </div>
      </div>

      <div className="health-deck-inset life-mainlines-block">
        <div className="life-section-head">
          <div>
            <Kicker>在推进的事项</Kicker>
            <h2>按打算怎么处理分组</h2>
          </div>
          <span className="life-section-meta">{mainlines.length ? `${mainlines.length} 条` : ""}</span>
        </div>
        {mainlines.length ? (
          <MainlineDispositionGroups mainlines={mainlines} />
        ) : (
          <Empty>待办情况里还没写在推的事。</Empty>
        )}
      </div>

      <section className="life-atelier-section">
        <div className="life-section-head">
          <div>
            <Kicker>好时光</Kicker>
            <h2>哪条线回能、哪条耗能</h2>
          </div>
          {toolbox?.tempTest ? <TempBadge /> : null}
        </div>
        {toolbox?.goodTimes?.length ? (
          <div className="life-lean-grid">
            {toolbox.goodTimes.map((row) => (
              <LineLeanDial
                key={row.line}
                line={row.line}
                lean={row.lean}
                dates={row.dates}
                note={row.note}
              />
            ))}
          </div>
        ) : (
          <p className="life-muted">还没有按线的好时光记录</p>
        )}
      </section>

      <section className="life-atelier-section">
        <div className="life-section-head">
          <div>
            <Kicker>原型</Kicker>
            <h2>低成本试一试</h2>
          </div>
          {toolbox?.tempTest ? <TempBadge /> : null}
        </div>
        {toolbox?.prototypes?.length ? (
          <div className="life-proto-bento">
            {toolbox.prototypes.map((row, index) => (
              <article className="life-proto-cell" key={row.name}>
                <div className="life-proto-glow" aria-hidden="true" />
                <header>
                  <span className="life-proto-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="life-proto-status">{row.status || "—"}</span>
                </header>
                <h3>{row.name}</h3>
                {row.kind ? <em className="life-proto-kind">{row.kind}</em> : null}
                <p>{row.blurb || "—"}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="life-muted">还没有原型清单</p>
        )}
      </section>

      <section className="life-atelier-section">
        <div className="life-section-head">
          <div>
            <Kicker>选择四步</Kicker>
            <h2>当前这件事怎么定</h2>
          </div>
          {toolbox?.tempTest ? <TempBadge /> : null}
        </div>
        {toolbox?.choiceSteps ? (
          <div className="life-choice-block">
            {toolbox.choiceSteps.topic ? (
              <p className="life-choice-topic">
                <span>大事</span>
                {toolbox.choiceSteps.topic}
              </p>
            ) : null}
            <ol className="life-choice-bento">
              {CHOICE_STEPS.map((step) => (
                <li key={step.key}>
                  <span className="life-choice-num">{step.step}</span>
                  <strong>{step.label}</strong>
                  <p>{toolbox.choiceSteps?.[step.key] || "—"}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="life-muted">没有正在走四步的大事</p>
        )}
      </section>

      <section className="life-atelier-section">
        <div className="life-section-head">
          <div>
            <Kicker>卡住时</Kicker>
            <h2>看什么</h2>
          </div>
          {toolbox?.tempTest ? <TempBadge /> : null}
        </div>
        {toolbox?.stuckNote ? (
          <blockquote className="life-stuck-note">{toolbox.stuckNote}</blockquote>
        ) : (
          <p className="life-muted">还没写卡住时的提醒</p>
        )}
      </section>

      {plans.length ? (
        <div className="health-deck-inset">
          <OdysseyColumns plans={plans} />
        </div>
      ) : null}
    </div>
  );
}

export function lifeBandSummary(_life: HealthSectionData["life"]): string {
  return "时间与精力投入";
}
