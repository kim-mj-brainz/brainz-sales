const PRICE = '(?:\\d{1,3}(?:,\\d{3})+|\\d+|-)';
const ITEM_ROW_PATTERN = `(?:^|\\s)(?:\\d+\\s+)?([A-Z][A-Z0-9-]{1,})\\s+(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+([A-Za-z가-힣]+)\\s+${PRICE}\\s+${PRICE}\\s+${PRICE}\\s+${PRICE}`;
const ITEM_ROW = new RegExp(
  `${ITEM_ROW_PATTERN}(?=\\s+(?:\\d+\\s+)?[A-Z][A-Z0-9-]{1,}\\s+|\\s+REMARK\\b|$)`,
  'g',
);
const ITEM_LINE = new RegExp(`${ITEM_ROW_PATTERN}\\s*$`);

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactPersonName(value) {
  const text = clean(value);
  const parts = text.split(' ');
  if (parts.length <= 1) return text;
  const title = parts.at(-1);
  const name = parts.slice(0, -1).join('');
  return `${name} ${title}`.trim();
}

function normalizeText(text) {
  return clean(text)
    .replace(/\s*:\s*/g, ' : ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => clean(line).replace(/\s*:\s*/g, ' : '))
    .filter(Boolean);
}

function rejectLabelNoise(value, labels) {
  const text = clean(value);
  if (!text) return '';
  return labels.some((label) => text.startsWith(label)) ? '' : text;
}

function extractBetween(text, start, endLabels) {
  const end = endLabels.join('|');
  const match = text.match(new RegExp(`${start}\\s*:\\s*(.*?)(?=\\s*(?:${end})\\s*:|$)`));
  return clean(match?.[1]);
}

function extractLineValue(lines, label, stopLabels = []) {
  const labelRegExp = new RegExp(label);
  const line = lines.find((candidate) => labelRegExp.test(candidate));
  if (!line) return '';

  let value = line.replace(new RegExp(`^.*?${label}\\s*:?\\s*`), '');
  stopLabels.forEach((stop) => {
    value = value.replace(new RegExp(`\\s*:?\\s*${stop}[\\s\\S]*$`), '');
  });

  const colonIndex = value.indexOf(' : ');
  if (colonIndex > 0) value = value.slice(0, colonIndex);
  return clean(value);
}

function parseKoreanDate(text) {
  const match = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseDateFromQuoteNo(text) {
  const match = text.match(/\bBC-[A-Z]-?(\d{6})\b/i);
  if (!match) return '';
  return yymmddToDate(match[1]);
}

function parseDateFromFileName(fileName) {
  const match = String(fileName || '').match(/(?:^|[_-])(\d{6})(?:[_-]|\.|$)/);
  if (!match) return '';
  return yymmddToDate(match[1]);
}

function normalizeSpacedQuoteNo(text) {
  return String(text || '').replace(/\b(BC-[A-Z])[-\s]*(\d{2})\s+(\d{4})\b/gi, '$1-$2$3');
}

function extractQuoteNo(text, lines) {
  const normalizedText = normalizeSpacedQuoteNo(text);
  const labelValue = normalizeSpacedQuoteNo(extractLineValue(lines, '견적번호'));
  return clean(
    labelValue.match(/\bBC-[A-Z]-?\d{6}(?:-[A-Za-z0-9_-]+)?\b/i)?.[0]
    || normalizedText.match(/\bBC-[A-Z]-?\d{6}(?:-[A-Za-z0-9_-]+)?\b/i)?.[0]
    || normalizedText.match(/\bBC-[A-Z0-9-]+(?:-[A-Za-z0-9_-]+)?\b/i)?.[0],
  );
}

function yymmddToDate(value) {
  const year = Number(value.slice(0, 2));
  const month = value.slice(2, 4);
  const day = value.slice(4, 6);
  const fullYear = year >= 80 ? `19${value.slice(0, 2)}` : `20${value.slice(0, 2)}`;
  return `${fullYear}-${month}-${day}`;
}

function parseFileNameHints(fileName) {
  const baseName = String(fileName || '').replace(/\.[^.]+$/, '');
  const parts = baseName.split(/[_-]+/).map(clean).filter(Boolean);
  const customer = parts.find((part, index) => (
    index > 0
    && !/브레인즈|brainz/i.test(part)
    && !/^\d{6}$/.test(part)
    && !/^[a-z]+[a-z0-9]*$/i.test(part)
  ));
  const project = parts.find((part) => (
    part !== customer
    && !/브레인즈|brainz/i.test(part)
    && !/^\d{6}$/.test(part)
    && !/^[a-z]+[a-z0-9]*$/i.test(part)
  ));

  return { customer: customer || '', project: project || '' };
}

function parseRemark(text) {
  const match = text.match(/본\s*견적은\s*(.+?)의\s+(.+?)\s*견적(?:입니다|입니다\.)?/);
  return {
    customer: clean(match?.[1]),
    project: clean(match?.[2]),
  };
}

function parseProcurementItems(lines) {
  const headerIndex = lines.findIndex((line) => (
    line.includes('물품식별번호')
    && line.includes('규격')
    && line.includes('Qty')
    && line.includes('조달단가')
  ));
  if (headerIndex < 0) return [];

  const items = [];
  let pendingDescription = [];
  const rowPattern = new RegExp(`^(\\d+)\\s+(\\d{6,})\\s+(\\d+(?:\\.\\d+)?)\\s+([A-Za-z가-힣]+)\\s+${PRICE}\\s+${PRICE}(?:\\s+(.+))?$`);
  const stopPattern = /^(?:Zenius\s+제품가|최\s*종\s*공\s*급\s*가|REMARK|내자구매|▶|※)/;

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || stopPattern.test(line)) break;

    const match = line.match(rowPattern);
    if (!match) {
      pendingDescription.push(line);
      continue;
    }

    const [, , itemCode, qty, unit] = match;
    const descriptionParts = [...pendingDescription];
    const nextLine = lines[index + 1] || '';
    if (nextLine && !rowPattern.test(nextLine) && !stopPattern.test(nextLine) && !nextLine.includes('통신소프트웨어')) {
      descriptionParts.push(nextLine);
      index += 1;
    }

    items.push({
      item: itemCode,
      description: clean(descriptionParts.join(' ')),
      qty: Number(qty),
      unit: clean(unit) || 'EA',
    });
    pendingDescription = [];
  }

  return items;
}

function parseItems(text) {
  const lines = normalizeLines(text);
  const items = [];

  lines.forEach((line) => {
    const match = line.match(ITEM_LINE);
    if (!match) return;
    const [, code, description, qty, unit] = match;
    items.push({
      item: code,
      description: clean(description),
      qty: Number(qty),
      unit: clean(unit) || 'EA',
    });
  });

  if (items.length) return items;

  const procurementItems = parseProcurementItems(lines);
  if (procurementItems.length) return procurementItems;

  const body = text.split(/\bNo\.\s*Item\s*Description\s*Qty\s*Unit\b/i).at(-1) || text;
  for (const match of body.matchAll(ITEM_ROW)) {
    const [, code, description, qty, unit] = match;
    if (['REMARK', 'ITEM'].includes(code)) continue;
    items.push({
      item: code,
      description: clean(description),
      qty: Number(qty),
      unit: clean(unit) || 'EA',
    });
  }

  return items;
}

export function parseQuoteText(rawText, fileName = '') {
  const lines = normalizeLines(rawText);
  const text = normalizeText(rawText);
  const quoteNo = extractQuoteNo(text, lines);
  const fileHints = parseFileNameHints(fileName);
  const remark = parseRemark(text);
  const customerFromLine = rejectLabelNoise(
    extractLineValue(lines, '수신\\(참조\\)', ['대표이사', '건\\s*명']),
    ['대표이사', '건 명', 'Tel / Fax'],
  );
  const customerFromLabel = rejectLabelNoise(
    extractBetween(text, '수신\\(참조\\)', ['건\\s*명', '대표이사']),
    ['대표이사', '건 명', 'Tel / Fax'],
  );
  const projectFromLine = rejectLabelNoise(
    extractLineValue(lines, '건\\s*명', ['Tel\\s*/\\s*Fax', '결제조건']),
    ['Tel / Fax', '결제조건', '담 당 자'],
  );
  const projectFromLabel = rejectLabelNoise(
    extractBetween(text, '건\\s*명', ['결제조건', 'Tel\\s*/\\s*Fax']),
    ['Tel / Fax', '결제조건', '담 당 자'],
  );
  const contactName = rejectLabelNoise(
    extractLineValue(lines, '담\\s*당\\s*자', ['유지보수', '연\\s*락\\s*처'])
      || extractBetween(text, '담\\s*당\\s*자', ['유지보수', '연\\s*락\\s*처']),
    ['유지보수', '연 락 처'],
  );
  const issueDateText = extractLineValue(lines, '견적일자', ['수신\\(참조\\)', '대표이사'])
    || extractBetween(text, '견적일자', ['수신\\(참조\\)', '대표이사']);

  return {
    quoteNo,
    issueDate: parseKoreanDate(issueDateText)
      || parseKoreanDate(text)
      || parseDateFromQuoteNo(text)
      || parseDateFromFileName(fileName),
    customer: customerFromLine || customerFromLabel || remark.customer || fileHints.customer,
    project: projectFromLine || projectFromLabel || remark.project || fileHints.project,
    contactName: compactPersonName(contactName),
    contactPhone: clean(extractLineValue(lines, '연\\s*락\\s*처') || text.match(/연\s*락\s*처\s*:\s*([0-9-]+)/)?.[1]),
    contactEmail: clean(extractLineValue(lines, '이\\s*메\\s*일') || text.match(/이\s*메\s*일\s*:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1]),
    items: parseItems(rawText),
  };
}
