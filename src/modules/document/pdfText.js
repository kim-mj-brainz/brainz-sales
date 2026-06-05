let pdfjsPromise;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }

  return pdfjsPromise;
}

export async function extractPdfText(file) {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageTexts = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const text = layoutPageText(content.items);

    if (text) pageTexts.push(text);
  }

  const text = pageTexts.join('\n').trim();
  return {
    text,
    pageCount: pdf.numPages,
    charCount: text.length,
  };
}

function layoutPageText(items) {
  const rows = [];

  items.forEach((item) => {
    const str = 'str' in item ? item.str.trim() : '';
    if (!str || !item.transform) return;

    const x = item.transform[4];
    const y = item.transform[5];
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (row) {
      row.items.push({ x, str });
    } else {
      rows.push({ y, items: [{ x, str }] });
    }
  });

  const text = rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.str).join(' '))
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (text) return text;

  return items
    .map((item) => ('str' in item ? item.str : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
