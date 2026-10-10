import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, ExternalLink, Plus, Tag, X } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

import { Card, Empty, Kicker, fmtDateTime, jsonFetch } from "../../page-shared";
import { ReceiptLine, RunButton, fmtYen, sendJson, type JobReceipt } from "./job-ui";

type Site = "amazon-jp" | "rakuten" | "yahoo-shopping";
type Cost = { price: number; shipping: number | null; total: number; points: number; net: number } | null;
type Advice = "buy_now" | "wait" | "insufficient_data";
type Offer = { site: Site; title: string | null; url: string | null; price_text: string; shipping_text: string | null; points_text: string | null; note: string | null; cost: Cost };
type PriceItem = {
  slug: string; version: number; errors: string[]; title: string; status: "watching" | "bought" | "dropped"; mode: "link" | "name";
  url: string | null; sites: Site[]; query: string | null; spec: string | null; targetPrice: number | null; note: string;
  lastRun: string | null; observedAt: string | null; offers: Offer[]; failures: { site: Site | null; outcome: string; error: string | null }[];
  series: { run_id: string; net: number }[]; lowest: { run_id: string; net: number } | null; okRuns: number;
  candidates: { label: string; description: string }[]; advice: { advice: Advice; judgment: string } | null; running: boolean;
};
type History = { times_seen: number; lowest_price_text: string; change_from_previous: number | null; is_lowest: boolean | null };
type PriceSearch = {
  slug: string; version: number; errors: string[]; title: string; status: "active" | "paused"; sites: Site[]; query: string | null;
  compareBy: string | null; maxResults: number | null; note: string; lastRun: { run_id: string; started_at: string } | null;
  results: { site: Site; title: string; url: string; price_text: string; size_text: string | null; sponsored: boolean | null; cost: Cost; history: History | null }[];
  advice: { summary: string; picks: { url: string; title: string; site: Site; price_text: string; advice: Advice; reason: string }[] } | null; running: boolean;
};
type PricesPage = {
  items: PriceItem[]; searches: PriceSearch[]; running: boolean; lastRun: JobReceipt | null;
  recommendation: { generatedAt: string; model: string } | null; siteLabels: Record<Site, string>;
};

const SITES: Site[] = ["amazon-jp", "rakuten", "yahoo-shopping"];
const SITE_LABELS: Record<Site, string> = { "amazon-jp": "日亚", rakuten: "楽天", "yahoo-shopping": "Yahoo!" };
const ADVICE_LABELS: Record<Advice, string> = { buy_now: "现在买", wait: "再等等", insufficient_data: "数据不够" };
const ITEM_STATUS: Record<PriceItem["status"], string> = { watching: "追踪中", bought: "已买", dropped: "已停止" };
const chartTooltip = { contentStyle: { background: "var(--surface-2, #0e191c)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11 }, labelStyle: { color: "var(--gold)" } };

/** 运行号 YYYYMMDD-HHmm → 「10/12」。 */
const runLabel = (runId: string) => `${Number(runId.slice(4, 6))}/${Number(runId.slice(6, 8))}`;

function SitePicker({ value, onChange }: { value: Site[]; onChange: (sites: Site[]) => void }) {
  return (
    <div className="price-site-picker" role="group" aria-label="站点">
      {SITES.map((site) => (
        <label key={site}>
          <input type="checkbox" checked={value.includes(site)} onChange={(event) => onChange(event.target.checked ? [...value, site] : value.filter((item) => item !== site))} />
          {SITE_LABELS[site]}
        </label>
      ))}
    </div>
  );
}

function NewItemForm({ kind, onDone }: { kind: "items" | "searches"; onDone: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [sites, setSites] = useState<Site[]>(["amazon-jp", "rakuten"]);
  const [target, setTarget] = useState("");
  const [compareBy, setCompareBy] = useState("到手价");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = kind === "items"
        ? { title, url: url.trim() || undefined, query, sites, target_price: target ? Number(target) : undefined, note }
        : { title, query, sites, compare_by: compareBy, max_results: 10, note };
      await sendJson(`/api/tools/prices/${kind}`, "POST", body);
      onDone(kind === "items" ? "已登记，下次运行时开始追踪" : "已登记类别搜索");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登记失败");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="price-form" onSubmit={(event) => void submit(event)}>
      <label><span>名称</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required /></label>
      {kind === "items" ? <label><span>商品链接</span><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.amazon.co.jp/dp/…" inputMode="url" /></label> : null}
      {kind === "items" && url.trim() ? null : (
        <>
          <label><span>搜索词</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={60} placeholder="日文搜索词" /></label>
          <SitePicker value={sites} onChange={setSites} />
        </>
      )}
      {kind === "items"
        ? <label><span>目标价</span><input value={target} onChange={(event) => setTarget(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="日元" /></label>
        : <label><span>比较方式</span><input value={compareBy} onChange={(event) => setCompareBy(event.target.value)} maxLength={60} placeholder="到手价 / 每公斤单价" /></label>}
      <label className="is-wide"><span>备注</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} /></label>
      {error ? <p className="price-form-error"><AlertTriangle size={14} />{error}</p> : null}
      <div className="price-form-actions"><button type="submit" className="gold-button small" disabled={saving}>登记</button></div>
    </form>
  );
}

function Sparkline({ series }: { series: PriceItem["series"] }) {
  if (series.length < 2) return null;
  const data = series.map((point) => ({ label: runLabel(point.run_id), net: point.net }));
  return (
    <div className="price-sparkline" aria-label="到手价走势">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 4, bottom: 2, left: 4 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip {...chartTooltip} formatter={(value) => [fmtYen(Number(value)), "最低到手价"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""} />
          <Line type="monotone" dataKey="net" stroke="var(--teal)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ItemCard({ item, globalRunning, onChanged, onMessage }: { item: PriceItem; globalRunning: boolean; onChanged: () => void; onMessage: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const best = item.offers[0];
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) onMessage(done);
      onChanged();
    } catch (reason) {
      onMessage(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (status: PriceItem["status"]) => act(() => sendJson(`/api/tools/prices/items/${item.slug}`, "PATCH", { status, version: item.version }));
  return (
    <Card className={`price-card is-${item.status}`}>
      <header>
        <div>
          <Kicker>{item.mode === "link" ? `链接 · ${item.sites.map((site) => SITE_LABELS[site]).join("")}` : `名称 · ${item.sites.map((site) => SITE_LABELS[site]).join(" / ")}`}</Kicker>
          <h3>{item.title}</h3>
          {item.spec ? <small className="price-spec">同款：{item.spec}</small> : null}
        </div>
        <span className="price-status">{ITEM_STATUS[item.status]}</span>
      </header>
      {item.errors.length ? <p className="price-errors"><AlertTriangle size={14} />{item.errors[0]}</p> : null}
      <div className="price-numbers">
        <div><small>当前最低到手价</small><strong>{best?.cost ? fmtYen(best.cost.net) : "—"}</strong>{best ? <span>{SITE_LABELS[best.site]}{best.cost?.shipping == null ? " · 运费未知" : ""}</span> : null}</div>
        <div><small>记录内最低</small><strong>{fmtYen(item.lowest?.net)}</strong>{item.lowest ? <span>{runLabel(item.lowest.run_id)}</span> : null}</div>
        <div><small>目标价</small><strong>{fmtYen(item.targetPrice)}</strong><span>{item.okRuns} 次成功观测</span></div>
      </div>
      <Sparkline series={item.series} />
      {item.advice ? <p className={`price-advice is-${item.advice.advice}`}><Tag size={13} /><strong>{ADVICE_LABELS[item.advice.advice]}</strong>{item.advice.judgment}</p> : null}
      {item.candidates.length ? (
        <div className="price-candidates">
          <strong>这个名称对应多件商品，选一件：</strong>
          {item.candidates.map((option) => (
            <button type="button" key={option.label} disabled={busy} onClick={() => void act(() => sendJson(`/api/tools/prices/items/${item.slug}`, "PATCH", { spec: option.label, version: item.version }), "已确认同款，下次运行按它比价")}>
              <span>{option.label}</span><small>{option.description}</small>
            </button>
          ))}
        </div>
      ) : null}
      {item.offers.length ? (
        <ul className="price-offers">
          {item.offers.slice(0, 4).map((offer, index) => (
            <li key={`${offer.url}-${index}`}>
              <span>{SITE_LABELS[offer.site]}</span>
              <a href={offer.url ?? undefined} target="_blank" rel="noreferrer">{offer.title || offer.price_text}<ExternalLink size={11} /></a>
              <strong>{offer.cost ? fmtYen(offer.cost.net) : offer.price_text}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      {item.failures.length ? <p className="price-failures">{item.failures.map((f) => `${f.site ? SITE_LABELS[f.site] : "整体"}：${f.error ?? f.outcome}`).join("；")}</p> : null}
      <footer>
        <small>{item.observedAt ? `观测于 ${fmtDateTime(item.observedAt)}` : "还没有观测"}</small>
        <div>
          {item.status === "watching" ? (
            <>
              <RunButton small running={item.running} busy={busy || globalRunning} label="立即搜索" onClick={() => void act(() => sendJson("/api/tools/jobs/run", "POST", { job: "prices", scope: `items/${item.slug}` }), "已开始搜索这一件")} />
              <button type="button" className="ghost-button small" disabled={busy} onClick={() => void setStatus("bought")}>已买</button>
              <button type="button" className="ghost-button small" disabled={busy} onClick={() => void setStatus("dropped")}>停止</button>
            </>
          ) : <button type="button" className="ghost-button small" disabled={busy} onClick={() => void setStatus("watching")}>恢复追踪</button>}
        </div>
      </footer>
    </Card>
  );
}

function SearchCard({ search, globalRunning, onChanged, onMessage }: { search: PriceSearch; globalRunning: boolean; onChanged: () => void; onMessage: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) onMessage(done);
      onChanged();
    } catch (reason) {
      onMessage(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const picks = new Set(search.advice?.picks.map((pick) => pick.url));
  return (
    <Card className={`price-card is-${search.status}`}>
      <header>
        <div>
          <Kicker>类别搜索 · {search.sites.map((site) => SITE_LABELS[site]).join(" / ")}{search.compareBy ? ` · 按${search.compareBy}` : ""}</Kicker>
          <h3>{search.title}</h3>
        </div>
        <span className="price-status">{search.status === "active" ? "搜索中" : "已暂停"}</span>
      </header>
      {search.errors.length ? <p className="price-errors"><AlertTriangle size={14} />{search.errors[0]}</p> : null}
      {search.advice?.summary ? <p className="price-advice"><Tag size={13} />{search.advice.summary}</p> : null}
      {search.results.length ? (
        <ul className="price-offers">
          {search.results.slice(0, 6).map((result) => (
            <li key={result.url} className={picks.has(result.url) ? "is-pick" : ""}>
              <span>{SITE_LABELS[result.site]}</span>
              <a href={result.url} target="_blank" rel="noreferrer">{result.title}<ExternalLink size={11} /></a>
              <strong>{result.cost ? fmtYen(result.cost.net) : result.price_text}</strong>
              {result.history?.is_lowest && result.history.times_seen > 1 ? <em>30 天最低</em> : result.history?.change_from_previous ? <em>{result.history.change_from_previous < 0 ? "降" : "涨"} {fmtYen(Math.abs(result.history.change_from_previous))}</em> : null}
            </li>
          ))}
        </ul>
      ) : <Empty>还没有搜索结果</Empty>}
      <footer>
        <small>{search.lastRun ? `搜索于 ${fmtDateTime(search.lastRun.started_at)}` : "还没有搜索过"}</small>
        <div>
          <RunButton small running={search.running} busy={busy || globalRunning} label="立即搜索" onClick={() => void act(() => sendJson("/api/tools/jobs/run", "POST", { job: "prices", scope: `searches/${search.slug}` }), "已开始搜索")} />
          <button type="button" className="ghost-button small" disabled={busy} onClick={() => void act(() => sendJson(`/api/tools/prices/searches/${search.slug}`, "PATCH", { status: search.status === "active" ? "paused" : "active", version: search.version }))}>{search.status === "active" ? "暂停" : "恢复"}</button>
        </div>
      </footer>
    </Card>
  );
}

export default function PricesView({ active }: { active: boolean }) {
  const [data, setData] = useState<PricesPage | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<"items" | "searches" | null>(null);
  const [showStopped, setShowStopped] = useState(false);
  const load = async () => {
    try {
      setData(await jsonFetch<PricesPage>("/api/tools/prices"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取失败");
    }
  };
  useEffect(() => { if (active) void load(); }, [active]);
  const anyRunning = Boolean(data && (data.running || data.items.some((item) => item.running) || data.searches.some((search) => search.running)));
  // 运行中每 10 秒刷新一次，跑完自动停
  useEffect(() => {
    if (!active || !anyRunning) return;
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [active, anyRunning]);
  const runAll = async () => {
    try {
      const result = await sendJson<{ message: string }>("/api/tools/jobs/run", "POST", { job: "prices" });
      setMessage(result.message);
      void load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "没能发起");
    }
  };
  const items = data?.items.filter((item) => showStopped || item.status === "watching") ?? [];
  const stoppedCount = data?.items.filter((item) => item.status !== "watching").length ?? 0;
  return (
    <div className="prices-view">
      <Card className="job-hero">
        <div>
          <Kicker>日亚 · 楽天 · Yahoo!ショッピング</Kicker>
          <h2>价格追踪</h2>
          <ReceiptLine receipt={data?.lastRun ?? null} />
          {data?.recommendation ? <small>建议生成于 {fmtDateTime(data.recommendation.generatedAt)}</small> : null}
        </div>
        <RunButton running={Boolean(data?.running)} onClick={() => void runAll()} label="全部立即运行" />
      </Card>
      {message ? <p className="job-message" role="status">{message}<button type="button" onClick={() => setMessage("")} aria-label="关闭"><X size={13} /></button></p> : null}
      {error ? <p className="job-message is-error"><AlertTriangle size={14} />{error}</p> : null}

      <section className="price-section">
        <div className="price-section-head">
          <h3>指定商品</h3>
          {stoppedCount ? <button type="button" className="ghost-button small" onClick={() => setShowStopped((value) => !value)}>{showStopped ? "只看追踪中" : `已停止 ${stoppedCount}`}</button> : null}
          <button type="button" className="ghost-button small" onClick={() => setForm(form === "items" ? null : "items")}><Plus size={14} />登记商品</button>
        </div>
        {form === "items" ? <Card><NewItemForm kind="items" onDone={(text) => { setForm(null); setMessage(text); void load(); }} /></Card> : null}
        <div className="price-grid">
          {items.map((item) => <ItemCard key={item.slug} item={item} globalRunning={Boolean(data?.running)} onChanged={() => void load()} onMessage={setMessage} />)}
        </div>
        {data && !items.length ? <Empty>还没有追踪的商品</Empty> : null}
      </section>

      <section className="price-section">
        <div className="price-section-head">
          <h3>类别搜索</h3>
          <button type="button" className="ghost-button small" onClick={() => setForm(form === "searches" ? null : "searches")}><Plus size={14} />登记搜索</button>
        </div>
        {form === "searches" ? <Card><NewItemForm kind="searches" onDone={(text) => { setForm(null); setMessage(text); void load(); }} /></Card> : null}
        <div className="price-grid">
          {data?.searches.map((search) => <SearchCard key={search.slug} search={search} globalRunning={Boolean(data?.running)} onChanged={() => void load()} onMessage={setMessage} />)}
        </div>
        {data && !data.searches.length ? <Empty>还没有类别搜索</Empty> : null}
      </section>
    </div>
  );
}
