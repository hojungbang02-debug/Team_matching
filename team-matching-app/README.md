# 모이다 웹앱

교사가 질문을 공개하고 학생의 자유 응답을 수집한 뒤, Gemini 분석과 의미 임베딩을 이용해 아이디어 기반 팀을 추천하는 Next.js 애플리케이션입니다.

## 배포 주소

[https://team-matching-eta.vercel.app](https://team-matching-eta.vercel.app)

주요 경로:

- `/` 서비스 소개 및 역할 선택
- `/teacher` 룸 생성, 참여 현황, 분석, 팀 검토 및 확정
- `/student?room=ROOM_CODE` 학생 입장, 대기 및 답변 제출
- `/api/health/supabase` Supabase 연결 상태

## 현재 동작 흐름

1. 교사가 질문, 예상 인원, 팀 구성 방식과 참여 암호를 설정합니다.
2. 룸을 생성하고 학생 링크 또는 QR 코드를 공유합니다.
3. 학생은 암호와 이름·학번으로 입장해 질문 공개를 기다립니다.
4. 교사가 질문을 공개하면 학생 화면이 자동으로 답변 단계로 바뀝니다.
5. 교사가 수집을 마감하고 Gemini 팀 구성을 실행합니다.
6. 교사가 추천 팀을 검토하고 필요한 학생 이동·경고 승인을 거쳐 확정합니다.

교사와 학생의 세션은 HttpOnly 쿠키로 관리합니다. 같은 브라우저에서 새로고침하거나 링크를 다시 열면 Supabase에 저장된 현재 룸과 진행 단계를 복원합니다.

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
- 학생 여러 명을 한 브라우저의 일반 탭으로 테스트하면 참가자 쿠키가 공유됩니다. 실제 학생처럼 서로 다른 기기나 브라우저 프로필을 사용해야 합니다.
- 교사 화면은 한 브라우저에서 현재 룸 한 개를 이어서 관리합니다. `새 룸 만들기`를 선택하면 새 교사 세션으로 전환됩니다.
- 참가자 현황은 현재 2.5초 polling 방식으로 갱신됩니다.
- Gemini 요청 실패 시 팀 구성 알고리즘 검증을 위한 기본 분석으로 대체합니다.
- 학생 최종 결과 화면의 상세 데이터 연결과 교사 수동 이동 이력의 서버 영구 저장은 추가 구현이 필요합니다.
