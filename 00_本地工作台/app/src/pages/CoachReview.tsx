import { MessageSquareText } from "lucide-react";
import type { HealthSectionData, WriteAction } from "../types";
import { Card, Kicker } from "../page-shared";
import { buildCoachReview, buildCoachReviewSeed } from "./coach-review";

export default function CoachReview({
  data,
  onAskCoach,
  compact = false,
}: {
  data: Pick<
    HealthSectionData,
    "trainingVolume" | "progressionAdvice" | "muscleBalance" | "recoveryLoad" | "mesocycle" | "staleMuscles" | "coachHints" | "measurements"
  >;
  onAskCoach: (seedUser: string) => void;
  onWritePreview?: (action: WriteAction) => void;
  sleepMinutes?: number | null;
  compact?: boolean;
}) {
  const model = buildCoachReview(data);

  return (
    <Card className={`coach-review${compact ? " is-compact" : ""}`}>
      <div className="coach-review-head">
        <div>
          <Kicker>教练复盘</Kicker>
          <h2>最近这一周期</h2>
        </div>
        <div className="coach-review-actions">
          <button
            type="button"
            className="coach-review-ask"
            onClick={() => onAskCoach(buildCoachReviewSeed(model))}
          >
            <MessageSquareText size={13} />
            让小秘书讲讲
          </button>
        </div>
      </div>

      <p className="coach-review-auto-hint" title="每两周定时写入训练复盘；不用手点保存">
        复盘会定时自动写入 · 不用手存
      </p>

      <div className="coach-review-conclusion">
        {model.conclusion.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      {model.items.length ? (
        <ul className="coach-review-items">
          {model.items.map((item) => (
            <li className={`kind-${item.kind}`} key={`${item.kind}-${item.text}`} title={item.basis}>
              <span className="coach-review-tag">{item.label}</span>
              <span className="coach-review-text">{item.text}</span>
              {!compact ? <small className="coach-review-basis">{item.basis}</small> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="coach-review-empty">暂时没有要处理的。</p>
      )}
    </Card>
  );
}
