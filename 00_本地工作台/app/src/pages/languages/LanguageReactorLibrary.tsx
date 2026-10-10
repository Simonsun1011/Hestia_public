import { useEffect, useState } from "react";
import { BookMarked, ChevronRight, FileText, Search, ShieldCheck } from "lucide-react";
import type { LanguageReactorCollection, LanguageReactorItem } from "../../types";
import { Card, Empty, Kicker, SourceLink, fmtDate, jsonFetch } from "../../page-shared";
import { LANGUAGE_REACTOR_SOURCE } from "../../vault-paths";
import { mediaOffset, usableReactorTranslation } from "./shared";
import { readLanguageViewPosition, writeLanguageViewPosition } from "./language-view-memory";

export function LanguageReactorLibrary({ meta, onImport }: { meta: LanguageReactorCollection | null; onImport: (file: File) => void }) {
  const pageSize = 60;
  const rememberedPosition = readLanguageViewPosition("collection");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "phrase" | "word">(rememberedPosition?.kind || "all");
  const [source, setSource] = useState(rememberedPosition?.source || "全部作品");
  const [sources, setSources] = useState<string[]>(["全部作品"]);
  const [items, setItems] = useState<LanguageReactorItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOffset(0);
    setItems([]);
  }, [meta, kind, source, query]);

  useEffect(() => {
    if (sources.length <= 1 || sources.includes(source)) return;
    setSource("全部作品");
    writeLanguageViewPosition("collection", { kind, source: "全部作品" });
  }, [kind, source, sources]);

  useEffect(() => {
    if (!meta) { setItems([]); setTotal(0); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        kind,
        source,
        q: query.trim(),
        offset: String(offset),
        limit: String(pageSize),
      });
      jsonFetch<{ data: { items: LanguageReactorItem[]; total: number; sources: string[] } }>(`/api/languages/reactor?${params}`)
        .then((body) => {
          if (cancelled) return;
          setItems((current) => offset === 0 ? body.data.items : [...current, ...body.data.items]);
          setTotal(body.data.total);
          setSources(body.data.sources?.length ? body.data.sources : ["全部作品"]);
          setError("");
        })
        .catch((reason) => {
          if (cancelled) return;
          setError(reason instanceof Error ? reason.message : "没读到收藏内容");
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [meta, kind, source, query, offset]);

  const sourceName = (title: string) => title.split(" · ")[0] || title;
  return <Card className="lr-library">
    <div className="lr-header"><div><Kicker>爱好旁支</Kicker><h2>Language Reactor 收藏</h2><p>只是爱好，不算进日语总分。{meta ? `最近导入 ${fmtDate(meta.importedAt, true)}` : ""}</p></div><label className="lr-file-button"><FileText size={14}/>{meta ? "重新导入 JSON" : "导入 JSON"}<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ""; }}/></label></div>
    {meta ? <>
      <div className="lr-stats"><div><strong>{meta.stats.total}</strong><span>全部收藏</span></div><div><strong>{meta.stats.phrases}</strong><span>完整句子</span></div><div><strong>{meta.stats.words}</strong><span>带语境单词</span></div><div><strong>{meta.stats.sources}</strong><span>内容来源</span></div></div>
      <div className="lr-toolbar"><div className="lr-search"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索原文、翻译、假名或作品" placeholder="搜索原文、翻译、假名或作品…"/></div><div className="segmented lr-kind">{[["all", "全部"], ["phrase", "句子"], ["word", "单词"]].map(([value, label]) => <button key={value} className={kind === value ? "active" : ""} onClick={() => {
        const nextKind = value as typeof kind;
        setKind(nextKind);
        writeLanguageViewPosition("collection", { kind: nextKind, source });
      }}>{label}</button>)}</div><select value={source} onChange={(event) => {
        const nextSource = event.target.value;
        setSource(nextSource);
        writeLanguageViewPosition("collection", { kind, source: nextSource });
      }}>{sources.map((item) => <option key={item}>{item}</option>)}</select><span>{loading ? "读取中…" : `显示 ${items.length} / ${total}`}</span></div>
      {error ? <Empty>{error}</Empty> : null}
      <div className="lr-grid">{items.map((item) => <article className="lr-item" key={item.id}><header><div><span className={`lr-type ${item.type}`}>{item.type === "phrase" ? "句子" : "单词"}</span>{item.word ? <strong>{item.word}<small>{item.wordTransliteration}</small></strong> : null}</div><time>{fmtDate(item.createdAt)}</time></header><h3>{item.sentence}</h3>{item.transliteration ? <p className="lr-reading">{item.transliteration}</p> : null}<p className="lr-translation">{usableReactorTranslation(item)}</p><footer><span>{sourceName(item.sourceTitle)}</span><small>{mediaOffset(item.startTimeMs)}</small></footer>{item.previous || item.next ? <details><summary>查看前后语境 <ChevronRight size={12}/></summary><div>{item.previous ? <p><i>前</i><span>{item.previous}<small>{item.previousTranslation}</small></span></p> : null}<p className="current"><i>本句</i><span>{item.sentence}<small>{item.translation}</small></span></p>{item.next ? <p><i>后</i><span>{item.next}<small>{item.nextTranslation}</small></span></p> : null}</div></details> : null}</article>)}</div>
      {!error && items.length < total ? <button className="load-more" disabled={loading} onClick={() => setOffset(items.length)}>{loading ? "正在加载…" : `继续加载（剩余 ${total - items.length} 条）`}</button> : null}
      {!loading && !error && !items.length ? <Empty>没有符合当前筛选的收藏。</Empty> : null}
      <div className="lr-boundary"><ShieldCheck size={14}/><span>{meta.note} 本次略过 {meta.media.audioOmitted} 段音频和 {meta.media.screenshotsOmitted} 张截图。</span><SourceLink path={LANGUAGE_REACTOR_SOURCE} label="查看导入档案"/></div>
    </> : <div className="lr-empty"><BookMarked size={28}/><h3>等待第一次导入</h3><p>在 Language Reactor 里导出收藏（Saved Items → Export），然后在这儿选那个文件。</p></div>}
  </Card>;
}
