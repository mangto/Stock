import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { ALLOWED_HOSTS } from "@/lib/news";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export type ArticlePayload = {
  title: string;
  byline?: string;
  image?: string;
  paragraphs: string[];
};

const cache = new Map<string, ArticlePayload>();

function decode(buf: ArrayBuffer, contentType: string | null): string {
  let charset = contentType?.match(/charset=([\w-]+)/i)?.[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(buf.slice(0, 4096));
    charset = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

const NOISE = [
  /^▶/, /무단\s*전재/, /재배포\s*금지/, /^Copyright/i, /구독하기/, /^사진=?$/,
  /\S+@\S+\.\S+/, /저작권법/, /법적\s*책임/, /\[email/, /^입력\s?\d{4}/, /송고$/,
];

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return Response.json({ error: "url 파라미터가 필요합니다" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: "잘못된 URL" }, { status: 400 });
  }
  const allowed =
    target.protocol === "https:" &&
    ALLOWED_HOSTS.some((h) => target.hostname === h || target.hostname.endsWith("." + h));
  if (!allowed) return Response.json({ error: "허용되지 않은 출처" }, { status: 400 });

  const hit = cache.get(target.href);
  if (hit) return Response.json(hit);

  try {
    const res = await fetch(target.href, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = decode(await res.arrayBuffer(), res.headers.get("content-type"));

    const vc = new VirtualConsole(); // silence CSS parse noise
    const dom = new JSDOM(html, { url: target.href, virtualConsole: vc });
    const doc = dom.window.document;
    const image =
      doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? undefined;
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");

    const parsed = new Readability(doc).parse();
    if (!parsed?.content) throw new Error("본문을 찾지 못했습니다");

    // Keep paragraph breaks: many Korean outlets separate paragraphs with <br>.
    const withBreaks = parsed.content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h\d|li|figcaption|blockquote)>/gi, "\n");
    const body = new JSDOM(`<body>${withBreaks}</body>`, { virtualConsole: vc }).window.document.body;
    body.querySelectorAll("figure, figcaption, script, style").forEach((n) => n.remove());
    let paragraphs = (body.textContent ?? "")
      .split("\n")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 1 && !(s.length < 100 && NOISE.some((r) => r.test(s))));
    // Drop page chrome (share buttons, font-size menus, tags) before the first and
    // after the last real paragraph.
    const isBody = (s: string) => s.length >= 40;
    const first = paragraphs.findIndex(isBody);
    const last = paragraphs.findLastIndex(isBody);
    if (first >= 0) paragraphs = paragraphs.slice(first, last + 1);

    const payload: ArticlePayload = {
      title: ogTitle || parsed.title || "",
      byline: parsed.byline ?? undefined,
      image,
      paragraphs,
    };
    if (cache.size > 300) cache.clear();
    cache.set(target.href, payload);
    return Response.json(payload);
  } catch (e) {
    return Response.json(
      { error: `기사를 불러오지 못했습니다: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
