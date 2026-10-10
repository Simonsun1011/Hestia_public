import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { HealthSectionData, WriteAction } from "../types";
import { Kicker, tokyoDateKey } from "../page-shared";
import BodyPanel, { AppleHealthImportCard, planMovesLine, type BodyDerived } from "./BodyPanel";
import MindPanel, { mindBandSummary } from "./MindPanel";
import LifePanel, { lifeBandSummary } from "./LifePanel";
import MuscleMapPanel from "./MuscleMapPanel";
import CoachReview from "./CoachReview";

type CellId = "body" | "mind" | "life";

type HealthHistoryState = { healthBand?: CellId | null };

function readBandQuery(): CellId | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("band");
  return value === "body" || value === "mind" || value === "life" ? value : null;
}

function bandUrl(band: CellId | null) {
  const url = new URL(window.location.href);
  if (band) url.searchParams.set("band", band);
  else url.searchParams.delete("band");
  return `${url.pathname}${url.search}${url.hash}`;
}

function writeBandQuery(band: CellId | null, mode: "push" | "replace") {
  if (typeof window === "undefined") return;
  const next = bandUrl(band);
  const state: HealthHistoryState = { healthBand: band };
  if (mode === "push") window.history.pushState(state, "", next);
  else window.history.replaceState(state, "", next);
}

function higherOverlayOpen() {
  if (typeof document === "undefined") return false;
  if (document.querySelector(".modal-backdrop")) return true;
  if (document.querySelector(".app-shell.ai-open")) return true;
  return false;
}

const CELL_META: Record<CellId, { title: string }> = {
  body: { title: "体魄" },
  mind: { title: "心理" },
  life: { title: "平衡" },
};

function CellHead({ title, summary }: { title: string; summary: ReactNode }) {
  return (
    <header className="health-cell-head">
      <div className="health-cell-title">
        <strong>{title}</strong>
      </div>
      <div className="health-cell-summary">{summary}</div>
    </header>
  );
}

function DeckCard({
  id,
  title,
  summary,
  onOpen,
  openButtonRef,
  children,
}: {
  id: CellId;
  title: string;
  summary: ReactNode;
  onOpen: (id: CellId) => void;
  openButtonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <section className={`health-deck-card health-cell-${id}`} id={`health-cell-${id}`}>
      <header className="health-deck-card-head">
        <button type="button" className="health-deck-card-open-zone" onClick={() => onOpen(id)} aria-label={`打开${title}`}>
          <strong>{title}</strong>
          <p>{summary}</p>
        </button>
        <button
          type="button"
          className="health-deck-open"
          ref={openButtonRef}
          onClick={() => onOpen(id)}
          aria-label={`打开${title}详情`}
        >
          打开
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </header>
      <div className="health-deck-card-body">{children}</div>
    </section>
  );
}

function useHealthDerived(data: HealthSectionData, today: string): BodyDerived {
  return useMemo(() => {
    type BodyPoint = { date: string; weightKg?: number; waist?: number; bodyFatPercent?: number; chest?: number; arm?: number };
    const apple = data.appleHealth;
    const completeDaily = (apple?.daily ?? []).filter((item) => item.date < today && item.steps !== undefined);
    const latestComplete = completeDaily.at(-1) ?? null;
    const recent7 = completeDaily.slice(-7);
    const recent14 = completeDaily.slice(-14).map((item) => ({ ...item, short: item.date.slice(5) }));
    const average = (values: Array<number | undefined>) => {
      const valid = values.filter((value): value is number => Number.isFinite(value));
      return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
    };
    const sum = (values: Array<number | undefined>) => values.reduce<number>((total, value) => total + (Number.isFinite(value) ? Number(value) : 0), 0);
    const averageSteps = average(recent7.map((item) => item.steps));
    const averageEnergy = average(recent7.map((item) => item.activeEnergy));
    const averageHeart = average(recent7.map((item) => item.restingHeartRate));
    const exerciseTotal = sum(recent7.map((item) => item.exerciseMinutes));

    const merged = new Map<string, BodyPoint>(data.measurements.map((item) => [item.date, { ...item }]));
    for (const item of apple?.body ?? []) {
      const row = merged.get(item.day) ?? { date: item.day };
      if (item.metric === "weightKg" && row.weightKg === undefined) row.weightKg = item.value;
      if (item.metric === "waistCm" && row.waist === undefined) row.waist = item.value;
      if (item.metric === "bodyFatPercent" && row.bodyFatPercent === undefined) row.bodyFatPercent = item.value;
      merged.set(item.day, row);
    }
    const referenceDay = latestComplete?.date ? new Date(`${latestComplete.date}T00:00:00+09:00`) : new Date();
    const cutoff = new Date(referenceDay); cutoff.setDate(cutoff.getDate() - 29);
    const cutoffDay = tokyoDateKey(cutoff);
    const allBodyPoints = [...merged.values()].filter((item) => item.weightKg || item.bodyFatPercent || item.waist).sort((a, b) => a.date.localeCompare(b.date));
    const monthPoints = allBodyPoints.filter((item) => item.date >= cutoffDay);
    const smoothKey = (points: typeof monthPoints, key: "weightKg" | "bodyFatPercent", window = 3) => {
      const values = points.map((item) => item[key]);
      return values.map((value, index) => {
        if (value === undefined) return undefined;
        const nearby: number[] = [];
        for (let cursor = index; cursor >= 0 && nearby.length < window; cursor -= 1) {
          const candidate = values[cursor];
          if (candidate !== undefined) nearby.push(candidate);
        }
        return nearby.length ? Number((nearby.reduce((acc, item) => acc + item, 0) / nearby.length).toFixed(2)) : value;
      });
    };
    const smoothedWeight = smoothKey(monthPoints, "weightKg");
    const smoothedBodyFat = smoothKey(monthPoints, "bodyFatPercent");
    const chart = monthPoints.map((item, index) => ({
      ...item,
      weightKg: smoothedWeight[index],
      bodyFatPercent: smoothedBodyFat[index],
      short: item.date.slice(5),
    }));
    const weightValues = chart.map((item) => item.weightKg).filter((value): value is number => Number.isFinite(value));
    const bodyFatValues = chart.map((item) => item.bodyFatPercent).filter((value): value is number => Number.isFinite(value));
    const weightDomain: [number, number] = weightValues.length
      ? [Math.floor(Math.min(...weightValues) - 1), Math.ceil(Math.max(...weightValues) + 1)]
      : [70, 82];
    const bodyFatDomain: [number, number] = bodyFatValues.length
      ? [Math.floor(Math.min(...bodyFatValues) - 1), Math.ceil(Math.max(...bodyFatValues) + 1)]
      : [15, 25];
    const latestManualWeight = [...data.measurements].reverse().find((item) => item.weightKg !== undefined);
    const latestManualWaist = [...data.measurements].reverse().find((item) => item.waist !== undefined);
    const appleWeight = apple?.latestBody.weightKg;
    const useAppleWeight = Boolean(appleWeight && (!latestManualWeight || appleWeight.day > latestManualWeight.date));
    const currentWeight = useAppleWeight ? appleWeight!.value : latestManualWeight?.weightKg;
    const weightDate = useAppleWeight ? appleWeight!.day : latestManualWeight?.date ?? data.baselineDate;
    const monthWeights = allBodyPoints.filter((item) => item.date >= cutoffDay && item.weightKg !== undefined);
    const weightDelta = monthWeights.length >= 2 ? Number(monthWeights.at(-1)!.weightKg!) - Number(monthWeights[0].weightKg!) : null;
    const latestWaist = latestManualWaist ?? [...allBodyPoints].reverse().find((item) => item.waist !== undefined);
    const workouts30 = (apple?.workouts ?? []).filter((item) => item.day >= cutoffDay);
    const strengthSessions = workouts30.filter((item) => item.type.includes("力量")).length;
    const walkingMinutes = sum(workouts30.filter((item) => item.type === "步行").map((item) => item.durationMinutes ?? undefined));
    const workoutTypes = [...new Set(workouts30.map((item) => item.type))];
    return {
      apple, latestComplete, recent14, averageSteps, averageEnergy, averageHeart, exerciseTotal,
      chart, weightDomain, bodyFatDomain, currentWeight, weightDate, weightDelta, latestWaist,
      strengthSessions, walkingMinutes, workoutTypes, workouts30,
    };
  }, [data, today]);
}

export default function HealthPage({
  data,
  onImport,
  onImportFromDownloads,
  importing,
  onAskCoach,
  onWritePreview,
}: {
  data: HealthSectionData;
  onImport: (file: File) => void;
  onImportFromDownloads: () => void;
  importing: boolean;
  onAskCoach: (seedUser: string) => void;
  onWritePreview?: (action: WriteAction) => void;
}) {
  const today = tokyoDateKey(new Date());
  const derived = useHealthDerived(data, today);
  const [open, setOpen] = useState<CellId | null>(() => readBandQuery());
  const backRef = useRef<HTMLButtonElement>(null);
  const openButtonRefs = useRef<Partial<Record<CellId, HTMLButtonElement | null>>>({});
  const lastOpenedRef = useRef<CellId | null>(readBandQuery());
  const skipFocusOnceRef = useRef(Boolean(readBandQuery()));

  const appleSleep = (() => {
    const daily = data.appleHealth?.daily ?? [];
    for (let i = daily.length - 1; i >= 0; i -= 1) {
      const row = daily[i] as { sleepMinutes?: number; asleepMinutes?: number };
      const value = row.sleepMinutes ?? row.asleepMinutes;
      if (Number.isFinite(value)) return Number(value);
    }
    return null;
  })();

  const bodyPeek = data.todayPlan?.title
    ? `${derived.currentWeight?.toFixed(1) ?? "—"} kg · ${data.todayPlan.weekday} · ${data.todayPlan.title}`
    : `${derived.currentWeight?.toFixed(1) ?? "—"} kg · ${data.latestTraining || "暂无训练"}`;
  const todayMoves = planMovesLine(data.todayPlan);

  const openCell = (id: CellId) => {
    if (open === id) return;
    writeBandQuery(id, "push");
    lastOpenedRef.current = id;
    setOpen(id);
  };

  const closeCell = () => {
    const state = window.history.state as HealthHistoryState | null;
    if (state?.healthBand) {
      window.history.back();
      return;
    }
    writeBandQuery(null, "replace");
    setOpen(null);
  };

  useEffect(() => {
    const onPop = () => setOpen(readBandQuery());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (higherOverlayOpen()) return;
      event.preventDefault();
      closeCell();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (skipFocusOnceRef.current) {
      skipFocusOnceRef.current = false;
      if (open) queueMicrotask(() => backRef.current?.focus());
      return;
    }
    if (open) {
      lastOpenedRef.current = open;
      queueMicrotask(() => backRef.current?.focus());
      return;
    }
    const id = lastOpenedRef.current;
    if (id) queueMicrotask(() => openButtonRefs.current[id]?.focus());
  }, [open]);

  if (open) {
    const meta = CELL_META[open];
    const summary =
      open === "body" ? bodyPeek : open === "mind" ? mindBandSummary(data.mind) : lifeBandSummary(data.life);
    return (
      <div className="health-dashboard-v2 health-expanded">
        <section className={`health-cell health-cell-${open}`} id={`health-cell-${open}`}>
          <div className="health-expanded-bar">
            <button type="button" className="health-expanded-back" ref={backRef} onClick={closeCell}>
              <ArrowLeft size={15} aria-hidden="true" />
              三张卡
            </button>
            <CellHead title={meta.title} summary={summary} />
            {open === "body" ? (
              <AppleHealthImportCard
                apple={derived.apple}
                compact
              />
            ) : null}
          </div>

          {open === "body" ? (
            <BodyPanel
              data={data}
              today={today}
              derived={derived}
              onAskCoach={onAskCoach}
              onWritePreview={onWritePreview}
              sleepMinutes={appleSleep}
            />
          ) : null}

          {open === "mind" ? (
            <MindPanel
              mind={data.mind}
              mainlineNames={(data.life?.mainlines ?? []).map((line) => line.item).filter(Boolean)}
              appleSleepMinutes={appleSleep}
            />
          ) : null}

          {open === "life" ? <LifePanel life={data.life} /> : null}
        </section>
      </div>
    );
  }

  return (
    <div className="health-dashboard-v2 health-deck">
      <div className="health-deck-grid">
        <DeckCard
          id="body"
          title={CELL_META.body.title}
          summary={bodyPeek}
          onOpen={openCell}
          openButtonRef={(node) => { openButtonRefs.current.body = node; }}
        >
          <div className="health-body-panel is-card">
            <p className="today-plan-banner is-card" title={data.todayPlan?.detail || undefined}>
              <Kicker>今日</Kicker>
              <span className="today-plan-main">
                <strong>{data.todayPlan?.title || "今天没排训练"}</strong>
                {todayMoves ? <span className="today-plan-moves">{todayMoves}</span> : null}
              </span>
            </p>
            <MuscleMapPanel sessions={data.sessions} strength={data.strength} today={today} compact />
            <CoachReview
              data={{
                trainingVolume: data.trainingVolume,
                progressionAdvice: data.progressionAdvice,
                muscleBalance: data.muscleBalance,
                recoveryLoad: data.recoveryLoad,
                mesocycle: data.mesocycle,
                staleMuscles: data.staleMuscles,
                coachHints: data.coachHints,
                measurements: data.measurements,
              }}
              onAskCoach={onAskCoach}
              onWritePreview={onWritePreview}
              sleepMinutes={appleSleep}
              compact
            />
          </div>
        </DeckCard>

        <DeckCard
          id="mind"
          title={CELL_META.mind.title}
          summary={mindBandSummary(data.mind)}
          onOpen={openCell}
          openButtonRef={(node) => { openButtonRefs.current.mind = node; }}
        >
          <MindPanel
            mind={data.mind}
            mainlineNames={(data.life?.mainlines ?? []).map((line) => line.item).filter(Boolean)}
            appleSleepMinutes={appleSleep}
            variant="card"
          />
        </DeckCard>

        <DeckCard
          id="life"
          title={CELL_META.life.title}
          summary={lifeBandSummary(data.life)}
          onOpen={openCell}
          openButtonRef={(node) => { openButtonRefs.current.life = node; }}
        >
          <LifePanel life={data.life} variant="card" />
        </DeckCard>
      </div>
    </div>
  );
}
