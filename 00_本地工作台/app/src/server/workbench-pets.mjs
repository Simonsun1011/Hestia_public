/**
 * 宠物（一级入口「宠物」）。移植自 Hestia 的小花花ちゃん模块，改成可以养多只。
 *
 * 80_生活事务/宠物/<宠物目录>/
 *   档案.md          基本信息，一份（type: pet-profile）
 *   护理/<YYYY-MM-DD>-<slug>.md   驱虫、疫苗、体检、称重等，一次一个（type: care）
 *   用品/<slug>.md   猫粮、零食、猫砂等，一款一个（type: supply）
 *
 * 工作台只读：记录由人或 AI Agent 按 90_使用说明/数据格式_宠物价格活动.md 写。
 * next_due 只是记录，页面列出「快到期」，不自动建待办。
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

import { DIR_LIFE } from "./vault-paths.mjs";
import { addDays, todayTokyo } from "./job-runtime.mjs";

export const PETS_REL = path.posix.join(DIR_LIFE, "宠物");
export const CARE_KINDS = Object.freeze({ deworm: "驱虫", vaccine: "疫苗", nail: "剪指甲", bath: "洗澡", groom: "美容", checkup: "体检", illness: "就医", weigh: "称重", other: "其他" });
export const SUPPLY_KINDS = Object.freeze({ food: "主粮", treat: "零食", litter: "猫砂", toy: "玩具", med: "药品", other: "其他" });
export const SUPPLY_STATUSES = Object.freeze({ using: "在用", tried: "试过", stopped: "停用" });
const DUE_SOON_DAYS = 14;

function plainMeta(data) {
  const meta = {};
  for (const [key, value] of Object.entries(data ?? {})) meta[key] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  return meta;
}

const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

async function readMd(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile()) throw new Error("不是普通文件");
  const parsed = matter(await fs.readFile(file, "utf8"));
  return { meta: plainMeta(parsed.data), body: parsed.content.trim() };
}

async function readDir(dir) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith(".md") && !name.startsWith(".")).sort();
  } catch {
    return [];
  }
}

export function validateCare(meta) {
  const errors = [];
  if (!text(meta.title)) errors.push("缺少 title");
  if (!isDate(meta.date)) errors.push("date 须为 YYYY-MM-DD");
  if (!(meta.kind in CARE_KINDS)) errors.push(`kind 不在枚举内：${String(meta.kind)}`);
  if (meta.next_due != null && meta.next_due !== "" && !isDate(meta.next_due)) errors.push("next_due 须为 YYYY-MM-DD");
  if (meta.weight_kg != null && num(meta.weight_kg) == null) errors.push("weight_kg 须为数字");
  return errors;
}

export function validateSupply(meta) {
  const errors = [];
  if (!text(meta.title)) errors.push("缺少 title");
  if (!(meta.kind in SUPPLY_KINDS)) errors.push(`kind 不在枚举内：${String(meta.kind)}`);
  if (!(meta.status in SUPPLY_STATUSES)) errors.push(`status 不在枚举内：${String(meta.status)}`);
  if (meta.rating != null && !(Number.isInteger(meta.rating) && meta.rating >= 1 && meta.rating <= 5)) errors.push("rating 须为 1–5");
  return errors;
}

/** 年龄：「3 岁 2 个月」。生日不合法返回 null。 */
export function ageLabel(birthday, today) {
  if (!isDate(birthday) || birthday > today) return null;
  let months = (Number(today.slice(0, 4)) - Number(birthday.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(birthday.slice(5, 7));
  if (Number(today.slice(8, 10)) < Number(birthday.slice(8, 10))) months -= 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return years ? `${years} 岁${rest ? ` ${rest} 个月` : ""}` : `${rest} 个月`;
}

async function readPet(root, slug, today) {
  const dir = path.join(root, PETS_REL, slug);
  let profile = null;
  const profileErrors = [];
  try {
    const { meta, body } = await readMd(path.join(dir, "档案.md"));
    if (!text(meta.title)) profileErrors.push("缺少 title");
    profile = {
      name: text(meta.title) ?? slug, species: text(meta.species), breed: text(meta.breed), sex: meta.sex === "female" ? "母" : meta.sex === "male" ? "公" : null,
      neutered: typeof meta.neutered === "boolean" ? meta.neutered : null, birthday: isDate(meta.birthday) ? meta.birthday : null,
      adopted: isDate(meta.adopted) ? meta.adopted : null, age: ageLabel(meta.birthday, today), note: body,
    };
  } catch {
    profileErrors.push("没有 档案.md");
  }
  const care = [];
  for (const name of await readDir(path.join(dir, "护理"))) {
    try {
      const { meta, body } = await readMd(path.join(dir, "护理", name));
      care.push({
        file: name, errors: validateCare(meta), title: text(meta.title) ?? name, date: isDate(meta.date) ? meta.date : null,
        kind: meta.kind in CARE_KINDS ? meta.kind : "other", kindLabel: CARE_KINDS[meta.kind] ?? "其他",
        product: text(meta.product), vet: text(meta.vet), cost: num(meta.cost), weightKg: num(meta.weight_kg),
        nextDue: isDate(meta.next_due) ? meta.next_due : null, note: body,
      });
    } catch (err) {
      care.push({ file: name, errors: [err instanceof Error ? err.message : "读取失败"], title: name, date: null, kind: "other", kindLabel: "其他", note: "" });
    }
  }
  care.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || b.file.localeCompare(a.file));
  const supplies = [];
  for (const name of await readDir(path.join(dir, "用品"))) {
    try {
      const { meta, body } = await readMd(path.join(dir, "用品", name));
      supplies.push({
        file: name, errors: validateSupply(meta), title: text(meta.title) ?? name, kind: meta.kind in SUPPLY_KINDS ? meta.kind : "other",
        kindLabel: SUPPLY_KINDS[meta.kind] ?? "其他", brand: text(meta.brand), status: meta.status in SUPPLY_STATUSES ? meta.status : "using",
        statusLabel: SUPPLY_STATUSES[meta.status] ?? "在用", started: isDate(meta.started) ? meta.started : null,
        rating: Number.isInteger(meta.rating) ? meta.rating : null, note: body,
      });
    } catch (err) {
      supplies.push({ file: name, errors: [err instanceof Error ? err.message : "读取失败"], title: name, kind: "other", kindLabel: "其他", status: "using", statusLabel: "在用", note: "" });
    }
  }
  const weights = care.filter((item) => item.date && item.weightKg != null).map((item) => ({ date: item.date, kg: item.weightKg })).sort((a, b) => a.date.localeCompare(b.date));
  // 每类护理只看最近一次的 next_due：之后又做过同类护理的，旧的到期提醒作废
  const latestByKind = new Map();
  for (const item of care) if (item.date && !latestByKind.has(item.kind)) latestByKind.set(item.kind, item);
  const horizon = addDays(today, DUE_SOON_DAYS);
  const due = [...latestByKind.values()].filter((item) => item.nextDue && item.nextDue <= horizon)
    .map((item) => ({ kind: item.kind, kindLabel: item.kindLabel, title: item.title, nextDue: item.nextDue, overdue: item.nextDue < today }))
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  return { slug, profile, profileErrors, care, supplies, weights, due };
}

export async function readPets(root, now = new Date()) {
  const today = todayTokyo(now);
  const base = path.join(root, PETS_REL);
  let names = [];
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    names = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort();
  } catch {
    names = [];
  }
  const pets = [];
  for (const slug of names) pets.push(await readPet(root, slug, today));
  return { today, pets, sourceDir: PETS_REL };
}
