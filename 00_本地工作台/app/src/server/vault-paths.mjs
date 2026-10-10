/**
 * Vault 一级目录与常用路径常量。
 * 改目录名时只改本文件；业务模块不得再散写字面量路径。
 *
 * 十进制结构（2026-08-03 架构升级）：
 * 00_本地工作台 / 01_中转站 / 10_日志 / 20_个人档案 / 30_事业顺利 /
 * 40_身心健康 / 50_语言学习 / 60_艺术馆藏 / 70_领域研究 /
 * 80_生活事务 / 85_收藏夹 / 90_使用说明 / 99_归档
 */
import path from "node:path";

export const DIR_WORKBENCH = "00_本地工作台";
export const DIR_INBOX = "01_中转站";
export const DIR_LOG = "10_日志";
export const DIR_PROFILE = "20_个人档案";
export const DIR_CAREER = "30_事业顺利";
export const DIR_HEALTH = "40_身心健康";
export const DIR_LANG = "50_语言学习";
export const DIR_LIBRARY = "60_艺术馆藏";
export const DIR_TOPICS = "70_领域研究";
export const DIR_LIFE = "80_生活事务";
export const DIR_BOOKMARKS = "85_收藏夹";
/** @deprecated 用 DIR_BOOKMARKS；保留别名以免旧脚本报错 */
export const DIR_OTHER = DIR_BOOKMARKS;
export const DIR_RULES = "90_使用说明";
export const DIR_ARCHIVE = "99_归档";

export const TODO_PATH = "待办事项与长期规划.md";

export const WORKBENCH_IDENTITY = path.posix.join(DIR_WORKBENCH, "10_设计", "身份策展.md");
export const WORKBENCH_DERIVED_DIR = path.posix.join(DIR_WORKBENCH, "派生数据");
export const WORKBENCH_APP_PREFIX = path.posix.join(DIR_WORKBENCH, "app");
export const HOME_PINS_PATH = path.posix.join(DIR_WORKBENCH, "派生数据", "home-pins.json");
export const LEGACY_HOME_PINS_PATH = path.posix.join(DIR_WORKBENCH, "home-pins.json");
export const GANTT_HIDDEN_PATH = path.posix.join(DIR_WORKBENCH, "派生数据", "gantt-hidden.json");
export const PROJECT_TASK_FOLLOWS_PATH = path.posix.join(DIR_WORKBENCH, "派生数据", "project-task-follows.json");
export const DOMAIN_RESEARCH_PROGRESS_PATH = path.posix.join(DIR_WORKBENCH, "派生数据", "domain-research-progress.json");
export const MUSIC_PLAYLISTS_PATH = path.posix.join(DIR_WORKBENCH, "派生数据", "music-playlists.json");
export const APPLE_HEALTH_DERIVED = path.posix.join(DIR_WORKBENCH, "派生数据", "apple-health.json");
export const ANKI_SNAPSHOT_DERIVED = path.posix.join(DIR_WORKBENCH, "派生数据", "anki-snapshot.json");
export const LANGUAGE_REACTOR_DERIVED = path.posix.join(DIR_WORKBENCH, "派生数据", "language-reactor.json");
export const GAME_ANALYTICS_DERIVED = path.posix.join(DIR_WORKBENCH, "派生数据", "game-analytics.json");
export const KITCHEN_ORDERS_DERIVED = path.posix.join(DIR_WORKBENCH, "派生数据", "kitchen-orders.json");
export const KITCHEN_ORDERS_ARCHIVE = path.posix.join(DIR_LIFE, "日本生活", "私房菜馆", "订单同步归档.md");

/** 支持库中的正式课件；工作台只读扫描课件清单与同目录成品。 */
export const COURSE_LIBRARY_SUPPORT_PATH = path.posix.join("10_学习资料");
export function courseLibrarySupportDir(vaultRoot) {
  const supportRoot = process.env.INFANS_SUPPORT_ROOT || path.resolve(vaultRoot, "..", "Infans_Support");
  return path.resolve(supportRoot, COURSE_LIBRARY_SUPPORT_PATH);
}

/** 支持库中的私人动漫封面；工作台按清单白名单只读，不把图片复制进 Vault。 */
export const ANIME_COVERS_SUPPORT_PATH = path.posix.join("10_学习资料", "艺术馆藏", "动漫封面");
export function animeCoversSupportDir(vaultRoot) {
  const supportRoot = process.env.INFANS_SUPPORT_ROOT || path.resolve(vaultRoot, "..", "Infans_Support");
  return path.resolve(supportRoot, ANIME_COVERS_SUPPORT_PATH);
}

export const DIARY_DIR = path.posix.join(DIR_LOG, "日记");
export const PRIVATE_DIALOGUE_LOG_DIR = path.posix.join(DIR_LOG, "对话日志");
export const CURRENT_WELLBEING_DAILY_PATH = path.posix.join(DIR_HEALTH, "20_记录", "当前身心日评.md");

export const AVATAR_PATH = path.posix.join(DIR_PROFILE, "基础信息", "头像", "辛多雷徽记.jpg");
/** 抖音出镜身份头像（侧栏点头像可切换）。 */
export const AVATAR_CREATOR_PATH = path.posix.join(DIR_PROFILE, "基础信息", "头像", "豆包头像.PNG");
export const ASSET_SOURCE = path.posix.join(DIR_PROFILE, "个人资产", "个人资产记录.md");
/** 个人投资逐笔账本；首期以 A 股样本验证账户、证券、成交与持仓对账。 */
export const A_SHARE_INVESTMENT_LEDGER = path.posix.join(DIR_PROFILE, "个人资产", "A股投资账本.md");
/** 已由本人确认的跨账户交易事实；代持表之后发生的成交从这里增量接入投资看板。 */
export const PERSONAL_TRADE_MEMO = path.posix.join(DIR_CAREER, "金融投资", "20_记录", "个人交易备忘.md");
/** 微信支付导出原件目录（xlsx）；工作台只读解析，不改原件。 */
export const WECHAT_BILLS_DIR = path.posix.join(DIR_LIFE, "生活账单");
/** 固定 / 大事开销备忘（JSON）；支出页只读展示。 */
export const FIXED_EXPENSES_FILE = path.posix.join(WECHAT_BILLS_DIR, "固定开销.json");
/** 日本活动官方来源介绍卡；定时任务只能覆盖这一份白名单原件。 */
export const JAPAN_ACTIVITIES_SOURCE = path.posix.join(DIR_LIFE, "日本游玩攻略", "日本活动.md");
/** 续费／到期管理元数据；不复制金额或完整账号。 */
export const RENEWAL_EXPIRY_SOURCE = path.posix.join(DIR_LIFE, "日常杂务", "续费到期.md");

export const CAREER_OVERVIEW = path.posix.join(DIR_CAREER, "事业顺利_总览.md");
export const FLAGSHIP_OVERVIEW = path.posix.join(DIR_CAREER, "游戏开发", "月蔷薇洋装", "月蔷薇洋装_总览.md");
export const COACHING_OVERVIEW = path.posix.join(DIR_CAREER, "糖霜庭院", "糖霜庭院_总览.md");
export const COACHING_LOG = path.posix.join(DIR_CAREER, "糖霜庭院", "糖霜庭院_更新日志.md");
export const MARKET_BRIEF = path.posix.join(DIR_CAREER, "金融投资", "20_记录", "当前简报.md");
export const MARKET_BRIEF_HISTORY_DIR = path.posix.join(DIR_CAREER, "金融投资", "20_记录", "简报历史");
/** Cursor 可写的一事一档专题目录；工作台只读，不把 Markdown 正文直接交给前端。 */
export const MARKET_EVENT_TOPICS_DIR = path.posix.join(DIR_CAREER, "金融投资", "20_记录", "重大事件专题");

export const HEALTH_OVERVIEW = path.posix.join(DIR_HEALTH, "身心健康_总览.md");
export const BODY_RECORD = path.posix.join(DIR_HEALTH, "20_记录", "三维记录.md");
export const TRAINING_LOG = path.posix.join(DIR_HEALTH, "20_记录", "训练日志.md");
export const TRAINING_REVIEW = path.posix.join(DIR_HEALTH, "20_记录", "训练复盘.md");
export const TRAINING_PLAN = path.posix.join(DIR_HEALTH, "10_设计", "训练计划.md");
export const APPLE_HEALTH_SUMMARY = path.posix.join(DIR_HEALTH, "20_记录", "Apple健康导入摘要.md");
export const WORKVIEW_DOC = path.posix.join(DIR_HEALTH, "10_设计", "工作观.md");
export const LIFEVIEW_DOC = path.posix.join(DIR_HEALTH, "10_设计", "人生观.md");
export const LIFE_DESIGN_LOG = path.posix.join(DIR_HEALTH, "20_记录", "人生设计校准.md");
export const RECENT_WELLBEING_LOG = path.posix.join(DIR_HEALTH, "20_记录", "当前心理与人生平衡.md");
export const ODYSSEY_PLAN = path.posix.join(DIR_HEALTH, "20_记录", "奥德赛计划.md");
export const INTERVENTION_CARDS = path.posix.join(DIR_HEALTH, "90_历史", "干预卡库.md");
export const EXERCISES_DATASET_DIR = path.posix.join(DIR_HEALTH, "exercises-dataset");

export const JP_OVERVIEW = path.posix.join(DIR_LANG, "日语", "日语_总览.md");
export const JP_N2_DIR = path.posix.join(DIR_LANG, "日语", "JLPT_N2_陪跑");
export const JP_STATUS = path.posix.join(JP_N2_DIR, "current_status.md");
export const JP_DAILY = path.posix.join(JP_N2_DIR, "daily_log.md");
export const JP_GRAMMAR_N5 = path.posix.join(JP_N2_DIR, "文法", "N5.md");
export const JP_GRAMMAR_N4 = path.posix.join(JP_N2_DIR, "文法", "N4.md");
export const JP_GRAMMAR_N3 = path.posix.join(JP_N2_DIR, "文法", "N3.md");
export const JP_GRAMMAR_N2 = path.posix.join(JP_N2_DIR, "文法", "N2.md");
export const JP_EXPLORATION_PROGRESS = path.posix.join(JP_N2_DIR, "探索进度.md");
export const JP_MISTAKES = path.posix.join(JP_N2_DIR, "错题集.md");
export const JP_EXAM_SKILL = path.posix.join(JP_N2_DIR, "考官skill.md");
export const JP_MISTAKE_STATE = path.posix.join(JP_N2_DIR, "错题状态.json");
export const JP_SPECIAL_HISTORY_DIR = path.posix.join(JP_N2_DIR, "专项题历史");
export const JP_SPECIAL_MASTERY = path.posix.join(JP_N2_DIR, "专项掌握.json");
export const JP_MOCK_SNAPSHOT = path.posix.join(JP_N2_DIR, "探索全卷快照.json");
export const JP_READING_MILEAGE = path.posix.join(JP_N2_DIR, "阅读练习里程.json");
export const LANGUAGE_REACTOR_SOURCE = path.posix.join(DIR_LANG, "日语", "沉浸语料", "Language Reactor收藏.md");
export const LATIN_OVERVIEW = path.posix.join(DIR_LANG, "拉丁语", "拉丁语_总览.md");
export const CLASSICAL_CN_OVERVIEW = path.posix.join(DIR_LANG, "古汉语", "古汉语_总览.md");

export const LIBRARY_OVERVIEW = path.posix.join(DIR_LIBRARY, "我的书架", "书架_总览.md");
export const WEREAD_PATH = path.posix.join(DIR_LIBRARY, "我的书架", "微信读书.md");
export const PAPER_BOOKS = path.posix.join(DIR_LIBRARY, "我的书架", "纸质书.md");
export const BOOK_COVERS_JSON = path.posix.join(DIR_LIBRARY, "我的书架", "书架封面.json");
export const BOOK_COVERS_DIR = path.posix.join(DIR_LIBRARY, "我的书架", "封面");
export const WRITING_OVERVIEW = path.posix.join(DIR_LIBRARY, "我的写作", "原创写作_总览.md");
export const WRITING_DIR = path.posix.join(DIR_LIBRARY, "我的写作");
/** 公众号《设计手记》正文目录——艺术馆藏「写作」一并展示，文件仍住事业/自媒体。 */
export const WECHAT_OFFICIAL_DIR = path.posix.join(DIR_CAREER, "自媒体", "公众号_设计手记");
export const GAMES_OVERVIEW = path.posix.join(DIR_LIBRARY, "我的游戏", "我的游戏_总览.md");
export const STEAM_LIBRARY_JSON = path.posix.join(DIR_LIBRARY, "我的游戏", "steam_库.json");
export const EXTRA_GAMES_JSON = path.posix.join(DIR_LIBRARY, "我的游戏", "非Steam游戏.json");
export const APPLE_GAMES_JSON = path.posix.join(DIR_LIBRARY, "我的游戏", "apple_games_库.json");
export const GAME_COVERS_DIR = path.posix.join(DIR_LIBRARY, "我的游戏", "封面");
export const GAME_CULTURE_OVERVIEW = path.posix.join(DIR_LIBRARY, "我的游戏", "个人游戏文化谱系_总览.md");
export const GAME_CULTURE_WOW = path.posix.join(DIR_LIBRARY, "我的游戏", "文化谱系", "魔兽世界_TBC时期.md");
export const GAME_CULTURE_SOULS = path.posix.join(DIR_LIBRARY, "我的游戏", "文化谱系", "魂系作品_黑暗之魂与血源诅咒.md");
export const GAME_CULTURE_ZELDA = path.posix.join(DIR_LIBRARY, "我的游戏", "文化谱系", "塞尔达传说系列.md");
export const GAME_CULTURE_SOURCES = Object.freeze([GAME_CULTURE_WOW, GAME_CULTURE_SOULS, GAME_CULTURE_ZELDA]);
export const SCREEN_OVERVIEW = path.posix.join(DIR_LIBRARY, "我的影像", "我的影像_总览.md");
export const SCREEN_CULTURE_FANREN = path.posix.join(DIR_LIBRARY, "我的影像", "文化谱系", "凡人修仙传_动画.md");
export const SCREEN_CULTURE_FMA = path.posix.join(DIR_LIBRARY, "我的影像", "文化谱系", "钢之炼金术师.md");
export const SCREEN_CULTURE_MADOKA = path.posix.join(DIR_LIBRARY, "我的影像", "文化谱系", "魔法少女小圆.md");
export const SCREEN_CULTURE_CODE_GEASS = path.posix.join(DIR_LIBRARY, "我的影像", "文化谱系", "叛逆的鲁路修.md");
export const SCREEN_CULTURE_EAGLE = path.posix.join(DIR_LIBRARY, "我的影像", "文化谱系", "东成西就.md");
export const SCREEN_CULTURE_CINEMA_PARADISO = path.posix.join(DIR_LIBRARY, "我的影像", "文化谱系", "天堂电影院.md");
export const SCREEN_CULTURE_SOURCES = Object.freeze([
  SCREEN_CULTURE_FANREN,
  SCREEN_CULTURE_FMA,
  SCREEN_CULTURE_MADOKA,
  SCREEN_CULTURE_CODE_GEASS,
  SCREEN_CULTURE_EAGLE,
  SCREEN_CULTURE_CINEMA_PARADISO,
]);
export const CULTURE_DOCUMENT_SOURCES = Object.freeze([...GAME_CULTURE_SOURCES, ...SCREEN_CULTURE_SOURCES]);

export const TOPICS_OVERVIEW = path.posix.join(DIR_TOPICS, "领域研究_总览.md");
export const GAME_RESEARCH_OVERVIEW = path.posix.join(DIR_TOPICS, "游戏", "游戏文化研究_总览.md");
export const GAME_RESEARCH_QUESTIONS = path.posix.join(DIR_TOPICS, "游戏", "首批研究问题.md");
export const DEDAO_DIR = path.posix.join(DIR_TOPICS, "90_课程原件", "得到");
export const DEDAO_ARCHIVE = path.posix.join(DEDAO_DIR, "得到课程档案.md");
export const DEDAO_COVERS_JSON = path.posix.join(DEDAO_DIR, "得到课程封面.json");
export const DEDAO_COVERS_DIR = path.posix.join(DEDAO_DIR, "封面");

export const TOPIC_SOURCES = Object.freeze([
  GAME_RESEARCH_OVERVIEW,
  path.posix.join(DIR_TOPICS, "人工智能", "人工智能_总览.md"),
  path.posix.join(DIR_TOPICS, "经济与金融", "经济与金融_总览.md"),
  path.posix.join(DIR_TOPICS, "语言研究", "语言研究_总览.md"),
  path.posix.join(DIR_TOPICS, "思想史", "思想史_总览.md"),
  path.posix.join(DIR_TOPICS, "资治通鉴", "资治通鉴_总览.md"),
  path.posix.join(DIR_TOPICS, "形象管理", "形象管理_总览.md"),
  path.posix.join(DIR_TOPICS, "运动健身", "运动健身_总览.md"),
]);

/** 代码改动强制二次确认：只匹配工作台 app。 */
export function isWorkbenchCodePath(relativePath) {
  const normalized = String(relativePath ?? "").replace(/\\/g, "/");
  const app = `${DIR_WORKBENCH}/app`;
  return normalized === app || normalized.startsWith(`${app}/`);
}

export function diaryPathForDay(day) {
  return path.posix.join(DIARY_DIR, `${day}.md`);
}

export function exerciseMediaPath(folder, stem, ext) {
  return path.posix.join(EXERCISES_DATASET_DIR, folder, `${stem}.${ext}`);
}
