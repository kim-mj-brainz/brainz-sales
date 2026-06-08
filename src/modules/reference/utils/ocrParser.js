/**
 * OCR 파싱 유틸 — 3단계 파이프라인
 *
 *  parseCertificatePdf(file)
 *   ├─ [STAGE 1] PDF.js 텍스트 레이어 (디지털 PDF)
 *   ├─ [STAGE 2] renderPdfToImage → runOcr (Tesseract.js, 스캔 PDF)
 *   └─ [STAGE 3] 표준 제품 목록만 채운 빈 폼 (모든 추출 실패 시)
 *
 * parseCertificateText(rawText) 는 STAGE 1·2 양쪽에서 공통으로 사용한다.
 *
 * 라이선스 증서 고정 양식:
 * ┌────────────────────────┬─────────────────────────────────┐
 * │ 고객명                  │  증서발행일   YYYY년 M월 D일    │
 * │  [고객명]               │                                 │
 * │ 사업장  주소             │  제품번호    BC20XX-...-XXX-XXX │
 * │  [주소]                 │                                 │
 * ├────────────────────────┴─────────────────────────────────┤
 * │ 세부 내역                                     수량        │
 * │ Zenius-EMS Manager                            1Mgr       │
 * │ ...                                                      │
 * │ [사업명 건]                                              │
 * └──────────────────────────────────────────────────────────┘
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// ══════════════════════════════════════════════════════════════
//  데이터 모델
// ══════════════════════════════════════════════════════════════

export function emptyOcrEntry(filename) {
  return {
    filename,
    customer: '', issuedDate: '', year: '', month: '',
    bizNo: '', address: '', region: '', project: '',
    industry: '', orgType: '', modules: [],
    products: [{ name: '', qty: '', unit: '', version: '' }],
  };
}

// 표준 제품 목록 — Stage 3 폴백용 (OCR 완전 실패 시 폼 채우기)
const SAMPLE_PRODUCTS = [
  { name: 'Zenius-EMS Manager',                 qty: '1',  unit: 'Mgr', version: '' },
  { name: 'Zenius-SMS Manager',                 qty: '1',  unit: 'Mgr', version: '' },
  { name: 'Zenius-SMS Agent for Windows/Linux', qty: '40', unit: 'Agt', version: '' },
  { name: 'Zenius-NMS Manager',                 qty: '1',  unit: 'Mgr', version: '' },
  { name: 'Zenius-NMS Device License',          qty: '10', unit: 'Dev', version: '' },
  { name: 'Performance Prediction Module',      qty: '1',  unit: 'Mod', version: '' },
  { name: 'Zenius-DBRD Editor',                 qty: '1',  unit: 'ea',  version: '' },
];

// ══════════════════════════════════════════════════════════════
//  모듈 자동 추출
// ══════════════════════════════════════════════════════════════
// 순서 중요: 긴 패턴(STMS, BRMS…)이 짧은 패턴(TMS, BMS…) 앞에 위치해야 오매핑 방지.

const PRODUCT_MODULE_MAP = [
  { re: /\bSTMS\b/i,              mod: 'STMS'        },
  { re: /\bBRMS\b/i,              mod: 'BRMS'        },
  { re: /\bERMS\b/i,              mod: 'ERMS'        },
  { re: /\bRTMS\b/i,              mod: 'RTMS'        },
  { re: /\bWNMS\b/i,              mod: 'WNMS'        },
  { re: /\bDBMS\b/i,              mod: 'DBMS'        },
  { re: /\bNPM\b/i,               mod: 'NPM'         },
  { re: /\bNMS\b/i,               mod: 'NMS'         },
  { re: /\bSMS\b/i,               mod: 'SMS'         },
  { re: /\bVMS\b/i,               mod: 'VMS'         },
  { re: /\bBMS\b/i,               mod: 'BMS'         },
  { re: /\bOAM\b/i,               mod: 'OAM'         },
  { re: /\bGPM\b/i,               mod: 'GPM'         },
  { re: /\bCMS\b/i,               mod: 'CMS'         },
  { re: /\bK8s\b/i,               mod: 'K8s'         },
  { re: /\bTMS\b/i,               mod: 'TMS'         },
  { re: /\bAPM\b/i,               mod: 'APM'         },
  { re: /\bIMS\b/i,               mod: 'IMS'         },
  { re: /\bFMS\b/i,               mod: 'FMS'         },
  { re: /\bEMS\b/i,               mod: 'EMS'         },
  { re: /\bITSM\b/i,              mod: 'ITSM'        },
  { re: /\bSIEM\b/i,              mod: 'SIEM'        },
  { re: /Syslog|Trap/i,           mod: 'Syslog/Trap' },
  { re: /Performance Prediction/i, mod: 'Dashboard'  },
  { re: /Dashboard/i,             mod: 'Dashboard'   },
];

export function extractModulesFromProducts(products) {
  const found = new Set();
  for (const p of products) {
    const name = (p.name || '').trim();
    if (!name) continue;
    for (const { re, mod } of PRODUCT_MODULE_MAP) {
      if (re.test(name)) { found.add(mod); break; }
    }
  }
  return [...found];
}

// ══════════════════════════════════════════════════════════════
//  주소 → 지역 추출
// ══════════════════════════════════════════════════════════════

const REGION_MAP = [
  { re: /^서울/,        region: '서울' },
  { re: /^인천/,        region: '인천' },
  { re: /^부산/,        region: '부산' },
  { re: /^대구/,        region: '대구' },
  { re: /^광주/,        region: '광주' },
  { re: /^대전/,        region: '대전' },
  { re: /^울산/,        region: '울산' },
  { re: /^세종/,        region: '세종' },
  { re: /^경기/,        region: '경기' },
  { re: /^강원/,        region: '강원' },
  { re: /^충북|^충청북/, region: '충북' },
  { re: /^충남|^충청남/, region: '충남' },
  { re: /^전북|^전라북/, region: '전북' },
  { re: /^전남|^전라남/, region: '전남' },
  { re: /^경북|^경상북/, region: '경북' },
  { re: /^경남|^경상남/, region: '경남' },
  { re: /^제주/,        region: '제주' },
];

/** 주소 문자열에서 시/도 단위 지역명을 추출한다.
 *  예: "서울시 성동구 성수이로 87" → "서울"
 *      "경기도 성남시 분당구"       → "경기" */
export function extractRegion(address) {
  const s = (address || '').trim();
  for (const { re, region } of REGION_MAP) {
    if (re.test(s)) return region;
  }
  return '';
}

// ══════════════════════════════════════════════════════════════
//  텍스트 정리 유틸
// ══════════════════════════════════════════════════════════════

// OCR 노이즈 제거 및 공백 정규화
function normalizeText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')      // 수평 공백 압축
    .replace(/\n{3,}/g, '\n\n')   // 3줄 이상 빈 줄 → 최대 2줄
    .trim();
}

// 알려진 레이블·구조 값을 모두 제거하고 남은 텍스트 반환
// label-bounded 추출 후 잔류 잡음 제거용
function removeLabelNoise(text) {
  return text
    .replace(/소프트웨어\s*라이선스\s*증서/g, '')
    .replace(/고객\s*명/g, '')
    .replace(/사업장\s*주소|사업\s*장\s*주소/g, '')
    .replace(/증서[\s\S]{0,3}발행일/g, '')
    .replace(/제품\s*번호/g, '')
    .replace(/세부[\s\S]{0,3}내역/g, '')
    .replace(/수\s*량/g, '')
    .replace(/\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g, '')  // 날짜
    .replace(/BC\d{4}-[A-Z0-9.]+-\d{4}-\d{3}/gi, '')             // 제품번호 코드
    .replace(/[\[【][^\]】]*[\]】]/g, '')                          // 괄호 안 텍스트
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * OCR 텍스트에서 특정 레이블과 그 다음 레이블 사이의 구간을 추출한다.
 * 두 가지 OCR 읽기 순서(행 우선·열 우선) 모두 처리 가능.
 *
 * @param {string} text      정규화된 전체 텍스트
 * @param {RegExp} startRe   시작 레이블 패턴
 * @param {RegExp} endRe     종료 레이블 패턴 (없으면 최대 150자)
 * @returns {string}         레이블 노이즈 제거 후 값
 */
function extractBounded(text, startRe, endRe) {
  const startM = startRe.exec(text);
  if (!startM) return '';

  const afterLabel = text.slice(startM.index + startM[0].length);
  const endM = endRe ? endRe.exec(afterLabel) : null;
  const raw = endM ? afterLabel.slice(0, endM.index) : afterLabel.slice(0, 150);

  return removeLabelNoise(raw);
}

// ══════════════════════════════════════════════════════════════
//  개별 필드 추출기 (텍스트 전체 스캔)
// ══════════════════════════════════════════════════════════════

/** 제품번호: BC\d{4}-{제품코드}-{4자리}-{3자리} 고정 형식 */
function extractBizNo(text) {
  const m = text.match(/BC\d{4}-[A-Z0-9.]+-\d{4}-\d{3}/i);
  return m ? m[0].toUpperCase() : '';
}

/** 증서발행일: "YYYY년 M월 D일" → ISO 날짜 변환 */
function extractDate(text) {
  const m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) return {};
  return {
    issuedDate: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
    year: +m[1],
    month: +m[2],
  };
}

/** 사업명: 증서 하단 [ ] 안 텍스트 */
function extractProject(text) {
  const m = text.match(/[\[【]([^\]】\n]{2,100})[\]】]/);
  return m ? m[1].trim() : '';
}

/**
 * 제품 목록: "세부내역" ~ 첫 번째 "[" 사이 구간을 파싱
 *
 * 규칙 (사용자 지정):
 *   각 줄: (.+?)\s+(\d+)(Mgr|Agt|Dev|Mod|ea)$
 *   제품명에 "Zenius-" 또는 "Performance" 포함 여부로 식별
 */
function extractProducts(text) {
  // "세부 내역" ~ "[사업명]" 사이 구간
  const secStart = text.search(/세부[\s\S]{0,3}내역/);
  if (secStart === -1) {
    // "세부내역"이 없으면 전체에서 제품 패턴 스캔 (폴백)
    return scanProductLines(text);
  }
  const afterSec = text.slice(secStart);
  const secEnd   = afterSec.search(/[\[【][^\]】]{5,}/);  // 5자 이상 괄호 = 프로젝트 이름
  const section  = secEnd >= 0 ? afterSec.slice(0, secEnd) : afterSec;

  return scanProductLines(section);
}

// 주어진 텍스트에서 제품 줄 추출 (공통 로직)
function scanProductLines(text) {
  const PRODUCT_START = /^(Zenius-|Performance)/;
  // 수량+단위: 숫자 뒤 단위 (공백 허용)
  // Case-insensitive 로 Tesseract 오인식 허용
  const QTY_UNIT_RE = /^(.+?)\s+(\d+)\s*(Mgr|Agt|Dev|Mod|ea|Srv|Unit|License)\s*$/i;

  const products = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 헤더 줄 건너뜀
    if (/세부[\s\S]{0,3}내역|수\s*량/.test(line)) continue;
    if (!PRODUCT_START.test(line)) continue;

    const m = QTY_UNIT_RE.exec(line);
    if (m) {
      products.push({ name: m[1].trim(), qty: m[2], unit: m[3], version: '' });
    } else {
      // 수량이 다음 줄에 분리된 경우 (Tesseract 컬럼 분리 읽기)
      const nextLine = lines[i + 1] || '';
      const qm = /^(\d+)\s*(Mgr|Agt|Dev|Mod|ea|Srv|Unit|License)$/i.exec(nextLine);
      if (qm) {
        products.push({ name: line.trim(), qty: qm[1], unit: qm[2], version: '' });
        i++; // 수량 줄 건너뜀
      } else {
        products.push({ name: line.trim(), qty: '', unit: '', version: '' });
      }
    }
  }

  return products;
}

// ══════════════════════════════════════════════════════════════
//  parseCertificateText — 고정 양식 rule-based 파서 (공개 API)
//
//  STAGE 1(PDF.js 텍스트)과 STAGE 2(Tesseract OCR) 모두에서 사용한다.
//
//  지원하는 OCR 읽기 순서:
//    (A) 행 우선: "고객명 증서발행일 2026년 4월 13일 \n 브레인즈컴퍼니 \n ..."
//    (B) 열 우선: "고객명 \n 브레인즈컴퍼니 \n 사업장 주소 \n ..."
//    두 경우 모두 extractBounded 방식으로 동일하게 처리된다.
//
//  정확도 보장 전략:
//    ① bizNo, 날짜, 사업명은 고유 regex로 전체 텍스트 스캔 → 위치 무관
//    ② 고객명: "고객명" ~ "사업장 주소" 구간 → 레이블·날짜·코드 제거 후 남은 값
//    ③ 주소:   "사업장 주소" ~ "세부내역" 구간 → 레이블·날짜·코드 제거 후 남은 값
//    ④ 제품:   "세부내역" ~ "[" 구간에서 라인 파싱 (단위 suffix regex)
// ══════════════════════════════════════════════════════════════

export function parseCertificateText(rawText) {
  const text = normalizeText(rawText);

  // ① 위치 독립적 regex 추출
  const bizNo   = extractBizNo(text);
  const dateInfo = extractDate(text);
  const project  = extractProject(text);
  const products = extractProducts(text);

  // ② 고객명: "고객명" 이후, "사업장 주소" 이전 구간
  const customer = extractBounded(
    text,
    /고객\s*명/,
    /사업장\s*주소|사업\s*장\s*주소/,
  );

  // ③ 주소: "사업장 주소" 이후, "세부내역" 이전 구간
  //    종료 패턴에 "제품번호"는 포함하지 않음 — 같은 줄에 공존할 수 있음
  const address = extractBounded(
    text,
    /사업장\s*주소|사업\s*장\s*주소/,
    /세부[\s\S]{0,3}내역/,
  );

  return {
    customer,
    address,
    region: extractRegion(address),
    ...dateInfo,
    bizNo,
    project,
    products,
  };
}

// ══════════════════════════════════════════════════════════════
//  STAGE 1 — PDF.js 텍스트 레이어 (디지털 PDF)
// ══════════════════════════════════════════════════════════════

async function extractTextItems(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const all = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    all.push(...items.filter(it => it.str?.trim()));
  }
  return all;
}

function groupLines(items, tol = 6) {
  const map = {};
  for (const it of items) {
    const k = Math.round(it.transform[5] / tol) * tol;
    (map[k] = map[k] || []).push(it);
  }
  return Object.entries(map)
    .sort(([ya], [yb]) => +yb - +ya)
    .map(([, its]) => {
      const sorted = [...its].sort((a, b) => a.transform[4] - b.transform[4]);
      return { items: sorted, text: sorted.map(i => i.str).join(' ').trim() };
    })
    .filter(l => l.text);
}

// ══════════════════════════════════════════════════════════════
//  STAGE 2a — PDF 첫 페이지 → Canvas 렌더
// ══════════════════════════════════════════════════════════════

/** PDF 첫 페이지를 Canvas로 렌더링한다.
 *  scale=2.0 → A4 기준 약 1190×1684px, OCR 품질과 속도의 균형점.
 *  TODO: 멀티페이지 증서 지원 시 페이지 범위 파라미터 추가 가능. */
export async function renderPdfToImage(file, scale = 2.0) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

// ══════════════════════════════════════════════════════════════
//  STAGE 2b — Tesseract.js 클라이언트 OCR
// ══════════════════════════════════════════════════════════════

/** Canvas/이미지에서 텍스트 추출 (외부 API 불필요).
 *  kor+eng: 한글 레이블 + 영문 제품 코드(BC..., Zenius-...) 동시 인식.
 *  최초 실행 시 언어 파일 CDN 다운로드 (~13 MB, 이후 캐시됨).
 *  TODO: 자체 서버 배포 환경에서는 createWorker 3번째 인자 langPath를 로컬로 변경. */
export async function runOcr(canvas) {
  const worker = await createWorker('kor+eng');
  try {
    const { data: { text } } = await worker.recognize(canvas);
    return text;
  } finally {
    await worker.terminate();
  }
}

// ══════════════════════════════════════════════════════════════
//  공통 엔트리 빌더
// ══════════════════════════════════════════════════════════════

function hasKeyFields(p) {
  return !!(p.customer || p.bizNo || p.issuedDate);
}

function buildEntry(filename, parsed) {
  const products = parsed.products?.length
    ? parsed.products
    : [{ name: '', qty: '', unit: '', version: '' }];

  // year / month: issuedDate에서 자동 파생 (UI에서 직접 편집하지 않음)
  const isoDate = parsed.issuedDate || '';
  const [yearStr, monthStr] = isoDate ? isoDate.split('-') : ['', ''];

  const address = parsed.address || '';

  return {
    filename,
    customer:   parsed.customer   || '',
    issuedDate: isoDate,
    year:       yearStr  ? +yearStr  : '',
    month:      monthStr ? +monthStr : '',
    bizNo:      parsed.bizNo      || '',
    address,
    region:     parsed.region || extractRegion(address),
    project:    parsed.project    || '',
    industry:   '',
    orgType:    '',
    modules:    extractModulesFromProducts(products),
    products,
  };
}

// ══════════════════════════════════════════════════════════════
//  메인 공개 API
// ══════════════════════════════════════════════════════════════

export async function parseCertificatePdf(file) {
  // ── STAGE 1: PDF.js 텍스트 레이어 ─────────────────────────
  try {
    const items = await extractTextItems(file);
    if (items.length > 0) {
      // PDF 텍스트를 줄로 재조합해 parseCertificateText 에 전달
      // (위치 정보가 있어 정확하지만, 동일 파서를 재사용해 일관성 확보)
      const lines = groupLines(items);
      const rawFromItems = lines.map(l => l.text).join('\n');
      const parsed = parseCertificateText(rawFromItems);
      if (hasKeyFields(parsed)) return buildEntry(file.name, parsed);
    }
  } catch {
    // 암호화 PDF 등 → STAGE 2 진행
  }

  // ── STAGE 2: 이미지 렌더 → Tesseract.js 클라이언트 OCR ────
  try {
    const canvas = await renderPdfToImage(file, 2.0);
    const text   = await runOcr(canvas);
    const parsed = parseCertificateText(text);
    if (hasKeyFields(parsed)) return buildEntry(file.name, parsed);
  } catch {
    // OCR 실패 → STAGE 3
  }

  // ── STAGE 3: 모든 추출 실패 ───────────────────────────────
  // 표준 제품 목록·모듈만 채운 빈 폼. 사용자가 고객명·주소·지역 등을 직접 입력.
  return {
    ...emptyOcrEntry(file.name),
    products: SAMPLE_PRODUCTS.map(p => ({ ...p })),
    modules:  extractModulesFromProducts(SAMPLE_PRODUCTS),
  };
}

// ══════════════════════════════════════════════════════════════
//  파서 검증 헬퍼 (개발용)
//
//  브라우저 콘솔에서 실행:
//    import { verifyCertificateParser } from '.../ocrParser';
//    verifyCertificateParser();
//
//  첨부 증서를 Tesseract가 읽었을 때 가장 일반적으로 나오는
//  "행 우선" OCR 출력을 시뮬레이션하여 기대값과 비교한다.
// ══════════════════════════════════════════════════════════════

export function verifyCertificateParser() {
  // 행 우선(row-first) OCR 시뮬레이션 — Tesseract 가장 일반적 출력
  const MOCK_ROW_FIRST = `
소프트웨어 라이선스 증서

고객명 증서발행일 2026년 4월 13일
브레인즈컴퍼니
사업장  주소 제품번호 BC2026-ZEV8.0-1234-038
서울시 성동구 성수이로 87 성문빌딩 8층

세부 내역 수량
Zenius-EMS Manager 1Mgr
Zenius-SMS Manager 1Mgr
Zenius-SMS Agent for Windows/Linux 40Agt
Zenius-NMS Manager 1Mgr
Zenius-NMS Device License 10Dev
Performance Prediction Module 1Mod
Zenius-DBRD Editor 1ea

[브레인즈컴퍼니 AI 산출물 프로젝트 건]

이 소프트웨어에 포함된 프로그램과 문서 자료, 기록매체 등에 대한 사용권을 위의 제품번호가 부여된 사용자에게 드립니다.
  `;

  // 열 우선(column-first) OCR 시뮬레이션
  const MOCK_COL_FIRST = `
소프트웨어 라이선스 증서

고객명
브레인즈컴퍼니
사업장 주소
서울시 성동구 성수이로 87 성문빌딩 8층

증서발행일 2026년 4월 13일
제품번호 BC2026-ZEV8.0-1234-038

세부 내역 수량
Zenius-EMS Manager 1Mgr
Zenius-SMS Manager 1Mgr
Zenius-SMS Agent for Windows/Linux 40Agt
Zenius-NMS Manager 1Mgr
Zenius-NMS Device License 10Dev
Performance Prediction Module 1Mod
Zenius-DBRD Editor 1ea

[브레인즈컴퍼니 AI 산출물 프로젝트 건]
  `;

  const EXPECTED = {
    customer:   '브레인즈컴퍼니',
    issuedDate: '2026-04-13',
    year:       2026,
    month:      4,
    bizNo:      'BC2026-ZEV8.0-1234-038',
    address:    '서울시 성동구 성수이로 87 성문빌딩 8층',
    project:    '브레인즈컴퍼니 AI 산출물 프로젝트 건',
    products: [
      { name: 'Zenius-EMS Manager',                 qty: '1',  unit: 'Mgr', version: '' },
      { name: 'Zenius-SMS Manager',                 qty: '1',  unit: 'Mgr', version: '' },
      { name: 'Zenius-SMS Agent for Windows/Linux', qty: '40', unit: 'Agt', version: '' },
      { name: 'Zenius-NMS Manager',                 qty: '1',  unit: 'Mgr', version: '' },
      { name: 'Zenius-NMS Device License',          qty: '10', unit: 'Dev', version: '' },
      { name: 'Performance Prediction Module',      qty: '1',  unit: 'Mod', version: '' },
      { name: 'Zenius-DBRD Editor',                 qty: '1',  unit: 'ea',  version: '' },
    ],
  };

  function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    /* eslint-disable no-console */
    console.log(
      `[${ok ? '✓' : '✗'}] ${label}`,
      ok ? '' : `\n  기대: ${JSON.stringify(want)}\n  실제: ${JSON.stringify(got)}`,
    );
    /* eslint-enable no-console */
    return ok;
  }

  function verify(label, text) {
    console.log(`\n── ${label} ──`); /* eslint-disable-line no-console */
    const p = parseCertificateText(text);
    const modules = extractModulesFromProducts(p.products);
    let pass = true;
    pass &= check('customer',   p.customer,   EXPECTED.customer);
    pass &= check('issuedDate', p.issuedDate, EXPECTED.issuedDate);
    pass &= check('year',       p.year,       EXPECTED.year);
    pass &= check('month',      p.month,      EXPECTED.month);
    pass &= check('bizNo',      p.bizNo,      EXPECTED.bizNo);
    pass &= check('address',    p.address,    EXPECTED.address);
    pass &= check('project',    p.project,    EXPECTED.project);
    pass &= check('products',   p.products,   EXPECTED.products);
    pass &= check('modules',    modules,      ['EMS', 'SMS', 'NMS', 'Dashboard']);
    return { pass: !!pass, parsed: p };
  }

  const row = verify('행 우선(row-first) OCR', MOCK_ROW_FIRST);
  const col = verify('열 우선(col-first) OCR', MOCK_COL_FIRST);

  return { rowFirst: row, colFirst: col };
}
