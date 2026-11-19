import { NO_PROVIDER_MESSAGE, resolveProvider, streamText, toStreamResponse } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatBody = {
  provider?: string;
  article: { title: string; source: string; publishedAt: string; url: string; text: string };
  messages: { role: "user" | "assistant"; content: string }[];
};

const SYSTEM = `당신은 증시 뉴스를 쉽게 풀어주는 한국어 금융 뉴스 해설가입니다.
사용자는 아래에 주어진 기사를 읽고 질문합니다.
- 기사 내용에 근거해 답하고, 기사에 없는 배경지식을 덧붙일 때는 그렇다고 밝히세요.
- 용어는 처음 보는 사람도 이해할 수 있게 짧게 설명하세요.
- 시장에 미칠 수 있는 영향은 여러 관점(긍정/부정 요인)으로 균형 있게 다루세요.
- 특정 종목을 사라/팔라는 식의 개인 맞춤 투자 권유는 하지 말고, 판단은 사용자 몫이라고 알려주세요.
- 답변은 간결하게, 필요하면 짧은 목록을 쓰세요.`;

export async function POST(req: Request) {
  const { provider: requested, article, messages } = (await req.json()) as ChatBody;
  const provider = resolveProvider(requested);
  if (!provider) return new Response(NO_PROVIDER_MESSAGE, { status: 503 });
  if (!article?.text || !messages?.length) return new Response("잘못된 요청입니다.", { status: 400 });

  const context = `<article>
제목: ${article.title}
출처: ${article.source} (${article.publishedAt})
URL: ${article.url}

${article.text.slice(0, 30000)}
</article>`;

  const abort = new AbortController();
  const gen = streamText(provider, {
    system: SYSTEM,
    context,
    messages: messages.slice(-20),
    depth: "low",
    signal: abort.signal,
  });

  return new Response(toStreamResponse(gen, undefined, abort), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-AI-Provider": provider.id },
  });
}
