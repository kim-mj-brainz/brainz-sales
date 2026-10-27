/* =============================================================
   숫자 → 한글 금액 변환 (계약서용, 예: 20000000 → "이천만원정")
   ============================================================= */
const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const SMALL_UNITS = ['', '십', '백', '천'];
const BIG_UNITS = ['', '만', '억', '조'];

function fourDigitToKorean(n) {
  const str = String(n).padStart(4, '0');
  let result = '';
  for (let i = 0; i < 4; i++) {
    const d = Number(str[i]);
    if (d === 0) continue;
    const unit = SMALL_UNITS[3 - i];
    result += (d === 1 && unit === '십') ? unit : DIGITS[d] + unit;
  }
  return result;
}

export function numberToKoreanAmount(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n <= 0) return '영원정';

  let remaining = n;
  const groups = [];
  while (remaining > 0) {
    groups.push(remaining % 10000);
    remaining = Math.floor(remaining / 10000);
  }

  let result = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    result += fourDigitToKorean(groups[i]) + BIG_UNITS[i];
  }
  return `${result}원정`;
}

export function formatAmountNumber(amount) {
  return Math.round(Number(amount) || 0).toLocaleString('ko-KR');
}
