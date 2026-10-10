import { addCalendarDays, parseTaskDates, parseTaskKind, stripTaskDecorators, type TaskKind } from "./gantt-model.ts";
import type { ProjectManagementTask, ProjectTaskPriority } from "./types.ts";

/** 四象限分级：S / A / B / C（S 最高 = 重要且紧急）。 */
export type QuadrantId = "S" | "A" | "B" | "C";

export type WeekTodoRow = {
  id: string;
  source: "central" | "project" | "vault" | "reminder";
  text: string;
  displayText: string;
  kind: TaskKind | null;
  projectName?: string;
  whenLabel?: string;
  date?: ProjectManagementTask["date"];
  /** 有钟点提醒时用于组内按时间排序（ISO）。 */
  sortAt?: string;
  quadrant: QuadrantId;
  done: boolean;
  writeTarget?: {
    sourcePath: string;
    taskId: string;
    expectedDone: boolean;
    expectedPriority: ProjectTaskPriority;
  };
};

export type AiExecutionRow = {
  id: string;
  taskId: string;
  sourcePath: string;
  text: string;
  displayText: string;
  projectName?: string;
  date?: ProjectManagementTask["date"];
  executorId: string;
  executionStatus: "not-run" | "ran-failed" | "blocked";
};

export type QuadrantMeta = {
  id: QuadrantId;
  label: string;
  hint: string;
};

/** 展示顺序：上左 S、上右 A、下左 B、下右 C。 */
export const QUADRANT_ORDER: QuadrantMeta[] = [
  { id: "S", label: "重要且紧急", hint: "马上做" },
  { id: "A", label: "重要不紧急", hint: "计划做" },
  { id: "B", label: "紧急不重要", hint: "能推则推" },
  { id: "C", label: "不重要且不紧急", hint: "少做或不做" },
];

const QUADRANT_NAME_TO_ID: Record<string, QuadrantId> = {
  重要且紧急: "S",
  重要不紧急: "A",
  紧急不重要: "B",
  不重要且不紧急: "C",
  S: "S",
  A: "A",
  B: "B",
  C: "C",
  s: "S",
  a: "A",
  b: "B",
  c: "C",
};

/** `象限：重要且紧急` / `象限：S` */
const QUADRANT_NAMED_RE = /象限\s*[：:]\s*(重要且紧急|重要不紧急|紧急不重要|不重要且不紧急|[SABCsabc])\s*[：:]?\s*/u;
/** 分隔后的字母标记：`S：` / `A：` */
const QUADRANT_LETTER_RE = /(^|[\s：:·•])([SABCsabc])\s*[：:]\s*/gu;

export function parseQuadrant(text: string): { id: QuadrantId; explicit: boolean } | null {
  const named = text.match(QUADRANT_NAMED_RE);
  if (named) {
    const id = QUADRANT_NAME_TO_ID[named[1]];
    if (id) return { id, explicit: true };
  }
  QUADRANT_LETTER_RE.lastIndex = 0;
  const letter = QUADRANT_LETTER_RE.exec(text);
  if (letter) {
    const id = QUADRANT_NAME_TO_ID[letter[2]];
    if (id) return { id, explicit: true };
  }
  return null;
}

/** 从文案里剥掉象限标记（展示用）。 */
export function stripQuadrantMarkers(text: string) {
  return text
    .replace(QUADRANT_NAMED_RE, " ")
    .replace(QUADRANT_LETTER_RE, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** 旧服务过渡回退：只保留东京今天和明天有交集的任务。 */
export function isTodoInNextTwoTokyoDays(text: string, todayKey: string) {
  const span = parseTaskDates(text, todayKey);
  if (!span) return false;
  const endKey = addCalendarDays(todayKey, 1);
  return span.start <= endKey && span.end >= todayKey;
}

function isCadence(row: WeekTodoRow) {
  return row.kind === "cadence";
}

/** 组内：有钟点按时间；常驻垫底；其余保持原序。 */
function sortWithinQuadrant(a: WeekTodoRow, b: WeekTodoRow) {
  const aCadence = isCadence(a);
  const bCadence = isCadence(b);
  if (aCadence !== bCadence) return aCadence ? 1 : -1;
  if (a.sortAt && b.sortAt) return a.sortAt.localeCompare(b.sortAt);
  if (a.sortAt) return -1;
  if (b.sortAt) return 1;
  return 0;
}

export type QuadrantGroup = QuadrantMeta & { items: WeekTodoRow[] };

/** 日程上半区展示服务端已筛好的近 2 日执行任务。 */
export function buildCurrentExecutionRows(tasks: ProjectManagementTask[]): WeekTodoRow[] {
  return tasks.flatMap((task, index) => {
    if (task.done || !task.priority) return [];
    return [{
      id: `${task.id}:${task.sourcePath}:${index}`,
      source: task.sourceKind,
      text: task.text,
      displayText: task.displayText || stripTaskDecorators(task.text),
      kind: parseTaskKind(task.text).kind,
      whenLabel: task.date?.label || undefined,
      date: task.date,
      quadrant: task.priority,
      done: task.done,
      projectName: task.projectName || undefined,
      writeTarget: task.writable ? {
        sourcePath: task.sourcePath,
        taskId: task.id,
        expectedDone: task.done,
        expectedPriority: task.priority,
      } : undefined,
    } satisfies WeekTodoRow];
  });
}

/** 无需 Studio User 操作的近期待执行任务；完成状态由实际运行结果写回。 */
export function buildAiExecutionRows(tasks: ProjectManagementTask[]): AiExecutionRow[] {
  return tasks.flatMap((task, index) => {
    if ((task.done && task.aiExecutionStatus !== "ran-failed") || task.priority || !task.executorId || !/^AI·/u.test(task.displayText.trim())) return [];
    return [{
      id: `${task.id}:${task.sourcePath}:ai:${index}`,
      taskId: task.id,
      sourcePath: task.sourcePath,
      text: task.text,
      displayText: task.displayText.trim().replace(/^AI·\s*/u, "AI· "),
      projectName: task.projectName || undefined,
      date: task.date || undefined,
      executorId: task.executorId,
      executionStatus: task.aiExecutionStatus || "not-run",
    } satisfies AiExecutionRow];
  });
}

export function groupWeekTodosByQuadrant(rows: WeekTodoRow[]): QuadrantGroup[] {
  const buckets: Record<QuadrantId, WeekTodoRow[]> = { S: [], A: [], B: [], C: [] };
  for (const row of rows) {
    buckets[row.quadrant].push(row);
  }
  for (const id of ["S", "A", "B", "C"] as QuadrantId[]) {
    buckets[id].sort(sortWithinQuadrant);
  }
  return QUADRANT_ORDER.map((meta) => ({ ...meta, items: buckets[meta.id] }));
}
