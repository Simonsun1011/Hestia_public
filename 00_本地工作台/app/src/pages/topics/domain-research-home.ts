import type { DomainId } from "./domain-research-catalog";

export type ResearchDomainHomeMeta = {
  id: DomainId;
  title: string;
  mark: string;
  defaultBranch: string;
  focusLabel: string;
  focusTitle: string;
  focusText: string;
  highlights: string[];
  nextLabel: string;
};

export const RESEARCH_DOMAIN_IDS = [
  "ai",
  "economics-finance",
  "language",
  "image-management",
  "fitness",
] as const satisfies readonly DomainId[];

export const RESEARCH_DOMAIN_HOME_META: Record<DomainId, ResearchDomainHomeMeta> = {

  ai: {
    id: "ai",
    title: "人工智能",
    mark: "智能系统",
    defaultBranch: "ai-history-math",
    focusLabel: "知识地图主线",
    focusTitle: "从历史范式走到生成模型、Agent 与机器人",
    focusText: "同时追问能力怎样产生、怎样评测，以及怎样进入真实产品。",
    highlights: ["搜索与推理", "生成模型", "Agent 与机器人", "安全与治理"],
    nextLabel: "继续建立原理、工程、产品与社会之间的联系",
  },
  language: {
    id: "language",
    title: "语言研究",
    mark: "长期语言线",
    defaultBranch: "language-foundations",
    focusLabel: "知识地图主线",
    focusTitle: "用共同语言学骨架连接正在学的语言",
    focusText: "将日语、汉语、拉丁语、英语和德语放进历史、心智与社会中理解。",
    highlights: ["语言学基础", "语言史与类型", "习得与心智", "具体语言"],
    nextLabel: "从共同概念进入一门语言，或反向比较多门语言",
  },


  "image-management": {
    id: "image-management",
    title: "形象管理",
    mark: "外貌与表达",
    defaultBranch: "image-self",
    focusLabel: "知识地图主线",
    focusTitle: "把个人条件、视觉目标与日常维护连起来",
    focusText: "从皮肤、发型、妆容和穿搭，走向稳定、可复现的自我表达。",
    highlights: ["个人定位", "护理与发型", "妆容与穿搭", "体态与镜头"],
    nextLabel: "先理解自己，再把方法变成能够长期执行的方案",
  },
  fitness: {
    id: "fitness",
    title: "运动健身",
    mark: "身体能力",
    defaultBranch: "fitness-physiology",
    focusLabel: "知识地图主线",
    focusTitle: "从身体原理走到训练计划、恢复与长期习惯",
    focusText: "将力量、心肺、动作、营养和数据放在可持续的生活系统中。",
    highlights: ["运动生理", "力量与心肺", "计划与恢复", "营养与数据"],
    nextLabel: "继续理解身体，但不让设备和数字取代实际感受",
  },
  "economics-finance": {
    id: "economics-finance",
    title: "经济与金融",
    mark: "投资认知底座",
    defaultBranch: "ef-method-history",
    focusLabel: "知识地图主线",
    focusTitle: "从经济运行走到资产价格与投资决策",
    focusText: "用经济学解释环境，用会计与金融理解企业、证券、估值、组合和风险。",
    highlights: ["宏观与货币", "公司与财报", "资产与估值", "组合与风控"],
    nextLabel: "先看懂专业语言，再把判断带回真实投资项目",
  },
};

export function isResearchDomainId(value: unknown): value is DomainId {
  return typeof value === "string" && RESEARCH_DOMAIN_IDS.includes(value as DomainId);
}
