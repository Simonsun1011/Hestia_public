/** Vault 一级目录名（与 server/vault-paths.mjs 保持同步）。 */
export const DIR_WORKBENCH = "00_本地工作台";
export const JAPAN_ACTIVITIES_SOURCE = "80_生活事务/出行攻略/日本活动.md";
export const RENEWAL_EXPIRY_SOURCE = "80_生活事务/日常杂务/续费到期.md";
export const KITCHEN_ORDERS_DERIVED = "00_本地工作台/派生数据/kitchen-orders.json";
export const KITCHEN_ORDERS_ARCHIVE = "80_生活事务/日本生活/私房菜馆/订单同步归档.md";
export const MARKET_EVENT_TOPICS_DIR = "30_事业顺利/金融投资/20_记录/重大事件专题";
export const GAME_CULTURE_OVERVIEW = "60_艺术馆藏/我的游戏/个人游戏文化谱系_总览.md";
export const GAME_CULTURE_SOURCES = [
  "60_艺术馆藏/我的游戏/文化谱系/魔兽世界_TBC时期.md",
  "60_艺术馆藏/我的游戏/文化谱系/魂系作品_黑暗之魂与血源诅咒.md",
  "60_艺术馆藏/我的游戏/文化谱系/塞尔达传说系列.md",
] as const;
export const SCREEN_OVERVIEW = "60_艺术馆藏/我的影像/我的影像_总览.md";
export const SCREEN_CULTURE_SOURCES = [
  "60_艺术馆藏/我的影像/文化谱系/凡人修仙传_动画.md",
  "60_艺术馆藏/我的影像/文化谱系/钢之炼金术师.md",
  "60_艺术馆藏/我的影像/文化谱系/魔法少女小圆.md",
  "60_艺术馆藏/我的影像/文化谱系/叛逆的鲁路修.md",
  "60_艺术馆藏/我的影像/文化谱系/东成西就.md",
  "60_艺术馆藏/我的影像/文化谱系/天堂电影院.md",
] as const;
export const CULTURE_DOCUMENT_SOURCES = [...GAME_CULTURE_SOURCES, ...SCREEN_CULTURE_SOURCES] as const;

export function isWorkbenchCodePath(relativePath: string | undefined | null): boolean {
  const normalized = String(relativePath ?? "").replace(/\\/g, "/");
  const app = `${DIR_WORKBENCH}/app`;
  return normalized === app || normalized.startsWith(`${app}/`);
}
