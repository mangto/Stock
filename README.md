# 📈 증시 핫뉴스

국내 주요 경제지의 증시 뉴스를 실시간으로 모아 **속보 10개 / 인기 10개**로 보여주고,
기사를 클릭하면 **가운데에 본문, 오른쪽에 AI 채팅**이 뜨는 웹앱입니다.
섹터 버튼을 누르면 AI가 해당 섹터의 **요약과 증시 전망**도 정리해 줍니다.

> ⚠️ AI 답변은 뉴스 기반 참고 자료이며 투자 권유가 아닙니다.

---

## 목차
1. [주요 기능](#-주요-기능)
2. [준비물](#-준비물)
3. [설치하기](#-설치하기)
4. [AI 키 설정하기](#-ai-키-설정하기)
5. [실행하기](#-실행하기)
6. [사용법과 단축키](#-사용법과-단축키)
7. [문제 해결](#-문제-해결)
8. [비용과 보안](#-비용과-보안)
9. [프로젝트 구조](#-프로젝트-구조)

---

## ✨ 주요 기능

| 기능 | 설명 |
|---|---|
| ⚡ 속보 / 🔥 인기 탭 | 최신순 10개, 여러 언론이 동시에 다룬 순 10개. 2분마다 자동 갱신 |
| 📰 기사 본문 | 원문 페이지에서 광고·메뉴를 걷어낸 본문만 표시, 같은 소식을 다룬 다른 언론 기사 목록 |
| 💬 AI 채팅 | 기사 내용을 바탕으로 요약·영향·용어 설명 등 질문 (추천 질문 버튼 제공) |
| 📊 섹터별 요약·전망 | 반도체·2차전지·바이오 등 10개 섹터별 AI 브리핑 + 긍정/중립/부정 분위기 |
| 🔍 검색 | 종목·키워드로 전체 뉴스 검색 |
| ★ 저장 / 읽음 표시 | 관심 기사 저장, 읽은 기사는 흐리게 |
| 🌗 라이트 / 다크 모드 | 오른쪽 위 버튼 |
| 🤖 여러 AI 지원 | Claude · OpenAI · Gemini · OpenAI 호환 서버(OpenRouter, Groq, Ollama 등) |

뉴스 출처: 한국경제, 조선비즈, 서울경제, 파이낸셜뉴스, 연합뉴스 (각 언론사 공개 RSS)

---

## 🧰 준비물

### 1. Node.js (20 이상, LTS 권장)

설치되어 있는지 확인:
```bash
node -v
```
`v20.x.x` 이상이 나오면 통과입니다. 없다면 설치하세요.

- **Windows**: PowerShell에서
  ```bash
  winget install OpenJS.NodeJS.LTS
  ```
  또는 https://nodejs.org 에서 **LTS** 버전 설치 파일을 받아 실행
- **macOS**: `brew install node` 또는 https://nodejs.org

> 설치 후에는 **터미널을 새로 열어야** `node`, `npm` 명령이 인식됩니다.

### 2. AI API 키 (선택)

뉴스 목록과 기사 본문은 키 없이도 동작합니다.
**AI 채팅과 섹터 요약**을 쓰려면 아래 중 **하나 이상**의 키가 필요합니다. → [AI 키 설정하기](#-ai-키-설정하기)

---

## 📦 설치하기

### 1. 코드 받기
```bash
git clone <이 저장소 주소>
cd <폴더 이름>
```
Git이 없다면 GitHub 페이지의 **Code → Download ZIP**으로 받아 압축을 풀어도 됩니다.

### 2. 패키지 설치
프로젝트 폴더에서:
```bash
npm install
```
처음에는 1~2분 걸릴 수 있습니다. `node_modules` 폴더가 생기면 완료입니다.

### 3. 설정 파일 만들기
`.env.example`을 복사해서 `.env.local`을 만듭니다.

- Windows (PowerShell):
  ```bash
  Copy-Item .env.example .env.local
  ```
- macOS / Linux:
  ```bash
  cp .env.example .env.local
  ```

> `.env.local`은 **내 컴퓨터에만 있는 비밀 파일**입니다. `.gitignore`에 등록되어 있어 GitHub에 올라가지 않습니다.

---

## 🔑 AI 키 설정하기

`.env.local`을 메모장이나 VS Code로 열고, 쓰고 싶은 AI의 키를 `=` 뒤에 붙여넣으세요.
**여러 개를 넣으면** 화면 오른쪽 위 드롭다운에서 골라 쓸 수 있습니다.

```env
GEMINI_API_KEY=여기에_키_붙여넣기
```

- `=` 앞뒤에 **공백이나 따옴표를 넣지 마세요.**
- 저장한 뒤에는 **서버를 껐다 다시 켜야** 반영됩니다. → [실행하기](#-실행하기)

### 어떤 AI를 고를까?

| AI | 특징 | 필요한 값 | 기본 모델 |
|---|---|---|---|
| **Gemini** (Google) | 무료 사용량이 있어 시작하기 쉬움 | `GEMINI_API_KEY` | `gemini-flash-latest` |
| **Claude** (Anthropic) | 분석 품질이 좋음, 유료 | `ANTHROPIC_API_KEY` | `claude-opus-5-5` |
| **OpenAI** | 유료 | `OPENAI_API_KEY` | `gpt-5.5` |
| **OpenAI 호환 서버** | OpenRouter, Groq, DeepSeek, 내 PC의 Ollama 등 | `CUSTOM_BASE_URL`, `CUSTOM_MODEL` (+ 필요하면 `CUSTOM_API_KEY`) | 직접 지정 |

### Gemini 키 받기
1. https://aistudio.google.com 접속 → Google 계정으로 로그인
2. 왼쪽 메뉴 **Get API key** → **Create API key**
3. 만들어진 키를 복사해 `.env.local`의 `GEMINI_API_KEY=` 뒤에 붙여넣기

### Claude 키 받기
1. https://console.anthropic.com 가입 → **Billing**에서 결제 수단 등록(크레딧 충전)
2. **API Keys** → **Create Key**
3. `ANTHROPIC_API_KEY=` 뒤에 붙여넣기 (`sk-ant-`로 시작)

### OpenAI 키 받기
1. https://platform.openai.com 가입 → **Billing**에서 결제 수단 등록
2. **API keys** → **Create new secret key**
3. `OPENAI_API_KEY=` 뒤에 붙여넣기 (`sk-`로 시작)

### OpenAI 호환 서버 쓰기 (선택)
OpenAI와 같은 방식으로 요청을 받는 서비스라면 무엇이든 연결할 수 있습니다.

**예시 1 — OpenRouter** (여러 회사 모델을 한 키로):
```env
CUSTOM_BASE_URL=https://openrouter.ai/api/v1
CUSTOM_API_KEY=sk-or-...
CUSTOM_MODEL=원하는/모델이름
```

**예시 2 — Ollama** (내 PC에서 무료로 실행, 키 불필요):
```env
CUSTOM_BASE_URL=http://localhost:11434/v1
CUSTOM_MODEL=llama3.1
```
> Ollama는 https://ollama.com 에서 설치 후 `ollama pull <모델명>`으로 모델을 먼저 받아두세요.

### 고급 설정 (선택)

| 설정 | 설명 | 예시 |
|---|---|---|
| `AI_PROVIDER` | 키가 여러 개일 때 기본으로 선택될 AI | `gemini` / `anthropic` / `openai` / `custom` |
| `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL` | 사용할 모델 이름 변경 | `GEMINI_MODEL=gemini-3.1-flash-lite` |
| `GEMINI_FALLBACK_MODELS` 등 | 기본 모델이 혼잡(503)하거나 20초간 응답이 없을 때 순서대로 시도할 대체 모델 (쉼표 구분) | `GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-flash-lite-latest` |

> 대체 모델로 넘어가면 답변 맨 위에 `※ ○○ 모델이 혼잡해서 △△ 모델로 답변합니다`가 표시되고,
> 실패한 모델은 5분 동안 건너뜁니다.

---

## ▶ 실행하기

```bash
npm run dev
```

터미널에 `Ready`가 뜨면 브라우저에서 **http://localhost:3000** 을 여세요.

- **끄기**: 터미널에서 `Ctrl + C`
- **설정(.env.local) 바꾼 뒤**: 끄고 다시 `npm run dev`
- 오른쪽 위 드롭다운에 AI 이름이 보이면 키가 제대로 인식된 것입니다. `AI 미설정`이 보이면 [문제 해결](#-문제-해결)을 참고하세요.

### 더 빠르게 실행하기 (선택)
개발 모드보다 가볍게 돌리려면 빌드 후 실행합니다.
```bash
npm run build
```
```bash
npm start
```

---

## 🖱 사용법과 단축키

1. 왼쪽에서 **⚡ 속보 / 🔥 인기** 탭을 고르고 기사를 클릭
2. 가운데에서 본문을 읽고, 오른쪽 채팅창에 질문 (추천 질문 버튼을 눌러도 됨)
3. 왼쪽 **📊 섹터별 요약 · 전망** 버튼(옆으로 스크롤)을 누르면 섹터 브리핑이 생성됨
   - 같은 섹터는 15분간 결과를 재사용합니다. 새로 받으려면 **다시 생성**

| 키 | 동작 |
|---|---|
| `↑` `↓` 또는 `J` `K` | 이전 / 다음 기사 |
| `1` `2` `3` | 속보 · 인기 · 저장 탭 |
| `/` | 검색창으로 이동 |
| `S` | 현재 기사 저장 / 해제 |
| `A` | AI 질문 입력창으로 이동 |
| `R` | 뉴스 새로고침 |
| `Esc` | 닫기 / 검색어 지우기 |

> 저장한 기사, 읽음 표시, 테마, 글자 크기, 선택한 AI는 **이 브라우저에만** 저장됩니다.

---

## 🛠 문제 해결

| 증상 | 해결 방법 |
|---|---|
| `node` / `npm`을 찾을 수 없다고 나옴 | Node.js 설치 후 **터미널을 새로 열기** |
| 화면 오른쪽 위에 `AI 미설정` | `.env.local` 파일명/위치 확인(프로젝트 최상위 폴더), `=` 뒤 공백·따옴표 제거, **서버 재시작** |
| `API 키가 올바르지 않습니다` | 키를 다시 복사해서 붙여넣기 (앞뒤 공백 주의), 키가 삭제되지 않았는지 확인 |
| `503 … high demand` / `AI 서버가 지금 혼잡합니다` | 해당 회사 서버가 붐비는 것. 잠시 후 재시도하거나 `GEMINI_MODEL` 등을 다른 모델로 변경. 대체 모델은 `*_FALLBACK_MODELS`로 지정 |
| `모델을 찾을 수 없습니다` | 모델 이름이 틀렸거나 서비스 종료된 모델. `*_MODEL` 값을 최신 모델명으로 변경 |
| `요청이 많거나 사용 한도를 넘었습니다` (429) | 무료 한도 초과 또는 결제 크레딧 부족. 잠시 기다리거나 결제 설정 확인 |
| 뉴스가 안 뜸 | 인터넷 연결 확인, `R`로 새로고침. 일부 언론사 RSS가 일시적으로 막혀도 나머지는 표시됨 |
| `기사를 불러오지 못했습니다` | 해당 언론사 페이지 문제. 상단 **원문** 버튼으로 직접 열기 |
| 유료 기사 본문이 짧음 | 한국경제 프리미엄 등 유료 기사는 앞부분만 공개됨 (정상) |
| `Port 3000 is in use` | 다른 프로그램이 3000번 포트를 사용 중. `npx next dev -p 3001`처럼 다른 포트로 실행 |

---

## 💸 비용과 보안

**비용**
- 뉴스 수집과 본문 추출은 무료입니다.
- AI 기능은 질문·섹터 요약을 할 때마다 해당 AI 회사의 요금이 발생합니다(Gemini는 무료 한도 있음).
  - 기사 채팅: 기사 본문 + 대화 내용이 전송됩니다.
  - 섹터 요약: 기사 제목·요약 최대 25건이 전송되며, 같은 섹터는 15분간 재사용해 비용을 줄입니다.

**보안 — GitHub에 올릴 때**
- API 키는 **`.env.local`에만** 넣으세요. 코드 파일에 직접 적지 마세요.
- 커밋 전에 `git status`로 `.env.local`이 목록에 **없는지** 확인하세요.
- 키를 실수로 올렸다면 파일을 지우는 것으로는 부족합니다(기록에 남음). **즉시 해당 사이트에서 키를 삭제하고 새로 발급**받으세요.

---

## 🗂 프로젝트 구조

```
├─ app/
│  ├─ page.tsx              화면 전체 (목록 · 본문 · 채팅 · 섹터 브리핑)
│  ├─ globals.css           디자인 (라이트/다크 테마)
│  ├─ layout.tsx            HTML 뼈대, 폰트
│  └─ api/
│     ├─ news/              뉴스 목록 (속보 · 인기 · 섹터별)
│     ├─ article/           기사 원문 본문 추출
│     ├─ chat/              기사 기반 AI 채팅 (스트리밍)
│     ├─ sector/            섹터별 요약 · 전망 (15분 캐시)
│     └─ providers/         사용 가능한 AI 목록
├─ lib/
│  ├─ news.ts               RSS 수집, 같은 소식 묶기, 속보/인기 정렬 (2분 캐시)
│  ├─ sectors.ts            섹터 정의와 분류 키워드
│  └─ ai.ts                 AI 회사별 호출 공통 처리 (재시도 · 대체 모델)
├─ .env.example             설정 예시 (복사해서 .env.local로 사용)
└─ .env.local               내 API 키 (GitHub에 올라가지 않음)
```

### 직접 고쳐보고 싶다면
- **언론사 추가/삭제**: `lib/news.ts`의 `FEEDS` 목록 (RSS 주소)과 `ALLOWED_HOSTS`
- **섹터나 키워드 수정**: `lib/sectors.ts`의 `SECTORS`
- **AI 말투·규칙 변경**: `app/api/chat/route.ts`, `app/api/sector/route.ts`의 `SYSTEM` 문구
- **자동 갱신 주기**: `app/page.tsx`의 `REFRESH_MS`, `lib/news.ts`의 `TTL_MS`

---

## 📄 참고
- 기사 저작권은 각 언론사에 있습니다. 이 앱은 기사를 저장하지 않고 열람 시점에 원문에서 가져와 보여줍니다. 공개 서비스로 배포할 경우 언론사 이용 약관을 확인하세요.
- AI 분석은 사실과 다를 수 있으며 투자 판단의 책임은 본인에게 있습니다.
