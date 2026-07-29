# 모이다 웹앱

교사가 질문을 공개하고 학생의 자유 응답을 수집한 뒤, Gemini 분석과 의미 임베딩을 이용해 아이디어 기반 팀을 추천하는 Next.js 애플리케이션입니다.

## 배포 주소

[https://team-matching-eta.vercel.app](https://team-matching-eta.vercel.app)

주요 경로:

- `/` 서비스 소개 및 역할 선택
- `/teacher` 룸 생성, 참여 현황, 분석, 팀 검토 및 확정
- `/student?room=ROOM_CODE` 학생 입장, 대기, 답변 제출 및 팀 결과 확인
- `/api/health/supabase` Supabase 연결 상태

## 현재 동작 흐름

1. 교사가 질문, 예상 인원, 팀원 수 또는 고정 팀 수, 참여 암호를 설정합니다.
2. 룸을 생성하고 학생 링크 또는 QR 코드를 공유합니다.
3. 학생은 암호와 이름·학번으로 입장해 질문 공개를 기다립니다.
4. 교사가 질문을 공개하면 학생 화면이 자동으로 답변 단계로 바뀝니다.
5. 교사가 수집을 마감하고 Gemini 팀 구성을 실행합니다.
6. 교사가 추천 팀을 검토하고 필요한 학생 이동·경고 승인을 거쳐 확정합니다.
7. 학생이 자기 팀과 팀원을 확인합니다.
8. 교사가 수업을 종료하면 룸 데이터를 모두 삭제합니다.

회원가입 없이 룸 코드로 데이터를 묶고, 수업이 끝나면 룸 단위로 삭제합니다. 자세한 내용은
아래 `데이터 보관 정책`을 참고하세요.

교사와 학생의 세션은 HttpOnly 쿠키로 관리합니다. 현재 룸 주소에서 새로고침하면 Supabase에 저장된 진행 단계를 복원합니다. 교사가 기본 `/teacher` 주소로 새로 들어오면 최근 룸을 이어갈지 새 룸을 만들지 선택합니다.

## 주요 기술

- Next.js 16 및 React 19
- TypeScript
- Gemini API
  - 분석 모델: `gemini-3.6-flash`
  - 임베딩 모델: `gemini-embedding-001`
- Supabase Postgres, pgvector
- Vercel

Gemini의 OpenAI 호환 엔드포인트를 사용하므로 코드 내부 HTTP 클라이언트로 `openai` 패키지를 사용합니다. 실제 요청 대상과 모델은 Gemini입니다.

## 로컬 실행

WSL Ubuntu의 Conda 환경 `team_match`를 기준으로 합니다.

```bash
source ~/miniconda3/etc/profile.d/conda.sh
conda activate team_match
cd /mnt/c/Users/hojun/Desktop/Team_matching/team-matching-app
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. 개발 서버는 터미널에서 `Ctrl+C`로 종료합니다.

WSL에서 `/mnt/c` 경로의 코드를 실행할 때 주의할 점이 두 가지 있습니다.

- Windows 편집기로 파일을 고쳐도 WSL의 파일 감시가 동작하지 않아 `next dev`가 변경을 반영하지 못할 수 있습니다. API 응답이 코드와 다르면 개발 서버를 재시작하세요.
- `npm run build`는 `next dev`와 같은 `.next` 폴더를 사용합니다. 빌드 후 개발 서버에서 일부 라우트가 404가 되면 `rm -rf .next` 후 다시 실행하세요.

## 환경변수

예제 파일을 복사합니다.

```bash
cp .env.example .env.local
```

필수 환경변수:

| 변수 | 용도 | 공개 가능 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 예 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | 예 |
| `SUPABASE_SECRET_KEY` | 서버 전용 Supabase 관리자 키 | 아니요 |
| `GEMINI_API_KEY` | Gemini API 인증 | 아니요 |
| `GEMINI_ANALYSIS_MODEL` | 응답 분석 모델 | 예 |
| `GEMINI_EMBEDDING_MODEL` | 임베딩 모델 | 예 |
| `APP_SESSION_SECRET` | 세션 토큰 HMAC 서명 | 아니요 |

`APP_SESSION_SECRET`은 다음과 같이 생성할 수 있습니다.

```bash
openssl rand -base64 48
```

`.env.local`과 비밀키는 Git에 커밋하지 않습니다. 서버 전용 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

## Supabase 설정

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

마이그레이션:

- `supabase/migrations/202607290001_initial_schema.sql`
- `supabase/migrations/202607290002_gemini_provider.sql`

테이블에는 룸, 매칭 기준, 참가자, 답변, 분석, 매칭 실행, 팀 및 팀원이 저장됩니다. 브라우저에서 DB에 직접 쓰지 않고 Next.js 서버 API가 세션을 확인한 뒤 서버 전용 Supabase 클라이언트를 사용합니다.

## 검증 명령

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:gemini
npm run check:supabase
npm run check:room-flow
```

`check:room-flow`는 테스트 룸 생성, 학생 입장, 답변 제출, Gemini 매칭, DB 저장을 확인한 뒤 테스트 룸을 삭제합니다.

## Vercel 배포

Vercel 프로젝트 설정:

- Framework Preset: `Next.js`
- Root Directory: `team-matching-app`
- Production Branch: `main`
- Build/Install/Output 명령: Next.js 기본값

`.env.local`의 필수 변수를 Vercel의 `Environment Variables`에 등록하되, 값은 README나 GitHub에 넣지 않습니다. `main` 브랜치에 푸시하면 Vercel이 자동으로 새 Production Deployment를 만듭니다.

## 운영 시 참고

- 학생 링크와 QR에는 룸 코드만 포함되며 참여 암호는 별도로 안내합니다.
- 권장·절대 최대 인원은 교사가 입력하지 않고 팀원 수, 팀 수와 실제 참여 인원으로 자동 계산합니다.
- 고정 팀 수가 예상 학생 수 또는 실제 참가자 수보다 많으면 빈 팀이 생기지 않도록 생성·매칭을 차단합니다. 이 검증은 교사 화면과 `/api/rooms`, `/api/match` 양쪽에서 수행합니다.
- 인원이 팀 수로 나누어떨어지지 않으면 앞 팀부터 한 명씩 더 배정합니다. 예: 10명 3팀 → 4·3·3명.
- 학생 여러 명을 한 브라우저의 일반 탭으로 테스트하면 참가자 쿠키가 공유됩니다. 실제 학생처럼 서로 다른 기기나 브라우저 프로필을 사용해야 합니다.
- 교사 화면은 한 브라우저에서 현재 룸 한 개를 이어서 관리합니다. `새 룸 만들기`를 선택하면 새 교사 세션으로 전환됩니다.
- 참가자 현황은 현재 2.5초 polling 방식으로 갱신됩니다. Supabase Realtime은 사용하지 않습니다.
- 학생이 작성 중인 답변은 polling이 덮어쓰지 않고 현재 탭의 `sessionStorage` 초안으로 보관합니다. 제출된 답변만 서버 값으로 동기화하고, 제출에 성공하면 초안을 지웁니다.
- Gemini 요청이 실패하면 기본 분석으로 대체합니다. 이때는 임베딩 차원이 달라 `response_analyses.embedding`에 저장하지 않고 `provider`가 `demo-fallback`으로 기록됩니다. 실패 원인은 서버 로그의 `Gemini analysis failed` 항목에서 확인합니다.
- `/api/match`는 교사 세션이 확인되면 참가자 명단과 답변을 클라이언트 요청이 아니라 Supabase에서 다시 읽어 사용합니다.

## 데이터 보관 정책

회원가입이 없으므로 **룸 코드가 데이터의 수명 단위**입니다. 한 수업에서 생긴 참가자, 답변,
분석, 매칭 이력, 팀 결과는 모두 해당 룸에 묶여 있고 룸을 지우면 함께 삭제됩니다.

- 교사가 팀 구성을 확정하면 학생이 자기 팀을 확인할 수 있습니다.
- 수업이 끝나면 교사가 확정 화면에서 `수업 종료 및 데이터 삭제`를 눌러 룸을 지웁니다.
  `rooms` 삭제 한 번으로 관련 테이블이 모두 정리되고 교사 세션 쿠키도 만료됩니다.
- 교사가 지우지 않은 룸은 다음 룸을 만들 때 `ROOM_RETENTION_HOURS`(기본 24시간) 기준으로
  자동 정리합니다. 값은 `src/lib/room-policy.ts`에 있습니다.
- 삭제 후 학생 화면은 다음 polling에서 `수업이 종료되어 룸 정보가 삭제되었습니다`를 표시하고
  더 이상 서버를 조회하지 않습니다. 이미 확인한 팀 결과는 화면에 남습니다.

학생에게는 자기 팀의 대표 아이디어, 공통 주제, 팀원 이름만 내려보냅니다. 다른 팀 구성,
원본 답변, 유사도나 정보량 점수는 학생 응답에 포함하지 않습니다.

## 알려진 제한사항

- 매칭 결과 검토 화면은 교사 브라우저의 `localStorage`에 남습니다. 브라우저 저장소를 지우거나 다른 기기에서 접속하면 검토 화면을 서버에서 복원하지 못하고 다시 분석을 실행해야 합니다. 확정한 뒤에는 서버에 저장되므로 학생 결과는 영향을 받지 않습니다.
- 팀 구성을 다시 실행하면 이전 `matching_runs` 이력을 지우지 않고 새 실행을 추가합니다. 학생에게는 가장 최근에 확정한 실행 결과를 보여줍니다.
- 학생은 한 번 제출한 뒤 답변을 수정할 수 없습니다.
- 자동 정리는 새 룸을 만들 때만 동작합니다. 아무도 룸을 만들지 않으면 기한이 지난 룸이 잠시 남아 있을 수 있습니다.
- 교사가 자기 룸의 학생 링크를 같은 브라우저에서 열면 교사 쿠키가 우선해 학생 화면이 정상 동작하지 않습니다. 학생 화면 확인은 시크릿 창을 사용하세요.
