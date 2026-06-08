/* 중복 의심 판단 유틸
   - bizNo가 있으면 bizNo 기준으로만 판단 (완전 일치 또는 포함 관계)
   - bizNo가 없을 때만 고객명 + 연도 + 사업명 보조 기준 사용 */

export function isDuplicate(ref, others) {
  return others.some((o) => {
    if (o.id === ref.id) return false;
    if (ref.bizNo && o.bizNo) {
      if (ref.bizNo === o.bizNo) return true;
      if (o.bizNo.includes(ref.bizNo) || ref.bizNo.includes(o.bizNo)) return true;
      return false;
    }
    if (!ref.bizNo && !o.bizNo) {
      return (
        o.customer === ref.customer &&
        String(o.year) === String(ref.year) &&
        o.project === ref.project
      );
    }
    return false;
  });
}
