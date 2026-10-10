/**
 * 抓网页、转纯文本、逐字核对（价格追踪与东京活动共用）。
 *
 * 出网只在这里：每一跳（含重定向）都要过白名单，响应体有大小上限，有超时。
 * 模型只收到这里转出的纯文本；页面里的链接写成「文字 ⟨URL⟩」，模型只能照抄其中出现过的链接。
 * 模型交回的标题、价格、证据都要用 appearsIn 核对确实出现在页面原文里，编出来的一律丢弃。
 */

export const PAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PAGE_MAX_REDIRECTS = 3;
export const PAGE_TIMEOUT_MS = 30_000;
/** 交给模型的页面文本上限（字符）。超出截断。省 token：比 Hestia 小。 */
export const PAGE_TEXT_MAX_CHARS = 60_000;

/** 与常见桌面浏览器一致；站点对非浏览器 UA 普遍直接拒绝。 */
export const PAGE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * 通用抓取。返回 { ok: true, finalUrl, html } 或 { ok: false, outcome: failed|blocked|unavailable, error }。
 * @param {(url: string) => boolean} allowed
 */
export async function fetchAllowedPage(allowed, startUrl, fetchImpl = fetch) {
  let current = startUrl;
  for (let hop = 0; hop <= PAGE_MAX_REDIRECTS; hop++) {
    if (!allowed(current)) return { ok: false, outcome: "failed", error: "主机不在白名单内" };
    let res;
    try {
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": PAGE_USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "ja-JP,ja;q=0.9",
        },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
    } catch (err) {
      return { ok: false, outcome: "failed", error: err?.name === "TimeoutError" ? "超时" : "连接失败" };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) return { ok: false, outcome: "failed", error: "重定向缺少 Location" };
      if (hop === PAGE_MAX_REDIRECTS) return { ok: false, outcome: "failed", error: "重定向超过 3 次" };
      try {
        current = new URL(loc, current).href;
      } catch {
        return { ok: false, outcome: "failed", error: "重定向地址无效" };
      }
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel();
      return { ok: false, outcome: "unavailable", error: `HTTP ${res.status}` };
    }
    if (res.status === 403 || res.status === 429 || res.status === 503) {
      await res.body?.cancel();
      return { ok: false, outcome: "blocked", error: `HTTP ${res.status}` };
    }
    if (res.status < 200 || res.status >= 300) {
      await res.body?.cancel();
      return { ok: false, outcome: "failed", error: `HTTP ${res.status}` };
    }
    const bytes = await readCappedBytes(res, PAGE_MAX_BYTES);
    if (!bytes) return { ok: false, outcome: "failed", error: "响应超过 8 MB" };
    return { ok: true, finalUrl: current, html: decodeHtml(bytes, res.headers.get("content-type")) };
  }
  return { ok: false, outcome: "failed", error: "重定向超过 3 次" };
}

async function readCappedBytes(res, maxBytes) {
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > maxBytes ? null : buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** 按 Content-Type 的 charset，其次 <meta charset> 解码。楽天、Yahoo 的部分页面为 EUC-JP / Shift_JIS。 */
export function decodeHtml(bytes, contentType) {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const head = bytes.subarray(0, 4096).toString("latin1");
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label.toLowerCase()).decode(bytes);
    } catch {
      /* 不认识的标签，试下一个 */
    }
  }
  return bytes.toString("utf8");
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", yen: "¥", times: "×", hellip: "…", ndash: "–", mdash: "—" };

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) return " ";
      try {
        return String.fromCodePoint(code);
      } catch {
        return " ";
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const BLOCK_TAGS = /<\/?(?:p|div|li|ul|ol|tr|td|th|table|h[1-6]|section|article|header|footer|nav|aside|main|br|hr|dd|dt|dl|form|option|button|time|figure|figcaption)\b[^>]*>/gi;

function stripTags(text) {
  return text.replace(/<[^>]*>/g, " ");
}

function tidy(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v 　]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

function attr(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decodeEntities(match[1] ?? match[2] ?? "").trim() : null;
}

function cutText(text, maxChars) {
  const deduped = text.replace(/(⟨[^⟩]+⟩)(\s*\1)+/g, "$1");
  const chars = [...deduped];
  const truncated = chars.length > maxChars;
  const out = truncated ? chars.slice(0, maxChars).join("") : deduped;
  // 只认模型实际收到的文本里出现的链接
  const links = new Set();
  for (const match of out.matchAll(/⟨(https:\/\/[^⟩]+)⟩/g)) links.add(match[1]);
  return { text: out, fullChars: chars.length, truncated, links };
}

/**
 * 页面里的结构化价格数据：`<meta itemprop|property=… content=…>` 与 JSON-LD。
 * 部分站（楽天单品页）只在这里放价格，可见文本里没有。原样取，不解析、不换算。
 */
export function structuredData(html) {
  const lines = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = /\b(?:itemprop|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!key || content == null) continue;
    if (!/price|currency|availability|sku|gtin|brand|name|offer/i.test(key)) continue;
    lines.push(`${key}: ${decodeEntities(content).trim()}`);
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const body = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (/price/i.test(body)) lines.push([...body].slice(0, 4000).join(""));
  }
  return [...new Set(lines)].join("\n");
}

/**
 * HTML → 纯文本。
 * @param {string} html
 * @param {{ baseUrl: string, linkFor?: (href: string) => string | null, structured?: boolean, maxChars?: number }} opts
 *   linkFor 把页面里的 href 规范成要交给模型的链接，返回 null 表示这个链接不写出来。
 */
export function htmlToText(html, opts) {
  const images = new Map();
  const labels = new Map();
  const structured = opts.structured ? structuredData(html) : "";
  let body = html
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  body = body.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_whole, attrs, inner) => {
    let label = decodeEntities(stripTags(inner)).replace(/\s+/g, " ").trim();
    if (!label) {
      const alt = /\balt\s*=\s*"([^"]*)"/i.exec(inner)?.[1];
      if (alt) label = decodeEntities(alt).trim();
    }
    const href = attr(`<a ${attrs}>`, "href");
    const link = href && opts.linkFor ? opts.linkFor(href) : null;
    if (!link) return ` ${label} `;
    if (label && label.length > (labels.get(link)?.length ?? 0)) labels.set(link, label);
    const imgTag = /<img\b[^>]*>/i.exec(inner)?.[0];
    if (imgTag && !images.has(link)) {
      const src = imgSrc(imgTag, opts.baseUrl);
      if (src) images.set(link, src);
    }
    return ` ${label} ⟨${link}⟩ `;
  });
  body = body.replace(BLOCK_TAGS, "\n");
  const visible = tidy(decodeEntities(stripTags(body)));
  const full = structured ? `${visible}\n[结构化数据]\n${structured}` : visible;
  return { ...cutText(full, opts.maxChars ?? PAGE_TEXT_MAX_CHARS), images, labels };
}

/** `<img>` 的图片地址：延迟加载属性优先，其次 srcset 第一项，最后 src。data: 与 .svg、图标类不要。 */
function imgSrc(tag, base) {
  const candidates = [
    attr(tag, "data-src"),
    attr(tag, "data-lazy-src"),
    attr(tag, "data-original"),
    (attr(tag, "data-srcset") ?? attr(tag, "srcset"))?.split(",")[0]?.trim().split(/\s+/)[0] ?? null,
    attr(tag, "src"),
  ];
  for (const candidate of candidates) {
    if (!candidate || candidate.startsWith("data:")) continue;
    try {
      const url = new URL(candidate, base);
      if (url.protocol !== "https:") continue;
      if (/\.svg(\?|$)/i.test(url.pathname) || /(?:logo|icon|sprite|blank|spacer|loading)/i.test(url.pathname)) continue;
      return url.href;
    } catch {
      /* 下一个 */
    }
  }
  return null;
}

/** 主机是否落在 hosts 内（完全相等或其子域），且是 https。 */
export function hostIn(hosts, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
}

/** 去掉片段与跟踪参数，同一页面只有一种写法。非 https 或无法解析返回 null。 */
export function canonicalUrl(href, base) {
  let url;
  try {
    url = new URL(decodeEntities(href).trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|yclid|ref$|_ga)/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

/** 详情页的 og:image（取不到返回 null）。只认 https。 */
export function ogImage(html, baseUrl) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = attr(tag, "property") ?? attr(tag, "name");
    if (key !== "og:image" && key !== "twitter:image") continue;
    const content = attr(tag, "content");
    if (!content) continue;
    try {
      const url = new URL(content, baseUrl);
      if (url.protocol === "https:") return url.href;
    } catch {
      /* 下一个 */
    }
  }
  return null;
}

/** 比对用：连续空白折为一个空格。 */
export function collapseSpace(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/** needle 是否逐字出现在页面文本中（只忽略空白差异）。pageCollapsed 须先经 collapseSpace。 */
export function appearsIn(pageCollapsed, needle) {
  const flat = collapseSpace(needle);
  return flat !== "" && pageCollapsed.includes(flat);
}
