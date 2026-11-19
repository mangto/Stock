export type SectorDef = { id: string; name: string; emoji: string; keywords: string[] };

// "market" is the whole-market view; every story with a market keyword lands there.
export const SECTORS: SectorDef[] = [
  {
    id: "market", name: "시장 전체", emoji: "📈",
    keywords: ["코스피", "코스닥", "증시", "지수", "외국인", "순매수", "순매도", "마감", "시황", "나스닥", "S&P", "다우", "뉴욕증시"],
  },
  {
    id: "semi", name: "반도체·AI", emoji: "💾",
    keywords: ["반도체", "삼성전자", "SK하이닉스", "하이닉스", "HBM", "엔비디아", "TSMC", "AI", "인공지능", "앤트로픽", "오픈AI", "메모리", "파운드리", "D램", "낸드", "한미반도체", "소부장", "데이터센터"],
  },
  {
    id: "battery", name: "2차전지·전기차", emoji: "🔋",
    keywords: ["2차전지", "이차전지", "배터리", "LG에너지솔루션", "삼성SDI", "에코프로", "포스코퓨처엠", "양극재", "리튬", "전기차", "테슬라", "전해액"],
  },
  {
    id: "bio", name: "바이오·헬스", emoji: "🧬",
    keywords: ["바이오", "제약", "신약", "임상", "셀트리온", "삼성바이오", "알테오젠", "헬스케어", "의료", "FDA", "기술수출"],
  },
  {
    id: "auto", name: "자동차·조선·방산", emoji: "🚢",
    keywords: ["자동차", "현대차", "기아", "조선업", "조선주", "조선사", "HD현대", "현대글로비스", "한화오션", "삼성중공업", "방산", "한화에어로", "LIG넥스원", "K방산", "수주", "로봇"],
  },
  {
    id: "finance", name: "금융·증권", emoji: "🏦",
    keywords: ["은행", "금융지주", "증권사", "보험", "KB금융", "KB국민", "신한", "하나금융", "하나증권", "우리금융", "밸류업", "배당", "자사주", "저축은행", "카드사", "금투협", "금융위", "금감원"],
  },
  {
    id: "consumer", name: "소비재·엔터", emoji: "🛍️",
    keywords: ["화장품", "엔터", "K팝", "하이브", "JYP", "SM엔터", "YG엔터", "한한령", "여행", "면세", "항공", "호텔", "콘텐츠", "스튜디오드래곤", "식품", "유통주", "유통업"],
  },
  {
    id: "energy", name: "에너지·화학", emoji: "⛽",
    keywords: ["국제유가", "유가 하락", "유가 상승", "유가 급락", "WTI", "정유", "석유", "석유화학", "LG화학", "롯데케미칼", "화학주", "에너지", "ESS", "원전", "태양광", "풍력", "가스", "SK이노베이션", "S-Oil", "에쓰오일", "전력"],
  },
  {
    id: "macro", name: "금리·환율·매크로", emoji: "💱",
    keywords: ["금리", "환율", "달러화", "강달러", "약달러", "원·달러", "연준", "Fed", "FOMC", "한은", "한국은행", "물가", "CPI", "국채", "채권", "수출", "관세", "인플레"],
  },
  {
    id: "crypto", name: "가상자산", emoji: "🪙",
    keywords: ["비트코인", "가상자산", "코인", "이더리움", "업비트", "빗썸", "스테이블코인", "토큰증권", "STO"],
  },
];

/**
 * A headline match is enough. The summary is noisier (bylines, outlet names,
 * boilerplate), so it only counts when two different keywords of a sector appear.
 */
export function sectorsOf(title: string, summary = ""): string[] {
  const t = title.toLowerCase();
  const s = summary.toLowerCase();
  return SECTORS.filter((sec) => {
    const kws = sec.keywords.map((k) => k.toLowerCase());
    if (kws.some((k) => t.includes(k))) return true;
    return kws.filter((k) => s.includes(k)).length >= 2;
  }).map((sec) => sec.id);
}
