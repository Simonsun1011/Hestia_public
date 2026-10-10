import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildClaudeArgs, looksLikeQuota, parseClaudeOutput, parseJsonObject, runClaude, sandboxProfile } from "../ai-runner.mjs";
import { createAiSession } from "../job-ai.mjs";
import {
  acquireLock, allRunning, claimPending, liveLock, readQuotaHold, releaseLock, runState, runtimeDir,
} from "../job-runtime.mjs";
import { dueSlot, nextSlot, readSettings, writeSettings, DEFAULT_SETTINGS } from "../workbench-settings.mjs";
import { readSettingsPage, runNow, saveSettings, schedulerTick, startGuide } from "../workbench-jobs-api.mjs";
import { fakeClaude, tempRoot } from "./helpers.mjs";

describe("ai-runner", () => {
  it("不给模型任何工具、换掉系统提示", () => {
    const args = buildClaudeArgs("/bin/claude", "haiku");
    expect(args).toContain("--no-session-persistence");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--system-prompt");
    expect(args[args.indexOf("--model") + 1]).toBe("haiku");
    expect(args[args.indexOf("--settings") + 1]).toContain('"alwaysThinkingEnabled":false');
    expect(buildClaudeArgs("/bin/claude", "sonnet", true)).not.toContain("--settings");
  });

  it("sandbox 拒绝含引号的路径", () => {
    expect(sandboxProfile('/tmp/a"b', "/Users/x")).toBeNull();
    expect(sandboxProfile("/tmp/repo", "/Users/x")).toContain('(subpath "/Users/x/.ssh")');
  });

  it("解析结果与 token", () => {
    const out = parseClaudeOutput(JSON.stringify({ result: "hi", is_error: false, usage: { input_tokens: 5, output_tokens: 2, cache_read_input_tokens: 1, cache_creation_input_tokens: 3 }, modelUsage: { "claude-haiku-4-5": {} } }));
    expect(out).toMatchObject({ text: "hi", isError: false, usage: { input: 5, output: 2, cache_read: 1, cache_write: 3 }, model: "claude-haiku-4-5" });
    expect(parseClaudeOutput("garbage").text).toBeNull();
  });

  it("JSON 围栏与前后文字", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject("说明 {\"a\":2} 结束")).toEqual({ a: 2 });
    expect(parseJsonObject("[1,2]")).toBeNull();
  });

  it("识别额度用尽", () => {
    expect(looksLikeQuota({ exitCode: 1, stdout: "", stderr: "Claude usage limit reached" })).toBe(true);
    expect(looksLikeQuota({ exitCode: 0, stdout: "ok", stderr: "" })).toBe(false);
  });

  it("模型不在可选范围内直接拒绝，不起进程", async () => {
    const { spawnImpl, calls } = fakeClaude(["{}"]);
    const res = await runClaude({ prompt: "x", model: "opus", repoRoot: "/tmp/r", spawnImpl });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("prompt 走 stdin", async () => {
    const { spawnImpl, calls } = fakeClaude(['{"ok":true}']);
    const res = await runClaude({ prompt: "页面文字", model: "haiku", repoRoot: "/tmp/r", spawnImpl });
    expect(res.ok).toBe(true);
    expect(calls[0].input).toBe("页面文字");
    expect(calls[0].args).not.toContain("页面文字");
  });
});

describe("job-ai 会话", () => {
  const base = async (replies, extra = {}) => {
    const root = await tempRoot();
    const fake = fakeClaude(replies);
    const ai = createAiSession({ root, job: "prices", runDir: path.join(root, "run"), maxCalls: 5, deadline: Date.now() + 60_000, spawnImpl: fake.spawnImpl, sleep: async () => {}, ...extra });
    return { root, ai, fake };
  };

  it("输出不是 JSON 才重试一次", async () => {
    const { ai, fake } = await base(["not json", '{"ok":1}']);
    expect(await ai.call("x", "p", "haiku")).toEqual({ ok: 1 });
    expect(fake.calls).toHaveLength(2);
  });

  it("超时不重试", async () => {
    const { ai, fake } = await base([{ raw: "", timedOut: true, exitCode: null }]);
    expect(await ai.call("x", "p", "haiku")).toBeNull();
    expect(ai.state.lastError).toBe("模型调用超时");
    expect(fake.calls).toHaveLength(1);
  });

  it("额度用尽：余下调用不再发起，并暂停定时任务", async () => {
    const { root, ai, fake } = await base([{ raw: "", stderr: "rate limit exceeded", exitCode: 1 }]);
    expect(await ai.call("a", "p", "haiku")).toBeNull();
    expect(await ai.call("b", "p", "haiku")).toBeNull();
    expect(fake.calls).toHaveLength(1);
    expect(await readQuotaHold(root)).not.toBeNull();
  });

  it("达到次数上限即停", async () => {
    const { ai, fake } = await base(['{"a":1}'], { maxCalls: 2 });
    await ai.call("a", "p", "haiku");
    await ai.call("b", "p", "haiku");
    expect(await ai.call("c", "p", "haiku")).toBeNull();
    expect(fake.calls).toHaveLength(2);
    expect(ai.state.stopReason).toContain("上限");
  });

  it("记 token 账本", async () => {
    const { root, ai } = await base(['{"a":1}']);
    await ai.call("a", "p", "haiku");
    const dir = path.join(runtimeDir(root), "ai-calls");
    const [file] = await fs.readdir(dir);
    const row = JSON.parse((await fs.readFile(path.join(dir, file), "utf8")).trim());
    expect(row).toMatchObject({ job: "prices", input: 100, output: 20, ok: true });
  });
});

describe("锁与防重复提交", () => {
  it("O_EXCL 占位：同时两次只有一次成功", async () => {
    const root = await tempRoot();
    const results = await Promise.all([claimPending(root, "prices"), claimPending(root, "prices")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await runState(root, "prices")).running).toBe(true);
  });

  it("过期占位可以重新发起", async () => {
    const root = await tempRoot();
    await claimPending(root, "events");
    const later = new Date(Date.now() + 120_000);
    expect(await claimPending(root, "events", later)).toBe(true);
  });

  it("锁：进程还在时拒绝，进程不在视为残留", async () => {
    const root = await tempRoot();
    expect(await acquireLock(root, "prices")).toBe(true);
    expect(await acquireLock(root, "prices")).toBe(false);
    await fs.writeFile(path.join(runtimeDir(root), "jobs", "prices.lock"), "999999\n2026-01-01T00:00:00+09:00\n");
    expect(await liveLock(root, "prices")).toBeNull();
    expect(await acquireLock(root, "prices")).toBe(true);
    await releaseLock(root, "prices");
    expect(await allRunning(root)).toEqual({});
  });

  it("立即运行：重复点击返回 409，只起一个进程", async () => {
    const root = await tempRoot();
    const spawned = [];
    const spawn = async (_root, job, args) => { spawned.push(args); };
    const first = await runNow(root, { job: "prices" }, new Date(), spawn);
    const second = await runNow(root, { job: "prices" }, new Date(), spawn);
    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
    expect(spawned).toHaveLength(1);
    expect((await runNow(root, { job: "rm -rf" }, new Date(), spawn)).status).toBe(400);
    expect((await runNow(root, { job: "prices", scope: "../x" }, new Date(), spawn)).status).toBe(400);
  });

  it("单份搜索在全量运行时被拒", async () => {
    const root = await tempRoot();
    const spawn = async () => {};
    await runNow(root, { job: "prices" }, new Date(), spawn);
    const res = await runNow(root, { job: "prices", scope: "items/item-1" }, new Date(), spawn);
    expect(res.status).toBe(409);
  });

  it("攻略：不在清单里的活动不生成", async () => {
    const root = await tempRoot();
    await fs.mkdir(path.join(root, "80_生活事务", "出行攻略"), { recursive: true });
    await fs.writeFile(path.join(root, "80_生活事务", "出行攻略", "日本活动.md"), "<!-- INFANS_JAPAN_ACTIVITIES_JSON_START -->\n```json\n{\"activities\":[]}\n```\n<!-- INFANS_JAPAN_ACTIVITIES_JSON_END -->\n");
    const res = await startGuide(root, { activityId: "nope" }, new Date(), async () => {});
    expect(res.status).toBe(404);
  });
});

describe("设置与定时", () => {
  const at = (iso) => new Date(iso);

  it("每天：取今天已过的最后一个时刻", () => {
    const job = { mode: "daily", weekday: "mon", times: ["09:00", "21:00"] };
    expect(dueSlot(at("2026-10-10T08:00:00+09:00"), job)).toBeNull();
    expect(dueSlot(at("2026-10-10T10:00:00+09:00"), job)).toBe("2026-10-10 09:00");
    expect(nextSlot(at("2026-10-10T10:00:00+09:00"), job)).toBe("2026-10-10 21:00");
  });

  it("每周：往回找最近的那一天", () => {
    const job = { mode: "weekly", weekday: "mon", times: ["07:00"] };
    // 2026-10-10 是星期六，最近的星期一是 10-05
    expect(dueSlot(at("2026-10-10T12:00:00+09:00"), job)).toBe("2026-10-05 07:00");
    expect(nextSlot(at("2026-10-10T12:00:00+09:00"), job)).toBe("2026-10-12 07:00");
    // 星期一但时刻未到：取上周一
    expect(dueSlot(at("2026-10-12T06:00:00+09:00"), job)).toBe("2026-10-05 07:00");
  });

  it("写设置：版本令牌防覆盖，非法值拒绝", async () => {
    const root = await tempRoot();
    const { settings, version } = await readSettings(root);
    expect(version).toBeNull();
    expect((await writeSettings(root, { ...settings, models: { extract: "opus", judge: "haiku" } }, null)).status).toBe(400);
    const ok = await writeSettings(root, { ...settings, pausedAll: true }, null);
    expect(ok.ok).toBe(true);
    expect((await writeSettings(root, settings, null)).status).toBe(409);
    expect((await readSettings(root)).settings.pausedAll).toBe(true);
  });

  it("定时器：第一次不补跑；到点发起一次；同一时刻不重复", async () => {
    const root = await tempRoot();
    const spawned = [];
    const spawn = async (_root, job) => { spawned.push(job); };
    const now = at("2026-10-10T10:00:00+09:00");
    expect(await schedulerTick(root, now, spawn)).toEqual([]);
    const later = at("2026-10-11T10:00:00+09:00");
    expect(await schedulerTick(root, later, spawn)).toEqual(["prices"]);
    // 子进程还没起来（占位仍在）时再检查：同一时刻不再发起
    expect(await schedulerTick(root, later, spawn)).toEqual([]);
    expect(spawned).toEqual(["prices"]);
  });

  it("全部暂停时不发起", async () => {
    const root = await tempRoot();
    const spawn = async () => { throw new Error("不该发起"); };
    await writeSettings(root, { ...structuredClone(DEFAULT_SETTINGS), pausedAll: true }, null);
    expect(await schedulerTick(root, new Date(), spawn)).toEqual([]);
  });

  it("改时刻后不立刻补跑", async () => {
    const root = await tempRoot();
    const spawned = [];
    const spawn = async (_root, job) => { spawned.push(job); };
    const now = at("2026-10-10T10:00:00+09:00");
    await schedulerTick(root, now, spawn);
    const page = await readSettingsPage(root, now);
    const next = structuredClone(page.settings);
    next.jobs.prices.times = ["09:30"];
    const saved = await saveSettings(root, { settings: next, version: page.version }, now);
    expect(saved.ok).toBe(true);
    expect(await schedulerTick(root, at("2026-10-10T10:01:00+09:00"), spawn)).toEqual([]);
  });
});
