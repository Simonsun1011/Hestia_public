/**
 * 一次任务运行内的模型调用管家：限次数、限总时长、额度用尽即停、超时不重试、记账、留中间文件。
 *
 * 规则（Hestia 的经验）：
 * - 输出不是合格 JSON 才重试，且只重试一次；超时不重试（再等一次多半还是超时，白耗额度）。
 * - 疑似额度用尽或限流：本次余下的调用一律不发起，并让定时任务暂停 5 小时。
 * - 每次运行有调用次数上限与总时长上限，触顶即停，已完成的部分照常保存。
 * - 两次调用之间稍作停顿，避免短时间突发请求。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { parseJsonObject, runClaude } from "./ai-runner.mjs";
import { recordAiCall, setQuotaHold } from "./job-runtime.mjs";

export class AiBudgetStop extends Error {}

/**
 * @param {{ root: string, job: string, runDir: string, maxCalls: number, deadline: number,
 *   spawnImpl?: Function, sleep?: (ms: number) => Promise<void>, now?: () => Date, gapMs?: number }} opts
 */
export function createAiSession(opts) {
  const clock = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const gapMs = opts.gapMs ?? 2000;
  const state = { calls: 0, quotaHit: false, stopReason: null, lastError: null, lastText: "", tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 } };

  const note = async (name, body) => {
    try {
      await fs.mkdir(opts.runDir, { recursive: true });
      await fs.writeFile(path.join(opts.runDir, name), body, "utf8");
    } catch {
      /* 中间文件只为排障，写不进去不影响任务 */
    }
  };

  /** 本次运行是否已经不能再调模型。 */
  const stopped = () => {
    if (state.quotaHit) state.stopReason = "疑似额度用尽或限流，余下各项未调用模型";
    else if (state.calls >= opts.maxCalls) state.stopReason = `本次已调用模型 ${opts.maxCalls} 次，达到上限`;
    else if (clock().getTime() > opts.deadline) state.stopReason = "超出本次运行的总时长";
    else return false;
    return true;
  };

  /**
   * 调一次模型并解析 JSON。失败返回 null，原因在 state.lastError。
   * @param {string} name 中间文件名前缀
   * @param {string} prompt
   * @param {"haiku"|"sonnet"} model
   * @param {{ json?: boolean, timeoutMs?: number, thinking?: boolean }} [options] json 默认 true；false 时返回原文。
   *   thinking 默认 false（低级任务不思考，省输出 token）；判断类任务传 true。
   */
  const call = async (name, prompt, model, options = {}) => {
    const wantJson = options.json !== false;
    state.lastText = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (stopped()) {
        state.lastError = state.stopReason;
        return null;
      }
      if (state.calls > 0) await sleep(gapMs + Math.floor(Math.random() * gapMs));
      state.calls += 1;
      const res = await runClaude({ prompt, model, repoRoot: opts.root, timeoutMs: options.timeoutMs, spawnImpl: opts.spawnImpl, thinking: options.thinking === true });
      await recordAiCall(opts.root, { job: opts.job, requested: model, model: res.model, ok: res.ok, usage: res.usage, at: clock() }).catch(() => {});
      if (res.usage) for (const key of Object.keys(state.tokens)) state.tokens[key] += res.usage[key] ?? 0;
      await note(`${name}.try${attempt}.txt`, res.ok ? res.text : `ERROR ${res.error}`);
      if (res.quota) {
        state.quotaHit = true;
        state.lastError = "疑似额度用尽或限流";
        await setQuotaHold(opts.root, opts.job, clock()).catch(() => {});
        return null;
      }
      if (res.timedOut) {
        state.lastError = "模型调用超时";
        return null;
      }
      if (!res.ok) {
        state.lastError = res.error;
        continue;
      }
      state.lastText = res.text;
      if (!wantJson) return res.text;
      const parsed = parseJsonObject(res.text);
      if (parsed) return parsed;
      state.lastError = "模型输出不是 JSON";
    }
    return null;
  };

  return { call, note, state, stopped };
}

/** 回执里的 token 摘要。 */
export function tokenSummary(tokens) {
  const total = tokens.input + tokens.output + tokens.cache_read + tokens.cache_write;
  return total ? `用 token ${total.toLocaleString("en-US")}` : "";
}
