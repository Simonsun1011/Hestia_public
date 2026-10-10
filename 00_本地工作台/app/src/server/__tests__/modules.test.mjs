import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { appearsIn, collapseSpace, htmlToText } from "../page-fetch.mjs";
import {
  canonicalProductUrl, createRegistration, offerCost, parsePriceText, readPricesPage, readRegistrations, runPrices,
  updateRegistration, validateItemOutput, validateMatchOutput, validateSearchOutput,
} from "../workbench-prices.mjs";
import { dedupeEvents, parseSources, runEvents, salvageEvents, validateListOutput } from "../workbench-events-collect.mjs";
import { checkGuide } from "../workbench-events-guide.mjs";
import { modelFamily, parseClaudeSession, readUsage } from "../workbench-usage.mjs";
import { ageLabel, readPets } from "../workbench-pets.mjs";
import { readReceipts } from "../job-runtime.mjs";
import { readJapanActivities, writeJapanActivityInterest } from "../workbench-japan-activities.mjs";
import { fakeClaude, fakeFetch, tempRoot, writeFile } from "./helpers.mjs";

describe("价格：校验模型输出", () => {
  const page = "商品A 税込 ￥2,980 送料無料 在庫あり 30ポイント 獲得 ご注文はこちら";

  it("售价与证据必须逐字在页面里", () => {
    const base = { run_id: "r", observed_at: "t", url_visited: "u", site: "amazon-jp" };
    const ok = validateItemOutput({ outcome: "ok", price_text: "￥2,980", evidence: "税込 ￥2,980 送料無料", shipping_text: "送料無料" }, page, base);
    expect(ok.outcome).toBe("ok");
    expect(ok.shipping_text).toBe("送料無料");
    const fake = validateItemOutput({ outcome: "ok", price_text: "￥1,980", evidence: "税込 ￥1,980" }, page, base);
    expect(fake.outcome).toBe("failed");
    // 附带信息抄错只丢那一栏
    const side = validateItemOutput({ outcome: "ok", price_text: "￥2,980", evidence: "税込 ￥2,980 送料無料", points_text: "999pt" }, page, base);
    expect(side.outcome).toBe("ok");
    expect(side.points_text).toBeNull();
  });

  it("搜索结果的链接必须是页面里出现过的", () => {
    const html = `<div><a href="https://www.amazon.co.jp/dp/B000000001/ref=x">猫用爪とぎ 段ボール</a> ￥1,280 送料無料</div>`;
    const text = htmlToText(html, { baseUrl: "https://www.amazon.co.jp/s?k=x", linkFor: (href) => canonicalProductUrl("amazon-jp", href, "https://www.amazon.co.jp/") });
    expect(text.text).toContain("⟨https://www.amazon.co.jp/dp/B000000001⟩");
    const good = { rank: 1, title: "猫用爪とぎ 段ボール", url: "https://www.amazon.co.jp/dp/B000000001", price_text: "￥1,280", evidence: "猫用爪とぎ 段ボール ⟨https://www.amazon.co.jp/dp/B000000001⟩ ￥1,280" };
    const invented = { ...good, rank: 2, url: "https://www.amazon.co.jp/dp/B000000009" };
    const res = validateSearchOutput({ outcome: "ok", results: [good, invented] }, text, { run_id: "r", site: "amazon-jp", query: "q", baseUrl: "https://www.amazon.co.jp/", max: 10 });
    expect(res.results).toHaveLength(1);
    expect(res.siteRun.error).toContain("url 不在页面中");
  });

  it("同款判定：编号越界即失败；已确认同款不得给不明确", () => {
    const results = [{ url: "a" }, { url: "b" }];
    expect(validateMatchOutput({ status: "matched", matches: [{ i: 5 }] }, results, false).status).toBe("failed");
    expect(validateMatchOutput({ status: "matched", matches: [{ i: 1, note: null }] }, results, false).matches[0].result.url).toBe("b");
    expect(validateMatchOutput({ status: "ambiguous", options: [{ label: "a" }, { label: "b" }] }, results, true).status).toBe("failed");
  });

  it("价格原文换算", () => {
    expect(parsePriceText("６２，８００ 円")).toBe(62800);
    expect(offerCost({ price_text: "￥3,000", shipping_text: "3,980円以上送料無料", points_text: "1%" })).toEqual({ price: 3000, shipping: null, total: 3000, points: 30, net: 2970 });
    expect(offerCost({ price_text: "￥4,000", shipping_text: "3,980円以上送料無料", points_text: "40pt" }).net).toBe(3960);
  });

  it("新建登记与改状态（版本令牌）", async () => {
    const root = await tempRoot();
    expect((await createRegistration(root, "items", { title: "", sites: ["rakuten"] })).status).toBe(400);
    expect((await createRegistration(root, "items", { title: "x", url: "https://evil.example.com/a" })).status).toBe(400);
    const made = await createRegistration(root, "items", { title: "猫抓板 \"大号\"", sites: ["rakuten", "bogus"], query: "爪とぎ" });
    expect(made.ok).toBe(true);
    const [reg] = await readRegistrations(root, "items");
    expect(reg.meta.title).toBe('猫抓板 "大号"');
    expect(reg.meta.sites).toEqual(["rakuten"]);
    expect(reg.errors).toEqual([]);
    expect((await updateRegistration(root, "items", reg.slug, { status: "dropped" }, 1)).status).toBe(409);
    expect((await updateRegistration(root, "items", reg.slug, { status: "bogus" }, reg.version)).status).toBe(400);
    expect((await updateRegistration(root, "items", reg.slug, { status: "dropped" }, reg.version)).ok).toBe(true);
    expect((await readRegistrations(root, "items"))[0].meta.status).toBe("dropped");
  });

  it("一次运行：链接追踪，摘录核对后追加观测，写回执", async () => {
    const root = await tempRoot();
    const url = "https://www.amazon.co.jp/dp/B000000001";
    await createRegistration(root, "items", { title: "测试商品", url });
    const fetchImpl = fakeFetch({ [url]: "<html><body><div>测试商品</div><div>価格：￥2,980 税込</div></body></html>" });
    const { spawnImpl, calls } = fakeClaude([
      { outcome: "ok", price_text: "￥2,980", evidence: "価格：￥2,980 税込", list_price_text: null },
      { items: [], searches: [] },
    ]);
    const result = await runPrices({ root, fetchImpl, spawnImpl, sleep: async () => {} });
    expect(result.outcome).toBe("ok");
    expect(calls[0].args).toContain("haiku");
    expect(calls[1].args).toContain("sonnet");
    const page = await readPricesPage(root);
    expect(page.items[0].offers[0]).toMatchObject({ price_text: "￥2,980" });
    expect(page.running).toBe(false);
    const receipts = await readReceipts(root, "prices");
    expect(receipts.at(-1).outcome).toBe("ok");
  });

  it("一次运行：页面抓不到就记失败，不调模型", async () => {
    const root = await tempRoot();
    await createRegistration(root, "items", { title: "测试商品", url: "https://www.amazon.co.jp/dp/B000000002" });
    const { spawnImpl, calls } = fakeClaude([{ items: [], searches: [] }]);
    const result = await runPrices({ root, fetchImpl: fakeFetch({}), spawnImpl, sleep: async () => {} });
    expect(result.outcome).toBe("failed");
    expect(calls).toHaveLength(0);
  });
});

describe("活动采集", () => {
  const sourcesText = `---
categories:
  - key: art
    label: 艺术展
    criteria: 美术馆的展览
sources:
  - name: 测试美术馆
    url: https://museum.example.jp/exhibitions/
    categories: [art]
  - name: 坏来源
    url: http://insecure.example.jp/
    categories: [art]
---
`;

  it("解析来源：非 https 的来源报错", () => {
    const parsed = parseSources(sourcesText);
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.errors[0]).toContain("坏来源");
  });

  it("摘录校验：链接、标题、日期", () => {
    const ctx = { categories: ["art"], today: "2026-10-10", pageText: "印象派展 ⟨https://m.jp/a⟩ 10月1日〜12月1日 一般 2,000円", links: new Set(["https://m.jp/a"]), images: new Map(), labels: new Map([["https://m.jp/a", "印象派展"]]), baseUrl: "https://m.jp/" };
    const out = validateListOutput({ events: [
      { title: "印象派展", category: "art", url: "https://m.jp/a", start_date: "2026-10-01", end_date: "2026-12-01", price_text: "一般 2,000円" },
      { title: "编造的展", category: "art", url: "https://m.jp/zzz", start_date: "2026-10-01", end_date: "2026-12-01" },
      { title: "印象派展", category: "art", url: "https://m.jp/a", start_date: "2026-01-01", end_date: "2026-02-01" },
    ] }, ctx);
    expect(out.events).toHaveLength(1);
    expect(out.events[0].price_text).toBe("一般 2,000円");
    expect(out.rejected.join()).toContain("链接不是页面里的活动链接");
  });

  it("截断的输出保留完整条目", () => {
    expect(salvageEvents('{"events":[{"title":"a"},{"title":"b"},{"tit').events).toHaveLength(2);
  });

  it("去重：同类别同日同名保留信息更全的一条", () => {
    const base = { category: "art", start_date: "2026-10-01", also: [], first_seen: "2026-10-01" };
    const out = dedupeEvents([{ ...base, id: "1", title: "印象派 展", url: "a", source: "s1" }, { ...base, id: "2", title: "印象派展", url: "b", source: "s2", price_text: "1円" }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("2");
    expect(out[0].also).toEqual([{ source: "s1", url: "a" }]);
  });

  it("一次运行：并入活动页；页面没变的来源第二次不调模型", async () => {
    const root = await tempRoot();
    await writeFile(root, "80_生活事务/日本游玩攻略/活动来源.md", sourcesText);
    await writeFile(root, "80_生活事务/日本游玩攻略/日本活动.md", "<!-- INFANS_JAPAN_ACTIVITIES_JSON_START -->\n```json\n{\"activities\":[]}\n```\n<!-- INFANS_JAPAN_ACTIVITIES_JSON_END -->\n");
    const list = `<ul><li><a href="/exhibitions/monet/">モネ展</a> 2026年10月1日〜2026年12月20日</li></ul>`;
    const fetchImpl = fakeFetch({ "https://museum.example.jp/exhibitions/": list });
    const { spawnImpl, calls } = fakeClaude([{ events: [{ title: "モネ展", category: "art", url: "https://museum.example.jp/exhibitions/monet/", start_date: "2026-10-01", end_date: "2026-12-20", summary_zh: "莫奈展" }] }, { venue: null }]);
    const now = () => new Date("2026-10-10T12:00:00+09:00");
    const first = await runEvents({ root, fetchImpl, spawnImpl, sleep: async () => {}, now });
    expect(first.outcome).toBe("ok");
    const callsAfterFirst = calls.length;
    await runEvents({ root, fetchImpl, spawnImpl, sleep: async () => {}, now });
    expect(calls.length).toBe(callsAfterFirst);
    const snapshot = await readJapanActivities(root, { today: "2026-10-10" });
    const card = snapshot.activities.find((a) => a.name === "モネ展");
    expect(card).toMatchObject({ origin: "collected", filterTag: "艺术展", cost: "价格见官方页面" });
    expect(snapshot.filters).toContain("艺术展");
    const after = await writeJapanActivityInterest(root, { activityId: card.id, hidden: true });
    expect(after.activities.find((a) => a.id === card.id).hidden).toBe(true);
  });

  it("攻略校验", () => {
    expect(checkGuide("太短")).toBe("攻略太短");
    expect(checkGuide(`## 一句话\n${"内容".repeat(150)}`)).toBeNull();
    expect(checkGuide(`## 一句话\n${"内容".repeat(150)}<script>x</script>`)).toContain("HTML");
  });
});

describe("Token 统计", () => {
  it("同一消息多行只计一次", () => {
    const line = (usage) => JSON.stringify({ type: "assistant", cwd: "/p", timestamp: "2026-10-10T01:00:00Z", message: { id: "m1", model: "claude-sonnet-5-5", usage } });
    const parsed = parseClaudeSession([line({ input_tokens: 10, output_tokens: 1 }), line({ input_tokens: 10, output_tokens: 50 }), "坏行"].join("\n"));
    expect(parsed.messages.size).toBe(1);
    expect(parsed.messages.get("m1")).toMatchObject({ input: 10, output: 50 });
    expect(modelFamily("claude-haiku-4-5-20251001")).toBe("Haiku");
  });

  it("汇总会话日志与后台任务账本", async () => {
    const root = await tempRoot();
    const projects = await tempRoot();
    const row = JSON.stringify({ type: "assistant", cwd: "/Users/x/Code/demo", timestamp: "2026-10-10T01:00:00Z", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 100, output_tokens: 10 } } });
    await writeFile(projects, "proj/s1.jsonl", `${row}\n`);
    await writeFile(projects, "proj/s2.jsonl", `${row}\n`);
    await writeFile(root, "00_本地工作台/运行状态/ai-calls/2026-10.jsonl", `${JSON.stringify({ ts: "2026-10-10T02:00:00Z", job: "prices", model: "claude-haiku-4-5", input: 50, output: 5, cache_read: 0, cache_write: 0 })}\n`);
    const usage = await readUsage(root, new Date("2026-10-10T12:00:00+09:00"), { projectsRoot: projects });
    expect(usage.windows.today.total).toBe(165);
    expect(usage.byModel.map((m) => m.model)).toEqual(["Opus", "Haiku"]);
    expect(usage.byJob[0]).toMatchObject({ job: "价格追踪", total: 55 });
    expect(usage.byProject.map((p) => p.project)).toContain("demo");
  });
});

describe("宠物", () => {
  it("年龄与到期提醒（同类只看最近一次）", async () => {
    expect(ageLabel("2022-04-12", "2026-10-10")).toBe("4 岁 5 个月");
    const root = await tempRoot();
    await writeFile(root, "80_生活事务/宠物/mochi/档案.md", "---\ntitle: 麻薯\nsex: female\nbirthday: 2025-01-01\n---\n");
    await writeFile(root, "80_生活事务/宠物/mochi/护理/2026-01-01-deworm.md", "---\ntitle: 驱虫\ndate: 2026-01-01\nkind: deworm\nnext_due: 2026-04-01\n---\n");
    await writeFile(root, "80_生活事务/宠物/mochi/护理/2026-09-20-deworm.md", "---\ntitle: 驱虫\ndate: 2026-09-20\nkind: deworm\nnext_due: 2026-10-20\nweight_kg: 3.2\n---\n");
    await writeFile(root, "80_生活事务/宠物/mochi/护理/2026-09-21-bad.md", "---\ntitle: 坏记录\ndate: 2026-9-1\nkind: spa\n---\n");
    const { pets } = await readPets(root, new Date("2026-10-10T12:00:00+09:00"));
    expect(pets[0].profile.name).toBe("麻薯");
    expect(pets[0].due).toEqual([expect.objectContaining({ nextDue: "2026-10-20", overdue: false })]);
    expect(pets[0].weights).toEqual([{ date: "2026-09-20", kg: 3.2 }]);
    expect(pets[0].care.find((c) => c.file === "2026-09-21-bad.md").errors.length).toBeGreaterThan(0);
  });
});

describe("页面文本", () => {
  it("逐字核对只忽略空白", () => {
    expect(appearsIn(collapseSpace("a  b\nc"), "a b c")).toBe(true);
    expect(appearsIn(collapseSpace("abc"), "")).toBe(false);
  });
});
