import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "infans-test-"));
}

export async function writeFile(root, rel, text) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
  return file;
}

/** 假的 claude 子进程：按顺序返回给定文本（或错误）。记录收到的 prompt。 */
export function fakeClaude(replies) {
  const calls = [];
  const spawnImpl = async (spec) => {
    calls.push(spec);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply && typeof reply === "object" && "raw" in reply) return { stdout: reply.raw, stderr: reply.stderr ?? "", exitCode: reply.exitCode ?? 0, timedOut: Boolean(reply.timedOut) };
    const result = typeof reply === "string" ? reply : JSON.stringify(reply);
    return {
      stdout: JSON.stringify({ type: "result", is_error: false, result, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, modelUsage: { "claude-haiku-4-5": {} } }),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    };
  };
  return { spawnImpl, calls };
}

/** 假的 fetch：按 URL 返回 HTML。 */
export function fakeFetch(pages) {
  return async (url) => {
    const html = pages[url];
    if (html == null) return new Response("not found", { status: 404 });
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
}
