/* =============================================================
   계약서 생성 (담당: 문서생성)
   용역계약서 / 물품공급계약서 실제 양식(docx)을 템플릿으로 사용해,
   템플릿 안의 샘플 문구(을 상호/주소/대표이사, 사업명, 계약기간,
   계약금액)만 찾아서 치환한다. 그 외 조항 문구는 원본 그대로 유지.
   ============================================================= */
import JSZip from 'jszip';
import { numberToKoreanAmount, formatAmountNumber } from './koreanNumber.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TEMPLATE_BASE_URL = import.meta.env.BASE_URL || '/';

function templateUrl(path) {
  return `${TEMPLATE_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function formatKoreanDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}년 ${mm}월 ${dd}일`;
}

function splitAddressLines(address) {
  const parts = String(address || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return [parts[0] || '', parts[1] || ''];
}

function paragraphText(p) {
  return Array.from(p.getElementsByTagNameNS(W_NS, 't')).map((t) => t.textContent || '').join('');
}

// 한 문단 안에서 서식이 다른 여러 run(<w:r>)에 텍스트가 쪼개져 있을 수 있어,
// 첫 run으로 합친 뒤 문자열 치환한다 (license.pptx 템플릿 치환과 동일한 방식).
function collapseParagraphToSingleRun(p) {
  const runs = Array.from(p.getElementsByTagNameNS(W_NS, 'r'));
  if (!runs.length) return null;
  const fullText = paragraphText(p);
  const firstRun = runs[0];
  const texts = Array.from(firstRun.getElementsByTagNameNS(W_NS, 't'));
  let tNode = texts[0];
  if (!tNode) {
    tNode = p.ownerDocument.createElementNS(W_NS, 'w:t');
    firstRun.appendChild(tNode);
  }
  tNode.textContent = fullText;
  tNode.setAttribute('xml:space', 'preserve');
  texts.slice(1).forEach((n) => n.parentNode?.removeChild(n));
  runs.slice(1).forEach((r) => r.parentNode?.removeChild(r));
  return tNode;
}

function replaceEverywhere(doc, replacements) {
  const pairs = replacements.filter(([oldStr]) => oldStr);
  const paragraphs = Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));
  paragraphs.forEach((p) => {
    const text = paragraphText(p);
    if (!pairs.some(([oldStr]) => text.includes(oldStr))) return;
    const tNode = collapseParagraphToSingleRun(p);
    if (!tNode) return;
    let next = tNode.textContent;
    pairs.forEach(([oldStr, newStr]) => { next = next.split(oldStr).join(newStr ?? ''); });
    tNode.textContent = next;
  });
}

const TEMPLATES = {
  service: {
    file: 'contract-service.docx',
    label: '용역계약서',
    build: (data) => [
      ['와이시큐어㈜', data.counterpartyName],
      ['재외동포인증센터 인프라 강화 사업', data.projectName],
      ['2025년 08월 29일', formatKoreanDate(data.startDate)],
      ['2025년 09월 17일', formatKoreanDate(data.endDate)],
      ['이천만원정', numberToKoreanAmount(data.amount)],
      ['20,000,000', formatAmountNumber(data.amount)],
      ['서울시 송파구 법원로8길 8, 717호', data.counterpartyAddress],
      ['우 하 영', data.counterpartyCeo],
    ],
  },
  supply: {
    file: 'contract-supply.docx',
    label: '물품공급계약서',
    build: (data) => {
      const [addr1, addr2] = splitAddressLines(data.counterpartyAddress);
      return [
        ['더파트 주식회사', data.counterpartyName],
        ['[1권역]학교 10Giga 인터넷 구축 관제센터용 NMS 구매', data.projectName],
        ['2025년 02월 24일', formatKoreanDate(data.startDate)],
        ['2025년 05월 30일', formatKoreanDate(data.endDate)],
        ['일천칠백만원정', numberToKoreanAmount(data.amount)],
        ['17,200,000', formatAmountNumber(data.amount)],
        ['서울시 금천구 가산디지털2로 169-23', addr1],
        ['가산모비우스타워 401-9호', addr2],
        ['강 현 준', data.counterpartyCeo],
      ];
    },
  },
};

export const CONTRACT_TYPES = Object.entries(TEMPLATES).map(([value, t]) => ({ value, label: t.label }));

export async function createContractDocx(type, data) {
  const template = TEMPLATES[type];
  if (!template) throw new Error('알 수 없는 계약서 종류입니다.');
  if (!data.counterpartyName) throw new Error('을(상대 회사명)이 없어 계약서를 생성할 수 없습니다.');
  if (!data.projectName) throw new Error('사업명(건명)이 없어 계약서를 생성할 수 없습니다.');
  if (!data.startDate || !data.endDate) throw new Error('계약기간(시작일/종료일)이 없어 계약서를 생성할 수 없습니다.');
  if (!data.amount) throw new Error('계약금액이 없어 계약서를 생성할 수 없습니다.');

  const response = await fetch(templateUrl(`/templates/${template.file}`));
  if (!response.ok) throw new Error(`${template.file} 템플릿을 불러오지 못했습니다.`);

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const docPath = 'word/document.xml';
  const xml = await zip.file(docPath).async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  replaceEverywhere(doc, template.build(data));

  zip.file(docPath, new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
