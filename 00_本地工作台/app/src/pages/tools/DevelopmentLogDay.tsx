import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { ArrowLeft } from "lucide-react";
import type { DevelopmentLogDay } from "../../types";
import { Kicker, SourceLink } from "../../page-shared";
import { remarkVaultWikiLinks, stripDisplayFrontmatter, vaultMarkdownUrlTransform } from "../../markdown-display.mjs";

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? ["http", "https", "mailto"]), "obsidian"],
  },
};

const markdownComponents = {
  a: ({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) => (
    <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>
  ),
};

export default function DevelopmentLogDayView({
  day,
  onBack,
}: {
  day: DevelopmentLogDay;
  onBack: () => void;
}) {
  return (
    <div className="development-log-day-view">
      <button type="button" className="development-log-day-back" onClick={onBack}>
        <ArrowLeft size={15} />
        每天的日志
      </button>
      <article className="development-log-full">
        <header>
          <Kicker>完整日志</Kicker>
          <h2>{day.date}</h2>
          <p>{day.description || "日志目录中的当日原文"}</p>
          <SourceLink path={day.sourcePath} label="在 Obsidian 打开这一天" />
        </header>
        <div className="development-log-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, [remarkVaultWikiLinks, { sourcePath: day.sourcePath }]]}
            rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
            components={markdownComponents}
            urlTransform={vaultMarkdownUrlTransform}
          >
            {stripDisplayFrontmatter(day.markdown)}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
