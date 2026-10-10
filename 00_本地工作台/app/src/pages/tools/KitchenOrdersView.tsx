import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckSquare2, ChefHat, RefreshCw, Search, Share2, Trash2, UtensilsCrossed, X } from "lucide-react";

import { Empty, Kicker, fmtDateTime, jsonFetch } from "../../page-shared";
import "./kitchen-orders.css";

type KitchenOrder = {
  id: string;
  guestName: string;
  visitDate: string;
  note: string;
  dishes: Array<{ id: string; name: { ja: string; zh: string } }>;
  createdAt: string;
  updatedAt: string;
  syncState: "pending" | "archived";
  isNew: boolean;
  isUpdated: boolean;
};

type KitchenOrdersSnapshot = {
  version: 1;
  orders: KitchenOrder[];
  syncedAt: string;
  syncStatus: "ready" | "missing" | "unsynced";
  discardedOrders: number;
  recent: { new: number; updated: number };
};

type ShareStatus = "idle" | "shared" | "copied" | "error";

const KITCHEN_MENU_TEXT = "糖霜庭院·试吃菜单：这是 Infans Studio 的清洁版功能示例，真实菜单地址请由新拥有者自行配置。";

async function copyMenuText() {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(KITCHEN_MENU_TEXT);
    return;
  }

  const field = document.createElement("textarea");
  field.value = KITCHEN_MENU_TEXT;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy failed");
}

function visitDateLabel(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export default function KitchenOrdersView({ active }: { active: boolean }) {
  const [data, setData] = useState<KitchenOrdersSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [cleanupMode, setCleanupMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    jsonFetch<KitchenOrdersSnapshot>("/api/tools/kitchen-orders", { method: "POST", signal: controller.signal })
      .then(setData)
      .catch(async (reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        const syncError = reason instanceof Error ? reason.message : "刷新本地点菜单失败";
        try {
          const snapshot = await jsonFetch<KitchenOrdersSnapshot>("/api/tools/kitchen-orders", { signal: controller.signal });
          setData(snapshot);
          setError(`${syncError}；已保留并显示上次快照`);
        } catch (readReason) {
          if (readReason instanceof DOMException && readReason.name === "AbortError") return;
          setError(readReason instanceof Error ? readReason.message : "读不到私房菜订单");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, refreshKey]);

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleOrders = useMemo(() => {
    if (!normalizedQuery) return data?.orders || [];
    return (data?.orders || []).filter((order) => order.guestName.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
  }, [data?.orders, normalizedQuery]);

  async function shareMenu() {
    setShareStatus("idle");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "糖霜庭院·试吃菜单",
          text: KITCHEN_MENU_TEXT,
        });
        setShareStatus("shared");
        return;
      }
      await copyMenuText();
      setShareStatus("copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await copyMenuText();
        setShareStatus("copied");
      } catch {
        setShareStatus("error");
      }
    }
  }

  function toggleCleanupMode() {
    setCleanupMode((current) => !current);
    setSelectedIds(new Set());
    setActionMessage("");
  }

  function toggleSelected(orderId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function selectVisibleOrders() {
    setSelectedIds(new Set(visibleOrders.map((order) => order.id)));
  }

  async function deleteOrders(orderIds: string[]) {
    if (!orderIds.length || deleting) return;
    const singleOrder = orderIds.length === 1 ? data?.orders.find((order) => order.id === orderIds[0]) : null;
    const prompt = singleOrder
      ? `确定删除「${singleOrder.guestName}」的点菜单吗？本机演示数据会保留可恢复记录。`
      : `确定删除选中的 ${orderIds.length} 份测试点菜单吗？本机演示数据会保留可恢复记录。`;
    if (!window.confirm(prompt)) return;
    setDeleting(true);
    setError("");
    setActionMessage("");
    try {
      const next = await jsonFetch<KitchenOrdersSnapshot & { deletedCount: number }>("/api/tools/kitchen-orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
      });
      setData(next);
      setSelectedIds(new Set());
      setCleanupMode(false);
      setActionMessage(`已删除 ${next.deletedCount} 份点菜单；本机保留可恢复记录。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除点菜单失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="kitchen-orders" aria-labelledby="kitchen-orders-title">
      <header className="kitchen-orders-head">
        <div>
          <Kicker>糖霜庭院·试吃收件簿</Kicker>
          <h2 id="kitchen-orders-title">私房菜单</h2>
          <p>看谁要来、想吃什么。清洁版只保留本机假订单与操作流程；实际收单地址由新拥有者自行配置。</p>
        </div>
        <div className="kitchen-orders-summary" aria-live="polite">
          <ChefHat size={18} aria-hidden="true" />
          <strong>{loading && !data ? "正在读取" : `${data?.orders.length || 0} 份点菜单`}</strong>
          <small>{data?.syncedAt ? `同步于 ${fmtDateTime(data.syncedAt)}` : "尚未同步订单"}</small>
          {data && (data.recent.new || data.recent.updated) ? (
            <p className="kitchen-orders-fresh"><span>新 {data.recent.new}</span><span>更新 {data.recent.updated}</span></p>
          ) : null}
          <div className="kitchen-orders-actions">
            <button className="is-primary" type="button" onClick={shareMenu} aria-label="把私房菜单发给朋友">
              <Share2 size={14} aria-hidden="true" />
              发菜单给朋友
            </button>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="刷新本地点菜单">
              <RefreshCw size={14} className={loading ? "spin" : ""} aria-hidden="true" />
              刷新点菜单
            </button>
            <button type="button" onClick={toggleCleanupMode} disabled={deleting || !data?.orders.length} aria-pressed={cleanupMode} aria-label="选择并清理测试点菜单">
              {cleanupMode ? <X size={14} aria-hidden="true" /> : <CheckSquare2 size={14} aria-hidden="true" />}
              {cleanupMode ? "取消清理" : "清理测试数据"}
            </button>
          </div>
          {shareStatus !== "idle" ? (
            <p className={`kitchen-orders-share-status${shareStatus === "error" ? " is-error" : ""}`} role="status">
              {shareStatus === "shared" ? "分享面板已打开" : shareStatus === "copied" ? "清洁版菜单说明已复制" : "没有成功唤起分享，请稍后重试"}
            </p>
          ) : null}
        </div>
      </header>

      <label className="kitchen-orders-search">
        <Search size={15} aria-hidden="true" />
        <span>按称呼筛选</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：小林" type="search" />
      </label>

      {cleanupMode ? (
        <div className="kitchen-orders-cleanup" role="group" aria-label="批量清理测试点菜单">
          <p>勾选确认是测试数据的订单，再一次删除；不会按名字猜测。</p>
          <div>
            <button type="button" onClick={selectVisibleOrders} disabled={!visibleOrders.length || deleting}>选择当前结果</button>
            <button className="is-danger" type="button" onClick={() => deleteOrders([...selectedIds])} disabled={!selectedIds.size || deleting}>
              <Trash2 size={14} aria-hidden="true" />
              {deleting ? "正在删除" : `删除所选 ${selectedIds.size || ""}`.trim()}
            </button>
          </div>
        </div>
      ) : null}

      {actionMessage ? <p className="kitchen-orders-action-status" role="status">{actionMessage}</p> : null}

      {error ? (
        <div className="kitchen-orders-error" role="alert">
          <UtensilsCrossed size={17} aria-hidden="true" />
          <div><strong>本次同步没有完成</strong><span>{error}。可以稍后再同步。</span></div>
        </div>
      ) : null}
      {loading && !data ? <Empty>正在打开朋友的点菜单。</Empty> : null}

      {data && !data.orders.length ? (
        <Empty>{data.syncStatus === "ready" ? "还没有朋友提交点菜单。" : "订单尚未同步到小秘书。"}</Empty>
      ) : null}
      {data?.orders.length && !visibleOrders.length ? <Empty>没有找到这个称呼的点菜单。</Empty> : null}

      {visibleOrders.length ? (
        <div className="kitchen-orders-list">
          {visibleOrders.map((order) => (
            <article className={`kitchen-order-slip${order.isNew ? " is-new" : order.isUpdated ? " is-updated" : ""}${selectedIds.has(order.id) ? " is-selected" : ""}`} key={order.id}>
              <div className="kitchen-order-date">
                <CalendarDays size={17} aria-hidden="true" />
                <time dateTime={order.visitDate}>{visitDateLabel(order.visitDate)}</time>
                <span>{order.isNew ? "新订单" : order.isUpdated ? "最近更新" : order.syncState === "pending" ? "待同步" : "已安全归档"}</span>
                {cleanupMode ? (
                  <label className="kitchen-order-select">
                    <input type="checkbox" checked={selectedIds.has(order.id)} onChange={() => toggleSelected(order.id)} />
                    <span>选择</span>
                  </label>
                ) : null}
              </div>
              <div className="kitchen-order-body">
                <header><h3>{order.guestName}</h3><small>{order.dishes.length} 道菜</small></header>
                <ul>{order.dishes.map((dish) => <li key={dish.id}>{dish.name.zh}</li>)}</ul>
                {order.note ? <p className="kitchen-order-note"><span>整单备注</span>{order.note}</p> : null}
                <footer>
                  <span>提交 {fmtDateTime(order.createdAt)} · 更新 {fmtDateTime(order.updatedAt)}</span>
                  {!cleanupMode ? (
                    <button type="button" onClick={() => deleteOrders([order.id])} disabled={deleting} aria-label={`删除 ${order.guestName} 的点菜单`}>
                      <Trash2 size={13} aria-hidden="true" />删除
                    </button>
                  ) : null}
                </footer>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
