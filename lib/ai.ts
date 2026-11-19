import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * One interface over several AI providers. Each provider is enabled by putting its
 * key in .env.local; the model can be overridden with the matching *_MODEL variable.
 */
export type ProviderId = "anthropic" | "openai" | "gemini" | "custom";

type ProviderDef = {
  id: ProviderId;
  label: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  /** OpenAI-compatible endpoint (Gemini and custom go through the OpenAI SDK). */
  baseURL?: () => string | undefined;
};

const DEFS: ProviderDef[] = [
  { id: "anthropic", label: "Claude", keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", defaultModel: "claude-opus-5-5" },
  { id: "openai", label: "OpenAI", keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", defaultModel: "gpt-5.5" },
  {
    id: "gemini", label: "Gemini", keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: "gemini-flash-latest",
    baseURL: () => "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  {
    // Any OpenAI-compatible server: OpenRouter, Groq, DeepSeek, Ollama, LM Studio…
    id: "custom", label: "OpenAI 호환", keyEnv: "CUSTOM_API_KEY", modelEnv: "CUSTOM_MODEL", defaultModel: "",
    baseURL: () => process.env.CUSTOM_BASE_URL || undefined,
  },
];

export type ProviderInfo = { id: ProviderId; label: string; model: string };

function modelOf(d: ProviderDef) {
  return process.env[d.modelEnv] || d.defaultModel;
}

function isConfigured(d: ProviderDef) {
  if (d.id === "custom") return !!(process.env.CUSTOM_BASE_URL && process.env.CUSTOM_MODEL); // key optional (e.g. Ollama)
  return !!process.env[d.keyEnv];
}

export function availableProviders(): ProviderInfo[] {
  return DEFS.filter(isConfigured).map((d) => ({ id: d.id, label: d.label, model: modelOf(d) }));
}

export function defaultProvider(): ProviderId | null {
  const list = availableProviders();
  const preferred = process.env.AI_PROVIDER as ProviderId | undefined;
  return list.find((p) => p.id === preferred)?.id ?? list[0]?.id ?? null;
}

/** Picks the requested provider if configured, else the default. Null when none is set up. */
export function resolveProvider(requested?: string | null): ProviderInfo | null {
  const list = availableProviders();
  return list.find((p) => p.id === requested) ?? list.find((p) => p.id === defaultProvider()) ?? null;
}

export const NO_PROVIDER_MESSAGE =
  "AI 기능을 쓰려면 프로젝트 폴더의 .env.local 파일에 API 키를 하나 이상 넣고 서버를 다시 시작하세요. " +
  "(ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY 또는 CUSTOM_BASE_URL + CUSTOM_MODEL)";

export type ChatInput = {
  system: string;
  /** Large, stable context (the article) — cached where the provider supports it. */
  context?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  /** How hard the model should think; mapped per provider. */
  depth: "low" | "medium";
  signal?: AbortSignal;
};

/** Streams answer text chunks. Throws on provider errors (see friendlyError). */
export async function* streamText(provider: ProviderInfo, input: ChatInput): AsyncGenerator<string> {
  const def = DEFS.find((d) => d.id === provider.id)!;

  if (def.id === "anthropic") {
    const client = new Anthropic();
    const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: input.system }];
    if (input.context) system.push({ type: "text", text: input.context, cache_control: { type: "ephemeral" } });
    const stream = client.beta.messages.stream(
      {
        model: provider.model,
        max_tokens: 8000,
        output_config: { effort: input.depth },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: input.messages,
      },
      { signal: input.signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "\n\n(이 요청에는 답변할 수 없습니다.)";
    return;
  }

  // OpenAI, Gemini (OpenAI-compatible endpoint) and custom servers.
  const client = new OpenAI({
    apiKey: process.env[def.keyEnv] || "not-needed",
    baseURL: def.baseURL?.(),
    maxRetries: 1,
  });
  const system = input.context ? `${input.system}\n\n${input.context}` : input.system;

  // Busy models (503/429), retired ones (404), empty or stalled replies: move on to the
  // next model in the chain, as long as nothing has been shown to the user yet.
  const chain = [...new Set([provider.model, ...fallbackModels(def)])];
  // Skip models that just failed, unless that would leave nothing to try.
  const healthy = chain.filter((m) => (cooldown.get(m) ?? 0) < Date.now());
  const models = healthy.length ? healthy : chain;
  let lastError: unknown = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const attempt = new AbortController();
    const onAbort = () => attempt.abort();
    input.signal?.addEventListener("abort", onAbort);
    let stalled = false;
    const timer = setTimeout(() => {
      stalled = true;
      attempt.abort();
    }, FIRST_TOKEN_TIMEOUT_MS);
    let started = false;
    try {
      const stream = await client.chat.completions.create(
        { model, stream: true, messages: [{ role: "system", content: system }, ...input.messages] },
        { signal: attempt.signal },
      );
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (!text) continue;
        if (!started) {
          started = true;
          clearTimeout(timer);
          if (model !== provider.model) yield `※ ${provider.model} 모델이 혼잡해서 ${model} 모델로 답변합니다.\n\n`;
        }
        yield text;
      }
      if (started) return;
      lastError = new Error(`${model} 모델이 빈 응답을 보냈습니다.`);
    } catch (e) {
      if (started || input.signal?.aborted) throw e;
      if (!stalled && !isRetryable(e)) throw e;
      cooldown.set(model, Date.now() + COOLDOWN_MS);
      lastError = stalled ? new Error(`${model} 모델이 ${FIRST_TOKEN_TIMEOUT_MS / 1000}초 동안 응답하지 않았습니다.`) : e;
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError ?? new Error("응답을 받지 못했습니다.");
}

const FIRST_TOKEN_TIMEOUT_MS = 20_000;
const COOLDOWN_MS = 5 * 60_000;
/** model id -> time until which it is skipped after failing */
const cooldown = new Map<string, number>();

// Tried in order after the main model. Override with e.g. GEMINI_FALLBACK_MODELS=a,b
const DEFAULT_FALLBACKS: Partial<Record<ProviderId, string[]>> = {
  gemini: ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.6-flash"],
};

function fallbackModels(def: ProviderDef): string[] {
  const env = process.env[def.modelEnv.replace(/_MODEL$/, "_FALLBACK_MODELS")];
  if (env !== undefined) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_FALLBACKS[def.id] ?? [];
}

function isRetryable(e: unknown) {
  if (!(e instanceof OpenAI.APIError)) return e instanceof OpenAI.APIConnectionError;
  return [404, 408, 429, 500, 502, 503, 504].includes(e.status ?? 0);
}

export function friendlyError(e: unknown): string {
  if ((e instanceof Anthropic.APIError || e instanceof OpenAI.APIError) && [503, 529].includes(e.status ?? 0))
    return "AI 서버가 지금 혼잡합니다. 잠시 후 다시 시도하거나 .env.local에서 다른 모델로 바꿔보세요.";
  if (e instanceof Anthropic.AuthenticationError || e instanceof OpenAI.AuthenticationError) return "API 키가 올바르지 않습니다.";
  if (e instanceof Anthropic.RateLimitError || e instanceof OpenAI.RateLimitError) return "요청이 많거나 사용 한도를 넘었습니다. 잠시 후 다시 시도하세요.";
  if (e instanceof Anthropic.NotFoundError || e instanceof OpenAI.NotFoundError) return "모델을 찾을 수 없습니다. .env.local의 *_MODEL 값을 확인하세요.";
  if (e instanceof Anthropic.APIError || e instanceof OpenAI.APIError) return e.message;
  if (e instanceof Error) return e.message;
  return "알 수 없는 오류";
}

/** Wraps a text generator as a streamed HTTP response body. */
export function toStreamResponse(gen: AsyncGenerator<string>, onDone?: (full: string) => void, abort?: AbortController) {
  const encoder = new TextEncoder();
  let acc = "";
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of gen) {
          acc += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        if (acc) onDone?.(acc);
      } catch (e) {
        if (!abort?.signal.aborted) controller.enqueue(encoder.encode(`\n\n⚠️ ${friendlyError(e)}`));
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      abort?.abort();
    },
  });
  return body;
}
