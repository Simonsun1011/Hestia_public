import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, RefreshCw } from "lucide-react";

import { Card, Empty, Kicker, fmtDateTime, jsonFetch } from "../../page-shared";
import type { RenewalExpiryItem, RenewalExpirySnapshot } from "../../types";

const GROUPS: Array<{ id: RenewalExpiryItem["group"]; label: string; note: string }> = [
  { id: "overdue", label: "已过期", note: "日期已经过了，需要确认是否已办理或不再使用。" },
  { id: "within30", label: "30 天内", note: "现在就值得安排。" },
  { id: "within90", label: "90 天内", note: "可以开始准备材料或做选择。" },
  { id: "automatic", label: "自动续费／扣费", note: "已有自动处理证据，默认安静展示。" },
  { id: "pending", label: "日期待补", note: "只等你给明确日期，不猜。" },
  { id: "later", label: "90 天以后", note: "现在不用处理，保留在时间轴上。" },
];

function dueLabel(item: RenewalExpiryItem) {
  if (!item.date || item.daysUntil == null) return "日期待补";
  if (item.daysUntil < 0) return `已过 ${Math.abs(item.daysUntil)} 天`;
  if (item.daysUntil === 0) return "就是今天";
  return `还有 ${item.daysUntil} 天`;
}

function modeLabel(item: RenewalExpiryItem) {
  if (item.mode !== "automatic") return item.recurring ? "方式待核对" : "手动处理";
  return item.category === "订阅与服务" ? "自动续费" : "自动扣费";
}

export default function RenewalExpiryView({ active }: { active: boolean }) {
  const [data, setData] = useState<RenewalExpirySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await jsonFetch<RenewalExpirySnapshot>("/api/tools/renewals"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读不到续费到期数据");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active]);

  const actionCount = (data?.counts.overdue || 0) + (data?.counts.within30 || 0);
  const groupedItems = useMemo(() => {
    const grouped = new Map<RenewalExpiryItem["group"], RenewalExpiryItem[]>();
    for (const item of data?.items || []) {
      grouped.set(item.group, [...(grouped.get(item.group) || []), item]);
    }
    return grouped;
  }, [data?.items]);
  return (
    <section className="renewal-expiry" aria-labelledby="renewal-expiry-title">
      <Card className={`renewal-expiry-hero${actionCount ? " has-due" : ""}`}>
        <div>
          <Kicker>时间刻度·只读</Kicker>
          <h2 id="renewal-expiry-title">续费到期</h2>
          <p>证件、资格、订阅和生活服务放在同一条时间轴上。这里不复制金额，也不保存完整卡号或支付密码。</p>
        </div>
        <div className="renewal-expiry-clock">
          <Clock3 size={22} />
          <strong>{loading && !data ? "正在读取" : actionCount ? `${actionCount} 项近期要看` : "暂无近期手动事项"}</strong>
          <small>日本时间 {data?.today || "—"}</small>
          <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={13} />刷新</button>
        </div>
      </Card>

      {error ? <div className="vpn-warning"><CalendarClock size={16} /><div><strong>暂时读不到时间轴</strong><span>{error}</span></div></div> : null}
      {loading && !data ? <Empty>正在检查续费与到期日期。</Empty> : null}

      {data ? (
        <div className="renewal-expiry-groups">
          {GROUPS.map((group) => {
            const items = groupedItems.get(group.id) || [];
            if (!items.length) return null;
            return (
              <section className={`renewal-expiry-group is-${group.id}`} key={group.id}>
                <header><div><Kicker>{items.length} 项</Kicker><h3>{group.label}</h3></div><p>{group.note}</p></header>
                <div className="renewal-expiry-list">
                  {items.map((item) => (
                    <article key={item.id}>
                      <div className="renewal-expiry-tick"><span>{dueLabel(item)}</span><i /></div>
                      <div className="renewal-expiry-copy">
                        <header><span>{item.category}</span><span>{modeLabel(item)}</span></header>
                        <h4>{item.name}</h4>
                        <p>{item.date || "待补日期"}{item.leadDays ? `·提前 ${item.leadDays} 天开始处理` : ""}</p>
                        {item.note ? <small>{item.note}</small> : null}
                        <footer>来源：{item.source}</footer>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
          <small className="renewal-expiry-updated">管理原件更新 {fmtDateTime(data.updatedAt)}。新日期只在你明确提供或权威原件更新后进入。</small>
        </div>
      ) : null}
    </section>
  );
}
