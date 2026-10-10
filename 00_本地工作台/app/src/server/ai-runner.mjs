/**
 * 后台 AI 任务调用 Claude Code CLI 的唯一入口（价格追踪、东京活动、攻略生成共用）。
 *
 * 做法沿用 Hestia 的实测结论：
 * - 模型不联网、不读写文件、不执行命令：`--tools ""`，换掉默认系统提示，不加载 MCP、技能与斜杠命令。
 *   页面由脚本抓取、转成纯文本后放进 prompt，模型只做摘录与判断。
 * - 外包一层 macOS `sandbox-exec`，禁止子进程读写本仓库与 home 下的敏感目录，由操作系统强制。
 * - cwd 为每次新建的临时目录，用完即删；子进程环境只有 PATH、HOME、USER、LOGNAME（订阅登录走钥匙串）。
 * - 以独立进程组启动，超时杀整组；本进程退出时也杀掉仍在册的组，不留孤儿进程。
 * - 不留会话（`--no-session-persistence`）；每次调用的 token 记进运行状态目录的账本，Token 统计页一并计入。
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** 单次调用上限。实测一页搜索结果的摘录在 1–3 分钟。 */
export const AI_CALL_TIMEOUT_MS = 300_000;
export const AI_MAX_STDOUT = 1024 * 1024;
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const CHILD_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

/** 设置页可选的模型。只给 Haiku 与 Sonnet：朋友是 20 美元订阅，不开放更贵的。 */
export const MODEL_CHOICES = Object.freeze(["haiku", "sonnet"]);

export function isModelChoice(value) {
  return typeof value === "string" && MODEL_CHOICES.includes(value);
}

/** home 下禁止子进程读写的目录与文件（仓库目录另行加入）。 */
export const HOME_DENY = Object.freeze([
  "Documents",
  "Desktop",
  "Downloads",
  "Library/Mobile Documents",
  "Library/Mail",
  "Library/Messages",
  "Pictures",
  ".ssh",
  ".aws",
  ".gnupg",
  ".config",
  ".docker",
  ".kube",
  ".netrc",
  ".npmrc",
  ".zsh_history",
  ".bash_history",
]);

/** 生成 sandbox 配置。路径含引号、反斜杠或换行时拒绝（返回 null），不拼接不可控字符。 */
export function sandboxProfile(repoRoot, home) {
  const targets = [repoRoot, ...HOME_DENY.map((item) => path.join(home, item))];
  if (targets.some((item) => !path.isAbsolute(item) || /["\\\n]/.test(item))) return null;
  const rules = targets.map((item) => `(subpath "${item}")`).join(" ");
  return `(version 1)(allow default)(deny file-read-data file-write* ${rules})`;
}

/** Claude Code CLI 路径：先看 INFANS_CLAUDE_BIN，再找常见安装位置与 PATH。找不到返回 null。 */
export function claudeBin(env = process.env, home = os.homedir()) {
  const explicit = String(env.INFANS_CLAUDE_BIN || "").trim();
  if (explicit) return explicit;
  const candidates = [
    path.join(home, ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    ...String(env.PATH || "").split(":").filter(Boolean).map((dir) => path.join(dir, "claude")),
  ];
  return candidates.find((file) => existsSync(file)) || null;
}

const SYSTEM_PROMPT = "You are a text-processing step inside a script. Follow the user's instructions exactly and output only what they ask for.";

/**
 * thinking 为 false 时关掉扩展思考。实测（2.1.283，Haiku）：同款判定输出 85 字节却计 4.7k 输出 token，几乎全是思考；
 * 关掉后降到约 200。`--effort low` 对 Haiku 不起作用。摘录这类低级任务一律关掉。
 */
export function buildClaudeArgs(bin, model, thinking = false) {
  return [
    bin,
    "-p",
    "--model",
    model,
    "--output-format",
    "json",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--tools",
    "",
    "--system-prompt",
    SYSTEM_PROMPT,
    ...(thinking ? [] : ["--settings", '{"alwaysThinkingEnabled":false}']),
  ];
}

/** 额度用尽或限流的迹象。命中后本次运行余下的调用不再发起：再试只会继续失败、继续消耗。 */
export function looksLikeQuota(res) {
  if (res.exitCode === 0 && !res.isError) return false;
  return /rate.?limit|quota|usage limit|too many requests|\b429\b|limit exceeded|exceeded your|out of credits|insufficient (credit|balance)|limit reached|reset at|resets at/i.test(
    `${res.stderr}\n${res.stdout}\n${res.text || ""}`,
  );
}

/**
 * 解析 `--output-format json` 的结果行。返回 { text, isError, usage, model }；无法解析时 text 为 null。
 * usage 四项：input、output、cache_read、cache_write。
 */
export function parseClaudeOutput(stdout) {
  const line = String(stdout || "").trim().split("\n").filter((item) => item.startsWith("{")).pop();
  let out = null;
  try {
    out = line ? JSON.parse(line) : null;
  } catch {
    out = null;
  }
  if (!out || typeof out.result !== "string") return { text: null, isError: true, usage: null, model: null };
  const n = (key) => (typeof out.usage?.[key] === "number" && out.usage[key] > 0 ? Math.floor(out.usage[key]) : 0);
  const models = out.modelUsage && typeof out.modelUsage === "object" ? Object.keys(out.modelUsage) : [];
  return {
    text: out.result,
    isError: out.is_error === true,
    usage: {
      input: n("input_tokens"),
      output: n("output_tokens"),
      cache_read: n("cache_read_input_tokens"),
      cache_write: n("cache_creation_input_tokens"),
    },
    model: models[0] || null,
  };
}

/** 剥掉 ```json 围栏，取第一个 { 到最后一个 } 之间解析。失败返回 null。 */
export function parseJsonObject(text) {
  const body = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const liveGroups = new Set();
let exitHooked = false;

export function killGroup(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* 已退出 */
    }
  }
}

/** 本进程退出时杀掉仍在册的模型进程组。 */
export function killAllGroups() {
  for (const pid of liveGroups) killGroup(pid);
  liveGroups.clear();
}

function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.once("exit", killAllGroups);
}

/** 真实子进程。prompt 走 stdin，不受命令行长度限制。 */
export function realSpawn(spec) {
  return new Promise((resolve) => {
    hookExit();
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    if (child.pid) liveGroups.add(child.pid);
    const done = () => {
      if (!child.pid) return;
      killGroup(child.pid);
      liveGroups.delete(child.pid);
    };
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let timedOut = false;
    let overflow = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killGroup(child.pid);
    }, spec.timeoutMs ?? AI_CALL_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > AI_MAX_STDOUT) {
        overflow = true;
        if (child.pid) killGroup(child.pid);
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 64 * 1024) stderr += chunk.toString("utf8");
    });
    child.stdin.on("error", () => { /* 子进程提前退出时写 stdin 会 EPIPE，结果以 close 为准 */ });
    child.stdin.end(spec.input ?? "");
    child.on("error", (err) => {
      clearTimeout(timer);
      done();
      resolve({ stdout, stderr: `${stderr}${err.message}`, exitCode: null, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done();
      if (overflow) resolve({ stdout: "", stderr: `${stderr}输出超过 1 MB`, exitCode: null, timedOut });
      else resolve({ stdout, stderr, exitCode: code, timedOut });
    });
  });
}

/**
 * 调一次模型。返回 { ok, text, error, timedOut, quota, usage, model }。
 * error 是给人看的一句话；quota 为真表示疑似额度用尽或限流。
 */
export async function runClaude({ prompt, model, repoRoot, timeoutMs, spawnImpl, home = os.homedir(), bin, thinking = false }) {
  const fail = (error, extra = {}) => ({ ok: false, text: null, error, timedOut: false, quota: false, usage: null, model: null, ...extra });
  if (!isModelChoice(model)) return fail(`模型不在可选范围内：${String(model)}`);
  // 测试注入子进程时不要求本机装了 claude
  const cli = bin ?? claudeBin() ?? (spawnImpl ? "claude" : null);
  if (!cli) return fail("找不到 Claude Code CLI，先安装并登录 claude");
  const profile = sandboxProfile(path.resolve(repoRoot), home);
  if (!profile) return fail("sandbox 配置无法生成");
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "infans-ai-"));
  const user = os.userInfo().username;
  try {
    const res = await (spawnImpl || realSpawn)({
      command: SANDBOX_EXEC,
      args: ["-p", profile, ...buildClaudeArgs(cli, model, thinking)],
      cwd: workspace,
      env: { PATH: CHILD_PATH, HOME: home, USER: user, LOGNAME: user },
      input: prompt,
      timeoutMs: timeoutMs ?? AI_CALL_TIMEOUT_MS,
    });
    if (res.timedOut) return fail("模型调用超时", { timedOut: true });
    const parsed = parseClaudeOutput(res.stdout);
    const quota = looksLikeQuota({ ...res, isError: parsed.isError, text: parsed.text });
    if (quota) return fail("疑似额度用尽或限流", { quota: true, usage: parsed.usage, model: parsed.model });
    if (parsed.text == null) return fail(res.exitCode === 0 ? "模型输出无法解析" : `模型进程退出码 ${String(res.exitCode)}`);
    if (parsed.isError || res.exitCode !== 0) return fail(`模型报错：${parsed.text.slice(0, 120)}`, { usage: parsed.usage, model: parsed.model });
    return { ok: true, text: parsed.text, error: null, timedOut: false, quota: false, usage: parsed.usage, model: parsed.model };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}
