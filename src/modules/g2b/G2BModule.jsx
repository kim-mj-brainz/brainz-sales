/* =============================================================
   조달(G2B) (담당: 영업지원)
   [통계] [상세 실적] [설정] — 상세 내용은 추후 요청 예정
   ============================================================= */

function G2BPlaceholder({ title }) {
  return (
    <div className="card card-pad">
      <div className="card-title">{title}</div>
      <p className="muted">준비 중입니다. 상세 요구사항 확정 후 구현됩니다.</p>
    </div>
  );
}

export function G2BStats() {
  return <G2BPlaceholder title="조달(G2B) 통계" />;
}

export function G2BPerformance() {
  return <G2BPlaceholder title="조달(G2B) 상세 실적" />;
}

export function G2BSettings() {
  return <G2BPlaceholder title="조달(G2B) 설정" />;
}
