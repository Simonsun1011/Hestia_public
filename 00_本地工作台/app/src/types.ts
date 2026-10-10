export type SourceMeta = { path: string; updatedAt: string | null };

export type HealthMeasurement = { date: string; weightKg?: number; waist?: number; chest?: number; arm?: number };
export type TrainingSession = {
  date: string;
  title: string;
  status: string;
  exercises: Array<{ name: string; topSet: string; rpe?: number | null; rir?: number | null }>;
};
export type ProjectTaskPriority = "S" | "A" | "B" | "C" | null;

export type ProjectManagementTask = {
  id: string;
  idKind: "explicit" | "derived";
  writable: boolean;
  done: boolean;
  completedAt: string | null;
  text: string;
  displayText: string;
  section: "doing" | "next" | "blocked" | "central-current";
  priority: ProjectTaskPriority;
  date: { start: string; end: string; label: string } | null;
  parentId: string | null;
  /** 已实际绑定的后台执行岗位；没有该字段时不得声称会自动执行。 */
  executorId?: string | null;
  /** 任务下的缩进证据与结果行；用于状态判定，不作为第二原件。 */
  details?: string[];
  /** 显式登记的下次复验时间（ISO）。 */
  reviewAt?: string | null;
  aiExecutionStatus?: "not-run" | "ran-failed" | "blocked";
  blockedByTaskIds?: string[];
  /** 兼容旧消费端的首个功能 ID；新逻辑应使用 featureIds。 */
  featureId: string | null;
  featureIds: string[];
  /** 关联到项目工作线；兼容旧消费端保留首个 ID。 */
  worklineId: string | null;
  worklineIds: string[];
  /** 与该任务显式建立多对多上下文关系的其他任务 ID。 */
  relatedTaskIds: string[];
  dependencyIds: string[];
  sourcePath: string;
  sourceKind: "project" | "central";
  projectId: string | null;
  projectName: string | null;
};

export type ProjectFocusBattleGateStatus = "pending" | "passed" | "blocked";
export type ProjectFocusBattleStatus = "enabled" | "paused" | "completed" | "cancelled";
export type ProjectFocusBattlePhase = "upcoming" | "active" | "paused" | "completed" | "expired" | "cancelled";

export type ProjectFocusBattleStage = {
  id: string;
  name: string;
  dueDate: string;
  focus: string;
  taskIds: string[];
  featureIds: string[];
  dependencyIds: string[];
  deliverables: string[];
  gate: string;
  gateStatus: ProjectFocusBattleGateStatus;
  evidenceRefs: string[];
};

/**
 * “限时大作战”只编排现有任务与功能节点，不复制它们的事实或完成态。
 * phase/currentDay/todayStageId 都由东京日期派生，避免每天写回原件。
 */
export type ProjectFocusBattle = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  status: ProjectFocusBattleStatus;
  phase: ProjectFocusBattlePhase;
  startDate: string;
  endDate: string;
  totalDays: number;
  currentDay: number;
  todayStageId: string | null;
  totalGoal: string;
  finalGate: string;
  riskIds: string[];
  reviewStatus: "pending" | "in-review" | "completed";
  sourcePath: string;
  stages: ProjectFocusBattleStage[];
};

export type ProjectManagementWarning = {
  code: string;
  message: string;
  sourcePath?: string;
  projectId?: string;
  taskId?: string;
};

export type ProjectManagementDocument = {
  currentStatus: string;
  /** 项目总看板优先读取独立摘要；缺失时取“当前状态”首段，最多 96 个字符。 */
  dashboardSummary: string;
  focusBattles: ProjectFocusBattle[];
  doing: ProjectManagementTask[];
  next: ProjectManagementTask[];
  blocked: ProjectManagementTask[];
  blockers: ProjectManagementContextItem[];
  recentCompleted: ProjectManagementContextItem[];
  authoritativeEntries: Array<{ label: string; path: string | null }>;
  warnings: ProjectManagementWarning[];
};

export type ProjectManagementContextItem = {
  id: string | null;
  text: string;
  /** 同一记录可关联多个任务；同一任务也可被多个记录引用。 */
  taskIds: string[];
  worklineIds: string[];
  moduleIds: string[];
  featureIds: string[];
};

export type ProductFeatureStatus = "稳定" | "准备开发" | "设计中" | "开发中" | "测试中" | "等待验收" | "已暂停";

export type ProductFeaturePointSource = {
  label: string;
  path: string;
  externalProjectId?: string;
};

export type ProductFeaturePoint = {
  id?: string;
  text: string;
  status?: string;
  summary?: string;
  source?: ProductFeaturePointSource | null;
  hiddenInDisplayMode: boolean;
  children?: ProductFeaturePoint[];
};

export type ProductFeature = {
  id: string;
  name: string;
  status: ProductFeatureStatus | string;
  description: string;
  points: ProductFeaturePoint[];
  progress: Array<{ kind: "done" | "current" | "next"; text: string }>;
  source: { label: string; path: string } | null;
};

export type ProductFeatureModule = {
  id: string;
  name: string;
  description: string;
  sourcePath?: string;
  features: ProductFeature[];
};

export type ProductFeatureTree = {
  title: string;
  description: string;
  sourcePath: string;
  modules: ProductFeatureModule[];
  warnings: ProjectManagementWarning[];
};

export type ProjectHubStatus = "planned" | "active" | "blocked" | "testing" | "waiting_acceptance" | "paused" | "stable" | "done";

export type ExternalProjectSourceReference = ProductFeaturePointSource & {
  externalProjectId: string;
};

export type ProjectHubFeatureNode = {
  id: string;
  name: string;
  status: ProjectHubStatus;
  description: string;
  hiddenInDisplayMode: boolean;
  source: ExternalProjectSourceReference | null;
  children: ProjectHubFeatureNode[];
};

export type ProjectHubFeatureTree = {
  id: string;
  worklineId: string;
  title: string;
  description: string;
  source: ExternalProjectSourceReference | null;
  modules: Array<{
    id: string;
    name: string;
    status: ProjectHubStatus;
    description: string;
    hiddenInDisplayMode: boolean;
    source: ExternalProjectSourceReference | null;
    features: ProjectHubFeatureNode[];
  }>;
  warnings: ProjectManagementWarning[];
};

export type ProjectHub = {
  schemaVersion: 1;
  project: {
    id: string;
    name: string;
    status: ProjectHubStatus;
    summary: string;
    defaultView: "home" | "featureTree";
  };
  worklines: Array<{
    id: string;
    name: string;
    status: ProjectHubStatus;
    summary: string;
    hiddenInDisplayMode: boolean;
    source: ExternalProjectSourceReference | null;
    view: { kind: "overview" } | { kind: "featureTree"; treeId: string };
  }>;
  featureTrees: ProjectHubFeatureTree[];
  taskLinks: Array<{ taskId: string; worklineId: string; moduleId: string | null; featureId: string | null }>;
  recentLinks: Array<{ recentId: string; worklineId: string; moduleId: string | null; featureId: string | null }>;
  warnings: ProjectManagementWarning[];
};

export type RegisteredProjectManagement = {
  projectId: string | null;
  name: string;
  status: string;
  cardSummary: string;
  entryPath: string | null;
  archived: boolean;
  migrated: boolean;
  managementPath: string | null;
  managementLabel?: string;
  experience: {
    kind: "external" | "launcher";
    label: string;
    url: string | null;
    launcherId: string | null;
  } | null;
  management: ProjectManagementDocument | null;
  featureTree: ProductFeatureTree | null;
  hasFeatureTree?: boolean;
  projectHub?: ProjectHub | null;
  hasProjectHub?: boolean;
};

export type ProjectManagementSnapshot = {
  projects: RegisteredProjectManagement[];
  currentTodos: ProjectManagementTask[];
  relationIndex: ProjectRelationIndex;
  warnings: ProjectManagementWarning[];
};

export type ProjectRelationNodeKind = "project" | "task" | "blocker" | "recent" | "focus-battle" | "focus-stage" | "workline" | "module" | "feature";
export type ProjectRelationType = "child_of" | "has_stage" | "delivers_through" | "depends_on" | "related_to" | "blocks" | "completed" | "recent_for" | "scoped_to_project" | "scoped_to_workline" | "scoped_to_module" | "scoped_to_feature";

export type ProjectRelationRef = {
  kind: ProjectRelationNodeKind;
  id: string;
  projectId: string | null;
};

export type ProjectRelationEdge = {
  type: ProjectRelationType;
  source: ProjectRelationRef;
  target: ProjectRelationRef;
};

export type ProjectRelationIssue = {
  code: "RELATION_SOURCE_ID_MISSING" | "RELATION_SCOPE_MISSING" | "RELATION_TARGET_MISSING" | "RELATION_TARGET_AMBIGUOUS";
  projectId: string | null;
  sourceKind: "task" | "blocker" | "recent";
  sourceId: string | null;
  relationType?: ProjectRelationType;
  targetId?: string;
};

export type ProjectRelationIndex = {
  edges: ProjectRelationEdge[];
  issues: ProjectRelationIssue[];
};

export type ProjectTaskFollowState = { taskKeys: string[] };
export type AppleHealthSummary = {
  schemaVersion: number;
  importedAt: string;
  exportFile: string;
  exportCreatedAt?: string;
  exportCreatedAtKind?: string;
  recordCount: number;
  note: string;
  daily: Array<{
    date: string;
    steps?: number;
    activeEnergy?: number;
    exerciseMinutes?: number;
    standMinutes?: number;
    restingHeartRate?: number;
    /** 客观睡着分钟（S12）；与心舱主观三档分列 */
    sleepMinutes?: number;
    asleepMinutes?: number;
    sources: Record<string, string>;
  }>;
  body: Array<{ date: string; day: string; metric: "weightKg" | "waistCm" | "bodyFatPercent"; value: number; unit: string; source: string }>;
  workouts: Array<{ date: string; day: string; type: string; durationMinutes: number | null; energyKcal: number | null; source: string; end: string | null }>;
  stretch: {
    dailyTargetMinutes: number;
    /** 只有 Apple Watch 已记录日；缺失日不代表未完成。 */
    days: Array<{ date: string; durationMinutes: number; status: "complete" | "partial"; completed: boolean; workoutCount: number; source: string }>;
    missingMeans: "unknown";
  };
  latestBody: Record<string, { date: string; day: string; metric: string; value: number; unit: string; source: string } | null>;
  latestDaily: {
    date: string;
    steps?: number;
    activeEnergy?: number;
    exerciseMinutes?: number;
    restingHeartRate?: number;
    sleepMinutes?: number;
    asleepMinutes?: number;
  } | null;
  sync?: {
    source: "iphone-healthkit";
    deviceId?: string;
    lastSyncedAt: string;
    lastGeneratedAt?: string;
    windowStart?: string;
    windowEnd?: string;
    completeThrough?: string;
    sampleCount?: number;
    lastRun?: {
      runId: string;
      trigger: "background-refresh" | "healthkit-observer" | "app-launch" | "manual";
      startedAt: string;
      finishedAt: string;
    } | null;
  };
};

export type WriteAction =
  | { kind: "toggleTodo"; scope: "today" | "longTerm"; text: string; expectedDone: boolean }
  | { kind: "toggleTodo"; sourcePath: string; id: string; expectedDone: boolean }
  | { kind: "setTodoPriority"; sourcePath: string; id: string; expectedDone: boolean; expectedPriority: ProjectTaskPriority; priority: ProjectTaskPriority }
  | { kind: "acceptProductFeature"; projectId: string; moduleId: string; featureId: string; sourcePath: string; expectedStatus: "等待验收" }
  | { kind: "addTodo"; scope: "today" | "longTerm"; text: string }
  | { kind: "addTodo"; scope: "project"; projectId: string; text: string }
  | { kind: "journal"; text: string }
  | { kind: "editFile"; path: string; content?: string; oldText?: string; newText?: string };

export type WritePreview = {
  token: string;
  kind: string;
  targetPath: string;
  /** 给人看的真实写入目标，例如“财不理你 · 项目进度与待办”。 */
  targetLabel?: string;
  summary: string;
  before: string;
  after: string;
  expiresAt: string;
  requiresConfirm?: boolean;
  /** 导入类预览：来源导出文件名与创建/修改时间，用来核对是不是刚下的那份 */
  sourceFile?: {
    name: string;
    createdAt: string;
    createdAtKind?: "birthtime" | "mtime" | "browser";
  };
  /** Apple Health 导入预览的最小核对信息；确认前必须能看出数据实际覆盖到哪天。 */
  health?: {
    recordCount?: number;
    body?: unknown[];
    daily?: Array<{ date?: string }>;
    workouts?: unknown[];
  };
};

export type LibraryItem = {
  id: string;
  topicId?: string;
  kind: "book" | "course" | "writing" | "topic" | "game" | "animation" | "screen";
  title: string;
  titleZh?: string;
  titleEn?: string;
  titleJa?: string;
  author?: string;
  date?: string;
  category: string;
  tags: string[];
  status: string;
  description: string;
  tip?: string;
  sourcePath: string;
  coverSeed: number;
  coverUrl?: string;
  playtimeHours?: number;
  playtimeMinutes?: number;
  externalUrl?: string;
  medium?: string;
  region?: string;
  viewingStatus?: string;
  releaseYear?: number;
  primaryGenre?: string;
  recommended?: boolean;
  influence?: boolean;
  metadataSource?: string;
  reflectionPrompt?: string;
  archived?: boolean;
  readTime?: number;
  openable?: boolean;
};

export type DomainKnowledgeSource = {
  id: string;
  title: string;
  kind: string;
  role: string;
  locator: string;
  path?: string;
  url?: string;
};

export type DomainKnowledgeLearningResource = {
  id: string;
  title: string;
  kind: string;
  level: string;
  reason: string;
  focus: string;
  creator: string;
  duration: string;
  language: string;
  access: string;
  use: string;
  asOf: string;
  path?: string;
  url?: string;
};

export type DomainKnowledgeLearningRecord = {
  domainId: string;
  nodeId: string;
  recordId: string;
  learningState: "session-recorded" | "initial-understanding" | "can-explain" | "can-transfer" | "revisit-needed";
  sourceConversationId: string;
  title: string;
  date: string;
  summary: string;
  nextStep: string;
  reviewedBy: string;
  acceptedByUser: boolean;
  sourcePath: string;
};

export type DomainKnowledgeNode = {
  domainId: string;
  branchId: string;
  topicId: string;
  nodeId: string;
  title: string;
  description: string;
  status: "formal" | "outline";
  order: number;
  asOf: string;
  jurisdiction: string;
  claimTypes: string[];
  sourcePath: string;
  sources: DomainKnowledgeSource[];
  learningResources: DomainKnowledgeLearningResource[];
  learningState: "not-started" | DomainKnowledgeLearningRecord["learningState"];
  learningRecords: DomainKnowledgeLearningRecord[];
  cards: Array<{
    id: string;
    kind: "authored";
    eyebrow: string;
    title: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
};

export type CultureReflectionCard = {
  id: string;
  title: string;
  description: string;
  medium: string;
  region?: string;
  tags: string[];
  viewingStatus?: string;
  recommended: boolean;
  influence: boolean;
  originalJudgment: string;
  prompts: string[];
  sourcePath: string;
};

export type CultureArchive = {
  cards: CultureReflectionCard[];
  screenCatalog: Array<{
    id: string;
    title: string;
    description: string;
    medium: "动画" | "电影";
    region?: "日漫" | "国漫" | "其他引进" | "";
    tags: string[];
    viewingStatus: "看过" | "正在看" | "想看";
    releaseYear?: number;
    primaryGenre?: string;
    recommended?: boolean;
    metadataSource?: string;
    confirmationSource: string;
    sourcePath: string;
    openable: false;
  }>;
  paths: {
    gameOverview: string;
    screenOverview: string;
  };
};

export type WritingDocument = LibraryItem & {
  markdown: string;
  headings: Array<{ level: number; text: string; id: string }>;
  previousId: string | null;
  nextId: string | null;
  siblings?: Array<{ id: string; title: string }>;
};

export type DevelopmentLogDay = {
  date: string;
  description: string;
  headings: string[];
  markdown: string;
  sourcePath: string;
};

export type DevelopmentLogSnapshot = {
  updatedAt: string;
  sourcePath: string;
  days: DevelopmentLogDay[];
};

export type DiaryModeContextItem = {
  kind: "diary" | "task" | "project" | "calendar" | "wellbeing";
  title: string;
  detail: string;
  sourcePath: string;
  score: number;
  reasons: string[];
  date: string | null;
  caution: string | null;
};

export type DialogueLogEntry = {
  date: string;
  recordId: string;
  title: string;
  description: string;
  markdown: string;
  sourcePath: string;
};

export type DialogueLogDaySummary = {
  date: string;
  dateLabel: string;
  description: string;
  messageCount: number;
  userCount: number;
  assistantCount: number;
};

export type DialogueLogThreadItem =
  | { id: string; kind: "divider"; label: string }
  | { id: string; kind: "message"; role: "user" | "assistant"; speaker: string; markdown: string };

export type DialogueLogDayList = { logs: DialogueLogDaySummary[] };
export type DialogueLogDayDetail = { summary: DialogueLogDaySummary; items: DialogueLogThreadItem[] };

export type DiaryModeSnapshot = {
  generatedAt: string;
  config: { windowDays: number; futureDays: number; maxItems: number; maxChars: number; maxPerSource: number; kindLimits: Record<string, number> };
  primaryPath: { verified: boolean; verifiedAt: string; label: string; runbookPath: string; protocolPath: string };
  mcpPrompt: string;
  fallbackGuide: string;
  preferences: { careAbout: string[]; avoid: string[]; style: string[]; sourcePath: string };
  context: DiaryModeContextItem[];
  contextCharacters: number;
  sourceWarnings: Array<{ code: string; message: string }>;
  dialogueLogs: DialogueLogEntry[];
};

export type DialogueLogImportPreview = WritePreview & {
  kind: "dialogueLog";
  parsed: { recordId: string; occurredAt: string; date: string; title: string; summary: string; needsReview: boolean };
};

export type CalendarEvent = {
  id: string;
  calendar: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  recurring: boolean;
  editable: boolean;
};

export type CalendarSnapshot = {
  available: boolean;
  permission: "granted" | "denied" | "unknown";
  calendars: string[];
  events: CalendarEvent[];
  loading?: boolean;
  source?: "Calendar";
  backend?: "jxa";
  refreshedAt?: string;
  stale?: boolean;
  message?: string;
};

export type MarketBriefHistoryEntry = {
  date: string;
  asOf: string;
  eventsCount: number;
  status: "active" | "quiet" | "unavailable";
  latest: boolean;
};

export type MarketSignalBias = "利好" | "利空" | "还没出";
export type MarketSignalUrgency = "重大" | "今晚盯";
export type MarketSignalTarget = "美股" | "油价" | "利率" | "日元" | "芯片";

export type MarketEventSignal = {
  targets: MarketSignalTarget[];
  bias?: MarketSignalBias;
  urgency?: MarketSignalUrgency;
};

export type MarketEventTopicStatus = "preview" | "published" | "tracking" | "closed";
export type MarketEventTopicPhase = "preview" | "release" | "d1" | "tracking" | "d3" | "d5" | "closed";
export type MarketEventTopicNodeStatus = "recorded" | "current" | "pending";
export type MarketEventDecisionGrade = "SSS" | "S" | "A" | "B" | "C";

export type MarketEventTopicSource = {
  title: string;
  url: string;
  type: string;
};

/**
 * 金融重大事件专题的稳定展示契约。
 * Cursor 可在 MARKET_EVENT_TOPICS_DIR 下写一事一档 Markdown，并把同形 JSON 放进
 * INFANS_MARKET_EVENT_TOPIC_JSON_START / END 标记；解析入口见 parseMarketEventTopicDocument。
 */
export type MarketEventTopic = {
  schemaVersion: number;
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  region: string;
  category: string;
  status: MarketEventTopicStatus;
  /** 专题原件里的观察状态，如“暂定结案”；与 lifecycle status 分开。 */
  sourceStatus: string;
  latestConclusion: string;
  attributionOverall: string;
  officialUrl: string;
  missingEvidence: string[];
  updatedAt: string;
  closeRule: string;
  /** 仅在专题结案且 Studio User 主动要求后记录；用于历史决策检索，未提供表示尚未评级。 */
  decisionGrade?: MarketEventDecisionGrade;
  decisionReview?: string;
  decisionReviewedAt?: string;
  /** true 只用于内置沙盘；界面必须醒目标注，不能当成当前事实。 */
  sample?: boolean;
  sourcePath: string;
  nodes: Array<{
    phase: MarketEventTopicPhase;
    status: MarketEventTopicNodeStatus;
    observedAt: string;
    attribution: string;
    conclusion: string;
    facts: string[];
    candidateJudgments: string[];
    missingEvidence: string[];
    sources: MarketEventTopicSource[];
    evidenceBuckets?: Array<{ key: string; label: string; text: string }>;
  }>;
};

export type MarketBrief = {
  schemaVersion: number;
  generatedAt: string;
  asOf: string;
  headline: string;
  status: "active" | "quiet" | "unavailable";
  events: Array<{
    id: string;
    importance: number;
    category: string;
    title: string;
    fact: string;
    whyItMatters: string;
    marketReaction: string;
    impact: string;
    confidence: string;
    watchNext: string[];
    sources: Array<{ title: string; url: string; type: string }>;
    /** 宏观大事三层初筛；AI热点不填 */
    signal?: MarketEventSignal;
    /** 展示用，最多 3 个 */
    signalTags?: string[];
  }>;
  calendar: Array<{
    date: string;
    title: string;
    region: string;
    importance: number;
    /** 只有官方已确认到具体日期时才为 true；缺省不显示日期格重大标记 */
    dateConfirmed?: boolean;
    /** 极少数特别核心的重大事件额外加星，不从标题猜测 */
    featured?: boolean;
    whyWatch: string;
    sourceUrl: string;
  }>;
  note: string;
  topics: MarketEventTopic[];
  date?: string | null;
  latest?: boolean;
  history?: MarketBriefHistoryEntry[];
};

export type AssetItem = {
  category: string;
  name: string;
  currency: string;
  amount: number;
  rateToCny: number;
  cnyValue: number;
  note: string;
};

export type AssetSnapshot = {
  date: string;
  capturedAt?: string;
  sheet: string;
  /** 无法补采时用上一期顶替；界面必须明示，不得当真实盘点 */
  proxy?: boolean;
  proxyOf?: string;
  proxyNote?: string;
  items: AssetItem[];
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  categories: Array<{ name: string; value: number }>;
  custodyOverlaid?: boolean;
};

export type AssetCashflowMonth = {
  month: string;
  income: number;
  expense: number;
  neutral: number;
  balance: number;
  incomeJpy?: number;
  expenseJpy?: number;
  neutralJpy?: number;
  balanceJpy?: number;
  incomeCount: number;
  expenseCount: number;
  neutralCount: number;
  categories: Array<{ name: string; amount: number; currency?: string }>;
};

export type AssetCashflowEntry = {
  id: string;
  at: string;
  day: string;
  name: string;
  amount: number;
  kind: "income" | "expense" | "neutral";
  category: string;
  type: string;
  method: string;
  status: string;
  note: string;
  channel?: "wechat" | "alipay" | "paypay" | string;
  currency?: "CNY" | "JPY" | string;
};

export type AssetCashflowYear = {
  year: string;
  income: number;
  expense: number;
  neutral: number;
  balance: number;
  incomeJpy?: number;
  expenseJpy?: number;
  balanceJpy?: number;
  incomeCount: number;
  expenseCount: number;
  neutralCount: number;
  monthCount: number;
  categories: Array<{ name: string; amount: number; currency?: string }>;
};

export type AssetBillDownloadPick = {
  name: string;
  createdAt: string;
  createdAtKind: string;
  size: number;
  location: string;
  channel: "wechat" | "paypay" | "alipay" | string;
  inVault: boolean;
} | null;

export type AssetCashflowData = {
  schemaVersion: number;
  currency: "CNY" | "JPY" | "MIXED" | string;
  sourceLabel: string;
  sourceDir: string;
  sources: Array<{
    path: string;
    name?: string;
    title: string;
    range: string;
    exportedAt: string;
    rowCount: number;
    channel?: string;
    location?: string;
    createdAt?: string;
    createdAtKind?: string;
  }>;
  downloadPicks?: { wechat: AssetBillDownloadPick; paypay: AssetBillDownloadPick; alipay?: AssetBillDownloadPick };
  transactionCount: number;
  latestMonth: string;
  years: AssetCashflowYear[];
  months: AssetCashflowMonth[];
  trend: Array<{
    month: string;
    label: string;
    income: number;
    expense: number;
    balance: number;
    incomeJpy?: number;
    expenseJpy?: number;
    balanceJpy?: number;
  }>;
  ledgerByMonth: Record<string, AssetCashflowEntry[]>;
  available: boolean;
  message: string;
};

export type AssetFxInfo = {
  stableJpyToCny: number;
  stableNote?: string;
  liveJpyToCny?: number | null;
  liveUpdatedAt?: string | null;
  liveAvailable?: boolean;
  currentJpyToCny?: number;
  currentSource?: "live" | "stable-fallback";
  currentUpdatedAt?: string | null;
};

export type AssetFixedExpenseItem = {
  id: string;
  name: string;
  kind: "monthly" | "one_time" | "receivable" | string;
  group?: "living" | "repayment" | "receivable" | "event" | string;
  /** 支出页固定扣款分区：生活成本 / 订阅 / 扣款 */
  subgroup?: "living_cost" | "subscription" | "deduction" | string;
  amount: number;
  currency: "CNY" | "JPY" | string;
  status?: string;
  confirmedAt?: string;
  fromMonth?: string;
  fromDate?: string;
  eventMonth?: string;
  eventDate?: string;
  dueDay?: number;
  approximate?: boolean;
  note?: string;
};

export type AssetFixedExpensesData = {
  schemaVersion: number;
  updatedAt: string;
  note: string;
  path: string;
  items: AssetFixedExpenseItem[];
  available: boolean;
  message: string;
};

export type AssetBankIncomeItem = {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  date: string;
  amount: number;
  currency: string;
  counterparty?: string;
  type?: string;
  note?: string;
};

export type AssetBankIncomeData = {
  schemaVersion: number;
  updatedAt: string;
  note: string;
  path: string;
  available: boolean;
  message: string;
  sourceAccount?: { bank: string; branch?: string; last4: string; note?: string } | null;
  incomeItems: AssetBankIncomeItem[];
  totalsRough?: Record<string, unknown> | null;
};

export type InvestmentAccount = {
  id: string;
  label: string;
  broker: string;
  country: string;
  ownerType: string;
  baseCurrency: string;
  accountClass: string;
};

export type InvestmentInstrument = {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  assetClass: string;
  listingCurrency: string;
  exposureTags: string[];
  officialBenchmark: {
    symbol: string;
    name: string;
    returnBasis: string;
    sourceUrl: string;
    indexUrl: string;
  } | null;
};

export type InvestmentTransaction = {
  id: string;
  accountId: string;
  instrumentId: string;
  tradedAt: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  currency: string;
  grossAmount: number;
  /** 仅供跨币种绩效合并；原成交价和成交额仍按 currency 展示。 */
  performanceGrossAmountCny?: number | null;
  fees: number | null;
  taxes: number | null;
  sourceRef: string;
};

export type InvestmentAnalysisEpisode = {
  id: string;
  label: string;
  accountId: string;
  instrumentId: string;
  from: string;
  to: string;
  thesis: string;
  status: "scorable" | "blocked";
  reason?: string;
  asOf?: string;
  priceSeriesLabel?: string;
  marketReferenceLabel?: string;
  initialQuantity?: number;
  initialCost?: number;
  entryPrice?: number;
  exitQuantity?: number;
  exitProceeds?: number;
  remainingQuantity?: number;
  endPrice?: number;
  strategyValue?: number;
  passiveValue?: number;
  remainingMarketValue?: number;
  strategyProfit?: number;
  realizedProfit?: number;
  unrealizedProfit?: number;
  strategyReturn?: number;
  passiveReturn?: number;
  behaviorReturn?: number;
  instrumentCloseReturn?: number;
  marketReferenceReturn?: number | null;
  marketSpread?: number | null;
  entryExecution?: number;
  sellTimingValue?: number;
  sellTimingReturn?: number;
  maxDrawdown?: number;
  verdict?: string;
  comparisonSeries?: Array<{ date: string; strategy: number; passive: number; instrument: number; market: number | null }>;
  actions?: Array<{ id: string; date: string; side: "buy" | "sell"; quantity: number; price: number }>;
  caveats?: string[];
};

export type InvestmentInstrumentPerformance = {
  id: string;
  accountId: string;
  instrumentId: string;
  from: string;
  to: string;
  transactionCount: number;
  currentPosition: boolean;
  quantityMatched: boolean;
  status: "available" | "unavailable";
  basis: "platform-holding" | "transaction-gross" | "platform-pnl-only" | "platform-closed-record";
  investedAmount: number | null;
  endingValue: number | null;
  profit: number | null;
  returnRate: number | null;
  currentMarketValue: number;
  lastTradedAt: string | null;
  platformProfit: number | null;
  note: string;
};

export type InvestmentInstrumentSeries = {
  available: boolean;
  instrumentId: string;
  mode?: "operation" | "market-only";
  symbol?: string;
  name?: string;
  from?: string;
  to?: string;
  sourceLabel?: string;
  note?: string;
  priceCurrency?: string;
  coverage?: { eligibleCount: number; availableCount: number; selectedCount?: number };
  rows?: Array<{ date: string; strategy: number | null; market: number | null; passiveStrategy?: number | null; profit: number; value: number; passiveValue?: number | null; contributed?: number; price: number; quantity: number; externalFlow?: number; passiveUnitsPurchased?: number }>;
  actions?: Array<{ id: string; date: string; side: "buy" | "sell"; quantity: number; price: number; instrumentId?: string; instrumentName?: string; instrumentSymbol?: string }>;
  message: string;
};

export type InvestmentPeriodPerformanceRow = {
  id: string;
  accountId: string;
  instrumentId: string;
  from: string;
  to: string;
  currentPosition: boolean;
  currentMarketValue: number;
  lastTradedAt: string | null;
  transactionCount: number;
  status: "available" | "unavailable";
  basis: "period-strategy" | "period-unavailable" | InvestmentInstrumentPerformance["basis"];
  profit: number | null;
  returnRate: number | null;
  marketReturn: number | null;
  operationDifference: number | null;
  operationProfit: number | null;
  passiveValue: number | null;
  endingValue: number | null;
  contributionRate: number | null;
  note: string;
};

export type InvestmentPeriodPerformance = {
  available: boolean;
  from: string;
  to: string;
  sourceLabel: string;
  summary: {
    totalCount: number;
    availableCount: number;
    positiveCount: number;
    negativeCount: number;
    totalProfit: number;
  };
  rows: InvestmentPeriodPerformanceRow[];
  message: string;
};

export type InvestmentLedgerData = {
  schemaVersion: number;
  baseCurrency: string;
  source: { title: string; asOf: string; path: string };
  coverage: {
    status: "partial" | "complete";
    holdingsStatus: string;
    transactionsStatus: string;
    cashFlowsStatus: string;
    from: string;
    to: string;
    note: string;
    missing: string[];
    futureCapture: string[];
  };
  accounts: InvestmentAccount[];
  instruments: InvestmentInstrument[];
  accountSnapshots: Array<{
    id: string;
    asOf: string;
    accountId: string;
    totalAssets: number;
    cash: number;
    marketValue: number;
    available: number | null;
    withdrawable: number | null;
    investedRatio: number | null;
    reportedPnl: number | null;
    reportedPnlRate: number | null;
    reportedPnlLabel: string;
    holdingPnl: number | null;
    sourceQuality: string;
    note: string;
  }>;
  cashFlowSummaries: Array<{
    id: string;
    accountId: string;
    range: string;
    asOf: string;
    initialAssets: number | null;
    transferIn: number | null;
    transferOut: number | null;
    netInflow: number | null;
    reportedPnl: number | null;
    endingAssets: number | null;
    reconciliationDifference: number | null;
    sourceQuality: string;
    note: string;
  }>;
  transactions: InvestmentTransaction[];
  positionSnapshots: Array<{
    id: string;
    asOf: string;
    accountId: string;
    instrumentId: string;
    quantity: number;
    quantityApproximate: boolean;
    alternateReportedQuantity: number | null;
    referencePrice: number | null;
    costPrice: number | null;
    marketValue: number | null;
    reportedPnl: number | null;
    reportedPnlRate: number | null;
    pnlBasis: string;
    sourceQuality: string;
    note: string;
  }>;
  historicalInvestments: Array<{
    id: string;
    accountId: string;
    instrumentId: string;
    from: string;
    to: string;
    status: "closed" | "recorded";
    investedAmount: number | null;
    endingValue: number | null;
    profit: number | null;
    returnRate: number | null;
    holdingDays: number | null;
    sourceRef: string;
    note: string;
  }>;
  summary: {
    tradeCount: number;
    buyCount: number;
    sellCount: number;
    buyQuantity: number;
    sellQuantity: number;
    netQuantity: number;
    buyGross: number;
    sellGross: number;
    feesKnown: boolean;
    taxesKnown: boolean;
  };
  reconciliations: Array<{
    accountId: string;
    instrumentId: string;
    asOf: string;
    coveredNetQuantity: number;
    reportedQuantity: number;
    openingOrMissingQuantity: number;
    status: "matched" | "needs-opening-position";
  }>;
  accountReconciliations: Array<{
    accountId: string;
    asOf: string;
    reportedMarketValue: number;
    positionMarketValue: number;
    marketValueDifference: number;
    reportedPnl: number | null;
    positionReportedPnl: number;
    pnlDifference: number | null;
    status: "matched" | "mismatch";
  }>;
  portfolio: {
    asOf: string;
    totalAssets: number;
    cash: number;
    marketValue: number;
    investedRatio: number | null;
    accountCount: number;
    positionCount: number;
    reconciledAccountCount: number;
    largestPositionId: string;
    largestPositionWeight: number | null;
    exposures: Array<{ name: string; value: number; weight: number }>;
  };
  performance: {
    from: string;
    to: string;
    availableCount: number;
    rows: InvestmentInstrumentPerformance[];
    accountReturns: Array<{
      accountId: string;
      asOf: string;
      rate: number | null;
      basis: "current-holdings" | "platform-all-period" | "platform-inferred";
      note: string;
    }>;
  };
  returns: { available: boolean; reasons: string[] };
  marketEvidence: {
    asOf: string;
    sources: Array<{ id: string; label: string; kind: string; url: string; retrievedAt: string }>;
    series: Array<{ id: string; label: string; currency: string; sourceId: string; points: Array<{ date: string; value: number }> }>;
  };
  analysis: {
    asOf: string;
    available: boolean;
    episodes: InvestmentAnalysisEpisode[];
    officialBenchmarks: Array<{
      instrumentId: string;
      symbol: string;
      name: string;
      returnBasis: string;
      sourceUrl: string;
      indexUrl: string;
      seriesAvailable: boolean;
      reason: string;
    }>;
  };
  warnings: string[];
  available: boolean;
  message: string;
};

export type AssetVaultData = {
  schemaVersion: number;
  source: { title: string; url: string; googleUpdatedAt: string; syncedAt: string; path: string };
  fx?: AssetFxInfo;
  snapshots: AssetSnapshot[];
  trend: Array<{ date: string; netAssets: number }>;
  sessionExpiresAt: string | null;
  openAccess?: boolean;
  cashflow?: AssetCashflowData;
  custody?: AssetCustodyData;
  investments?: InvestmentLedgerData;
  fixedExpenses?: AssetFixedExpensesData;
  bankIncome?: AssetBankIncomeData;
};

export type AssetCustodyData = {
  available: boolean;
  message: string;
  googleSheetUrl?: string;
  source?: {
    title: string;
    name: string;
    path: string;
    location: string;
    createdAt: string;
    createdAtKind?: string;
    googleSheetUrl?: string;
  } | null;
  usStocks?: { amountJpy: number; costJpy: number; gainJpy: number; yield: number; cnyValue: number };
  funds?: { amountJpy: number; costJpy: number; gainJpy: number; yield: number; cnyValue: number };
  total?: {
    amountJpy: number;
    costJpy: number;
    gainJpy: number;
    yield: number;
    cnyValue: number;
    costCny: number;
    gainCny: number;
    cnyYield: number;
  };
  receivableCny?: number;
  income?: {
    label: string;
    gainJpy: number;
    gainCny: number;
    yield: number;
    cnyYield: number;
    usGainJpy: number;
    fundsGainJpy: number;
  };
  compareJune?: {
    usStocksJpyJune: number;
    fundsJpyJune: number;
    receivableCnyJune: number;
    usStocksJpyDelta: number;
    fundsJpyDelta: number;
    receivableCnyDelta: number;
  };
  overlayItems?: AssetItem[];
};

export type VpnClientStatus = {
  id: string;
  label: string;
  onlineSessions: number;
  currentSourceCount: number;
  sourceNetworks24h: number;
  sourceNetworks7d: number;
  lastSeen: string | null;
  sources: Array<{ id: string; firstSeen: string | null; lastSeen: string | null; current: boolean }>;
  riskLevel: "stable" | "watch" | "high";
  riskReasons: string[];
  uplinkBytes: number;
  downlinkBytes: number;
  uplinkRate: number;
  downlinkRate: number;
  active: boolean;
};

export type VpnMonitorSnapshot = {
  observedAt: string;
  service: { reachable: boolean; running: boolean; status: string; startedAt: string | null; version: string };
  clients: VpnClientStatus[];
  monitoringSince: string | null;
  riskEvents: Array<{ at: string | null; clientId: string; type: string; message: string }>;
  pollingSeconds: number;
  privacy: string;
  error?: string;
};

export type CronMonitorTask = {
  id: string;
  name: string;
  blurb: string;
  scheduleLabel: string;
  cadence: "daily" | "monthly" | "weekly" | "quarterly";
  dueToday: boolean;
  status: "ok" | "failed" | "running" | "pending" | "waiting" | "idle" | "missed" | "missing";
  statusLabel: string;
  running: boolean;
  canRerun?: boolean;
  agentInstalled: boolean;
  scriptInstalled: boolean;
  lastOkAt: string | null;
  lastFailAt: string | null;
  outputDate: string | null;
  detail: string;
  recentLines: string[];
  nextRunLabel: string;
  lastOutcomeState: "success" | "failed" | "waiting" | "none";
  lastOutcomeLabel: string;
  lastOutcomeAt: string | null;
  lastOutcomeSummary: string;
  versionOutcomeLabel?: string | null;
  readinessStatus: "ready" | "check" | "blocked";
  readinessLabel: string;
  requirements: Array<{
    id: string;
    label: string;
    state: "ready" | "check" | "missing" | "optional";
    detail: string;
    action?: "apple-health";
  }>;
};

export type RhythmFreshnessRow = {
  id: string;
  label: string;
  asOf: string | null;
  asOfLabel: string;
  alarm: boolean;
  detail: string;
  readyPercent?: number;
};

export type RhythmCoverageRow = {
  id: string;
  label: string;
  have?: number;
  total?: number;
  asOf?: string | null;
  alarm: boolean;
  detail: string;
  readyPercent?: number;
};

export type RhythmAssetItem = {
  id: string;
  label: string;
  present: boolean;
  group?: string;
};

export type RhythmAssetGroup = {
  id: string;
  label: string;
  items: RhythmAssetItem[];
  missingCount: number;
};

export type CronMonitorSnapshot = {
  observedAt: string;
  today: string;
  summary: {
    ok: number;
    failed: number;
    running: number;
    pending: number;
    missing: number;
    blocked?: number;
    materialAlarms?: number;
  };
  verdict?: { level: "green" | "yellow" | "red"; label: string };
  tasks: CronMonitorTask[];
  sections?: {
    daily: { tasks: CronMonitorTask[]; freshness: RhythmFreshnessRow[] };
    weekly: {
      tasks: CronMonitorTask[];
      coverage: {
        weekStart: string;
        elapsedDays: number;
        training: RhythmCoverageRow;
        sleep: RhythmCoverageRow;
        gameAsk: RhythmCoverageRow;
      } | null;
    };
    monthly: {
      tasks: CronMonitorTask[];
      coverage: {
        prevMonthKey: string;
        daysInMonth: number;
        sleep: RhythmCoverageRow;
        monthlyReviewExists: boolean;
        assets: {
          snapshotDate: string | null;
          items: RhythmAssetItem[];
          groups?: RhythmAssetGroup[];
          missingCount: number;
          missingLabels: string[];
          cycle?: {
            state: "next-pending" | "open" | "overdue";
            targetMonthKey: string;
            opensAt: string;
            dueAt: string;
            lastCompletedMonthKey: string | null;
          };
          pastDue: boolean;
          alarm: boolean;
          detail: string;
        };
      } | null;
    };
    quarterly?: { tasks: CronMonitorTask[] };
  };
  freshness?: RhythmFreshnessRow[];
  note: string;
  noteExtras?: string;
  error?: string;
};

export type JapanActivity = {
  id: string;
  name: string;
  /** 手写卡为 ACG / 历史人文 / AI 新知；自动采集的卡为活动来源.md 里的类别名。 */
  filterTag: string;
  category: string;
  startDate: string;
  endDate: string;
  dateLabel: string;
  place: string;
  region: string;
  cost: string;
  registration: string;
  language: string;
  languagePressure: "低" | "中" | "高" | "待核验";
  chineseFriendly: string;
  why: string;
  officialUrl: string;
  sourceLabel: string;
  verifiedAt: string;
  interested: boolean;
  hidden: boolean;
  hasPlaybook: boolean;
  guideRunning: boolean;
  origin: "curated" | "collected";
  imageUrl?: string;
};

export type JapanActivitiesSnapshot = {
  observedAt: string;
  today: string;
  updatedAt: string;
  scope: string;
  activities: JapanActivity[];
  playbooks: Array<JapanActivityGuideSummary & { updatedAt: string; sourcePath: string }>;
  attended: Array<JapanActivityGuideSummary & { sourcePath: string }>;
  filters: string[];
  collectedAt: string;
  sourcePath: string;
};

export type JapanActivityGuideImage = {
  imageUrl: string;
  imageAlt: string;
  imageSourceLabel: string;
  imageSourceUrl: string;
  imageCredit: string;
};

export type JapanActivityGuideSummary = JapanActivityGuideImage & {
  id: string;
  name: string;
  dateLabel: string;
  status: string;
};

export type JapanActivityGuideDocument = JapanActivityGuideSummary & {
  description: string;
  updatedAt: string;
  markdown: string;
  sourcePath: string;
};

export type ReleaseWatchItem = {
  id: string;
  appid: number;
  title: string;
  category: "游戏" | "动漫" | "影视" | "实体商品" | "其他";
  region: string;
  sourceLabel: string;
  storeUrl: string;
  imageUrl: string;
  release: {
    kind: "confirmed" | "window" | "tbd";
    date: string | null;
    label: string;
  };
  platforms: string[];
  priority: number;
  addedAt: string | null;
};

export type ReleaseWatchSnapshot = {
  available: boolean;
  accountLabel: string;
  totalWishlistCount: number;
  upcomingCount: number;
  releasedCount: number;
  unresolvedCount: number;
  items: ReleaseWatchItem[];
  refreshedAt: string | null;
  sourceLabel: string;
  message: string | null;
};

export type RenewalExpiryItem = {
  id: string;
  name: string;
  category: string;
  date: string | null;
  mode: "automatic" | "manual";
  leadDays: number;
  source: string;
  note: string;
  recurring: boolean;
  daysUntil: number | null;
  group: "overdue" | "within30" | "within90" | "automatic" | "pending" | "later";
};

export type RenewalExpirySnapshot = {
  observedAt: string;
  today: string;
  updatedAt: string;
  counts: Partial<Record<RenewalExpiryItem["group"], number>>;
  items: RenewalExpiryItem[];
  sourcePath: string;
};

export type GameAnalyticsBreakdown = {
  label: string;
  eventCount: number;
};

export type GameAnalyticsSummary = {
  schemaVersion: number;
  game: { id: string; name: string; productLine: string };
  environment: "development" | "production";
  days: number;
  observedAt: string;
  dataUpdatedAt: string | null;
  eventCount: number;
  metrics: {
    pageViews: number;
    playStarts: number;
    playStartRate: number | null;
    play5m: number;
    play5mRate: number | null;
    play15m: number;
    play15mRate: number | null;
    sessionEnds: number;
    runStarts: number;
    runEnds: number;
    runEndRate: number | null;
    deaths: number;
    reincarnations: number;
    steamClicks: number;
  };
  versions: GameAnalyticsBreakdown[];
  channels: GameAnalyticsBreakdown[];
  income: { connected: boolean; advertising: number | null; steamSales: number | null; other: number | null };
  boundary: string;
};

export type RecentWellbeingAssessment = {
  latestDate: string | null;
  /** 每周日收口的三需要六项独立观察；未知保持 null，不与月度量表混用。 */
  weeklyMindSnapshots: Array<{
    weekEnding: string;
    confidence: string;
    basis: string;
    needs: Array<{
      need: string;
      met: number | null;
      thwarted: number | null;
      note: string;
    }>;
  }>;
  /** 本人最近一次直接给出的主观睡眠三档；与 iWatch 客观睡眠分开。 */
  subjectiveSleep: {
    rating: "差" | "一般" | "好";
    observedAt: string;
    source: string;
  } | null;
  entries: Array<{
    date: string;
    sourceDate: string;
    closedBy: string;
    sources: string;
    correction: string;
    mind: Array<{
      dimension: string;
      judgment: string;
      confidence: string;
      evidence: string;
      unknown: string;
    }>;
    balance: {
      dimension: string;
      judgment: string;
      confidence: string;
      evidence: string;
      unknown: string;
    } | null;
    goodTimes: Array<{
      dimension: string;
      judgment: string;
      confidence: string;
      evidence: string;
      unknown: string;
    }>;
  }>;
};

export type WorkbenchSnapshot = {
  version: string;
  generatedAt: string;
  identity: {
    current: { title: string; intro: string; roles: string[] };
    past: { title: string; intro: string; roles: string[] };
    source: SourceMeta;
  };
  todo: {
    today: Array<{ done: boolean; text: string }>;
    longTerm: Array<{ done: boolean; text: string }>;
    mainlines: Array<{ priority: string; item: string; prefix?: string; category?: string; entry: string }>;
    source: SourceMeta;
  };
  projects: {
    items: Array<{ name: string; status: string; entry: string; entryPath: string | null; archived?: boolean; updatedAt?: string; summary?: string }>;
    flagship: { version: string; focus: string; ready: string[]; pending: string[] };
    coaching: { focus: string; latest: string };
    source: SourceMeta;
    flagshipSource: SourceMeta;
    coachingSource: SourceMeta;
  };
  /** 事业项目的统一管理派生视图；旧服务过渡期允许缺省。 */
  projectManagement?: ProjectManagementSnapshot;
  health: {
    baselineDate: string;
    weight: string;
    latestTraining: string;
    note: string;
    todayPlan: { weekday: string; title: string; detail: string; exercises: string[] };
    weekPlan: Array<{
      weekday: string;
      label: string;
      title: string;
      short: string;
      detail: string;
      kind: "lift" | "swim" | "rest" | "other";
      exercises: string[];
      isToday: boolean;
    }>;
    staleMuscles: Array<{ id: string; label: string; status: "due" | "overdue"; daysSince: number; lastDate?: string }>;
    coachHints: Array<{ tone: "action" | "warn" | "info"; text: string; basis: string }>;
    measurements: HealthMeasurement[];
    undated: Array<{ label: string; value: string }>;
    sessions: TrainingSession[];
    strength: Array<{ category: "拉力" | "推举" | "下肢" | "核心"; label: string; value: string; date: string; note: string }>;
    appleHealth: AppleHealthSummary | null;
    trainingVolume: {
      weekly: Array<{
        weekStart: string;
        muscles: Record<string, number>;
        bodyweightReps: Record<string, number>;
        totalTonnageKg: number;
      }>;
      topSetSeries: Array<{
        name: string;
        points: Array<{ date: string; topSet: string; weightKg: number | null; reps: number[]; bodyweight: boolean }>;
      }>;
    };
    /** S10：各动作最近最重一组，只读派生自训练日志 */
    strengthBaseline: Array<{ name: string; topSet: string; date: string; basis: string; category?: string }>;
    /** S11：有 RPE/RIR 才进样本；缺填不编造相对强度 */
    intensity: {
      sampleCount: number;
      latest: { date: string; exercise: string; rpe: number | null; rir: number | null; basis: string } | null;
      samples: Array<{ date: string; exercise: string; rpe: number | null; rir: number | null; basis: string }>;
    };
    progressionAdvice: Array<{
      kind: "increase" | "deload";
      exercise: string;
      text: string;
      basis: string;
      fromKg: number;
      toKg: number;
    }>;
    /** S8：恢复负荷——训练 + 脱离 + 睡眠三者叠加才 suggestDeload */
    recoveryLoad: {
      suggestDeload: boolean;
      text: string | null;
      basis: string;
      factors: {
        training: { elevated: boolean | null; days: number | null; basis: string };
        detachment: { elevated: boolean | null; days: number | null; basis: string };
        sleep: { elevated: boolean | null; days: number | null; basis: string };
      };
    };
    /** S7：mesocycle 第几周；满 4 周提示讨论 deload */
    mesocycle: {
      stageStart: string | null;
      weekIndex: number | null;
      elapsedDays: number | null;
      suggestDeloadDiscuss: boolean;
      text: string | null;
      basis: string;
    };
    muscleBalance: {
      windowWeeks: number;
      pushKg: number;
      pullKg: number;
      upperKg: number;
      lowerKg: number;
      pushPullRatio: number | null;
      upperLowerRatio: number | null;
      pushPullBasis: string;
      upperLowerBasis: string;
      plateauCandidates: Array<{
        exercise: string;
        weeks: number;
        text: string;
        basis: string;
        weightKg: number;
      }>;
    };
    mind: {
      days: Array<{
        date: string;
        workIntensity: number | null;
        sleep: "差" | "一般" | "好" | null;
        trained: boolean;
        restDay: boolean;
        restReasons: Array<"weekend" | "public-holiday" | "leave">;
      }>;
      sampleDays: number;
      /** 恢复四维来自校准「心·演示信号」且标了临时测试 */
      recoveryTempTest?: boolean;
      /** 量表仪表（校准文件 · 量表仪表节） */
      scales?: {
        tempTest: boolean;
        bpnsfs: { period: string; rows: Array<{ need: string; met: number | null; thwarted: number | null; note: string }>; report?: string } | null;
        req: { period: string; rows: Array<{ dim: string; score: number | null; note: string }>; report?: string } | null;
        aaq: { period: string; score: number | null; blurb: string; report?: string } | null;
        cbi: { period: string; rows: Array<{ face: string; score: number | null; note: string }>; report?: string } | null;
      } | null;
      /** GPT 候选经 Cursor 去重后的近期定性判断；不覆盖月度量表。 */
      recentAssessment?: Pick<RecentWellbeingAssessment, "weeklyMindSnapshots" | "subjectiveSleep">;
      signals: {
        days: Array<{
          date: string;
          sampled: boolean;
          hits: Record<string, number> | null;
          hitTotal: number;
        }>;
        sampleDays: number;
        hitDays: number;
        recovery: {
          detachmentFail: number;
          relaxation: number;
          mastery: number;
          controlLoss: number;
        };
        /** Studio User 自定恢复百分比（近窗各维度有据日平均）；未知不进入分母，非 REQ 原算法 */
        recoveryPercents?: {
          scoredDays: number;
          sampleDays?: {
            detachmentFail: number;
            controlLoss: number;
            mastery: number;
            relaxation: number;
          };
          percents: {
            detachmentFail: number | null;
            controlLoss: number | null;
            mastery: number | null;
            relaxation: number | null;
          };
        };
        motivation: {
          controlled: number;
          autonomous: number;
          competenceMet: number;
          competenceThwarted: number;
          relatednessMet: number;
          relatednessThwarted: number;
          ruminationAvoidance: number;
        };
      };
    };
    life: {
      compass: { filled: boolean; workview: string; lifeview: string };
      mainlines: Array<{
        item: string;
        prefix: string;
        category: string;
        energy: "回能" | "中性" | "耗能" | null;
        disposition: "多投入" | "保持" | "少投入" | "停" | null;
        reason: string;
        lastActionDays: number | null;
        offMainline?: boolean;
        /** 好时光候选：由心舱信号 × 日志线名共现聚合；仅回能/耗能，持平不出。 */
        energyCandidate?: "回能" | "耗能" | null;
        energyEvidenceDates?: string[];
      }>;
      gauges: Array<{
        month: string;
        health: number | null;
        work: number | null;
        play: number | null;
        love: number | null;
        surprise: string;
        refuel: string;
      }>;
      /** 每周日封存的四格快照；竖卡用最近两条完整周互比，不拿同一份当前值与周快照互比。 */
      weeklyGauges?: Array<{
        weekEnding: string;
        health: number | null;
        work: number | null;
        play: number | null;
        love: number | null;
        status: "trial" | "formal";
        confidence: string;
        basis: string;
      }>;
      /** 只有 Studio User 明确认可后才能从试运行切为正式；旧试运行周不会追认。 */
      gaugeLifecycle?: {
        status: "trial" | "formal";
        formalFrom: string | null;
      };
      /** 最近一期月度自评（三需要分列 + 动机质量）；无总分；待审阅稿优先于已确认稿。 */
      monthlySelfAssessment: {
        month: string | null;
        needs: Array<{ need: string; met: string; thwarted: string }>;
        motives: Array<{ line: string; quality: string }>;
        reviewStatus?: "pending" | "confirmed" | "dismissed";
        rawSection?: string;
      } | null;
      /** H8：指南针一致性三边（人工确认）；无评分 —— 界面已砍，解析仍保留 */
      coherence: {
        edges: Array<{
          id: "work_life" | "work_lines" | "life_lines";
          label: string;
          verdict: "说得通" | "说不通" | "没想过" | null;
          note: string;
        }>;
      } | null;
      /** 斯坦福工具箱扩展：好时光 / 原型 / 选择四步 / 卡住时 */
      toolbox?: {
        tempTest: boolean;
        goodTimes: Array<{ line: string; lean: "回能" | "耗能" | "中性" | null; dates: string[]; note: string }>;
        prototypes: Array<{ name: string; kind: string; status: string; blurb: string }>;
        choiceSteps: {
          topic: string;
          generate: string;
          narrow: string;
          choose: string;
          letGo: string;
        } | null;
        stuckNote: string;
      } | null;
      /** 与 mind 共用的正式近期收口，供人生平衡页显示。 */
      recentAssessment?: Pick<RecentWellbeingAssessment, "entries">;
      /** H5：奥德赛三方案结构（评分可由人填） */
      odyssey: {
        plans: Array<{
          id: "A" | "B" | "C";
          title: string;
          blurb: string;
          scores: Array<{ dim: string; score: number | null; note: string }>;
        }>;
      } | null;
      overdueWeeks: number | null;
    };
    /** 按信号推荐的应对练习卡；没有采样时为空。 */
    interventionCards: Array<{
      id: string;
      title: string;
      process: string;
      trigger: string;
      steps: string[];
      basis: string;
    }>;
    sources: SourceMeta[];
  };
  library: {
    books: number;
    completedBooks: number;
    courses: number;
    games: number;
    animation: number;
    screen: number;
    writing: { count: number; updatedAt: string | null };
    learning: { count: number; updatedAt: string | null };
    cultureArchive: CultureArchive;
    domainResearch: { knowledgeNodes: DomainKnowledgeNode[] };
    items: LibraryItem[];
    sources: SourceMeta[];
  };
  market: MarketBrief & { source: SourceMeta };
  warnings: Array<{ source: string; message: string }>;
};

export type WorkbenchWarning = WorkbenchSnapshot["warnings"][number];
export type HealthSectionData = WorkbenchSnapshot["health"];
export type LibrarySectionData = WorkbenchSnapshot["library"];
export type MarketsSectionData = WorkbenchSnapshot["market"];

type ExactKeyList<T, Keys extends readonly (keyof T)[]> = Exclude<keyof T, Keys[number]> extends never ? Keys : never;

function exactKeys<T>() {
  return <Keys extends readonly (keyof T)[]>(keys: ExactKeyList<T, Keys>) => keys;
}

/** 运行时契约清单由 TypeScript 校验完整性，测试直接复用，避免两边各写一份“真相”。 */
export const SECTION_DATA_KEYS = {
  health: exactKeys<HealthSectionData>()([
    "baselineDate", "weight", "latestTraining", "note", "measurements", "undated",
    "sessions", "strength", "todayPlan", "weekPlan", "staleMuscles", "coachHints", "appleHealth",
    "trainingVolume", "strengthBaseline", "intensity", "progressionAdvice", "muscleBalance", "recoveryLoad", "mesocycle", "mind", "life", "interventionCards", "sources",
  ] as const),
  library: exactKeys<LibrarySectionData>()([
    "books", "completedBooks", "courses", "games", "animation", "screen", "writing", "learning", "cultureArchive", "domainResearch", "items", "sources",
  ] as const),
  markets: exactKeys<MarketsSectionData>()([
    "schemaVersion", "generatedAt", "asOf", "headline", "status", "events", "calendar",
    "note", "topics", "date", "latest", "history", "source",
  ] as const),
} as const;

export type WorkbenchSummary = Pick<WorkbenchSnapshot, "version" | "generatedAt" | "identity" | "todo" | "projects" | "projectManagement" | "warnings"> & {
  health: Pick<HealthSectionData, "baselineDate" | "weight" | "latestTraining" | "todayPlan" | "staleMuscles"> & {
    life: Pick<HealthSectionData["life"], "overdueWeeks">;
  };
  library: Pick<LibrarySectionData, "books" | "completedBooks" | "courses" | "games" | "writing" | "learning"> & {
    latestWriting: LibraryItem | null;
    topics: Array<{ id: string; topicId?: string; title: string; description: string; tip?: string; sourcePath: string }>;
  };
  market: Pick<MarketsSectionData, "status" | "headline"> & {
    eventsCount: number;
    topEvents: Array<{ id: string; title: string; category: string; signalTags?: string[] }>;
    aiHotspots: Array<{ id: string; title: string; category: string }>;
    date?: string | null;
  };
};

export type HomePins = { topicIds: string[]; likedCourseIds: string[]; researchDomainId: string | null };

export type WeatherSnapshot = {
  available: boolean;
  location: string;
  temperatureC: number | null;
  weatherCode: number | null;
  condition: string;
  uvIndex: number | null;
  uvLabel: string;
  refreshedAt: string | null;
  message: string | null;
};

export type MarketLiveSnapshot = {
  available: boolean;
  stocks: Array<{
    symbol: string;
    label?: string | null;
    name: string;
    price: number | null;
    change: number | null;
    changePercent: number | null;
    currency: string;
  }>;
  /** 光大证券最新持仓标的的公开行情；不含数量、成本、盈亏或账户金额。 */
  holdingStocks: Array<{
    symbol: string;
    label?: string | null;
    name: string;
    price: number | null;
    change: number | null;
    changePercent: number | null;
    currency: string;
  }>;
  fx: Array<{ pair: string; label: string; value: number }>;
  refreshedAt: string | null;
  message: string | null;
};

export type WorkbenchSectionResponse<T> = {
  version: string;
  generatedAt: string;
  data: T;
  warnings: WorkbenchWarning[];
};
