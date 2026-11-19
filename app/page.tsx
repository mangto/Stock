"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NewsItem, NewsPayload, SectorBucket } from "@/lib/news";
import type { ProviderInfo } from "@/lib/ai";

type Article = { title: string; byline?: string; image?: string; paragraphs: string[] };
type Msg = { role: "user" | "assistant"; content: string };
type Tab = "breaking" | "popular" | "saved";
type Report = { text: string; at: string; done: boolean };

const REFRESH_MS = 2 * 60 * 1000;

/* ---------------- storage helpers (per-viewer conveniences only) ---------------- */
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function timeAgo(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/* ---------------- icons ---------------- */
const I = {
  chart: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  bolt: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  sun: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>,
  star: (on: boolean) => <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>,
  back: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>,
  ext: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 4h6v6M20 4 10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>,
  link: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>,
  send: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  stop: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>,
  copy: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  spark: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7z" /></svg>,
  news: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 5h13v14H6a2 2 0 0 1-2-2z" /><path d="M17 9h3v8a2 2 0 0 1-2 2" /><path d="M8 9h5M8 13h5M8 17h3" /></svg>,
};

/* ================================================================ */
export default function Home() {
  const [news, setNews] = useState<NewsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("breaking");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [showChat, setShowChat] = useState(false); // mobile only
  const [now, setNow] = useState(() => Date.now());
  const [saved, setSaved] = useState<NewsItem[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [chats, setChats] = useState<Record<string, Msg[]>>({});
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState<string>("");

  // Which AI providers have keys on the server; remember the viewer's pick.
  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d: { providers: ProviderInfo[]; default: string | null }) => {
        setProviders(d.providers);
        const saved = load<string>("provider", "");
        setProvider(d.providers.some((x) => x.id === saved) ? saved : d.default ?? "");
      })
      .catch(() => {});
  }, []);
  const seen = useRef<Set<string> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // restore per-viewer preferences
  useEffect(() => {
    setSaved(load("saved", []));
    setRead(load("read", []));
    setFontSize(load("fontSize", 16));
    const t = load<"light" | "dark" | null>("theme", null);
    setTheme(t ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      const data: NewsPayload = await res.json();
      const ids = [...data.breaking, ...data.popular].map((n) => n.id);
      if (seen.current) {
        const added = ids.filter((id) => !seen.current!.has(id));
        if (added.length) {
          setFresh((f) => new Set([...f, ...added]));
          setToast(`새 뉴스 ${added.length}건`);
          setTimeout(() => setToast(""), 3500);
        }
        added.forEach((id) => seen.current!.add(id));
      } else {
        seen.current = new Set(ids);
      }
      setNews(data);
      setError(data.breaking.length ? "" : "뉴스를 가져오지 못했습니다. 잠시 후 다시 시도합니다.");
    } catch {
      setError("뉴스를 가져오지 못했습니다.");
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    const c = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [refresh]);

  const items = useMemo(() => {
    const base = tab === "saved" ? saved : news?.[tab] ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    // Search across everything we have, not just the current tab.
    const pool = new Map<string, NewsItem>();
    [...(news?.breaking ?? []), ...(news?.popular ?? []), ...saved].forEach((n) => pool.set(n.id, n));
    return [...pool.values()].filter((n) =>
      [n.title, n.summary, n.source, ...n.related.map((r) => r.title)].join(" ").toLowerCase().includes(q),
    );
  }, [tab, news, saved, query]);

  const isSaved = (id: string) => saved.some((s) => s.id === id);
  const toggleSave = useCallback((n: NewsItem) => {
    setSaved((s) => {
      const next = s.some((x) => x.id === n.id) ? s.filter((x) => x.id !== n.id) : [n, ...s].slice(0, 100);
      save("saved", next);
      return next;
    });
  }, []);

  const openSector = useCallback((id: string) => {
    setSectorId(id);
    setSelected(null);
    setShowChat(false);
  }, []);

  const open = useCallback((n: NewsItem) => {
    setSelected(n);
    setSectorId(null);
    setShowChat(false);
    setFresh((f) => {
      if (!f.has(n.id)) return f;
      const next = new Set(f);
      next.delete(n.id);
      return next;
    });
    setRead((r) => {
      if (r.includes(n.id)) return r;
      const next = [n.id, ...r].slice(0, 500);
      save("read", next);
      return next;
    });
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      if (e.key === "Escape") {
        if (typing) (el as HTMLInputElement).blur();
        else if (selected) setSelected(null);
        else if (sectorId) setSectorId(null);
        else setQuery("");
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "1") setTab("breaking");
      else if (e.key === "2") setTab("popular");
      else if (e.key === "3") setTab("saved");
      else if (e.key === "j" || e.key === "ArrowDown" || e.key === "k" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        const idx = selected ? items.findIndex((n) => n.id === selected.id) : -1;
        const down = e.key === "j" || e.key === "ArrowDown";
        const next = items[Math.min(items.length - 1, Math.max(0, idx + (down ? 1 : -1)))];
        if (next) {
          open(next);
          listRef.current?.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "s" && selected) toggleSave(selected);
      else if (e.key === "a" && selected) {
        e.preventDefault();
        setShowChat(true);
        setTimeout(() => chatInputRef.current?.focus(), 0);
      } else if (e.key === "r") refresh();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected, sectorId, open, toggleSave, refresh]);

  const sector = sectorId ? news?.sectors.find((s) => s.id === sectorId) ?? null : null;
  const layoutClass = ["layout", selected || sector ? "has-article" : "no-chat", showChat ? "show-chat" : ""].join(" ");

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">{I.bolt}</span>
          증시 핫뉴스
          <span className="live"><i />LIVE</span>
        </div>
        <label className="search">
          <span style={{ color: "var(--muted)", display: "flex" }}>{I.search}</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목·키워드 검색 (예: 반도체, 삼성전자)"
          />
          {query ? (
            <button className="ibtn" style={{ height: 24, minWidth: 24, padding: 0 }} onClick={() => setQuery("")} aria-label="검색 지우기">✕</button>
          ) : (
            <kbd className="hide-sm">/</kbd>
          )}
        </label>
        <div className="top-actions">
          {news && (
            <span className="updated">
              {new Date(news.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 업데이트 · 2분마다 자동
            </span>
          )}
          {providers.length > 0 ? (
            <label className="ai-select" title="AI 모델 선택">
              <span className="ai-select-icon">{I.spark}</span>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  save("provider", e.target.value);
                }}
              >
                {providers.map((x) => (
                  <option key={x.id} value={x.id}>{x.label} · {x.model}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="ai-select off" title=".env.local에 API 키를 넣고 서버를 재시작하세요">{I.spark} AI 미설정</span>
          )}
          <button className="ibtn" onClick={refresh} disabled={loading} title="새로고침 (R)" aria-label="새로고침">
            <span className={loading ? "spin" : ""} style={{ display: "flex" }}>{I.refresh}</span>
          </button>
          <button
            className="ibtn"
            onClick={() => {
              const t = theme === "dark" ? "light" : "dark";
              setTheme(t);
              save("theme", t);
            }}
            title="테마 전환"
            aria-label="테마 전환"
          >
            {theme === "dark" ? I.sun : I.moon}
          </button>
        </div>
        {toast && <div className="toast">↑ {toast}</div>}
      </header>

      <main className={layoutClass}>
        {/* ---------- list ---------- */}
        <section className="pane list-pane">
          <div className="pane-head">
            <div className="seg" role="tablist">
              <button className={tab === "breaking" ? "active" : ""} onClick={() => setTab("breaking")}>⚡ 속보</button>
              <button className={tab === "popular" ? "active" : ""} onClick={() => setTab("popular")}>🔥 인기</button>
              <button className={tab === "saved" ? "active" : ""} onClick={() => setTab("saved")}>
                ★ 저장 {saved.length > 0 && <span className="count">{saved.length}</span>}
              </button>
            </div>
          </div>
          <div className="sector-bar">
            <div className="sector-label">{I.chart} 섹터별 요약 · 전망</div>
            <div className="sector-chips">
              {(news?.sectors ?? []).map((s) => (
                <button
                  key={s.id}
                  className={`sector-chip ${sectorId === s.id ? "active" : ""}`}
                  onClick={() => openSector(s.id)}
                  disabled={s.items.length === 0}
                  title={`${s.name} 뉴스 ${s.items.length}건 요약`}
                >
                  <span>{s.emoji}</span>
                  {s.name}
                  <span className="n">{s.items.length}</span>
                </button>
              ))}
            </div>
          </div>
          {query && <div style={{ padding: "8px 16px 0", fontSize: 12, color: "var(--muted)" }}>‘{query}’ 검색 결과 {items.length}건 (전체 탭)</div>}
          {error && <div className="alert" style={{ margin: 12 }}>{error}</div>}
          <div className="list" ref={listRef}>
            {!news && tab !== "saved" &&
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} style={{ padding: "8px 12px" }}>
                  <div className="skel" style={{ width: "85%" }} />
                  <div className="skel" style={{ width: "40%", height: 10 }} />
                </div>
              ))}
            {news && items.length === 0 && (
              <div className="empty">
                {tab === "saved" && !query ? "☆ 별표를 누르면 여기에 저장됩니다" : "검색 결과가 없습니다"}
              </div>
            )}
            {items.map((n, i) => (
              <NewsRow
                key={n.id}
                n={n}
                rank={tab === "saved" || query ? null : i + 1}
                now={now}
                active={selected?.id === n.id}
                read={read.includes(n.id)}
                isNew={fresh.has(n.id)}
                saved={isSaved(n.id)}
                onOpen={() => open(n)}
                onSave={() => toggleSave(n)}
              />
            ))}
          </div>
        </section>

        {/* ---------- reader ---------- */}
        {sector && !selected ? (
          <SectorView
            key={`${provider}:${sector.id}`}
            sector={sector}
            provider={provider}
            now={now}
            report={reports[`${provider}:${sector.id}`]}
            setReport={(r) => setReports((all) => ({ ...all, [`${provider}:${sector.id}`]: r }))}
            read={read}
            onOpen={open}
            onBack={() => setSectorId(null)}
            showNews={() => setShowChat(true)}
            showReport={() => setShowChat(false)}
          />
        ) : selected ? (
          <Reader
            key={selected.id}
            item={selected}
            now={now}
            saved={isSaved(selected.id)}
            fontSize={fontSize}
            setFontSize={(v) => {
              setFontSize(v);
              save("fontSize", v);
            }}
            onSave={() => toggleSave(selected)}
            onBack={() => setSelected(null)}
            onShowChat={() => setShowChat(true)}
            chat={
              <Chat
                key={selected.id}
                item={selected}
                provider={provider}
                providerLabel={providers.find((x) => x.id === provider)?.label}
                inputRef={chatInputRef}
                messages={chats[selected.id] ?? []}
                setMessages={(m) => setChats((c) => ({ ...c, [selected.id]: m }))}
                onShowArticle={() => setShowChat(false)}
              />
            }
          />
        ) : (
          <section className="pane reader-pane">
            <div className="welcome">
              <div>
                <div className="welcome-icon">{I.news}</div>
                <h2>읽을 뉴스를 골라보세요</h2>
                <p>왼쪽에서 기사를 선택하면 본문과 함께 AI에게 바로 물어볼 수 있어요.<br />📊 섹터 버튼을 누르면 AI가 섹터별 요약과 증시 전망을 정리해 드려요.</p>
                <div className="shortcuts">
                  <span><kbd>↑</kbd> <kbd>↓</kbd> / <kbd>J</kbd> <kbd>K</kbd></span><span>기사 이동</span>
                  <span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span><span>속보 · 인기 · 저장</span>
                  <span><kbd>/</kbd></span><span>검색</span>
                  <span><kbd>S</kbd></span><span>저장하기</span>
                  <span><kbd>A</kbd></span><span>AI에게 질문</span>
                  <span><kbd>R</kbd></span><span>새로고침</span>
                  <span><kbd>Esc</kbd></span><span>닫기</span>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ---------------- list row ---------------- */
function NewsRow(p: {
  n: NewsItem; rank: number | null; now: number; active: boolean; read: boolean; isNew: boolean; saved: boolean;
  onOpen: () => void; onSave: () => void;
}) {
  const { n } = p;
  return (
    <div
      role="button"
      tabIndex={0}
      data-id={n.id}
      className={`item ${p.active ? "active" : ""} ${p.read && !p.active ? "read" : ""}`}
      onClick={p.onOpen}
      onKeyDown={(e) => e.key === "Enter" && p.onOpen()}
    >
      <div className={`rank ${p.rank && p.rank <= 3 ? "top" : ""}`}>{p.rank ?? "•"}</div>
      <div style={{ minWidth: 0 }}>
        <p className="item-title">{n.title}</p>
        <div className="item-meta">
          {p.isNew && <span className="pill new">NEW</span>}
          {n.coverage > 1 && <span className="pill hot">🔥 {n.coverage}곳 보도</span>}
          <span>{n.source}</span>
          <span className="dot" />
          <span>{timeAgo(n.publishedAt, p.now)}</span>
        </div>
      </div>
      <div className="item-side">
        {n.image && <img className="thumb" src={n.image} alt="" loading="lazy" />}
        <button
          className={`star ${p.saved ? "on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            p.onSave();
          }}
          aria-label={p.saved ? "저장 취소" : "저장"}
          title={p.saved ? "저장 취소 (S)" : "저장 (S)"}
        >
          {I.star(p.saved)}
        </button>
      </div>
    </div>
  );
}

/* ---------------- reader ---------------- */
function Reader(p: {
  item: NewsItem; now: number; saved: boolean; fontSize: number; setFontSize: (v: number) => void;
  onSave: () => void; onBack: () => void; onShowChat: () => void; chat: React.ReactNode;
}) {
  const { item } = p;
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/article?url=${encodeURIComponent(item.link)}`, { signal: ac.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setArticle(d);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message || "기사를 불러오지 못했습니다."));
    return () => ac.abort();
  }, [item.link]);

  const text = article?.paragraphs.join("\n") || item.summary;
  const minutes = Math.max(1, Math.round(text.length / 500));
  const isSub = (s: string) => s.length < 50 && !/[다요]\.?["”’]?$|\.$/.test(s);

  return (
    <>
      <section className="pane reader-pane">
        <div className="pane-head">
          <button className="ibtn" onClick={p.onBack} title="목록 (Esc)">{I.back}<span className="hide-sm">닫기</span></button>
          <div className="seg mobile-tabs">
            <button className="active">본문</button>
            <button onClick={p.onShowChat}>✦ AI</button>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
            <button className="ibtn" onClick={() => p.setFontSize(Math.max(14, p.fontSize - 1))} disabled={p.fontSize <= 14} title="글자 작게">A−</button>
            <button className="ibtn" onClick={() => p.setFontSize(Math.min(21, p.fontSize + 1))} disabled={p.fontSize >= 21} title="글자 크게">A+</button>
            <button className={`ibtn ${p.saved ? "on" : ""}`} onClick={p.onSave} title="저장 (S)">{I.star(p.saved)}</button>
            <button
              className="ibtn"
              title="링크 복사"
              onClick={() => {
                navigator.clipboard?.writeText(item.link).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "✓" : I.link}
            </button>
            <a className="ibtn" href={item.link} target="_blank" rel="noreferrer" title="원문 보기">{I.ext}<span className="hide-sm">원문</span></a>
          </div>
        </div>
        <div className="reader">
          <article className="reader-inner">
            <div className="kicker">
              <span className="pill src">{item.source}</span>
              <span>{new Date(item.publishedAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="dot" />
              <span>{timeAgo(item.publishedAt, p.now)}</span>
              {article && <><span className="dot" /><span>약 {minutes}분 읽기</span></>}
              {item.coverage > 1 && <span className="pill hot">🔥 {item.coverage}곳 보도</span>}
            </div>
            <h1>{item.title}</h1>
            {article?.byline && <div className="byline">{article.byline}</div>}
            {article?.image && <img className="hero" src={article.image} alt="" />}
            {!article && !error && Array.from({ length: 9 }).map((_, i) => <div key={i} className="skel" style={{ width: `${68 + ((i * 7) % 30)}%` }} />)}
            {error && (
              <>
                <div className="alert">{error}</div>
                {item.summary && <p>{item.summary}</p>}
              </>
            )}
            <div className="body" style={{ fontSize: p.fontSize }}>
              {article?.paragraphs.map((s, i) => <p key={i} className={isSub(s) ? "sub" : ""}>{s}</p>)}
            </div>
            {item.related.length > 0 && (
              <div className="related">
                <h3>📰 같은 소식, 다른 언론</h3>
                {item.related.map((r) => (
                  <a key={r.link} href={r.link} target="_blank" rel="noreferrer">
                    <span className="pill src">{r.source}</span>
                    <span>{r.title}</span>
                  </a>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>
      {p.chat}
    </>
  );
}

/* ---------------- sector report ---------------- */
const MOOD: Record<string, { label: string; cls: string }> = {
  긍정: { label: "▲ 긍정", cls: "up" },
  중립: { label: "● 중립", cls: "flat" },
  부정: { label: "▼ 부정", cls: "down" },
};

function SectorView(p: {
  sector: SectorBucket; now: number; report?: Report; setReport: (r: Report) => void; read: string[];
  onOpen: (n: NewsItem) => void; onBack: () => void; showNews: () => void; showReport: () => void; provider: string;
}) {
  const { sector, report } = p;
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const setRef = useRef(p.setReport);
  setRef.current = p.setReport;

  const generate = useCallback(async (force: boolean) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    let acc = "";
    let at = new Date().toISOString();
    setRef.current({ text: "", at, done: false });
    try {
      const qs = new URLSearchParams({ id: sector.id, provider: p.provider });
      if (force) qs.set("refresh", "1");
      const res = await fetch(`/api/sector?${qs}`, { signal: ac.signal });
      at = res.headers.get("X-Generated-At") ?? at;
      if (!res.ok || !res.body) {
        // Not a report (e.g. missing API key): show the message, retry on next open.
        setRef.current({ text: await res.text(), at, done: false });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setRef.current({ text: acc, at, done: false });
      }
      setRef.current({ text: acc || "⚠️ 응답이 비어 있습니다.", at, done: true });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setRef.current({ text: `⚠️ ${(e as Error).message}`, at, done: true });
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  }, [sector.id]);

  // Generate on first open; reuse the finished report when coming back.
  useEffect(() => {
    if (!report?.done) generate(false);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generate]);

  const text = report?.text ?? "";
  const mood = text.match(/단기 분위기[^가-힣]*(긍정|중립|부정)/)?.[1];
  const sources = new Set(sector.items.map((n) => n.source)).size;

  return (
    <>
      <section className="pane reader-pane">
        <div className="pane-head">
          <button className="ibtn" onClick={p.onBack} title="닫기 (Esc)">{I.back}<span className="hide-sm">닫기</span></button>
          <div className="seg mobile-tabs">
            <button className="active">요약</button>
            <button onClick={p.showNews}>뉴스 {sector.items.length}</button>
          </div>
          <button className="ibtn" style={{ marginLeft: "auto" }} onClick={() => generate(true)} disabled={busy} title="최신 뉴스로 다시 생성">
            <span className={busy ? "spin" : ""} style={{ display: "flex" }}>{I.refresh}</span>
            <span className="hide-sm">{busy ? "분석 중…" : "다시 생성"}</span>
          </button>
        </div>
        <div className="reader">
          <div className="reader-inner">
            <div className="kicker">
              <span className="pill new">{I.spark} AI 섹터 브리핑</span>
              <span>뉴스 {sector.items.length}건 · {sources}개 언론 분석</span>
              {report?.done && <><span className="dot" /><span>{timeAgo(report.at, p.now)} 생성</span></>}
            </div>
            <div className="sector-hero">
              <span className="sector-emoji">{sector.emoji}</span>
              <div>
                <h1 style={{ margin: 0 }}>{sector.name}</h1>
                <div className="byline">최근 48시간 뉴스 기반 요약과 전망</div>
              </div>
              {mood && <span className={`mood ${MOOD[mood].cls}`}>{MOOD[mood].label}</span>}
            </div>
            <div className="report">
              {text ? <Markdown text={text} /> : (
                <>
                  <div className="analyzing"><span className="dots"><i /><i /><i /></span> AI가 뉴스 {sector.items.length}건을 읽고 있어요…</div>
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel" style={{ width: `${60 + ((i * 11) % 35)}%` }} />)}
                </>
              )}
              {busy && text && <span className="dots"><i /><i /><i /></span>}
            </div>
            <div className="fineprint" style={{ textAlign: "left", marginTop: 24 }}>
              AI가 뉴스 헤드라인만 보고 정리한 내용이라 사실과 다를 수 있으며, 투자 권유가 아닙니다.
            </div>
          </div>
        </div>
      </section>
      <section className="pane chat">
        <div className="pane-head">
          <div className="seg mobile-tabs">
            <button onClick={p.showReport}>요약</button>
            <button className="active">뉴스 {sector.items.length}</button>
          </div>
          <div className="chat-title hide-sm">{sector.emoji} 관련 뉴스 <span className="pill src">{sector.items.length}</span></div>
        </div>
        <div className="list">
          {sector.items.map((n, i) => (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              className={`item ${p.read.includes(n.id) ? "read" : ""}`}
              style={{ gridTemplateColumns: "26px minmax(0,1fr)" }}
              onClick={() => p.onOpen(n)}
              onKeyDown={(e) => e.key === "Enter" && p.onOpen(n)}
            >
              <div className={`rank ${i < 3 ? "top" : ""}`}>{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <p className="item-title">{n.title}</p>
                <div className="item-meta">
                  {n.coverage > 1 && <span className="pill hot">🔥 {n.coverage}곳</span>}
                  <span>{n.source}</span>
                  <span className="dot" />
                  <span>{timeAgo(n.publishedAt, p.now)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------------- chat ---------------- */
const SUGGESTIONS = [
  "이 기사 핵심만 3줄로 요약해줘",
  "주가와 시장에 어떤 영향이 있을까?",
  "관련 수혜주·피해주 후보는?",
  "어려운 용어를 쉽게 설명해줘",
];

function Chat(p: {
  item: NewsItem;
  provider: string;
  providerLabel?: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  messages: Msg[];
  setMessages: (m: Msg[]) => void;
  onShowArticle: () => void;
}) {
  const { item, messages, setMessages } = p;
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [articleText, setArticleText] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState(-1);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The article route caches server-side, so this second fetch is cheap.
  useEffect(() => {
    fetch(`/api/article?url=${encodeURIComponent(item.link)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setArticleText(d?.paragraphs?.join("\n") || item.summary || item.title))
      .catch(() => setArticleText(item.summary || item.title));
  }, [item]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const ready = articleText !== null;

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy || !ready) return;
    const history: Msg[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          article: { title: item.title, source: item.source, publishedAt: item.publishedAt, url: item.link, text: articleText },
          messages: history,
          provider: p.provider,
        }),
      });
      if (!res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: acc }]);
      }
      if (!acc) setMessages([...history, { role: "assistant", content: "⚠️ 응답이 비어 있습니다." }]);
    } catch (e) {
      if ((e as Error).name === "AbortError")
        setMessages([...history, { role: "assistant", content: (acc || "") + "\n\n_(중지됨)_" }]);
      else setMessages([...history, { role: "assistant", content: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pane chat">
      <div className="pane-head">
        <div className="seg mobile-tabs">
          <button onClick={p.onShowArticle}>본문</button>
          <button className="active">✦ AI</button>
        </div>
        <div className="chat-title hide-sm"><span className="ai-badge">{I.spark}</span>AI 해설{p.providerLabel && <span className="pill src">{p.providerLabel}</span>}</div>
        {messages.length > 0 && (
          <button className="ibtn" style={{ marginLeft: "auto" }} onClick={() => !busy && setMessages([])} disabled={busy} title="대화 지우기">
            {I.trash}<span className="hide-sm">새 대화</span>
          </button>
        )}
      </div>
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="chat-intro">
            <b>이 기사에 대해 무엇이든 물어보세요.</b>
            <div style={{ marginTop: 2 }}>AI가 기사 본문을 읽고 답해드려요.</div>
            <div className="suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" disabled={!ready} onClick={() => send(s)}>
                  <span>{I.spark}</span>{s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">{m.content}</div>
          ) : (
            <div key={i} className="msg assistant">
              {m.content ? <Markdown text={m.content} /> : <span className="dots"><i /><i /><i /></span>}
              {m.content && !(busy && i === messages.length - 1) && (
                <div className="msg-tools">
                  <button
                    className="ibtn"
                    onClick={() =>
                      navigator.clipboard?.writeText(m.content).then(() => {
                        setCopiedIdx(i);
                        setTimeout(() => setCopiedIdx(-1), 1500);
                      })
                    }
                  >
                    {I.copy} {copiedIdx === i ? "복사됨" : "복사"}
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="composer-box">
          <textarea
            ref={p.inputRef}
            rows={1}
            value={input}
            placeholder={ready ? "질문을 입력하세요…" : "기사를 읽는 중…"}
            disabled={!ready}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(140, e.target.scrollHeight) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          {busy ? (
            <button type="button" className="send stop" onClick={() => abortRef.current?.abort()} aria-label="중지">{I.stop}</button>
          ) : (
            <button className="send" disabled={!input.trim() || !ready} aria-label="전송">{I.send}</button>
          )}
        </div>
        <div className="fineprint">Enter 전송 · Shift+Enter 줄바꿈 · AI 답변은 참고용이며 투자 권유가 아닙니다</div>
      </form>
    </section>
  );
}

/* ---------------- tiny safe markdown ---------------- */
function Markdown({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
    );
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) list.push(li[1]);
    else {
      flush();
      if (line) {
        const h = line.match(/^#+\s*(.*)/);
        blocks.push(h ? <h4 key={blocks.length} className="md-h">{inline(h[1])}</h4> : <p key={blocks.length}>{inline(line)}</p>);
      }
    }
  }
  flush();
  return <>{blocks}</>;
}
