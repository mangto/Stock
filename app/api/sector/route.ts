import { NO_PROVIDER_MESSAGE, resolveProvider, streamText, toStreamResponse } from "@/lib/ai";
import { getNews } from "@/lib/news";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TTL_MS = 15 * 60 * 1000;
// Finished reports, keyed by sector; reused while the underlying stories are unchanged.
const cache = new Map<string, { key: string; text: string; at: number }>();

const SYSTEM = `당신은 한국 증시 애널리스트입니다. 주어진 최근 뉴스 헤드라인 목록만 근거로
특정 섹터의 상황을 정리한 짧은 브리핑을 한국어로 씁니다.

반드시 아래 형식(마크다운)을 지키세요:

## 한줄 요약
(섹터 분위기를 한 문장으로)

## 핵심 이슈
- (뉴스에서 나온 주요 사건 3~5개, 각 1~2문장. 수치가 있으면 포함)

## 증시 전망
**단기 분위기:** 긍정 / 중립 / 부정 중 하나와 짧은 이유
- **상승 요인:** ...
- **하락 요인:** ...
- **체크포인트:** 앞으로 지켜볼 일정·지표 1~3개

## 뉴스에 언급된 종목
- (종목명 — 언급된 맥락 한 줄. 없으면 "특별히 언급된 종목 없음")

규칙:
- 헤드라인에 없는 사실을 지어내지 마세요. 일반적인 배경 설명이 필요하면 "(일반론)"이라고 표시하세요.
- 매수·매도 권유나 목표가 제시는 하지 마세요.
- 뉴스가 적으면 그 한계를 짧게 밝히세요.
- 전체 분량은 400~700자 정도로 간결하게.`;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id") ?? "";
  const force = params.get("refresh") === "1";
  const provider = resolveProvider(params.get("provider"));

  const news = await getNews();
  const bucket = news.sectors.find((s) => s.id === id);
  if (!bucket) return new Response("알 수 없는 섹터입니다.", { status: 404 });
  if (bucket.items.length === 0) {
    return new Response("최근 48시간 동안 이 섹터와 관련된 뉴스가 없습니다.", { status: 200 });
  }

  const items = bucket.items.slice(0, 25);
  const key = (provider?.id ?? "") + ":" + items.map((i) => i.id).join(",");
  const hit = cache.get(id);
  if (!force && hit && hit.key === key && Date.now() - hit.at < TTL_MS) {
    return new Response(hit.text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Generated-At": new Date(hit.at).toISOString() },
    });
  }

  if (!provider) return new Response(NO_PROVIDER_MESSAGE, { status: 503 });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const list = items
    .map(
      (n, i) =>
        `${i + 1}. [${n.source}, ${fmt(n.publishedAt)}${n.coverage > 1 ? `, ${n.coverage}개 언론 보도` : ""}] ${n.title}` +
        (n.summary ? `\n   요약: ${n.summary}` : "") +
        (n.related.length ? `\n   관련 헤드라인: ${n.related.slice(0, 3).map((r) => r.title).join(" / ")}` : ""),
    )
    .join("\n");

  const abort = new AbortController();
  const gen = streamText(provider, {
    system: SYSTEM,
    depth: "medium",
    signal: abort.signal,
    messages: [
      {
        role: "user",
        content: `섹터: ${bucket.emoji} ${bucket.name}
현재 시각: ${fmt(new Date().toISOString())} (KST)

최근 뉴스 (중요도 순):
${list}`,
      },
    ],
  });

  const body = toStreamResponse(gen, (text) => cache.set(id, { key, text, at: Date.now() }), abort);
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-AI-Provider": provider.id },
  });
}
