import JSZip from 'jszip';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const SHEET_RELS_PATH = 'xl/worksheets/_rels/sheet1.xml.rels';
const WORKBOOK_PATH = 'xl/workbook.xml';
const ITEM_START_ROW = 15;
const ITEM_END_ROW = 21;
const TEMPLATE_ITEM_ROWS = ITEM_END_ROW - ITEM_START_ROW + 1;
const TEMPLATE_PRINT_END_ROW = 32;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlText(value) {
  const text = String(value ?? '');
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<is><t${space}>${escapeXml(text)}</t></is>`;
}

function inlineCell(ref, style, value) {
  const text = String(value ?? '');
  if (!text) return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr">${xmlText(text)}</c>`;
}

function qtyCell(ref, style, value) {
  const text = String(value ?? '').trim();
  if (!text) return `<c r="${ref}" s="${style}"/>`;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && text !== '') return `<c r="${ref}" s="${style}"><v>${numeric}</v></c>`;
  return inlineCell(ref, style, text);
}

function normalizeItems(items) {
  const next = (items || [])
    .map((item) => ({
      description: (item.description || item.name || '').trim(),
      qty: item.qty ?? '',
    }))
    .filter((item) => item.description);

  return next.length ? next : [{ description: '', qty: '' }];
}

function itemRowXml(rowNumber, index, item, isLast) {
  const styles = isLast
    ? { no: 49, desc: 50, qty: 51, note: 52, noteTail: 53 }
    : { no: 47, desc: 36, qty: 37, note: 38, noteTail: 48 };

  return [
    `<row r="${rowNumber}" spans="1:8" s="${isLast ? 10 : 11}" customFormat="1" ht="16.5" customHeight="1">`,
    `<c r="A${rowNumber}" s="${styles.no}"><v>${index + 1}</v></c>`,
    inlineCell(`B${rowNumber}`, styles.desc, item.description),
    `<c r="C${rowNumber}" s="${styles.desc}"/>`,
    `<c r="D${rowNumber}" s="${styles.desc}"/>`,
    qtyCell(`E${rowNumber}`, styles.qty, item.qty),
    `<c r="F${rowNumber}" s="${styles.note}"/>`,
    `<c r="G${rowNumber}" s="${styles.noteTail}"/>`,
    '</row>',
  ].join('');
}

function rowNumber(rowXml) {
  return Number(rowXml.match(/<row[^>]*\sr="(\d+)"/)?.[1] || 0);
}

function shiftRow(rowXml, delta) {
  if (!delta) return rowXml;
  const current = rowNumber(rowXml);
  const next = current + delta;

  return rowXml
    .replace(/<row([^>]*)\sr="\d+"/, `<row$1 r="${next}"`)
    .replace(/\sr="([A-Z]+)(\d+)"/g, (match, column, row) => ` r="${column}${Number(row) + delta}"`);
}

function replaceSheetData(sheetXml, items) {
  const delta = items.length - TEMPLATE_ITEM_ROWS;
  const rows = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
  const nextRows = [];

  rows.forEach((row) => {
    const rowNo = rowNumber(row);
    if (rowNo >= ITEM_START_ROW && rowNo <= ITEM_END_ROW) return;
    if (rowNo > ITEM_END_ROW) {
      nextRows.push(shiftRow(row, delta));
      return;
    }
    nextRows.push(row);
  });

  const insertAt = nextRows.findIndex((row) => rowNumber(row) > ITEM_START_ROW);
  const itemRows = items.map((item, index) => {
    const rowNo = ITEM_START_ROW + index;
    return itemRowXml(rowNo, index, item, index === items.length - 1);
  });
  const mergedRows = insertAt === -1
    ? [...nextRows, ...itemRows]
    : [...nextRows.slice(0, insertAt), ...itemRows, ...nextRows.slice(insertAt)];

  return sheetXml
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${mergedRows.join('')}</sheetData>`)
    .replace(/<dimension ref="[^"]+"/, `<dimension ref="A1:H${TEMPLATE_PRINT_END_ROW + delta + 1}"`);
}

function parseRange(ref) {
  const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    startCol: match[1],
    startRow: Number(match[2]),
    endCol: match[3],
    endRow: Number(match[4]),
  };
}

function formatRange(range) {
  return `${range.startCol}${range.startRow}:${range.endCol}${range.endRow}`;
}

function isTemplateItemMerge(range) {
  if (!range) return false;
  const itemRow = range.startRow >= ITEM_START_ROW && range.endRow <= ITEM_END_ROW;
  const descMerge = range.startCol === 'B' && range.endCol === 'D';
  const noteMerge = range.startCol === 'F' && range.endCol === 'G';
  return itemRow && (descMerge || noteMerge);
}

function shiftRange(range, delta) {
  if (!range || !delta || range.startRow <= ITEM_END_ROW) return range;
  return {
    ...range,
    startRow: range.startRow + delta,
    endRow: range.endRow + delta,
  };
}

function replaceMergeCells(sheetXml, itemCount) {
  const delta = itemCount - TEMPLATE_ITEM_ROWS;
  const mergeBlock = sheetXml.match(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/)?.[0];
  if (!mergeBlock) return sheetXml;

  const refs = Array.from(mergeBlock.matchAll(/<mergeCell ref="([^"]+)"\/>/g))
    .map((match) => parseRange(match[1]))
    .filter((range) => range && !isTemplateItemMerge(range))
    .map((range) => shiftRange(range, delta));

  for (let row = ITEM_START_ROW; row < ITEM_START_ROW + itemCount; row += 1) {
    refs.push({ startCol: 'B', startRow: row, endCol: 'D', endRow: row });
    refs.push({ startCol: 'F', startRow: row, endCol: 'G', endRow: row });
  }

  const cells = refs.map((range) => `<mergeCell ref="${formatRange(range)}"/>`).join('');
  return sheetXml.replace(mergeBlock, `<mergeCells count="${refs.length}">${cells}</mergeCells>`);
}

function setCell(sheetXml, ref, value) {
  const cellPattern = new RegExp(`<c r="${ref}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const current = sheetXml.match(cellPattern)?.[0];
  if (!current) return sheetXml;
  const style = current.match(/\ss="([^"]+)"/)?.[1] || '0';
  return sheetXml.replace(cellPattern, inlineCell(ref, style, value));
}

function updateSheetValues(sheetXml, data) {
  return [
    ['B4', data.project || ''],
    ['B5', ''],
    ['B6', data.customer || ''],
    ['E9', data.contactName || ''],
    ['E10', data.contactPhone || ''],
    ['E11', data.contactEmail || ''],
  ].reduce((xml, [ref, value]) => setCell(xml, ref, value), sheetXml);
}

function updateEmailRelationship(relsXml, email) {
  if (!relsXml) return relsXml;
  if (!email) {
    return relsXml.replace(/<Relationship Id="rId1"[^>]*\/>/, '');
  }
  return relsXml.replace(
    /(<Relationship Id="rId1"[^>]*Target=")[^"]*("[^>]*\/>)/,
    `$1mailto:${escapeXml(email)}$2`,
  );
}

function updateHyperlink(sheetXml, email) {
  if (email) return sheetXml;
  return sheetXml.replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, '');
}

function updatePrintArea(workbookXml, itemCount) {
  if (!workbookXml) return workbookXml;
  const endRow = TEMPLATE_PRINT_END_ROW + itemCount - TEMPLATE_ITEM_ROWS;
  return workbookXml.replace(
    /(<definedName name="_xlnm\.Print_Area"[^>]*>[^!]+!\$A\$1:\$G\$)\d+(<\/definedName>)/,
    `$1${endRow}$2`,
  );
}

export async function createInspectionXlsx(data) {
  const response = await fetch('/templates/inspection-confirmation.xlsx');
  if (!response.ok) throw new Error('검수확인서 템플릿을 불러오지 못했습니다.');

  const items = normalizeItems(data.items);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  let sheetXml = await zip.file(SHEET_PATH).async('text');

  sheetXml = replaceSheetData(sheetXml, items);
  sheetXml = replaceMergeCells(sheetXml, items.length);
  sheetXml = updateSheetValues(sheetXml, data);
  sheetXml = updateHyperlink(sheetXml, data.contactEmail);
  zip.file(SHEET_PATH, sheetXml);

  const relsFile = zip.file(SHEET_RELS_PATH);
  if (relsFile) {
    zip.file(SHEET_RELS_PATH, updateEmailRelationship(await relsFile.async('text'), data.contactEmail));
  }

  const workbookFile = zip.file(WORKBOOK_PATH);
  if (workbookFile) {
    zip.file(WORKBOOK_PATH, updatePrintArea(await workbookFile.async('text'), items.length));
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
