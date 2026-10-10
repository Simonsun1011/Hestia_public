import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { ArrowLeft, BookOpenText, CalendarDays, CircleDotDashed, ExternalLink } from "lucide-react";

import { Card, Empty, Kicker, jsonFetch } from "../../page-shared";
import { stripDisplayFrontmatter } from "../../markdown-display.mjs";
import type { JapanActivityGuideDocument } from "../../types";
import GuideOfficialImage from "./GuideOfficialImage";

type GuideSection = { title: string; markdown: string };

const WIDE_SECTIONS = new Set(["当前结论", "为什么值得去", "听讲抓手", "展览内容与看展抓手", "来源与核验边界"]);

function splitGuideSections(markdown: string): GuideSection[] {
  const lines = stripDisplayFrontmatter(markdown).split(/\r?\n/);
  const sections: GuideSection[] = [];
  let title = "";
  let body: string[] = [];
  const finish = () => {
    if (title && body.some((line) => line.trim())) sections.push({ title, markdown: body.join("\n").trim() });
  };
  for (const line of lines) {
    if (/^#\s+/.test(line)) continue;
    const heading = line.match(/^##\s+(.+)$/)?.[1]?.trim();
    if (heading) {
      finish();
      title = heading;
      body = [];
    } else if (title) {
      body.push(line);
    }
  }
  finish();
  return sections;
}

const markdownComponents = {
  a: ({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) => (
    <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}<ExternalLink size={12} /></a>
  ),
};

export default function JapanActivityGuide({ id, onBack, backLabel }: { id: string; onBack: () => void; backLabel: string }) {
  const [data, setData] = useState<JapanActivityGuideDocument | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    void jsonFetch<JapanActivityGuideDocument>(`/api/tools/japan-activity-guide?id=${encodeURIComponent(id)}`)
      .then((document) => { if (!cancelled) setData(document); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "攻略打不开"); });
    return () => { cancelled = true; };
  }, [id]);

  const sections = useMemo(() => data ? splitGuideSections(data.markdown) : [], [data]);

  return (
    <div className="japan-guide-reader">
      <button type="button" className="activity-guide-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {backLabel}
      </button>

      {error ? (
        <div className="vpn-warning" role="alert">
          <BookOpenText size={16} />
          <div><strong>这份攻略暂时打不开</strong><span>{error}</span></div>
        </div>
      ) : null}
      {!data && !error ? <Empty>正在小秘书里打开完整攻略。</Empty> : null}

      {data ? (
        <>
          <Card className="japan-guide-reader-hero">
            <GuideOfficialImage {...data} guideId={data.id} className="is-guide-hero" priority sourceLink />
            <div>
              <Kicker>攻略集 · 小秘书内阅读</Kicker>
              <h2>{data.name}</h2>
              <p>{data.description || "出发前需要确认的事实、路线与现场行动。"}</p>
            </div>
            <div className="japan-guide-reader-facts">
              <span><CalendarDays size={16} /><strong>{data.dateLabel}</strong></span>
              <span><CircleDotDashed size={16} /><strong>{data.status}</strong></span>
              <small>读取同一份 Vault 原件 · {data.updatedAt || "更新日期待补"}</small>
            </div>
          </Card>

          <div className="japan-guide-reader-grid">
            {sections.map((section, index) => (
              <Card className={`japan-guide-reader-section${WIDE_SECTIONS.has(section.title) ? " is-wide" : ""}`} key={section.title}>
                <header>
                  <Kicker>{String(index + 1).padStart(2, "0")} · 出门攻略</Kicker>
                  <h2>{section.title}</h2>
                </header>
                <div className="japan-guide-reader-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
                    {section.markdown}
                  </ReactMarkdown>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
