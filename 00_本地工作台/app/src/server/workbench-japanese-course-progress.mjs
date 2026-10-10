import fs from "node:fs/promises";
import path from "node:path";
import { JP_STATUS } from "./vault-paths.mjs";

export const JP_COURSE_RECORDS_DIR = "50_语言学习/日语/20_记录";
export const JP_COURSE_STRUCTURE_PATH = "50_语言学习/日语/教材与听力/できる日本語/できる日本語_第2版官方配套资料结构索引.md";
export const JP_COURSE_COVERAGE_PATH = "50_语言学习/日语/教材与听力/できる日本語/できる日本語_GPT_Live练习覆盖台账.md";

const BOOKS = [
  { id: "beginner", label: "初級", prefix: "shokyu", stPerLesson: 3 },
  { id: "intermediate", label: "初中級", prefix: "chukyu", stPerLesson: 2 },
];

function cleanCell(value = "") {
  return String(value)
    .replace(/\*\*/g, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

function field(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(markdown).match(new RegExp(`^\\s*(?:-\\s*)?${escaped}\\s*[：:]\\s*(.*?)\\s*$`, "mi"));
  return match?.[1]?.trim() || "";
}

function integerField(markdown, label) {
  const value = field(markdown, label);
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function durationFromText(value = "") {
  const text = String(value);
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:小时|小時|h(?:ours?)?)/i)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分鐘|分(?:钟)?|m(?:in(?:utes?)?)?)/i)?.[1] || 0);
  if (hours || minutes) return Math.max(0, Math.round(hours * 60 + minutes));
  const range = text.match(/(\d{1,2}):(\d{2})\s*[–—~-]\s*(\d{1,2}):(\d{2})/);
  if (!range) return null;
  const start = Number(range[1]) * 60 + Number(range[2]);
  let end = Number(range[3]) * 60 + Number(range[4]);
  if (end < start) end += 24 * 60;
  return Math.max(0, end - start);
}

export function parseOralPracticeRecord(markdown = "", sourcePath = "") {
  const recordKind = field(markdown, "record_kind");
  const outcome = field(markdown, "session_outcome");
  const verified = field(markdown, "verified_by_codex").toLowerCase() === "true";
  const practiceSurface = field(markdown, "practice_surface");
  const sessionId = field(markdown, "session_id");
  const date = field(markdown, "练习日期").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  const explicit = field(markdown, "practice_duration_minutes");
  const explicitMinutes = /^\d+(?:\.\d+)?$/.test(explicit) ? Math.round(Number(explicit)) : null;
  const humanDuration = durationFromText(field(markdown, "实际练习时长"));
  const timeRange = durationFromText(field(markdown, "实际练习时间"));
  const durationMinutes = explicitMinutes ?? humanDuration ?? timeRange;
  const isOralSurface = /(?:chatgpt-live-voice|mixed)/i.test(practiceSurface);
  if (recordKind !== "real-owner-session"
    || !new Set(["completed", "user-stopped"]).has(outcome)
    || !verified
    || !isOralSurface
    || !date
    || durationMinutes === null) return null;
  return {
    sessionId,
    date,
    durationMinutes,
    estimated: explicitMinutes === null,
    practiceSurface,
    sourcePath,
  };
}

function lessonIdFor(book, lesson) {
  return `dekiru-${book.prefix}-${String(lesson).padStart(2, "0")}`;
}

function lessonFromId(lessonId) {
  const match = String(lessonId).match(/^dekiru-(shokyu|chukyu)-(0[1-9]|1[0-5])$/);
  if (!match) return null;
  const book = BOOKS.find((item) => item.prefix === match[1]);
  return book ? { book, lesson: Number(match[2]) } : null;
}

export function parseCourseStructure(markdown = "") {
  const rows = [];
  for (const match of String(markdown).matchAll(/^\|\s*(\d{1,2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)) {
    const lesson = Number(match[1]);
    if (lesson < 1 || lesson > 15) continue;
    rows.push({ lesson, beginnerTitle: cleanCell(match[2]), intermediateTitle: cleanCell(match[3]) });
  }
  const unique = new Map(rows.map((row) => [row.lesson, row]));
  return Array.from({ length: 15 }, (_, index) => {
    const lesson = index + 1;
    const row = unique.get(lesson);
    return {
      lesson,
      beginnerTitle: row?.beginnerTitle || `第${lesson}课`,
      intermediateTitle: row?.intermediateTitle || `第${lesson}课`,
    };
  });
}

function masteryLevel(markdown) {
  const value = field(markdown, "练习后等级");
  const match = value.match(/LV\s*([0-3])/i);
  return match ? Number(match[1]) : null;
}

function validUnitId(lessonId, unitId, stPerLesson) {
  const match = String(unitId).match(new RegExp(`^${lessonId}-st([1-${stPerLesson}])$`));
  return match ? Number(match[1]) : null;
}

function hasActualSpeakingEvidence(markdown) {
  return integerField(markdown, "独立正确次数") > 0
    || /证据性质\s*[：:]\s*本人实际说出/.test(markdown)
    || /完整重说\s*[：:]\s*完成/.test(markdown);
}

function hasActualListeningEvidence(markdown) {
  return /原版听力\s*[：:]\s*已做/.test(markdown)
    || /观察\s*[：:][^\n]*(?:听懂|听辨|请求重说)/.test(markdown);
}

function hasActualOutputEvidence(markdown) {
  return integerField(markdown, "独立正确次数") > 0
    || integerField(markdown, "换词或换场景成功次数") > 0
    || /真实内容替换\s*[：:]\s*已做/.test(markdown)
    || /AI 新场景\s*[：:]\s*已做/.test(markdown);
}

export function parseCourseLearningRecord(markdown = "", sourcePath = "") {
  const recordKind = field(markdown, "record_kind");
  const outcome = field(markdown, "session_outcome");
  const verified = field(markdown, "verified_by_codex").toLowerCase() === "true";
  const sessionId = field(markdown, "session_id");
  const lessonId = field(markdown, "lesson_id");
  const unitId = field(markdown, "unit_id");
  const lesson = lessonFromId(lessonId);
  const level = masteryLevel(markdown);

  let excludedReason = "";
  if (recordKind !== "real-owner-session") excludedReason = "not-real-session";
  else if (!new Set(["completed", "user-stopped"]).has(outcome)) excludedReason = "invalid-outcome";
  else if (!verified) excludedReason = "not-codex-verified";
  else if (!/^jlive-\d{8}-\d{4}-[\p{L}\p{N}]{4}$/u.test(sessionId)) excludedReason = "invalid-session-id";
  else if (!lesson) excludedReason = "invalid-lesson-id";

  const st = lesson && !excludedReason ? validUnitId(lessonId, unitId, lesson.book.stPerLesson) : null;
  if (!excludedReason && !st) excludedReason = "invalid-unit-id";
  if (!excludedReason && level === null) excludedReason = "missing-mastery-level";

  if (excludedReason) {
    return { valid: false, excludedReason, sourcePath };
  }

  const date = field(markdown, "练习日期").replace(/（.*$/, "").trim();
  const verifiedAt = field(markdown, "verified_at");
  return {
    valid: true,
    recordId: sessionId,
    sessionId,
    lessonId,
    stId: unitId,
    st,
    level,
    status: level >= 2 ? "mastered" : "in-progress",
    date,
    verifiedAt,
    sourcePath,
    modalities: {
      speaking: hasActualSpeakingEvidence(markdown),
      listening: hasActualListeningEvidence(markdown),
      output: hasActualOutputEvidence(markdown),
    },
  };
}

function latestRecord(records) {
  return records.toSorted((a, b) => {
    const aKey = a.verifiedAt || a.date || a.sourcePath;
    const bKey = b.verifiedAt || b.date || b.sourcePath;
    return bKey.localeCompare(aKey);
  })[0] || null;
}

function stStatus(records) {
  if (!records.length) return "not-started";
  return latestRecord(records)?.status || "unknown";
}

function lessonStatus(stItems) {
  if (stItems.every((item) => item.status === "mastered")) return "mastered";
  if (stItems.some((item) => item.status === "in-progress" || item.status === "mastered")) return "in-progress";
  if (stItems.some((item) => item.status === "unknown")) return "unknown";
  return "not-started";
}

async function readText(root, relativePath) {
  try {
    return await fs.readFile(path.join(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

async function readRecordFiles(root) {
  const directory = path.join(root, JP_COURSE_RECORDS_DIR);
  let names = [];
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const markdownNames = names.filter((name) => name.endsWith(".md"));
  return Promise.all(markdownNames.map(async (name) => {
    const relativePath = path.posix.join(JP_COURSE_RECORDS_DIR, name);
    return { relativePath, markdown: await readText(root, relativePath) };
  }));
}

function parseCurrentLessonId(markdown = "") {
  const matches = [...String(markdown).matchAll(/`(dekiru-(?:shokyu|chukyu)-(?:0[1-9]|1[0-5]))`/g)];
  return matches[0]?.[1] || null;
}

export async function buildJapaneseCourseProgress(root) {
  const [structureMarkdown, currentStatusMarkdown, files] = await Promise.all([
    readText(root, JP_COURSE_STRUCTURE_PATH),
    readText(root, JP_STATUS),
    readRecordFiles(root),
  ]);
  const titles = parseCourseStructure(structureMarkdown);
  const parsedRecords = files.map((file) => parseCourseLearningRecord(file.markdown, file.relativePath));
  const records = parsedRecords.filter((record) => record.valid);
  const oralSessions = files
    .map((file) => parseOralPracticeRecord(file.markdown, file.relativePath))
    .filter(Boolean)
    .toSorted((a, b) => b.date.localeCompare(a.date));
  const currentLessonId = parseCurrentLessonId(currentStatusMarkdown);

  const books = BOOKS.map((book) => {
    const lessons = titles.map((row) => {
      const lessonId = lessonIdFor(book, row.lesson);
      const stItems = Array.from({ length: book.stPerLesson }, (_, index) => {
        const st = index + 1;
        const stId = `${lessonId}-st${st}`;
        const stRecords = records.filter((record) => record.stId === stId);
        const latest = latestRecord(stRecords);
        return {
          st,
          stId,
          status: stStatus(stRecords),
          level: latest?.level ?? null,
          recordIds: stRecords.map((record) => record.recordId),
          modalities: {
            speaking: stRecords.some((record) => record.modalities.speaking),
            listening: stRecords.some((record) => record.modalities.listening),
            output: stRecords.some((record) => record.modalities.output),
          },
        };
      });
      return {
        lesson: row.lesson,
        lessonId,
        title: book.id === "beginner" ? row.beginnerTitle : row.intermediateTitle,
        status: lessonStatus(stItems),
        isCurrentSelection: lessonId === currentLessonId,
        stItems,
      };
    });
    const allSt = lessons.flatMap((lesson) => lesson.stItems);
    return {
      id: book.id,
      label: book.label,
      lessonTotal: lessons.length,
      stTotal: allSt.length,
      stWithEvidence: allSt.filter((item) => item.status !== "not-started" && item.status !== "unknown").length,
      masteredSt: allSt.filter((item) => item.status === "mastered").length,
      lessons,
    };
  });

  const allSt = books.flatMap((book) => book.lessons.flatMap((lesson) => lesson.stItems));
  const modalityCount = (key) => allSt.filter((item) => item.modalities[key]).length;
  const currentLesson = books.flatMap((book) => book.lessons).find((lesson) => lesson.lessonId === currentLessonId) || null;

  return {
    books,
    summary: {
      lessonTotal: books.reduce((sum, book) => sum + book.lessonTotal, 0),
      stTotal: allSt.length,
      stWithEvidence: allSt.filter((item) => item.status !== "not-started" && item.status !== "unknown").length,
      masteredSt: allSt.filter((item) => item.status === "mastered").length,
      validRecordCount: records.length,
      excludedRecordCount: parsedRecords.length - records.length,
      speakingSt: modalityCount("speaking"),
      listeningSt: modalityCount("listening"),
      outputSt: modalityCount("output"),
    },
    currentSelection: currentLesson ? {
      lessonId: currentLesson.lessonId,
      book: currentLessonId.includes("-chukyu-") ? "intermediate" : "beginner",
      lesson: currentLesson.lesson,
      title: currentLesson.title,
      evidenceKind: "selection-only",
    } : null,
    recentEvidence: records.toSorted((a, b) => (b.verifiedAt || b.date).localeCompare(a.verifiedAt || a.date)).slice(0, 8),
    oralSessions,
    paths: {
      structure: JP_COURSE_STRUCTURE_PATH,
      coverage: JP_COURSE_COVERAGE_PATH,
      records: JP_COURSE_RECORDS_DIR,
      currentStatus: JP_STATUS,
    },
    evidenceRule: "只有你真的练过并留下记录，才会算进这里；只是导入教材、让 AI 整理内容或选中课程，都不算学过。",
  };
}
