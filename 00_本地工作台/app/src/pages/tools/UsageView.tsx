import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, Kicker, fmtDateTime, jsonFetch } from "../../page-shared";
import { fmtTokens } from "./job-ui";

type Bucket = { input: number; output: number; cache_read: number; cache_write: number; total: number; messages: number };
type UsageSnapshot = {
  generatedAt: string;
  windowDays: number;
  sourceFound: boolean;
  windows: { last5h: Bucket; today: Bucket; last7d: Bucket; last30d: Bucket };
  daily: Array<Bucket & { date: string }>;
  byModel: Array<Bucket & { model: string }>;
  byProject: Array<Bucket & { project: string }>;
  byJob: Array<Bucket & { job: string }>;
};

const WINDOWS: Array<{ key: keyof UsageSnapshot["windows"]; label: string }> = [
  { key: "last5h", label: "最近 5 小时" },
  { key: "today", label: "今天" },
  { key: "last7d", label: "最近 7 天" },
  { key: "last30d", label: "最近 30 天" },
];
const chartTooltip = { contentStyle: { background: "var(--surface-2, #0e191c)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11 }, labelStyle: { color: "var(--gold)" }, cursor: { fill: "var(--teal-soft)" } };

function BreakdownTable({ title, rows, nameKey }: { title: string; rows: Array<Bucket & Record<string, string | number>>; nameKey: string }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <Card className="usage-table-card">
      <Kicker>最近 30 天</Kicker>
      <h3>{title}</h3>
      <table className="usage-table">
        <thead><tr><th scope="col">名称</th><th scope="col">输入</th><th scope="col">输出</th><th scope="col">缓存</th><th scope="col">合计</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[nameKey])}>
              <th scope="row"><span className="usage-bar" style={{ width: `${(row.total / max) * 100}%` }} aria-hidden="true" />{String(row[nameKey])}</th>
              <td>{fmtTokens(row.input + row.cache_write)}</td>
              <td>{fmtTokens(row.output)}</td>
              <td>{fmtTokens(row.cache_read)}</td>
              <td><strong>{fmtTokens(row.total)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function UsageView({ active }: { active: boolean }) {
  const [data, setData] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      setData(await jsonFetch<UsageSnapshot>("/api/tools/usage"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (active) void load(); }, [active]);
  const chart = data?.daily.map((day) => ({ ...day, label: `${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8, 10))}` })) ?? [];
  return (
    <div className="usage-view">
      <Card className="job-hero">
        <div>
          <Kicker>Claude · 本机会话与工作台后台任务</Kicker>
          <h2>Token 统计</h2>
          {data ? <small>统计于 {fmtDateTime(data.generatedAt)}</small> : null}
        </div>
        <button type="button" className="ghost-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} />刷新</button>
      </Card>
      {error ? <p className="job-message is-error"><AlertTriangle size={14} />{error}</p> : null}
      {data && !data.sourceFound ? <p className="job-message"><AlertTriangle size={14} />没有找到 ~/.claude/projects，只统计工作台后台任务</p> : null}
      <div className="usage-tiles">
        {WINDOWS.map((window) => {
          const bucket = data?.windows[window.key];
          return (
            <Card key={window.key} className="usage-tile">
              <Kicker>{window.label}</Kicker>
              <strong>{bucket ? fmtTokens(bucket.total) : "—"}</strong>
              <small>{bucket ? `输出 ${fmtTokens(bucket.output)} · 缓存读 ${fmtTokens(bucket.cache_read)}` : ""}</small>
            </Card>
          );
        })}
      </div>
      <Card className="usage-chart-card">
        <Kicker>每天合计</Kicker>
        <h3>最近 {data?.windowDays ?? 30} 天</h3>
        <div className="usage-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--quiet)" tickLine={false} axisLine={false} minTickGap={16} fontSize={11} />
              <YAxis stroke="var(--quiet)" tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={(value) => fmtTokens(Number(value))} />
              <Tooltip {...chartTooltip} formatter={(value) => [fmtTokens(Number(value)), "token"]} />
              <Bar dataKey="total" fill="var(--teal)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="usage-tables">
        <BreakdownTable title="按模型" rows={data?.byModel ?? []} nameKey="model" />
        <BreakdownTable title="按项目" rows={data?.byProject ?? []} nameKey="project" />
        <BreakdownTable title="工作台后台任务" rows={data?.byJob ?? []} nameKey="job" />
      </div>
    </div>
  );
}
