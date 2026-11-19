import { XMLParser } from "fast-xml-parser";
import { SECTORS, sectorsOf } from "./sectors";

export type NewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string; // ISO
  summary: string;
  image?: string;
  /** Number of distinct outlets reporting the same story */
  coverage: number;
  /** Other outlets' headlines on the same story */
  related: { title: string; link: string; source: string }[];
};

type Feed = { source: string; url: string; filter?: boolean };

// Market-focused feeds. Yonhap's economy feed is broad, so it is keyword-filtered.
export const FEEDS: Feed[] = [
  { source: "한국경제", url: "https://www.hankyung.com/feed/finance" },
  { source: "조선비즈", url: "https://biz.chosun.com/arc/outboundfeeds/rss/category/stock/?outputType=xml" },
  { source: "서울경제", url: "https://www.sedaily.com/rss/finance" },
  { source: "파이낸셜뉴스", url: "https://www.fnnews.com/rss/r20/fn_realnews_stock.xml" },
  { source: "연합뉴스", url: "https://www.yna.co.kr/rss/economy.xml", filter: true },
];

export const ALLOWED_HOSTS = [
  "hankyung.com",
  "biz.chosun.com",
  "sedaily.com",
  "fnnews.com",
  "yna.co.kr",
];

const MARKET_KEYWORDS = [
  "주가", "증시", "코스피", "코스닥", "주식", "종목", "상장", "공모", "IPO", "투자",
  "금리", "환율", "달러", "채권", "실적", "영업이익", "매출", "시총", "외국인", "기관",
  "개미", "나스닥", "뉴욕", "월가", "S&P", "다우", "반도체", "ETF", "펀드", "증권",
  "배당", "자사주", "금융", "한은", "연준", "Fed", "유가", "비트코인", "가상자산", "수출",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>))
    return String((v as Record<string, unknown>)["#text"]);
  return "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type RawItem = Omit<NewsItem, "coverage" | "related" | "id">;

async function fetchFeed(feed: Feed): Promise<RawItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const doc = parser.parse(xml);
    let items = doc?.rss?.channel?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    const out: RawItem[] = [];
    for (const it of items) {
      const title = stripHtml(text(it.title));
      const link = text(it.link).trim();
      if (!title || !link) continue;
      const date = new Date(text(it.pubDate));
      if (isNaN(date.getTime())) continue;
      const summary = stripHtml(text(it.description) || text(it["content:encoded"])).slice(0, 200);
      const media = it["media:content"];
      const image = media?.["@url"] ?? undefined;
      if (feed.filter && !MARKET_KEYWORDS.some((k) => (title + summary).includes(k))) continue;
      out.push({ title, link, source: feed.source, publishedAt: date.toISOString(), summary, image });
    }
    return out;
  } catch {
    return [];
  }
}

// --- Story clustering: headlines about the same event share many character bigrams.
function bigrams(title: string): Set<string> {
  const clean = title
    .replace(/\[[^\]]*\]/g, " ") // [단독], [월가 업&다운]
    .replace(/[^\p{L}\p{N}]+/gu, "");
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}

const SIM_THRESHOLD = 0.42;

type Cluster = { items: RawItem[]; grams: Set<string>[] };

function cluster(items: RawItem[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const item of items) {
    const g = bigrams(item.title);
    let best: Cluster | null = null;
    let bestScore = 0;
    for (const c of clusters) {
      const s = Math.max(...c.grams.map((cg) => similarity(g, cg)));
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best && bestScore >= SIM_THRESHOLD) {
      best.items.push(item);
      best.grams.push(g);
    } else {
      clusters.push({ items: [item], grams: [g] });
    }
  }
  return clusters;
}

function idOf(link: string): string {
  let h = 0;
  for (let i = 0; i < link.length; i++) h = (h * 31 + link.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function toNews(c: Cluster): NewsItem {
  // Newest item is the representative; prefer one with a summary.
  const sorted = [...c.items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const rep = sorted.find((i) => i.summary) ?? sorted[0];
  const sources = new Set(c.items.map((i) => i.source));
  return {
    ...rep,
    publishedAt: sorted[0].publishedAt,
    id: idOf(rep.link),
    coverage: sources.size,
    related: sorted
      .filter((i) => i !== rep)
      .slice(0, 6)
      .map(({ title, link, source }) => ({ title, link, source })),
  };
}

export type SectorBucket = { id: string; name: string; emoji: string; items: NewsItem[] };

export type NewsPayload = {
  updatedAt: string;
  breaking: NewsItem[];
  popular: NewsItem[];
  /** Stories grouped by sector, most important first (max 30 each). */
  sectors: SectorBucket[];
};

let cache: { at: number; data: NewsPayload } | null = null;
const TTL_MS = 2 * 60 * 1000;

export async function getNews(): Promise<NewsPayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();
  // Only stories from the last 48 hours count.
  const cutoff = Date.now() - 48 * 3600 * 1000;
  const fresh = all
    .filter((i) => new Date(i.publishedAt).getTime() > cutoff)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const stories = cluster(fresh).map(toNews);

  const breaking = [...stories]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 10);

  // Popularity: outlets covering the story, plus total articles, decayed by age.
  const now = Date.now();
  const score = (n: NewsItem, size: number) => {
    const ageH = (now - new Date(n.publishedAt).getTime()) / 3600000;
    return (n.coverage * 2 + size) / Math.pow(ageH + 2, 0.6);
  };
  const sizes = new Map(stories.map((s) => [s.id, s.related.length + 1]));
  const breakingIds = new Set(breaking.map((b) => b.id));
  const ranked = [...stories].sort((a, b) => score(b, sizes.get(b.id)!) - score(a, sizes.get(a.id)!));
  // Keep the two tabs distinct: a single-outlet story already in 속보 goes to the back.
  const dup = (n: NewsItem) => breakingIds.has(n.id) && n.coverage < 2;
  const popular = [...ranked.filter((n) => !dup(n)), ...ranked.filter(dup)].slice(0, 10);

  const sectors: SectorBucket[] = SECTORS.map(({ id, name, emoji }) => ({
    id,
    name,
    emoji,
    items: ranked
      .filter((n) => sectorsOf([n.title, ...n.related.map((r) => r.title)].join(" "), n.summary).includes(id))
      .slice(0, 30),
  }));

  const data = { updatedAt: new Date().toISOString(), breaking, popular, sectors };
  if (fresh.length) cache = { at: Date.now(), data };
  return data;
}
