# Team Matching

학생의 자유 응답을 분석해 대표 아이디어를 선택하고, 의미 유사도와 팀 정원을 고려해 모둠을 추천하는 Next.js 웹앱입니다.

## WSL 개발 환경

프로젝트는 WSL Ubuntu의 Conda 환경 `team_match`를 기준으로 설정되어 있습니다.

```bash
source /home/hojun5363/miniconda3/etc/profile.d/conda.sh
conda activate team_match
cd /mnt/c/Users/hojun/Desktop/Team_matching/team-matching-app
```

설치된 주요 런타임:

- Python 3.10
- Node.js 24 LTS
- npm 11

VS Code에서 프로젝트를 열 때는 WSL 터미널에서 다음을 실행합니다.

```bash
code .
```

새 통합 터미널은 자동으로 `team_match` 환경을 활성화합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

주요 화면:

- `/` 역할 선택 및 서비스 소개
- `/teacher` 교사 룸 설정, 응답 현황, AI 분석, 팀 검토·승인
- `/student` 학생 입장, 대기, 응답 제출, 결과 확인

교사 화면에서 `가상 학생 30명 불러오기`를 선택하면 외부 DB 없이 전체 흐름을 시연할 수 있습니다.

## 검증

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:gemini
npm run check:supabase
npm run check:room-flow
```

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 값을 입력합니다.

```bash
cp .env.example .env.local
```

`GEMINI_API_KEY`, `SUPABASE_SECRET_KEY`, `APP_SESSION_SECRET`에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

Gemini 연결 확인 명령은 키 값을 출력하지 않고 API 인증 성공 여부만 확인합니다.
Supabase 연결 확인 명령은 키 값을 출력하지 않고 `rooms` 테이블 조회 가능 여부만 확인합니다.

## Supabase

Supabase CLI 초기 설정은 `supabase/config.toml`에 생성되어 있습니다. 원격 프로젝트를 만든 다음 연결합니다.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

초기 migration은 `supabase/migrations/202607290001_initial_schema.sql`에 있습니다. 원격 프로젝트 연결 후 검토하고 적용합니다.

```bash
npx supabase db push
```
