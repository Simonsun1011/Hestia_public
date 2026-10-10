import { Activity } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Kicker } from "../page-shared";

const chartTooltip = { contentStyle: { background: "#0e191c", border: "1px solid #334244", borderRadius: 10, fontSize: 11 }, labelStyle: { color: "#d4c49a" } };

type TrendPoint = { short: string; weightKg?: number; bodyFatPercent?: number };

/** 身体维度曲线（目前体重 / 体脂；以后可加腰围等）。不展示步数柱图。 */
export default function HealthTrendCharts({
  chart,
  weightDomain,
  bodyFatDomain,
}: {
  chart: TrendPoint[];
  weightDomain: [number, number];
  bodyFatDomain: [number, number];
}) {
  return (
    <Card className="health-chart-v2">
      <div className="card-title">
        <div><Kicker>近 30 日趋势</Kicker><h2>身体维度趋势</h2></div>
        <span className="trust-badge">近一月 · 以后会加更多维度</span>
      </div>
      <div className="chart-area compact">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart}>
            <defs>
              <linearGradient id="weightV2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#7ec9c0" stopOpacity={0.35} />
                <stop offset="1" stopColor="#7ec9c0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#253235" vertical={false} />
            <XAxis dataKey="short" stroke="#778385" tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis yAxisId="kg" domain={weightDomain} stroke="#778385" tickLine={false} axisLine={false} width={36} />
            <YAxis yAxisId="fat" orientation="right" domain={bodyFatDomain} stroke="#8d8268" tickLine={false} axisLine={false} width={36} />
            <Tooltip {...chartTooltip} />
            <Area yAxisId="kg" type="basis" dataKey="weightKg" name="体重 kg" stroke="#7ec9c0" fill="url(#weightV2)" strokeWidth={2.4} connectNulls dot={false} activeDot={{ r: 3 }} />
            <Area yAxisId="fat" type="basis" dataKey="bodyFatPercent" name="体脂率 %" stroke="#d4c49a" fill="none" strokeWidth={2.4} connectNulls dot={false} activeDot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note"><Activity size={12} /> 现在只有体重和体脂；腰围等维度有连续数据后再加线。</p>
    </Card>
  );
}
