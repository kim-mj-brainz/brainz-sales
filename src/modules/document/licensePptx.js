import JSZip from 'jszip';

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const LICENSE_FONT = 'Noto Sans CJK KR Regular';
const TEXT_SIZE = '1100';
const ITEM_SIZE = '1200';
const TEMPLATE_BASE_URL = import.meta.env.BASE_URL || '/';

function templateUrl(path) {
  return `${TEMPLATE_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function formatKoreanDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function shapeText(shape) {
  return Array.from(shape.getElementsByTagNameNS(A_NS, 't'))
    .map((node) => node.textContent || '')
    .join('');
}

function setRunStyle(scope, size) {
  Array.from(scope.getElementsByTagNameNS(A_NS, 'rPr')).forEach((node) => {
    node.setAttribute('sz', size);
    node.setAttribute('lang', 'ko-KR');
  });
  Array.from(scope.getElementsByTagNameNS(A_NS, 'endParaRPr')).forEach((node) => {
    node.setAttribute('sz', size);
    node.setAttribute('lang', 'ko-KR');
  });
  ['latin', 'ea', 'cs'].forEach((tag) => {
    Array.from(scope.getElementsByTagNameNS(A_NS, tag)).forEach((node) => {
      node.setAttribute('typeface', LICENSE_FONT);
    });
  });
}

function setParagraphText(paragraph, text, size) {
  const runs = Array.from(paragraph.getElementsByTagNameNS(A_NS, 'r'));
  const firstRun = runs[0];
  if (!firstRun) return;

  runs.slice(1).forEach((run) => run.parentNode?.removeChild(run));
  const textNodes = Array.from(firstRun.getElementsByTagNameNS(A_NS, 't'));
  const firstTextNode = textNodes[0];
  if (firstTextNode) firstTextNode.textContent = text;
  textNodes.slice(1).forEach((node) => node.parentNode?.removeChild(node));
  setRunStyle(paragraph, size);
}

function replaceShapeText(shape, value, size = TEXT_SIZE) {
  const txBody = shape.getElementsByTagNameNS(P_NS, 'txBody')[0];
  if (!txBody) return;

  const paragraphs = Array.from(txBody.childNodes)
    .filter((node) => node.namespaceURI === A_NS && node.localName === 'p');
  const templateParagraph = paragraphs.find((p) => shapeText(p).trim()) || paragraphs[0];
  if (!templateParagraph) return;

  paragraphs.forEach((p) => txBody.removeChild(p));
  const lines = String(value || '-').split('\n');
  lines.forEach((line) => {
    const next = templateParagraph.cloneNode(true);
    setParagraphText(next, line, size);
    txBody.appendChild(next);
  });
}

function replaceByMatcher(document, matcher, value, size) {
  const shape = Array.from(document.getElementsByTagNameNS(P_NS, 'sp'))
    .find((node) => matcher(shapeText(node)));
  if (shape) replaceShapeText(shape, value, size);
}

function normalizeItems(items) {
  return (items || [])
    .map((item) => ({
      item: (item.item || item.code || '').trim(),
      description: (item.description || item.name || '').trim(),
      qty: item.qty || '',
      unit: 'EA',
    }))
    .filter((item) => item.description);
}

function formatItemDescription(item) {
  return item.item ? `${item.description}[${item.item}]` : item.description;
}

export async function createLicensePptx(data) {
  if (!data.documentNo) throw new Error('문서번호가 없어 라이선스 증서를 생성할 수 없습니다.');
  const response = await fetch(templateUrl('/templates/license.pptx'));
  if (!response.ok) throw new Error('license.pptx 템플릿을 불러오지 못했습니다.');

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const slidePath = 'ppt/slides/slide1.xml';
  const slideXml = await zip.file(slidePath).async('text');
  const document = new DOMParser().parseFromString(slideXml, 'application/xml');
  const items = normalizeItems(data.items);
  if (!items.length) throw new Error('품목이 없어 라이선스 증서를 생성할 수 없습니다.');

  replaceByMatcher(document, (text) => text.includes('한국남동발전'), data.customer, TEXT_SIZE);
  replaceByMatcher(document, (text) => text.includes('경상남도 고성군'), data.address, TEXT_SIZE);
  replaceByMatcher(document, (text) => text.includes('BC2020'), data.documentNo, TEXT_SIZE);
  replaceByMatcher(document, (text) => text.includes('2020년'), formatKoreanDate(data.issueDate), TEXT_SIZE);
  replaceByMatcher(document, (text) => text.includes('통신소프트웨어'), items.map(formatItemDescription).join('\n'), ITEM_SIZE);
  replaceByMatcher(document, (text) => text.includes('1 EA'), items.map((item) => `${item.qty} EA`).join('\n'), ITEM_SIZE);
  replaceByMatcher(document, (text) => text.includes('정보통신설비'), `[${data.project || '-'}]`, ITEM_SIZE);

  zip.file(slidePath, new XMLSerializer().serializeToString(document));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
