import Link from "next/link";

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>모이다</span>
        </div>
        <span className="eyebrow">아이디어로 만나는 팀</span>
      </nav>
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="hero-chip">AI 아이디어 팀 매칭</span>
          <h1>
            점수가 아니라,
            <br />
            <em>생각의 방향</em>으로 팀을 만듭니다.
          </h1>
          <p>
            자유 주제 조별과제에서 학생 답변의 의미를 분석하고, 겹치지
            않는 대표 아이디어를 중심으로 균형 있는 팀을 추천합니다.
          </p>
          <div className="hero-actions">
            <Link className="button primary large" href="/teacher">
              교사 화면 시작
            </Link>
            <Link className="button secondary large" href="/student">
              학생으로 입장
            </Link>
          </div>
          <div className="trust-row">
            <span>✓ 학생의 능력·성실성 평가 없음</span>
            <span>✓ 교사가 최종 승인</span>
            <span>✓ 정보 부족 응답은 균형 배정</span>
          </div>
        </div>
        <div className="hero-visual" aria-label="팀 매칭 과정 미리보기">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="idea-card idea-a">
            <span className="idea-dot blue" />
            <strong>급식 잔반 줄이기</strong>
            <small>5명 · 의미 유사도 0.84</small>
          </div>
          <div className="idea-card idea-b">
            <span className="idea-dot green" />
            <strong>교내 에너지 절약</strong>
            <small>5명 · 의미 유사도 0.79</small>
          </div>
          <div className="idea-card idea-c">
            <span className="idea-dot violet" />
            <strong>학교 생태 지도</strong>
            <small>4명 · 의미 유사도 0.76</small>
          </div>
          <div className="core-badge">
            <b>30</b>
            <span>개의 생각</span>
          </div>
        </div>
      </section>
    </main>
  );
}
