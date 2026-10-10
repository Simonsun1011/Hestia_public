import fs from "node:fs/promises";
import path from "node:path";

import { JAPAN_ACTIVITIES_SOURCE } from "./vault-paths.mjs";
import { readEventsDerived, readSources } from "./workbench-events-collect.mjs";
import { guideKey, readAiGuides } from "./workbench-events-guide.mjs";
import { runState } from "./job-runtime.mjs";

const START = "<!-- INFANS_JAPAN_ACTIVITIES_JSON_START -->";
const END = "<!-- INFANS_JAPAN_ACTIVITIES_JSON_END -->";
const INTEREST_START = "<!-- INFANS_JAPAN_ACTIVITY_INTERESTS_JSON_START -->";
const INTEREST_END = "<!-- INFANS_JAPAN_ACTIVITY_INTERESTS_JSON_END -->";

function tokyoDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseEmbeddedJson(markdown) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start < 0 || end <= start) throw new Error("日本活动原件缺少数据区");
  const block = markdown.slice(start + START.length, end);
  const fenced = block.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!fenced) throw new Error("日本活动数据区不完整");
  return JSON.parse(fenced[1]);
}

function parseInterests(markdown) {
  const start = markdown.indexOf(INTEREST_START);
  const end = markdown.indexOf(INTEREST_END);
  if (start < 0 || end <= start) return {};
  const fenced = markdown.slice(start + INTEREST_START.length, end).match(/```json\s*([\s\S]*?)\s*```/i);
  if (!fenced) return {};
  try {
    const parsed = JSON.parse(fenced[1]);
    return parsed?.items && typeof parsed.items === "object" ? parsed.items : {};
  } catch {
    return {};
  }
}

function renderInterests(items) {
  return `${INTEREST_START}\n\`\`\`json\n${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n\`\`\`\n${INTEREST_END}`;
}

async function atomicWrite(target, content) {
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeFilterTag(raw) {
  const explicit = String(raw?.filterTag || "").trim();
  if (["ACG", "历史人文", "AI 新知"].includes(explicit)) return explicit;
  const category = String(raw?.category || "");
  if (/\bAI\b|人工智能|生成式|大模型|LLM|RAG/i.test(category)) return "AI 新知";
  if (/游戏|动漫|漫画|同人|二次元/.test(category)) return "ACG";
  return "历史人文";
}

function normalizeActivity(raw) {
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.startDate || "")) ? raw.startDate : null;
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.endDate || "")) ? raw.endDate : startDate;
  const officialUrl = safeUrl(raw?.officialUrl);
  if (!raw?.id || !raw?.name || !startDate || !endDate || !officialUrl || !raw?.verifiedAt) return null;
  return {
    id: String(raw.id),
    name: String(raw.name),
    filterTag: normalizeFilterTag(raw),
    category: String(raw.category || "其他"),
    startDate,
    endDate,
    dateLabel: String(raw.dateLabel || startDate),
    place: String(raw.place || "地点待官方公布"),
    region: String(raw.region || "日本"),
    cost: String(raw.cost || "费用待官方公布"),
    registration: String(raw.registration || "报名方式待官方公布"),
    language: String(raw.language || "待核验"),
    languagePressure: ["低", "中", "高"].includes(raw.languagePressure) ? raw.languagePressure : "待核验",
    chineseFriendly: String(raw.chineseFriendly || "未见官方中文友好说明"),
    why: String(raw.why || ""),
    officialUrl,
    sourceLabel: String(raw.sourceLabel || "官方来源"),
    verifiedAt: String(raw.verifiedAt),
  };
}

function dateLabelOf(start, end) {
  const short = (ymd) => `${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;
  return start === end ? short(start) : `${short(start)} – ${short(end)}`;
}

/** 自动采集到的活动 → 活动卡。采集只摘了页面上写着的信息，语言等没核验的项如实标出。 */
function collectedActivity(event, labels, generatedAt) {
  const officialUrl = safeUrl(event.url);
  if (!officialUrl || !event.id || !event.title || !event.start_date || !event.end_date) return null;
  const label = labels.get(event.category) || event.category || "其他";
  const why = [event.summary_zh, event.reasons?.length ? `入选理由：${event.reasons.join("、")}` : ""].filter(Boolean).join(" ");
  return {
    id: String(event.id),
    name: String(event.title),
    filterTag: label,
    category: label,
    startDate: event.start_date,
    endDate: event.end_date,
    dateLabel: dateLabelOf(event.start_date, event.end_date),
    place: event.venue || "地点见官方页面",
    region: "东京",
    cost: event.price_text || "价格见官方页面",
    registration: event.time_text ? `时间：${event.time_text}` : "时间见官方页面",
    language: "未核验",
    languagePressure: "待核验",
    chineseFriendly: "未核验",
    why: why || "自动采集，详情见官方页面",
    officialUrl,
    sourceLabel: event.source || "官方来源",
    verifiedAt: generatedAt || "",
    origin: "collected",
    imageUrl: safeUrl(event.image_url),
  };
}

/** AI 攻略的条目（带上采集到的官方图）。 */
async function aiGuideEntries(vaultRoot, existingIds) {
  const derived = await readEventsDerived(vaultRoot);
  const images = new Map((derived?.events ?? []).map((event) => [String(event.id), safeUrl(event.image_url)]));
  const out = [];
  for (const guide of (await readAiGuides(vaultRoot)).values()) {
    if (existingIds.has(guide.id)) continue;
    const imageUrl = images.get(guide.id) || "";
    out.push({
      id: guide.id, name: guide.name, dateLabel: guide.dateLabel, status: "AI 攻略", updatedAt: guide.updatedAt, sourcePath: guide.sourcePath,
      ...(imageUrl ? { imageUrl, imageAlt: `${guide.name} 官方图`, imageSourceLabel: "官方页面", imageSourceUrl: guide.sourceUrl } : {}),
    });
  }
  return out;
}

/** 手写的攻略、参加记录与 AI 生成的攻略，合在一起供攻略页与图片读取。 */
async function guideEntries(vaultRoot, parsed) {
  const handwritten = [...(Array.isArray(parsed.playbooks) ? parsed.playbooks : []), ...(Array.isArray(parsed.guides) ? parsed.guides : [])];
  return [...handwritten, ...(await aiGuideEntries(vaultRoot, new Set(handwritten.map((entry) => String(entry?.id || "")))))];
}

function playbookSource(vaultRoot, sourcePath) {
  const relative = String(sourcePath || "").replaceAll("\\", "/");
  if (!relative.startsWith("80_生活事务/日本游玩攻略/") || !relative.endsWith(".md") || relative.split("/").includes("..")) {
    throw new Error("攻略原件路径不在日本游玩攻略目录内");
  }
  const root = path.resolve(vaultRoot);
  const target = path.resolve(root, relative);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error("攻略原件路径越界");
  return { relative, target };
}

function frontmatterValue(markdown, key) {
  const frontmatter = String(markdown).match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)?.[1] || "";
  return frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() || "";
}

function normalizeGuideImage(raw) {
  const imageUrl = safeUrl(raw?.imageUrl);
  return {
    imageUrl,
    imageAlt: imageUrl ? String(raw?.imageAlt || "活动官方内容图") : "",
    imageSourceLabel: imageUrl ? String(raw?.imageSourceLabel || "官方图片来源") : "",
    imageSourceUrl: imageUrl ? safeUrl(raw?.imageSourceUrl) : "",
    imageCredit: imageUrl ? String(raw?.imageCredit || "") : "",
  };
}

export async function readJapanActivities(vaultRoot, options = {}) {
  const today = options.today || tokyoDay();
  const markdown = await fs.readFile(path.join(vaultRoot, JAPAN_ACTIVITIES_SOURCE), "utf8");
  const parsed = parseEmbeddedJson(markdown);
  const interests = parseInterests(markdown);
  const derived = await readEventsDerived(vaultRoot);
  const { categories } = await readSources(vaultRoot);
  const labels = new Map(categories.map((category) => [category.key, category.label]));
  const handwrittenPlaybooks = Array.isArray(parsed.playbooks) ? parsed.playbooks : [];
  const playbookSources = [...handwrittenPlaybooks, ...(await aiGuideEntries(vaultRoot, new Set(handwrittenPlaybooks.map((item) => String(item?.id || "")))))];
  const playbooks = playbookSources.flatMap((playbook) => {
    if (!playbook?.id || !playbook?.name || !playbook?.sourcePath) return [];
    const updatedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(playbook.updatedAt || "")) ? String(playbook.updatedAt) : "";
    return [{
      id: String(playbook.id),
      name: String(playbook.name),
      dateLabel: String(playbook.dateLabel || ""),
      status: String(playbook.status || "攻略已做"),
      updatedAt,
      sourcePath: String(playbook.sourcePath),
      ...normalizeGuideImage(playbook),
    }];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const playbookRank = new Map(playbooks.map((playbook, index) => [playbook.id, index]));
  const curated = (Array.isArray(parsed.activities) ? parsed.activities : []).map(normalizeActivity).filter(Boolean).map((activity) => ({ ...activity, origin: "curated" }));
  const curatedIds = new Set(curated.map((activity) => activity.id));
  const collected = (derived?.events ?? []).map((event) => collectedActivity(event, labels, derived.generated_at)).filter((activity) => activity && !curatedIds.has(activity.id));
  const merged = [];
  for (const activity of [...curated, ...collected]) {
    if (activity.endDate < today) continue;
    merged.push({
      ...activity,
      interested: Boolean(interests[activity.id]?.interested),
      hidden: Boolean(interests[activity.id]?.hidden),
      hasPlaybook: playbookRank.has(activity.id),
      guideRunning: (await runState(vaultRoot, guideKey(activity.id))).running,
    });
  }
  const activities = merged
    .sort((a, b) => Number(b.hasPlaybook) - Number(a.hasPlaybook)
      || (a.hasPlaybook ? (playbookRank.get(a.id) ?? 0) - (playbookRank.get(b.id) ?? 0) : 0)
      || a.startDate.localeCompare(b.startDate)
      || a.name.localeCompare(b.name, "zh-CN"));
  const attended = (Array.isArray(parsed.guides) ? parsed.guides : []).flatMap((guide) => {
    if (!guide?.id || !guide?.name) return [];
    return [{
      id: String(guide.id),
      name: String(guide.name),
      dateLabel: String(guide.dateLabel || ""),
      status: String(guide.status || "参加过"),
      sourcePath: String(guide.sourcePath || ""),
      ...normalizeGuideImage(guide),
    }];
  });
  return {
    observedAt: new Date().toISOString(),
    today,
    updatedAt: String(parsed.updatedAt || ""),
    scope: String(parsed.scope || "东京／关东为主"),
    activities,
    playbooks,
    attended,
    filters: ["全部", ...new Set(activities.map((activity) => activity.filterTag))],
    collectedAt: derived?.generated_at || "",
    sourcePath: JAPAN_ACTIVITIES_SOURCE,
  };
}

export async function readJapanActivityPlaybook(vaultRoot, playbookId) {
  const id = String(playbookId || "").trim();
  if (!id) throw new Error("没有指定要看的攻略");
  const catalogMarkdown = await fs.readFile(path.join(vaultRoot, JAPAN_ACTIVITIES_SOURCE), "utf8");
  const parsed = parseEmbeddedJson(catalogMarkdown);
  const entries = await guideEntries(vaultRoot, parsed);
  const playbook = entries.find((item) => String(item?.id || "") === id);
  if (!playbook?.name || !playbook?.sourcePath) throw new Error("日本活动里没有这一份攻略");
  const source = playbookSource(vaultRoot, playbook.sourcePath);
  const markdown = await fs.readFile(source.target, "utf8");
  return {
    id,
    name: String(playbook.name),
    dateLabel: String(playbook.dateLabel || ""),
    status: String(playbook.status || "攻略已做"),
    ...normalizeGuideImage(playbook),
    description: frontmatterValue(markdown, "description"),
    updatedAt: frontmatterValue(markdown, "updated") || frontmatterValue(markdown, "date"),
    markdown,
    sourcePath: source.relative,
  };
}

export async function readJapanActivityGuideImage(vaultRoot, guideId, options = {}) {
  const id = String(guideId || "").trim();
  if (!id) throw new Error("没有指定攻略图片");
  const catalogMarkdown = await fs.readFile(path.join(vaultRoot, JAPAN_ACTIVITIES_SOURCE), "utf8");
  const parsed = parseEmbeddedJson(catalogMarkdown);
  const entries = await guideEntries(vaultRoot, parsed);
  const entry = entries.find((item) => String(item?.id || "") === id);
  const image = normalizeGuideImage(entry);
  if (!image.imageUrl) throw new Error("这份攻略还没有可用的官方内容图");

  const fetchImpl = options.fetchImpl || fetch;
  const upstream = await fetchImpl(image.imageUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8,*/*;q=0.1",
      Referer: image.imageSourceUrl || image.imageUrl,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Safari/537.36",
    },
  });
  if (!upstream.ok) throw new Error(`官方内容图暂时不可用（${upstream.status}）`);
  const contentType = String(upstream.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
  if (!/^image\/(?:avif|gif|jpeg|png|webp)$/.test(contentType)) throw new Error("官方图片来源返回的不是受支持图片");
  const declaredSize = Number(upstream.headers.get("content-length") || 0);
  if (Number.isFinite(declaredSize) && declaredSize > 8 * 1024 * 1024) throw new Error("官方内容图超过 8 MB，未加载");
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("官方内容图大小不合适");
  return { bytes, contentType };
}

export async function writeJapanActivityInterest(vaultRoot, payload, options = {}) {
  const activityId = String(payload?.activityId || "").trim();
  const field = typeof payload?.interested === "boolean" ? "interested" : typeof payload?.hidden === "boolean" ? "hidden" : null;
  if (!activityId || !field) throw new Error("标记不完整");
  const target = path.join(vaultRoot, JAPAN_ACTIVITIES_SOURCE);
  const markdown = await fs.readFile(target, "utf8");
  const parsed = parseEmbeddedJson(markdown);
  const derived = await readEventsDerived(vaultRoot);
  const known = (Array.isArray(parsed.activities) ? parsed.activities : []).some((activity) => String(activity?.id || "") === activityId)
    || (derived?.events ?? []).some((event) => String(event.id) === activityId);
  if (!known) throw new Error("找不到这张活动卡");
  const items = parseInterests(markdown);
  const mark = { ...(items[activityId] || {}) };
  if (payload[field]) mark[field] = true; else delete mark[field];
  delete mark.updatedAt;
  if (mark.interested || mark.hidden) items[activityId] = { ...mark, updatedAt: options.now || new Date().toISOString() };
  else delete items[activityId];
  const block = renderInterests(items);
  const start = markdown.indexOf(INTEREST_START);
  const end = markdown.indexOf(INTEREST_END);
  const next = start >= 0 && end > start
    ? `${markdown.slice(0, start)}${block}${markdown.slice(end + INTEREST_END.length)}`
    : `${markdown.trimEnd()}\n\n## 个人标记\n\n> 由小秘书保存，供后续购票和攻略任务读取。\n\n${block}\n`;
  await atomicWrite(target, next);
  return readJapanActivities(vaultRoot);
}
