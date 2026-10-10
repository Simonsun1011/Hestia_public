import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock3 } from "lucide-react";
import type { JapaneseCourseProgress, JapaneseCourseProgressStatus } from "../../types";
import { CourseProgressBooks, type CourseProgressBook, type CourseProgressLesson } from "./CourseProgressBooks";
import {
  COURSE_BOOKS,
  COURSE_MASTERY_LABELS,
  buildCourseCatalog,
  courseBook,
  masteryLabel,
  normalizeCoursePosition,
  type CourseMasteryLevel,
  type CoursePosition,
  type CourseSelection,
  type CourseStCard,
} from "./course-board-model";
import "./course-board.css";

export type CourseLessonRecord = {
  lessonId: string;
  title?: string;
  canDo?: string;
  level?: CourseMasteryLevel;
};

export type CourseBoardProps = {
  currentPosition?: CoursePosition;
  suggestedSt?: number;
  records?: CourseLessonRecord[];
  progress?: JapaneseCourseProgress;
  stCards?: Readonly<Partial<Record<string, CourseStCard>>>;
  loadStCard?: (selection: CourseSelection) => Promise<CourseStCard | undefined>;
  onSelectionChange?: (selection: CourseSelection) => void;
  initialExpandedBookId?: string | null;
  onExpandedBookChange?: (bookId: string | null) => void;
  className?: string;
};

function stMasteryLabel(level: number | null) {
  if (level === null || level < 0 || level > 3) return "尚未评价";
  return masteryLabel(level as CourseMasteryLevel);
}

function lessonMasterySummary(lesson: CourseProgressLesson | undefined) {
  if (!lesson) return "尚未评价";
  const levels = lesson.stItems.flatMap((item) => item.level === null ? [] : [item.level]);
  if (!levels.length) return "尚未评价";
  if (levels.length < lesson.stItems.length) return `${levels.length}/${lesson.stItems.length} 个小节已评价`;
  const floor = Math.min(...levels) as CourseMasteryLevel;
  return `整课 LV${floor} ${COURSE_MASTERY_LABELS[floor]}`;
}

function grammarFocusParts(focus: string) {
  const [kind = "重点", pattern = focus, usage = "", ...rest] = focus.split("｜").map((part) => part.trim()).filter(Boolean);
  return { kind, pattern, usage: [usage, ...rest].filter(Boolean).join("；") };
}

function StatusIcon({ status }: { status: JapaneseCourseProgressStatus }) {
  if (status === "mastered") return <CheckCircle2 size={15}/>;
  if (status === "in-progress") return <Clock3 size={15}/>;
  return <Circle size={14}/>;
}

function fallbackProgressBooks(
  records: CourseLessonRecord[],
): CourseProgressBook[] {
  const catalog = buildCourseCatalog();
  const recordsByLessonId = new Map(records.map((record) => [record.lessonId, record]));
  return COURSE_BOOKS.map((book) => {
    const lessons: CourseProgressLesson[] = catalog.filter((lesson) => lesson.book === book.id).map((lesson) => {
      const record = recordsByLessonId.get(lesson.id);
      const status: JapaneseCourseProgressStatus = record?.level === undefined
        ? "not-started"
        : record.level >= 2 ? "mastered" : "in-progress";
      return {
        lesson: lesson.lesson,
        lessonId: lesson.id,
        title: record?.title || `第${lesson.lesson}课`,
        status,
        isCurrentSelection: false,
        stItems: lesson.stIds.map((stId, index) => ({
          st: index + 1,
          stId,
          status,
          level: record?.level ?? null,
          recordIds: [],
          modalities: { speaking: false, listening: false, output: false },
        })),
      };
    });
    const allSt = lessons.flatMap((lesson) => lesson.stItems);
    return {
      id: book.id,
      label: book.label,
      lessonTotal: lessons.length,
      stTotal: allSt.length,
      stWithEvidence: allSt.filter((item) => item.status === "in-progress" || item.status === "mastered").length,
      masteredSt: allSt.filter((item) => item.status === "mastered").length,
      lessons,
    };
  });
}

function modalityLabels(modalities: CourseProgressLesson["stItems"][number]["modalities"]) {
  const labels = [
    modalities.speaking ? "开口" : "",
    modalities.listening ? "听辨" : "",
    modalities.output ? "自主表达" : "",
  ].filter(Boolean);
  return labels.length ? labels.join(" · ") : "还没有可展示的练习证据";
}

function modalitySummary(item: CourseProgressLesson["stItems"][number]) {
  return modalityLabels(item.modalities);
}

export function CourseBoard({
  currentPosition,
  suggestedSt = 1,
  records = [],
  progress,
  stCards,
  loadStCard,
  onSelectionChange,
  initialExpandedBookId,
  onExpandedBookChange,
  className = "",
}: CourseBoardProps) {
  const startingSelection = currentPosition
    ? normalizeCoursePosition({ ...currentPosition, st: currentPosition.st ?? suggestedSt })
    : null;
  const [selected, setSelected] = useState<CourseSelection | null>(startingSelection);
  const [loadedCards, setLoadedCards] = useState<Record<string, CourseStCard>>({});
  const [focusStatus, setFocusStatus] = useState<"idle" | "loading" | "missing" | "error">("idle");
  const books = useMemo(
    () => progress?.books ?? fallbackProgressBooks(records),
    [progress, records],
  );

  useEffect(() => {
    setSelected(startingSelection);
  }, [startingSelection?.book, startingSelection?.lesson, startingSelection?.st]);

  const selectedBook = selected ? courseBook(selected.book) : null;
  const selectedLesson = selected ? books
    .flatMap((book) => book.lessons)
    .find((lesson) => lesson.lessonId === selected.lessonId) : undefined;
  const lessonTitle = selected ? selectedLesson?.title
    || records.find((record) => record.lessonId === selected.lessonId)?.title
    || `第${selected.lesson}课` : "";
  const selectedRecord = selected ? records.find((record) => record.lessonId === selected.lessonId) : undefined;
  const lessonSelections = useMemo(
    () => selected && selectedBook ? Array.from({ length: selectedBook.stPerLesson }, (_, index) => (
      normalizeCoursePosition({ book: selected.book, lesson: selected.lesson, st: index + 1 })
    )) : [],
    [selected?.book, selected?.lesson, selectedBook?.stPerLesson],
  );

  useEffect(() => {
    if (!loadStCard) {
      setFocusStatus("idle");
      return;
    }
    let cancelled = false;
    const selectionsToLoad = lessonSelections.filter((selection) => !stCards?.[selection.stId] && !loadedCards[selection.stId]);
    if (!selectionsToLoad.length) {
      setFocusStatus("idle");
      return;
    }
    setFocusStatus("loading");
    void Promise.allSettled(selectionsToLoad.map((selection) => loadStCard(selection))).then((results) => {
      if (cancelled) return;
      const cards = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
      if (cards.length) {
        setLoadedCards((currentCards) => {
          const nextCards = { ...currentCards };
          for (const card of cards) nextCards[card.stId] = card;
          return nextCards;
        });
      }
      const failed = results.some((result) => result.status === "rejected");
      setFocusStatus(cards.length ? "idle" : failed ? "error" : "missing");
    });
    return () => { cancelled = true; };
  }, [lessonSelections, loadStCard, stCards]);

  const lessonCards = lessonSelections.flatMap((selection) => {
    const card = stCards?.[selection.stId] ?? loadedCards[selection.stId];
    return card ? [card] : [];
  });
  const grammarFocus = Array.from(new Set(lessonCards.flatMap((card) => card.supports).filter(Boolean)));
  const recentLessonEvidence = selected
    ? (progress?.recentEvidence ?? []).filter((item) => item.lessonId === selected.lessonId)
    : [];

  const selectLesson = (lesson: CourseProgressLesson) => {
    const book = lesson.lessonId.includes("-chukyu-") ? "intermediate" : "beginner";
    const next = normalizeCoursePosition({ book, lesson: lesson.lesson, st: 1 });
    setSelected(next);
    onSelectionChange?.(next);
  };

  return <section className={`course-board ${className}`.trim()} aria-labelledby="course-board-title">
    <header className="course-board__toolbar">
      <h2 id="course-board-title">《できる日本語》课程进度</h2>
    </header>

    <section className="course-board__overview" aria-label="课程分册与课次进度">
      <CourseProgressBooks
        books={books}
        selectedLessonId={selected?.lessonId}
        onSelectLesson={selectLesson}
        initialExpandedBookId={initialExpandedBookId}
        onExpandedBookChange={onExpandedBookChange}
      />
    </section>

    {selected && selectedBook ? <article className="course-board__detail" aria-labelledby="course-board-detail-title">
      <header className="course-board__detail-head">
        <div>
          <span>{selectedBook.label} · 第 {selected.lesson} 课</span>
          <h3 id="course-board-detail-title" lang="ja">{lessonTitle}</h3>
          {selectedRecord?.canDo ? <p>{selectedRecord.canDo}</p> : null}
        </div>
        <strong className={`is-${selectedLesson?.status || "not-started"}`}>
          {lessonMasterySummary(selectedLesson)}
        </strong>
      </header>

      <section className="course-board__st-map" aria-labelledby="course-board-st-map-title">
        <header>
          <div><span>第三级 · 展开课内结构</span><h4 id="course-board-st-map-title">本课小节与教材环节</h4></div>
          <p>材料可用不代表本人已经学过；每个课内小节的掌握度只读真实记录。</p>
        </header>
        <div>
          {lessonSelections.map((selection) => {
            const item = selectedLesson?.stItems.find((candidate) => candidate.stId === selection.stId);
            const card = stCards?.[selection.stId] ?? loadedCards[selection.stId];
            return <article className={item?.level === null || item?.level === undefined ? "is-unrated" : `is-lv-${item.level}`} key={selection.stId}>
              <header>
                <div><span>第 {selected.lesson}-{selection.st} 课</span><strong lang="ja">{card?.title || `第 ${selected.lesson}-${selection.st} 课`}</strong></div>
                <em>{stMasteryLabel(item?.level ?? null)}</em>
              </header>
              <p>{card ? `教材本册第 ${card.sourceBookPage} 页起` : focusStatus === "loading" ? "正在读取教材结构……" : "教材结构尚未接入"}</p>
              {card?.sections.length ? <div className="course-board__section-chips">
                {card.sections.map((section) => <span key={section.id}>{section.title}{section.sourceBookPage ? ` · P${section.sourceBookPage}` : ""}</span>)}
              </div> : null}
              <small>{item ? modalitySummary(item) : "还没有学习证据"}</small>
            </article>;
          })}
        </div>
      </section>

      <div className="course-board__detail-grid">
        <section className="course-board__focus" aria-labelledby="course-board-focus-title">
          <header>
            <div>
              <span>教材明确标注</span>
              <h4 id="course-board-focus-title">本课重点语法</h4>
            </div>
            <small>不按课文中出现多少来推测</small>
          </header>
          {grammarFocus.length ? <ul>
            {grammarFocus.map((focus) => {
              const parts = grammarFocusParts(focus);
              return <li key={focus}>
                <span>{parts.kind}</span>
                <strong lang="ja">{parts.pattern}</strong>
                {parts.usage ? <p>{parts.usage}</p> : null}
              </li>;
            })}
          </ul> : <div className="course-board__pending" aria-live="polite">
            <strong>{focusStatus === "loading" ? "正在核对教材重点……" : focusStatus === "error" ? "教材重点读取失败" : "教材重点映射待整理"}</strong>
            <p>在教材后附学习重点完成核对前，这里不会扫描正文或自行补写。</p>
          </div>}
        </section>

        <section className="course-board__study" aria-labelledby="course-board-study-title">
          <header>
            <span>我的学习情况</span>
            <h4 id="course-board-study-title">各小节的核验记录</h4>
          </header>
          <div className="course-board__st-list">
            {(selectedLesson?.stItems ?? []).map((item) => <article className={`is-${item.status}`} key={item.stId}>
              <StatusIcon status={item.status}/>
              <div>
                <strong>第 {selected.lesson}-{item.st} 课 · {stMasteryLabel(item.level)}</strong>
                <span>{modalitySummary(item)}</span>
              </div>
              <small>{item.recordIds.length} 条核验记录</small>
            </article>)}
            {!selectedLesson?.stItems.length ? <p className="course-board__empty-progress">这课还没有可展示的学习记录。</p> : null}
          </div>
          {recentLessonEvidence.length ? <div className="course-board__recent-evidence">
            <strong>最近核验</strong>
            {recentLessonEvidence.map((item) => <p key={item.recordId}>
              <span>{item.date || item.verifiedAt} · 第 {selected.lesson}-{item.st} 课</span>
              <em>{stMasteryLabel(item.level)} · {modalityLabels(item.modalities)}</em>
            </p>)}
          </div> : null}
        </section>
      </div>

    </article> : null}
  </section>;
}
