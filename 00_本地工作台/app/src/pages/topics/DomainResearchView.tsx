import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Brain,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Compass,
  Cpu,
  ExternalLink,
  FileText,
  FolderTree,
  Gamepad2,
  Hammer,
  History,
  Landmark,
  Library,
  Languages,
  Link2,
  Lightbulb,
  MessageCircle,
  PenTool,
  Puzzle,
  Search,
  Shirt,
  Shuffle,
  Sparkles,
  Star,
  Store,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { DomainKnowledgeNode } from "../../types";
import { obsidianHref } from "../../page-shared";
import {
  buildKnowledgeCards,
  buildKnowledgeExplainSeed,
  branchResearchStatusFromFormalNodes,
  knowledgeNodeId,
  learningLevelLabel,
  orderKnowledgeNodesByTopics,
  type KnowledgeCard,
  type KnowledgeCardStatus,
  type KnowledgeNodeInput,
} from "./domain-research-cards";
import {
  type DomainIconKey,
  type DomainId,
  type ResearchDomain as CatalogDomain,
  type ResearchBranch as CatalogBranch,
} from "./domain-research-catalog";
import {
  ECONOMICS_FINANCE_DOMAIN,
  FITNESS_DOMAIN,
  FULL_AI_DOMAIN,
  IMAGE_MANAGEMENT_DOMAIN,
  LANGUAGE_DOMAIN,
} from "./domain-research-domains";
import { RESEARCH_DOMAIN_IDS } from "./domain-research-home";
import "./domain-research.css";

type ResearchBranch = {
  id: string;
  title: string;
  cardSummary: string;
  summary: string;
  guidingQuestion: string;
  status: "正在理解" | "尚未展开";
  icon: LucideIcon;
  nodes: CatalogBranch["nodes"];
  formalNodes?: KnowledgeNodeInput[];
  mappedNodes?: KnowledgeNodeInput[];
  starterQuestions: string[];
};

export type ResearchDomainView = {
  id: DomainId;
  title: string;
  mark: string;
  description: string;
  mapLead: string;
  cardClass: string;
  icon: LucideIcon;
  branches: ResearchBranch[];
};

export type DomainResearchPosition = {
  domainId: string;
  branchId: string;
  nodeId: string;
  cardId: string;
  cardIndex: number;
  updatedAt: string;
};

export type DomainResearchProgress = {
  schemaVersion: 1;
  cards: Record<string, { status: KnowledgeCardStatus; updatedAt: string }>;
  choices: Record<string, { choiceId: string; updatedAt: string }>;
  lastPosition: null | DomainResearchPosition;
  lastPositions: Record<string, DomainResearchPosition>;
  recentCardIds: string[];
};

export type DomainResearchProgressUpdate = {
  cardId: string;
  status?: KnowledgeCardStatus;
  choiceId?: string;
  position: {
    domainId: DomainId;
    branchId: string;
    nodeId: string;
    cardId: string;
    cardIndex: number;
  };
};

const BRANCH_ICONS: Record<DomainIconKey, LucideIcon> = {
  book: BookOpen,
  puzzle: Puzzle,
  hammer: Hammer,
  cpu: Cpu,
  store: Store,
  users: UsersRound,
  atom: Cpu,
  brain: Brain,
  bot: UsersRound,
  wand: Sparkles,
  database: Library,
  scale: CircleHelp,
  languages: BookOpen,
  brackets: Link2,
  library: Library,
  landmark: Store,
  search: Search,
  feather: PenTool,
  history: History,
  bookmark: Bookmark,
  shirt: Shirt,
  activity: Activity,
  map: Compass,
};

function mappedKnowledgeNodes(nodes: DomainKnowledgeNode[], domainId: DomainId, branchId: string, topics: CatalogBranch["nodes"]): KnowledgeNodeInput[] {
  return orderKnowledgeNodesByTopics(
    nodes.filter((node) => node.domainId === domainId && node.branchId === branchId),
    topics.flatMap((topic) => topic.id ? [topic.id] : []),
  )
    .map((node) => ({
      id: node.nodeId,
      topicId: node.topicId,
      status: node.status,
      order: node.order,
      title: node.title,
      description: node.description,
      sourcePath: node.sourcePath,
      asOf: node.asOf,
      jurisdiction: node.jurisdiction,
      claimTypes: node.claimTypes,
      sources: node.sources,
      learningResources: node.learningResources,
      learningState: node.learningState,
      learningRecords: node.learningRecords,
      authoredCards: node.cards,
    }));
}

const LEARNING_STATE_LABELS: Record<NonNullable<KnowledgeNodeInput["learningState"]>, string> = {
  "not-started": "尚无本人学习记录",
  "session-recorded": "已记录学习会话",
  "initial-understanding": "已有初步认识",
  "can-explain": "能独立解释",
  "can-transfer": "能迁移使用",
  "revisit-needed": "需要复习",
};

function learningStateLabel(state: KnowledgeNodeInput["learningState"]) {
  return LEARNING_STATE_LABELS[state ?? "not-started"];
}

function catalogBranches(domainId: DomainId, branches: CatalogBranch[], knowledgeNodes: DomainKnowledgeNode[]): ResearchBranch[] {
  return branches.map(({ iconKey, ...branch }) => {
    const mapped = mappedKnowledgeNodes(knowledgeNodes, domainId, branch.id, branch.nodes);
    const formalNodes = mapped.filter((node) => node.status === "formal");
    return {
      ...branch,
      status: domainId === "ai" ? branchResearchStatusFromFormalNodes(formalNodes.length) : branch.status,
      icon: BRANCH_ICONS[iconKey],
      mappedNodes: mapped,
      formalNodes,
    };
  });
}

function catalogDomain(domain: CatalogDomain, icon: LucideIcon, knowledgeNodes: DomainKnowledgeNode[]): ResearchDomainView {
  return { ...domain, icon, branches: catalogBranches(domain.id, domain.branches, knowledgeNodes) };
}

export function researchDomains(knowledgeNodes: DomainKnowledgeNode[] = []): ResearchDomainView[] {
  const domains: ResearchDomainView[] = [
    catalogDomain(FULL_AI_DOMAIN, Cpu, knowledgeNodes),
    catalogDomain(ECONOMICS_FINANCE_DOMAIN, Landmark, knowledgeNodes),
    catalogDomain(LANGUAGE_DOMAIN, Languages, knowledgeNodes),
    catalogDomain(IMAGE_MANAGEMENT_DOMAIN, Shirt, knowledgeNodes),
    catalogDomain(FITNESS_DOMAIN, Activity, knowledgeNodes),
  ];
  const byId = new Map(domains.map((domain) => [domain.id, domain]));
  return RESEARCH_DOMAIN_IDS.flatMap((domainId) => {
    const domain = byId.get(domainId);
    return domain ? [domain] : [];
  });
}

export function findResearchDomain(domainId: DomainId, knowledgeNodes: DomainKnowledgeNode[] = []) {
  const domains = researchDomains(knowledgeNodes);
  return domains.find((domain) => domain.id === domainId) ?? domains[0];
}

export type ReaderTarget = { domainId: DomainId; branchId: string; nodeId: string; cardIndex: number };

function branchCards(branch: ResearchBranch) {
  return (branch.formalNodes ?? []).flatMap((node, nodeIndex) => buildKnowledgeCards(branch, node, nodeIndex));
}

function allDomainCards(domain: ResearchDomainView) {
  return domain.branches.flatMap((branch) => branchCards(branch));
}

export function domainReaderTargets(domain: ResearchDomainView): ReaderTarget[] {
  return domain.branches.flatMap((branch) => (branch.formalNodes ?? []).map((node, nodeIndex) => ({
    domainId: domain.id,
    branchId: branch.id,
    nodeId: knowledgeNodeId(branch.id, nodeIndex, node),
    cardIndex: 0,
  })));
}

function progressLabel(status?: KnowledgeCardStatus) {
  if (status === "overview") return "观其大略";
  if (status === "unclear") return "还不清楚";
  if (status === "deep") return "想深挖";
  return "尚未浏览";
}

function sourceRoleLabel(role: string) {
  return ({
    "research-question": "研究问题",
    "owner-original-judgment": "本人原始判断",
    "owner-learning-record": "本人学习证据",
    "source-viewpoint": "来源观点",
    context: "背景",
    definition: "定义",
    example: "例子",
    "execution-risk": "执行风险",
  } as Record<string, string>)[role] ?? "来源";
}

function learningKindLabel(kind: string) {
  return ({ talk: "演讲", course: "课程", book: "书", paper: "论文", guide: "指南", interview: "访谈", case: "案例", tool: "工具", reference: "文档" } as Record<string, string>)[kind] ?? "资源";
}

function learningAccessLabel(access: string) {
  return ({ free: "免费", paid: "付费", mixed: "部分免费", "self-directed": "自助实践", unknown: "获取方式待核" } as Record<string, string>)[access] ?? "获取方式待核";
}

function nodeProgressLabel(progress: DomainResearchProgress, cards: KnowledgeCard[]) {
  const statuses = cards.map((card) => progress.cards[card.id]?.status).filter(Boolean);
  if (!statuses.length) return "尚未浏览";
  if (statuses.includes("deep")) return "想深挖";
  if (statuses.includes("unclear")) return "还不清楚";
  if (statuses.length === cards.length) return "已观其大略";
  return `看过 ${statuses.length}/${cards.length}`;
}

const RESEARCH_METHOD_STEPS = [
  { title: "认识对象", detail: "它是什么，为什么值得研究" },
  { title: "建立脉络", detail: "基本概念、历史关系与代表案例" },
  { title: "形成判断", detail: "本人目前怎样理解，依据是什么" },
  { title: "保留缺口", detail: "仍不清楚什么，需要主动找什么" },
  { title: "连接验证", detail: "关联哪些知识，怎样进入创作实验" },
] as const;

function ResearchTransformation() {
  return (
    <section className="research-method-section">
      <header><h3>统一研究结构</h3><small>每个知识节点都按同一方法逐渐长出来</small></header>
      <ol className="research-method-grid">
        {RESEARCH_METHOD_STEPS.map((step, index) => (
          <li key={step.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
          </li>
        ))}
      </ol>
      <p className="research-method-boundary">知识节点只负责形成和校准认识；是否提炼为创作原则、进入哪个项目实验，仍由 Studio User 另行决定，不自动生成项目任务。</p>
    </section>
  );
}

export function DomainResearchHome({
  knowledgeNodes,
  progress,
  focusedDomainId,
  pinnedDomainId,
  onFocus,
  onCollapse,
  onTogglePin,
  onContinue,
  onStart,
  onRandom,
}: {
  knowledgeNodes: DomainKnowledgeNode[];
  progress: DomainResearchProgress;
  focusedDomainId: DomainId | null;
  pinnedDomainId: DomainId | null;
  onFocus: (domainId: DomainId) => void;
  onCollapse: () => void;
  onTogglePin: (domainId: DomainId) => void;
  onContinue: (domainId: DomainId) => void;
  onStart: (domainId: DomainId) => void;
  onRandom: (domainId: DomainId) => void;
}) {
  const focusRef = useRef<HTMLElement | null>(null);
  const domains = useMemo(() => researchDomains(knowledgeNodes).map((domain) => {
    const cards = allDomainCards(domain);
    const counts = cards.reduce((current, card) => {
      const status = progress.cards[card.id]?.status;
      if (status) current[status] += 1;
      else current.unseen += 1;
      return current;
    }, { overview: 0, unclear: 0, deep: 0, unseen: 0 });
    const hasLastPosition = Boolean(progress.lastPositions[domain.id] ?? (progress.lastPosition?.domainId === domain.id ? progress.lastPosition : null));
    return { domain, counts, hasLastPosition, seen: cards.length - counts.unseen, total: cards.length };
  }), [knowledgeNodes, progress.cards, progress.lastPosition, progress.lastPositions]);
  const focused = domains.find(({ domain }) => domain.id === focusedDomainId) ?? null;
  const compactDomains = focused ? domains.filter(({ domain }) => domain.id !== focused.domain.id) : domains;

  useEffect(() => {
    if (!focusedDomainId) return;
    const frame = window.requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedDomainId]);

  return (
    <div className="domain-research domain-research-home">
      <header className="domain-research-intro">
        <div>
          <span className="domain-eyebrow"><Compass size={15} />知识地图</span>
          <h2>先看见全貌，再走进真正关心的问题</h2>
          <p>一个大卡片代表一个准备长期理解的领域。课程会结束，领域会持续生长。</p>
        </div>
        <div className="domain-research-principle" aria-label="专题研究边界">
          <span><Library size={15} />艺术馆藏</span>
          <ChevronRight size={14} />
          <strong><Brain size={15} />专题研究</strong>
          <ChevronRight size={14} />
          <span><Hammer size={15} />事业项目</span>
        </div>
      </header>

      <section className={`domain-card-stack${focused ? " has-focus" : ""}`} aria-label="长期研究领域">
        {focused ? (() => {
          const { domain, counts, hasLastPosition } = focused;
          const DomainIcon = domain.icon;
          return (
            <article ref={focusRef} id={`domain-focus-${domain.id}`} className={`domain-card is-expanded ${domain.cardClass}`} aria-labelledby={`domain-focus-title-${domain.id}`}>
              <div className="domain-card-controls">
                <button className={`domain-pin-button${pinnedDomainId === domain.id ? " is-active" : ""}`} type="button" aria-label={pinnedDomainId === domain.id ? `取消首页置顶${domain.title}` : `将${domain.title}置顶到首页`} aria-pressed={pinnedDomainId === domain.id} onClick={() => onTogglePin(domain.id)}>
                  <Star size={17} fill={pinnedDomainId === domain.id ? "currentColor" : "none"} />
                </button>
                <button type="button" aria-label={`收起${domain.title}`} onClick={onCollapse}><X size={18} /></button>
              </div>
              <div className="domain-card-copy">
                <span className="domain-card-mark"><DomainIcon size={18} />{domain.mark}</span>
                <h3 id={`domain-focus-title-${domain.id}`}>{domain.title}</h3>
                <p>{domain.description}</p>
                <div className="domain-card-branches" aria-label={`${domain.title}领域分支`}>
                  {domain.branches.map((branch) => (
                    <span className={branch.status === "正在理解" ? "is-active" : ""} key={branch.id}>
                      <strong>{branch.title}</strong>
                      <em>{branch.cardSummary}</em>
                      <small>{branch.nodes.length} 个专题 · {branch.mappedNodes?.length ?? branch.formalNodes?.length ?? 0} 个知识节点</small>
                    </span>
                  ))}
                </div>
              </div>
              <div className="domain-card-action">
                <div className="domain-card-primary-actions">
                  <button type="button" onClick={() => onStart(domain.id)}>
                    进入专题<ChevronRight size={18} />
                  </button>
                  {hasLastPosition ? <button className="is-secondary" type="button" onClick={() => onContinue(domain.id)}><BookOpen size={16} />继续上次学习</button> : null}
                  <button className="is-secondary" type="button" onClick={() => onRandom(domain.id)}><Shuffle size={16} />随便看看</button>
                </div>
                <div className="domain-progress-counts" aria-label={`${domain.title}知识卡浏览状态`}>
                  <span><strong>{counts.overview}</strong><small>观其大略</small></span>
                  <span><strong>{counts.unclear}</strong><small>还不清楚</small></span>
                  <span><strong>{counts.deep}</strong><small>想深挖</small></span>
                  <span><strong>{counts.unseen}</strong><small>尚未浏览</small></span>
                </div>
                <div className="domain-card-compass" aria-hidden="true"><DomainIcon size={52} /></div>
              </div>
            </article>
          );
        })() : null}

        {focused ? <div className="domain-compact-heading"><span>其他母题</span><small>点开另一张，当前母题会自动收起</small></div> : null}
        <div className="domain-compact-grid" aria-label={focused ? "其他母题" : "全部母题"}>
          {compactDomains.map(({ domain, hasLastPosition, seen, total }) => {
            const DomainIcon = domain.icon;
            const isPinned = pinnedDomainId === domain.id;
            return (
              <article className={`domain-compact-card ${domain.cardClass}`} key={domain.id}>
                <button className="domain-compact-card-body" type="button" aria-expanded="false" aria-controls={`domain-focus-${domain.id}`} onClick={() => onFocus(domain.id)}>
                  <span className="domain-card-mark"><DomainIcon size={16} />{domain.mark}</span>
                  <div className="domain-compact-title"><span aria-hidden="true"><DomainIcon size={25} /></span><h3>{domain.title}</h3></div>
                  <p>{domain.description}</p>
                  <footer>
                    <span>{domain.branches.length} 条主干</span>
                    <span>{seen}/{total} 已浏览</span>
                    <strong>展开查看<ChevronRight size={15} /></strong>
                  </footer>
                </button>
                <button className={`domain-pin-button${isPinned ? " is-active" : ""}`} type="button" aria-label={isPinned ? `取消首页置顶${domain.title}` : `将${domain.title}置顶到首页`} aria-pressed={isPinned} onClick={() => onTogglePin(domain.id)}>
                  <Star size={16} fill={isPinned ? "currentColor" : "none"} />
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function KnowledgeCardReader({
  domain,
  branch,
  node,
  nodeIndex,
  cardIndex,
  progress,
  onMove,
  onClose,
  onSave,
  onAskSecretary,
}: {
  domain: ResearchDomainView;
  branch: ResearchBranch;
  node: ResearchBranch["nodes"][number];
  nodeIndex: number;
  cardIndex: number;
  progress: DomainResearchProgress;
  onMove: (target: ReaderTarget) => void;
  onClose: () => void;
  onSave: (update: DomainResearchProgressUpdate) => Promise<void>;
  onAskSecretary: (seedUser: string) => void;
}) {
  const [saveError, setSaveError] = useState("");
  const cards = buildKnowledgeCards(branch, node, nodeIndex);
  const safeIndex = Math.min(Math.max(0, cardIndex), cards.length - 1);
  const card = cards[safeIndex];
  const nodeId = knowledgeNodeId(branch.id, nodeIndex, node);
  const selectedChoice = progress.choices[card.id]?.choiceId;
  const currentStatus = progress.cards[card.id]?.status;
  const learningResourceCount = node.learningResources?.length ?? 0;
  const learningPathIndex = cards.findIndex((candidate) => candidate.id.endsWith("-learning-path"));
  const showLearningResources = safeIndex === learningPathIndex && learningResourceCount > 0;
  const previousLabel = safeIndex > 0 ? "上一张" : nodeIndex > 0 ? "上一节点" : "返回知识地图";
  const nextLabel = safeIndex < cards.length - 1 ? "下一张" : nodeIndex < (branch.formalNodes?.length ?? 0) - 1 ? "下一节点" : "返回知识地图";

  useEffect(() => {
    setSaveError("");
    void onSave({
      cardId: card.id,
      position: { domainId: domain.id, branchId: branch.id, nodeId, cardId: card.id, cardIndex: safeIndex },
    }).catch((error) => setSaveError(error instanceof Error ? error.message : "浏览位置没有保存"));
  }, [branch.id, card.id, domain.id, nodeId, onSave, safeIndex]);

  const moveRelative = (direction: -1 | 1) => {
    const nextCardIndex = safeIndex + direction;
    if (nextCardIndex >= 0 && nextCardIndex < cards.length) {
      onMove({ domainId: domain.id, branchId: branch.id, nodeId, cardIndex: nextCardIndex });
      return;
    }
    const nextNodeIndex = nodeIndex + direction;
    const formalNodes = branch.formalNodes ?? [];
    if (nextNodeIndex >= 0 && nextNodeIndex < formalNodes.length) {
      const nextNode = formalNodes[nextNodeIndex];
      const nextNodeId = knowledgeNodeId(branch.id, nextNodeIndex, nextNode);
      const nextCards = buildKnowledgeCards(branch, nextNode, nextNodeIndex);
      onMove({ domainId: domain.id, branchId: branch.id, nodeId: nextNodeId, cardIndex: direction > 0 ? 0 : nextCards.length - 1 });
      return;
    }
    onClose();
  };

  const saveAndAdvance = (status: KnowledgeCardStatus, choiceId?: string) => {
    setSaveError("");
    void onSave({
      cardId: card.id,
      status,
      choiceId,
      position: { domainId: domain.id, branchId: branch.id, nodeId, cardId: card.id, cardIndex: safeIndex },
    }).catch((error) => setSaveError(error instanceof Error ? error.message : "这次点按没有保存"));
    moveRelative(1);
  };

  return (
    <div className="knowledge-reader" role="dialog" aria-modal="true" aria-label={`${node.title}知识卡`}>
      <header className="knowledge-reader-topbar">
        <button type="button" onClick={onClose}><ArrowLeft size={19} /><span>返回知识地图</span></button>
        <div className="knowledge-reader-context"><span>{domain.title}</span><ChevronRight size={13} /><span>{branch.title}</span><ChevronRight size={13} /><strong>{node.title}</strong></div>
        <button className="knowledge-reader-close" type="button" aria-label="关闭知识卡" onClick={onClose}><X size={20} /></button>
      </header>

      <main className={`knowledge-reader-sheet is-${card.kind}`}>
        <div className="knowledge-reader-progress" aria-label={`第 ${safeIndex + 1} 张，共 ${cards.length} 张`}>
          <span style={{ width: `${((safeIndex + 1) / cards.length) * 100}%` }} />
        </div>
        <article>
          <div className="knowledge-reader-kicker">
            <span className="knowledge-reader-eyebrow"><Sparkles size={15} />{card.eyebrow}</span>
            <div className="knowledge-reader-kicker-meta">
              {learningResourceCount > 0 && !showLearningResources ? (
                <button
                  className="knowledge-reader-resource-jump"
                  type="button"
                  onClick={() => onMove({ domainId: domain.id, branchId: branch.id, nodeId, cardIndex: learningPathIndex })}
                  aria-label={`查看本节点 ${learningResourceCount} 项延展资源`}
                >
                  <Library size={14} />
                  <span className="knowledge-reader-resource-count">
                    {learningResourceCount}<span className="knowledge-reader-resource-label"> 项延展</span>
                  </span>
                </button>
              ) : null}
              <span className="knowledge-reader-page-number">{String(safeIndex + 1).padStart(2, "0")} / {String(cards.length).padStart(2, "0")}</span>
            </div>
          </div>
          <h2>{card.title}</h2>
          <div className="knowledge-reader-body">
            {card.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {card.bullets?.length ? <ul>{card.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            {card.question ? <blockquote><span>此刻的问题</span>{card.question}</blockquote> : null}
          </div>
          {showLearningResources ? (
            <section className="knowledge-learning-shelf" aria-label="主题内垂直学习梯">
              <header><div><span>主题内垂直学习梯</span><strong>沿着当前问题继续深入</strong></div><small>{node.learningResources?.length ?? 0} 项精选资源</small></header>
              <div className="knowledge-learning-resource-list">
                {node.learningResources?.map((resource) => {
                  const content = (
                    <>
                      <div className="knowledge-learning-resource-meta"><span>{learningLevelLabel(resource.level)}</span><em>{learningKindLabel(resource.kind)}</em></div>
                      <strong>{resource.title}</strong>
                      {resource.creator ? <small className="knowledge-learning-resource-creator">{resource.creator}</small> : null}
                      <p>{resource.reason}</p>
                      {resource.focus ? <blockquote><b>带着这个问题</b>{resource.focus}</blockquote> : null}
                      {resource.use ? <div className="knowledge-learning-resource-use"><b>建议用法</b>{resource.use}</div> : null}
                      <footer>
                        {resource.duration ? <span>{resource.duration}</span> : null}
                        {resource.language ? <span>{resource.language}</span> : null}
                        <span>{learningAccessLabel(resource.access)}</span>
                        {resource.asOf ? <span>核验 {resource.asOf}</span> : null}
                        {resource.url || resource.path ? <ExternalLink size={14} /> : null}
                      </footer>
                    </>
                  );
                  if (resource.url) return <a href={resource.url} target="_blank" rel="noopener noreferrer" key={resource.id}>{content}</a>;
                  if (resource.path) return <a href={obsidianHref(resource.path)} key={resource.id}>{content}<small className="knowledge-learning-resource-path">Obsidian 原件 · {resource.path}</small></a>;
                  return null;
                })}
              </div>
            </section>
          ) : null}
          <aside className="knowledge-source-rail" aria-label="本节点来源与边界">
            <div className="knowledge-source-meta">
              <span>{node.sources?.length ?? 0} 条来源</span>
              {node.asOf ? <span>核验 {node.asOf}</span> : null}
              {node.jurisdiction ? <span>{node.jurisdiction}</span> : null}
            </div>
            <div className="knowledge-source-list">
              {node.sources?.map((source) => source.role === "owner-learning-record" ? (
                <div key={source.id}>
                  <span>{sourceRoleLabel(source.role)}</span><strong>{source.title}</strong><small>已用于合并本页正文{source.locator ? ` · ${source.locator}` : ""}</small>
                </div>
              ) : source.url ? (
                <a href={source.url} target="_blank" rel="noopener noreferrer" key={source.id}>
                  <span>{sourceRoleLabel(source.role)}</span><strong>{source.title}</strong>{source.locator ? <small>{source.locator}</small> : null}
                </a>
              ) : source.path ? (
                <a href={obsidianHref(source.path)} key={source.id}>
                  <span>{sourceRoleLabel(source.role)}</span><strong>{source.title}</strong><small>Obsidian 原件 · {source.path}{source.locator ? ` · ${source.locator}` : ""}</small>
                </a>
              ) : (
                <div key={source.id}>
                  <span>{sourceRoleLabel(source.role)}</span><strong>{source.title}</strong><small>{source.path}{source.locator ? ` · ${source.locator}` : ""}</small>
                </div>
              ))}
            </div>
          </aside>
          {card.kind === "choice" ? (
            <div className="knowledge-choice-list" aria-label="选择当前想法">
              {card.choices?.map((choice) => (
                <button className={selectedChoice === choice.id ? "is-selected" : ""} type="button" key={choice.id} onClick={() => saveAndAdvance("overview", choice.id)}>
                  <span>{selectedChoice === choice.id ? <Check size={17} /> : null}</span>
                  <strong>{choice.label}</strong>
                  <small>{choice.detail}</small>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          ) : null}
        </article>
      </main>

      <footer className="knowledge-reader-actions">
        <button className="knowledge-reader-previous" type="button" onClick={() => moveRelative(-1)}><ChevronLeft size={18} />{previousLabel}</button>
        <button className="knowledge-reader-secretary ai-button" type="button" onClick={(event) => { event.stopPropagation(); onAskSecretary(buildKnowledgeExplainSeed(domain.title, branch.title, node.title, card, node.sources)); }}>
          <MessageCircle size={19} /><span><strong>让秘书讲解</strong><small>打开后可继续语音问</small></span>
        </button>
        {card.kind === "choice" ? (
          <div className="knowledge-reader-choice-hint">点一个想法，自动看下一张</div>
        ) : (
          <div className="knowledge-reader-statuses" aria-label="标记当前理解状态">
            {([
              ["overview", "观其大略"],
              ["unclear", "还不清楚"],
              ["deep", "想深挖"],
            ] as const).map(([status, label]) => (
              <button className={currentStatus === status ? "is-selected" : ""} type="button" key={status} onClick={() => saveAndAdvance(status)}>
                {currentStatus === status ? <Check size={16} /> : null}{label}
              </button>
            ))}
          </div>
        )}
        <button className="knowledge-reader-next" type="button" onClick={() => moveRelative(1)}>{nextLabel}<ChevronRight size={18} /></button>
        {saveError ? <p role="status">{saveError}</p> : null}
      </footer>
    </div>
  );
}

export function DomainKnowledgeMap({
  domain,
  activeBranchId,
  activeNodeId,
  activeCardIndex,
  progress,
  onBranchChange,
  onOpenNode,
  onMoveReader,
  onCloseReader,
  onSaveProgress,
  onAskSecretary,
  onBack,
}: {
  domain: ResearchDomainView;
  activeBranchId: string;
  activeNodeId: string | null;
  activeCardIndex: number;
  progress: DomainResearchProgress;
  onBranchChange: (branchId: string) => void;
  onOpenNode: (target: ReaderTarget) => void;
  onMoveReader: (target: ReaderTarget) => void;
  onCloseReader: () => void;
  onSaveProgress: (update: DomainResearchProgressUpdate) => Promise<void>;
  onAskSecretary: (seedUser: string) => void;
  onBack: () => void;
}) {
  const activeBranch = domain.branches.find((branch) => branch.id === activeBranchId) ?? domain.branches[0];
  const ActiveIcon = activeBranch.icon;
  const formalNodes = activeBranch.formalNodes ?? [];
  const mappedNodes = activeBranch.mappedNodes ?? formalNodes;
  const activeNodeIndex = formalNodes.findIndex((node, index) => knowledgeNodeId(activeBranch.id, index, node) === activeNodeId);
  const activeNode = activeNodeIndex >= 0 ? formalNodes[activeNodeIndex] : null;
  const activeBranchCardEntries = formalNodes.flatMap((node, nodeIndex) => buildKnowledgeCards(activeBranch, node, nodeIndex).map((card, cardIndex) => ({
    card,
    node,
    nodeId: knowledgeNodeId(activeBranch.id, nodeIndex, node),
    nodeIndex,
    cardIndex,
  })));
  const unclearEntries = activeBranchCardEntries.filter(({ card }) => progress.cards[card.id]?.status === "unclear");
  const deepEntries = activeBranchCardEntries.filter(({ card }) => progress.cards[card.id]?.status === "deep");
  const entriesByCardId = new Map(activeBranchCardEntries.map((entry) => [entry.card.id, entry]));
  const recentEntries = progress.recentCardIds.flatMap((cardId) => {
    const entry = entriesByCardId.get(cardId);
    return entry ? [entry] : [];
  }).slice(0, 4);

  return (
    <div className={`domain-research domain-knowledge-map is-${domain.id}`}>
      <header className="knowledge-map-header">
        <div>
          <button className="knowledge-map-back" type="button" onClick={onBack}>专题研究</button>
          <ChevronRight size={14} />
          <span>{domain.title}</span>
        </div>
        <p>{domain.mapLead}</p>
      </header>

      <div className="knowledge-map-layout">
        <aside className="knowledge-map-outline" aria-label={`${domain.title}领域目录`}>
          <header><span>{domain.title}领域目录</span><FolderTree size={17} /></header>
          <nav>
            {domain.branches.map((branch) => {
              const Icon = branch.icon;
              return (
                <button className={branch.id === activeBranch.id ? "is-active" : ""} type="button" key={branch.id} onClick={() => onBranchChange(branch.id)}>
                  <Icon size={17} />
                  <span><strong>{branch.title}</strong><small>{branch.status}</small></span>
                  <ChevronRight size={15} />
                </button>
              );
            })}
          </nav>
          <div className="knowledge-map-legend">
            <span><i className="is-known" />已形成认识</span>
            <span><i className="is-learning" />正在理解</span>
            <span><i className="is-question" />存疑待证</span>
            <span><i />尚未展开</span>
          </div>
          <p className="knowledge-map-legend-note">状态只表示当前研究进展。课程读完、作品看过或项目做过，都不会自动变成“已形成认识”。</p>
        </aside>

        <section className="knowledge-map-content">
          <div className="knowledge-map-breadcrumb">{domain.title} / {activeBranch.title}</div>
          <header className="knowledge-map-title">
            <span><ActiveIcon size={22} /></span>
            <div><h2>{activeBranch.title}</h2><p>{activeBranch.summary}</p></div>
          </header>

          <section className="knowledge-understanding">
            <span><Lightbulb size={16} />一句话理解</span>
            <p>{activeBranch.summary}</p>
            <div className="knowledge-guiding-question"><strong>核心问题</strong><p>{activeBranch.guidingQuestion}</p></div>
          </section>

          <section className="knowledge-node-section">
            <header><h3>专题与知识节点</h3><small>纲目只负责导航；有来源的正式节点才可点读并保存进度</small></header>
            <div className="knowledge-node-grid">
              {activeBranch.nodes.map((topic, index) => {
                const topicId = knowledgeNodeId(activeBranch.id, index, topic);
                const topicNodes = mappedNodes.filter((node) => node.topicId === topicId);
                return (
                  <article className={`knowledge-topic-card${topicNodes.length ? " has-formal-nodes" : " is-outline"}`} key={topicId}>
                    <header><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{topic.title}</strong><p>{topic.description}</p></div></header>
                    {topicNodes.length ? <div className="knowledge-topic-node-list">{topicNodes.map((node) => {
                      const nodeIndex = formalNodes.indexOf(node);
                      const nodeId = knowledgeNodeId(activeBranch.id, nodeIndex, node);
                      if (node.status !== "formal") {
                        const outlineResources = node.learningResources ?? [];
                        const learningRecords = node.learningRecords ?? [];
                        return (
                        <div className={`knowledge-outline-node${outlineResources.length ? " has-key-materials" : ""}${learningRecords.length ? " has-learning-records" : ""}`} key={nodeId}>
                          <span><FileText size={15} />知识节点<em>正文待补</em></span>
                          <strong>{node.title}</strong>
                          <p>{node.description}</p>
                          <small>{outlineResources.length ? `纲目已建立 · ${outlineResources.length} 项绕不开材料已备` : "纲目已建立，内容待补"}</small>
                          {learningRecords.length ? (
                            <section className="knowledge-outline-learning" aria-label={`${node.title}的本人学习记录`}>
                              <header><MessageCircle size={14} /><strong>{learningStateLabel(node.learningState)}</strong><span>{learningRecords.length} 次</span></header>
                              {learningRecords.map((record) => (
                                <article key={record.recordId}>
                                  <span>{record.date}</span>
                                  <strong>{record.title}</strong>
                                  <p>{record.summary}</p>
                                  {record.nextStep ? <footer><b>下次继续</b>{record.nextStep}</footer> : null}
                                </article>
                              ))}
                            </section>
                          ) : null}
                          {outlineResources.length ? (
                            <details className="knowledge-outline-resources">
                              <summary><Library size={14} />查看绕不开材料</summary>
                              <div>
                                {outlineResources.map((resource) => {
                                  const body = (
                                    <>
                                      <span>{learningLevelLabel(resource.level)} · {learningKindLabel(resource.kind)}</span>
                                      <strong>{resource.title}</strong>
                                      {resource.creator ? <small>{resource.creator}</small> : null}
                                      <p>{resource.reason}</p>
                                      {resource.focus ? <blockquote><b>带着这个问题</b>{resource.focus}</blockquote> : null}
                                      <footer>{resource.duration ? <span>{resource.duration}</span> : null}{resource.language ? <span>{resource.language}</span> : null}<span>{learningAccessLabel(resource.access)}</span><ExternalLink size={13} /></footer>
                                    </>
                                  );
                                  if (resource.url) return <a href={resource.url} target="_blank" rel="noopener noreferrer" key={resource.id}>{body}</a>;
                                  if (resource.path) return <a href={obsidianHref(resource.path)} key={resource.id}>{body}</a>;
                                  return null;
                                })}
                              </div>
                            </details>
                          ) : null}
                        </div>
                        );
                      }
                      const cards = buildKnowledgeCards(activeBranch, node, nodeIndex);
                      const label = nodeProgressLabel(progress, cards);
                      const learningResourceCount = node.learningResources?.length ?? 0;
                      const learningRecordCount = node.learningRecords?.length ?? 0;
                      return (
                        <button className={label === "尚未浏览" ? "is-unopened" : "is-learning"} type="button" key={nodeId} onClick={() => onOpenNode({ domainId: domain.id, branchId: activeBranch.id, nodeId, cardIndex: 0 })}>
                          <span><BookOpen size={15} />正式节点<em>{cards.length} 张{learningResourceCount ? <> · <Library size={12} />{learningResourceCount} 项延展</> : null}{learningRecordCount ? <> · <MessageCircle size={12} />{learningRecordCount} 次学习</> : null}</em></span><strong>{node.title}</strong><small>{learningRecordCount ? learningStateLabel(node.learningState) : label}<ChevronRight size={14} /></small>
                        </button>
                      );
                    })}</div> : <small className="knowledge-topic-pending">纲目已建立，内容待补</small>}
                  </article>
                );
              })}
            </div>
          </section>


          <ResearchTransformation />
        </section>

        <aside className="knowledge-map-gaps" aria-label="认知缺口">
          <header><CircleHelp size={19} /><h3>我的阅读线索</h3></header>
          <section>
            <span><CircleHelp size={16} />仍不清楚</span>
            {unclearEntries.length ? <div className="knowledge-clue-list">{unclearEntries.slice(0, 5).map((entry) => (
              <button type="button" key={entry.card.id} onClick={() => onOpenNode({ domainId: domain.id, branchId: activeBranch.id, nodeId: entry.nodeId, cardIndex: entry.cardIndex })}>
                <strong>{entry.card.title}</strong><small>{entry.node.title}</small><ChevronRight size={14} />
              </button>
            ))}</div> : <p>点过“还不清楚”的卡会自动来到这里。</p>}
          </section>
          <section>
            <span><Sparkles size={16} />想继续看</span>
            {deepEntries.length ? <div className="knowledge-clue-list">{deepEntries.slice(0, 5).map((entry) => (
              <button type="button" key={entry.card.id} onClick={() => onOpenNode({ domainId: domain.id, branchId: activeBranch.id, nodeId: entry.nodeId, cardIndex: entry.cardIndex })}>
                <strong>{entry.card.title}</strong><small>{entry.node.title}</small><ChevronRight size={14} />
              </button>
            ))}</div> : <p>觉得值得深挖时点一下，系统替你收在这里。</p>}
          </section>
          <section>
            <span><History size={16} />最近看过</span>
            {recentEntries.length ? <div className="knowledge-clue-list">{recentEntries.map((entry) => (
              <button type="button" key={entry.card.id} onClick={() => onOpenNode({ domainId: domain.id, branchId: activeBranch.id, nodeId: entry.nodeId, cardIndex: entry.cardIndex })}>
                <strong>{entry.card.title}</strong><small>{progressLabel(progress.cards[entry.card.id]?.status)}</small><ChevronRight size={14} />
              </button>
            ))}</div> : <p>浏览过的卡片会自动出现，不需要另做记录。</p>}
          </section>
        </aside>
      </div>
      {activeNode ? createPortal(
        <KnowledgeCardReader
          domain={domain}
          branch={activeBranch}
          node={activeNode}
          nodeIndex={activeNodeIndex}
          cardIndex={activeCardIndex}
          progress={progress}
          onMove={onMoveReader}
          onClose={onCloseReader}
          onSave={onSaveProgress}
          onAskSecretary={onAskSecretary}
        />,
        document.body,
      ) : null}
    </div>
  );
}

export type { DomainId } from "./domain-research-catalog";
