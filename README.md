# 모이다 (Team Matching)

학생의 자유 응답을 분석해 비슷한 문제의식과 아이디어를 가진 학생을 팀으로 연결하는 수업용 웹앱입니다.

## 바로가기

- 배포 서비스: [https://team-matching-eta.vercel.app](https://team-matching-eta.vercel.app)
- 개발·배포 문서: [team-matching-app/README.md](team-matching-app/README.md)

## 주요 기능

- 교사가 질문, 예상 인원, 팀 크기 또는 팀 수, 참여 암호를 설정해 수업 룸 생성
- 학생 링크 복사 및 QR 코드 공유
- 학생 입장·대기·답변 제출 상태 자동 갱신
- Gemini 분석과 임베딩을 이용한 아이디어 기반 팀 추천
- 교사의 팀 검토, 학생 이동, 경고 승인 및 최종 확정
- 학생 화면에서 자기 팀과 팀원 확인
- 교사·학생 화면 새로고침 시 현재 룸과 진행 상태 복원
- Supabase에 룸, 참가자, 답변, 분석 및 팀 결과 저장
- 수업 종료 시 룸 단위 데이터 삭제와 기한 지난 룸 자동 정리
- GitHub `main` 브랜치 푸시 시 Vercel 자동 배포

## 기술 구성

- Next.js 16, React 19, TypeScript
- Gemini API
- Supabase Postgres 및 pgvector
- Vercel

앱 소스는 [`team-matching-app`](team-matching-app) 폴더에 있습니다.
