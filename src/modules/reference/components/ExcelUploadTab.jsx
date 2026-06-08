/* 기존 데이터 업로드 탭 (레거시 Excel 마이그레이션용)
   흐름: 업로드 → 컬럼 매핑 → 검수/편집 → 저장
   지원: .xlsx / .xls / .xlsm(매크로 미실행, 셀값만 읽기) / .csv
   헤더 행 자동 감지: 최대 20행 스캔, 키워드 3개 이상 일치 시 헤더로 판단 */
import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button, Badge } from '../../../common/components.jsx';
import { AUDIT_CATEGORY } from '../../../common/audit.js';
import { isDuplicate } from '../utils/duplicateCheck.js';

// ══════════════════════════════════════════════════════════════
//  모듈 키워드 파싱
// ══════════════════════════════════════════════════════════════

const KNOWN_MODULES = [
  'EMS', 'SMS', 'NMS', 'NPM', 'VMS', 'DBMS', 'OAM', 'GPM', 'CMS', 'K8s',
  'STMS', 'BMS', 'WNMS', 'Syslog/Trap', 'TMS', 'BRMS', 'APM', 'IMS',
  'FMS', 'RTMS', 'ERMS', 'ITSM', 'SIEM', 'Dashboard',
];

function parseModulesFromText(text) {
  if (!text) return [];
  const s = String(text);
  const found = new Set();
  for (const mod of KNOWN_MODULES) {
    if (mod.includes('/')) {
      const [a] = mod.split('/');
      if (new RegExp(`\\b${a}\\b`, 'i').test(s)) found.add(mod);
    } else {
      if (new RegExp(`\\b${mod}\\b`, 'i').test(s)) found.add(mod);
    }
  }
  return [...found];
}

// ══════════════════════════════════════════════════════════════
//  연도 파싱
// ══════════════════════════════════════════════════════════════

/** "2025.09~2025.12" / "2024년 1월" / "2024" 등 → 4자리 연도 */
function extractYear(raw) {
  if (!raw && raw !== 0) return '';
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) return +s;
  const m = s.match(/(\d{4})/);
  return m ? +m[1] : s;
}

// ══════════════════════════════════════════════════════════════
//  헤더 텍스트 정규화
// ══════════════════════════════════════════════════════════════

/**
 * 셀 텍스트를 정규화한다:
 *   - 줄바꿈·탭 제거
 *   - 전각 공백·NBSP·BOM·Zero-Width Space 제거
 *   - 모든 공백 제거
 *   - 소문자 변환
 *   - 알려진 약어 → 정식 표현 확장
 *
 * 예:
 *   "도입 모듈"       → "도입모듈"
 *   "산업군 1"        → "산업군1"
 *   "고객사 정규화 컬럼" → "고객사정규화컬럼"
 *   "계약년"          → "계약년도"  (약어 확장)
 */
function normH(raw) {
  let s = String(raw ?? '')
    .replace(/[\r\n\t]/g, '')
    .replace(/[　 ﻿​]/g, '')  // 전각 공백, NBSP, BOM, Zero-Width
    .replace(/\s+/g, '')
    .toLowerCase();

  // 알려진 약어 확장
  if (s === '계약년') s = '계약년도';

  return s;
}

// ══════════════════════════════════════════════════════════════
//  헤더 행 자동 감지
// ══════════════════════════════════════════════════════════════

// 감지 기준 키워드 (정규화된 형태)
// 원본: 사업기간, 발주처, 매출액, 도입 모듈, 지역, 산업군 1, 산업군 2, 고객사 정규화 컬럼,
//       코드, 계약년도, 영업담당자, 매출처, 매출내역, 최종구매자, 품명, 분류
const ALL_KW = [
  '사업기간', '발주처', '매출액', '도입모듈', '지역', '산업군1', '산업군2', '고객사정규화컬럼',
  '코드', '계약년도', '영업담당자', '매출처', '매출내역', '최종구매자', '품명', '분류',
];

// 형식 A 특징 키워드 (정규화)
const KW_A = ['사업기간', '도입모듈', '산업군1', '고객사정규화컬럼', '발주처'];
// 형식 B 특징 키워드 (정규화)
const KW_B = ['코드', '계약년도', '영업담당자', '매출내역', '최종구매자'];

/**
 * data(XLSX sheet_to_json header:1 결과)에서 실제 헤더 행을 찾는다.
 * - 최대 20행 스캔
 * - 정규화된 셀 값이 ALL_KW 중 3개 이상 일치하는 첫 번째 행을 헤더로 판단
 * - 타이틀 행("코드 현황" 등 단일 셀 행)은 자동으로 무시됨
 */
function detectHeaderRow(data) {
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const rowNorm = data[i].map(c => normH(c));
    const matchCount = ALL_KW.filter(kw => rowNorm.includes(kw)).length;

    if (matchCount >= 3) {
      const scoreA = KW_A.filter(kw => rowNorm.includes(kw)).length;
      const scoreB = KW_B.filter(kw => rowNorm.includes(kw)).length;
      return {
        rowIdx:     i,
        format:     scoreA >= scoreB ? 'A' : 'B',
        matchCount,
      };
    }
  }
  // 감지 실패 → 첫 행 fallback
  return { rowIdx: 0, format: null, matchCount: 0 };
}

// ══════════════════════════════════════════════════════════════
//  필드 정의
// ══════════════════════════════════════════════════════════════
// normKeys:  형식 미감지일 때 사용하는 기본 우선순위 (앞쪽 = 높은 우선순위)
// normKeysA: 형식 A 전용 우선순위
// normKeysB: 형식 B 전용 우선순위
// autoRe:    normKeys 매칭 실패 시 정규식 fallback

const FIELD_DEFS = [
  {
    key: 'customer', label: '고객명',
    //
    // 형식 A: 고객명 → 최종구매자 → 발주처 → 매출처 → 고객사 정규화 컬럼(최후 수단)
    // 형식 B: 최종구매자 → 매출처 → 고객명
    // 형식 미감지: 최종구매자 → 고객명 → 발주처 → 매출처 → 고객사 정규화 컬럼(최후 수단)
    //
    // ❌ 고객사 정규화 컬럼은 수동 정규화 결과라 오염된 값이 있을 수 있어 최후 수단으로만 사용
    //
    normKeysA: ['고객명', '최종구매자', '발주처', '매출처', '고객사정규화컬럼'],
    normKeysB: ['최종구매자', '매출처', '고객명'],
    normKeys:  ['최종구매자', '고객명', '발주처', '매출처', '고객사정규화컬럼'],
    autoRe:    /최종구매자|고객명?|업체명?|거래처/i,
    hint:      '최종구매자 > 고객명 > 발주처 > 매출처 순 사용 (고객사 정규화 컬럼은 최후 수단)',
  },
  {
    key: 'project', label: '사업명',
    normKeys: ['매출내역', '사업명', '프로젝트명', '과제명', '건명'],
    autoRe:   /사업명|매출내역|프로젝트명?|과제명|건명/i,
    hint:     '형식B: 매출내역',
  },
  {
    key: 'bizNo', label: '사업번호',
    normKeys: ['코드', '사업번호', '수주번호'],
    autoRe:   /^코드$|사업번호|수주번호/i,
    hint:     '형식B: 코드',
  },
  {
    key: 'year', label: '연도',
    normKeys: ['사업기간', '계약년도', '연도', '년도'],
    autoRe:   /사업기간|계약년도?|^연도$|^년도$/i,
    hint:     '형식A: 사업기간 → 첫 4자리 연도 추출 / 형식B: 계약년도',
  },
  {
    key: 'region', label: '지역',
    normKeys: ['지역', '지역명'],
    autoRe:   /^지역$|지역명/i,
  },
  {
    key: 'industry', label: '산업군',
    // 산업군1 우선, 없으면 산업군2 fallback
    normKeys: ['산업군1', '산업군2', '산업군', '산업분류', '업종'],
    autoRe:   /산업군\s*[12]?|산업분류|업종/i,
    hint:     '형식A: 산업군 1 (산업군 2는 미매핑)',
  },
  {
    key: 'orgType', label: '기관/기업유형',
    normKeys: ['분류', '기관유형', '기업유형', '기관구분'],
    autoRe:   /기관.*유형|기업.*유형|기관구분|^분류$/i,
    hint:     '형식B: 분류',
  },
  {
    key: 'sales', label: '담당 영업',
    normKeys: ['영업담당자', '영업담당', '영업사원'],
    autoRe:   /영업담당자?|영업사원|담당.*영업/i,
    hint:     '형식B: 영업담당자',
  },
  {
    key: 'engineer', label: '담당 엔지니어',
    normKeys: ['엔지니어', '기술담당', '담당기술'],
    autoRe:   /엔지니어|기술담당|담당.*기술/i,
  },
  {
    key: 'revenue', label: '매출액',
    normKeys: ['매출액', '매출금액', '계약금액'],
    autoRe:   /매출액|매출금액|계약금액/i,
  },
  {
    key: 'orderer', label: '발주처/매출처',
    normKeys: ['발주처', '매출처', '구매처', '발주자'],
    autoRe:   /발주처|구매처|발주자|매출처/i,
    hint:     '고객명이 비어 있으면 fallback으로 사용',
  },
  {
    key: 'modules', label: '도입 모듈',
    normKeys: ['도입모듈', '모듈', '제품군'],
    autoRe:   /도입.*모듈|모듈|제품군/i,
    hint:     '형식A: 도입 모듈 — 키워드 파싱 적용 (EMS, SMS, NMS, …)',
  },
  {
    key: 'productName', label: '품명',
    normKeys: ['품명', '제품명'],
    autoRe:   /^품명$|제품명/i,
    hint:     '형식B: 품명 — 사업명 fallback으로 사용',
  },
];

// ══════════════════════════════════════════════════════════════
//  유틸
// ══════════════════════════════════════════════════════════════

function colLabel(idx) {
  let s = '';
  let n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/**
 * 헤더 배열 → { fieldKey: colIndexStr } 자동 매핑
 * @param {string[]} headers  원본 헤더 배열
 * @param {'A'|'B'|null} format  감지된 형식 (customer 필드는 형식별 우선순위 적용)
 *
 * 매칭 순서:
 * 1. 형식별 normKeys (normKeysA / normKeysB) 로 정규화 정확 매칭
 * 2. 기본 normKeys 로 정규화 정확 매칭
 * 3. autoRe 정규식으로 원본 헤더 fallback 매칭
 */
function autoDetect(headers, format) {
  const headersNorm = headers.map(normH);
  const result = {};

  for (const { key, normKeysA, normKeysB, normKeys, autoRe } of FIELD_DEFS) {
    let found = -1;

    // 형식별 normKeys 우선 적용
    const formatKeys = (format === 'A' && normKeysA) ? normKeysA
                     : (format === 'B' && normKeysB) ? normKeysB
                     : normKeys;

    if (formatKeys) {
      for (const nk of formatKeys) {
        const idx = headersNorm.indexOf(nk);
        if (idx >= 0) { found = idx; break; }
      }
    }

    // fallback: 정규식으로 원본 헤더 매칭
    if (found < 0 && autoRe) {
      found = headers.findIndex(h => autoRe.test(String(h).trim()));
    }

    if (found >= 0) result[key] = String(found);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
//  매핑 적용
// ══════════════════════════════════════════════════════════════

function applyMapping(rawRows, mapping) {
  return rawRows.map((row, i) => {
    const get = (field) => {
      const ci = mapping[field];
      if (ci === '' || ci === undefined) return '';
      const v = row[+ci];
      return v !== undefined && v !== null ? String(v).trim() : '';
    };

    const modulesRaw = get('modules') || get('productName');
    const modules    = parseModulesFromText(modulesRaw);
    const year       = extractYear(get('year'));

    // 고객명: 형식별 컬럼 우선순위로 이미 매핑된 값 사용
    // 컬럼이 아예 매핑되지 않은 경우에만 orderer(발주처/매출처) fallback
    // 언더스코어(데이터 정규화 아티팩트)를 공백으로 치환하되 전체 값은 유지
    const rawCustomer = get('customer') || get('orderer') || '';
    const customer = rawCustomer.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();

    // 사업명 fallback: project → productName → modulesRaw 앞 50자
    let project = get('project') || get('productName') || '';
    if (!project && modulesRaw) project = modulesRaw.slice(0, 50);

    return {
      _id:      i,
      customer,
      project,
      bizNo:    get('bizNo'),
      year,
      region:   get('region'),
      address:  '',
      industry: get('industry'),
      orgType:  get('orgType'),
      sales:    get('sales'),
      engineer: get('engineer'),
      revenue:  get('revenue'),
      orderer:  get('orderer'),
      modules,
      checked:  true,
      verified: false,
    };
  });
}

// ══════════════════════════════════════════════════════════════
//  컴포넌트
// ══════════════════════════════════════════════════════════════

export default function ExcelUploadTab({ col, logAudit, toast }) {
  const fileRef = useRef();

  const [step,           setStep]           = useState(1);   // 1=업로드, 2=매핑, 3=검수
  const [fileName,       setFileName]       = useState('');
  const [headers,        setHeaders]        = useState([]);
  const [rawRows,        setRawRows]        = useState([]);
  const [detectedFormat, setDetectedFormat] = useState(null);    // 'A' | 'B' | null
  const [headerRowNum,   setHeaderRowNum]   = useState(null);    // 1-based, 디버깅용
  const [matchCount,     setMatchCount]     = useState(0);
  const [autoMap,        setAutoMap]        = useState({});
  const [mapping,        setMapping]        = useState({});
  const [rows,           setRows]           = useState([]);
  const [dupOnly,        setDupOnly]        = useState(false);
  const [limit,          setLimit]          = useState(20);

  // ── 파일 파싱 ─────────────────────────────────────────────────
  async function pickFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'xlsm', 'csv'].includes(ext)) {
      toast('Excel 파일(.xlsx/.xls/.xlsm/.csv)만 업로드할 수 있습니다.', 'err');
      return;
    }
    try {
      const ab = await file.arrayBuffer();
      // xlsm: bookVBA:false → 매크로 VBA 코드 로드 없이 셀 값만 읽음
      const wb = XLSX.read(ab, { type: 'array', bookVBA: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (!data.length) { toast('파일에 데이터가 없습니다.', 'err'); return; }

      // 헤더 행 자동 감지 (최대 20행 스캔)
      const { rowIdx, format, matchCount: mc } = detectHeaderRow(data);
      const hdr = data[rowIdx].map(h => String(h ?? '').trim());
      const rws = data.slice(rowIdx + 1).filter(r => r.some(c => c !== ''));

      if (!hdr.some(h => h)) {
        toast('헤더 행을 감지할 수 없습니다. 파일 구조를 확인해주세요.', 'err');
        return;
      }

      const detected = autoDetect(hdr, format);
      setFileName(file.name);
      setHeaders(hdr);
      setRawRows(rws);
      setDetectedFormat(format);
      setHeaderRowNum(rowIdx + 1);   // 1-based
      setMatchCount(mc);
      setAutoMap(detected);
      setMapping(detected);
      setStep(2);
    } catch {
      toast('파일을 읽는 중 오류가 발생했습니다.', 'err');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag');
    pickFile(e.dataTransfer.files[0]);
  }

  function confirmMapping() {
    setRows(applyMapping(rawRows, mapping));
    setDupOnly(false);
    setLimit(20);
    setStep(3);
  }

  function setRowField(id, k, v) {
    setRows(rs => rs.map(r => r._id === id ? { ...r, [k]: v } : r));
  }

  function removeRow(id) {
    setRows(rs => rs.filter(r => r._id !== id));
  }

  function saveSelected() {
    const toSave = rows.filter(r => r.checked);
    if (!toSave.length) { toast('저장할 행을 체크해주세요.', 'err'); return; }
    toSave.forEach(r => {
      const { _id, checked, verified, ...data } = r;
      const status = (verified && data.customer) ? '검수완료' : '검수미완료';
      col.add({
        ...data,
        status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, 'R');
    });
    logAudit({
      category: AUDIT_CATEGORY.REFERENCE,
      eventType: 'BULK_UPLOAD',
      extra: { count: toSave.length, fileName },
    });
    toast(`${toSave.length}건이 등록되었습니다.`);
    resetUpload();
  }

  function resetUpload() {
    setStep(1);
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setDetectedFormat(null);
    setHeaderRowNum(null);
    setMatchCount(0);
    setAutoMap({});
    setMapping({});
    setRows([]);
    setDupOnly(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function dupCheck(r) {
    const inBatch = rows.some(o => {
      if (o._id === r._id || !r.bizNo || !o.bizNo) return false;
      return r.bizNo === o.bizNo
          || o.bizNo.includes(r.bizNo)
          || r.bizNo.includes(o.bizNo);
    });
    return inBatch || isDuplicate({ ...r, id: '__new__' }, col.items);
  }

  const dupCount     = rows.filter(dupCheck).length;
  const filteredRows = dupOnly ? rows.filter(dupCheck) : rows;
  const displayRows  = filteredRows.slice(0, limit);

  // ════════════════════════════════════════════════════════════
  // RENDER: Step 1 — 업로드
  // ════════════════════════════════════════════════════════════
  if (step === 1) return (
    <div className="card card-pad">
      <div className="card-title" style={{ fontSize: 14 }}>Excel 파일 업로드</div>

      <div style={{
        background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6,
        padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#0369a1', lineHeight: 1.5,
      }}>
        ℹ️ 기존 레거시 엑셀은 최초 마이그레이션 용도로만 사용하며,
        추후 신규 업로드는 제공된 표준 양식을 사용합니다.
      </div>

      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        컬럼명이 다양한 레거시 파일을 지원합니다.
        최대 20행을 스캔해 헤더 행을 자동으로 감지합니다 (형식 A / 형식 B).
      </p>

      <div
        style={{
          border: '2px dashed var(--border)', borderRadius: 8, padding: '40px 24px',
          textAlign: 'center', cursor: 'pointer', color: 'var(--muted)',
        }}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag'); }}
        onDragLeave={e => e.currentTarget.classList.remove('drag')}
        onDrop={handleDrop}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Excel 파일을 드래그하거나 클릭하여 업로드
        </div>
        <div style={{ fontSize: 12 }}>
          .xlsx / .xls / .xlsm / .csv 지원
        </div>
      </div>
      <input
        ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv"
        style={{ display: 'none' }}
        onChange={e => pickFile(e.target.files[0])}
      />
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // RENDER: Step 2 — 컬럼 매핑
  // ════════════════════════════════════════════════════════════
  if (step === 2) {
    const unmappedCount = FIELD_DEFS.filter(f => !mapping[f.key]).length;

    // 형식 배지
    const fmtLabel  = detectedFormat === 'A' ? '형식 A' : detectedFormat === 'B' ? '형식 B' : '미감지';
    const fmtDetail = detectedFormat === 'A'
      ? '고객사 정규화 컬럼·산업군·도입 모듈'
      : detectedFormat === 'B'
      ? '코드·계약년도·영업담당자·매출내역'
      : '수동 매핑 필요';
    const fmtOk = !!detectedFormat;

    return (
      <div className="card card-pad">

        {/* 헤더 */}
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>컬럼 매핑 확인</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span>{fileName} · {rawRows.length}행 · 컬럼 {headers.length}개</span>

              {/* 감지된 형식 */}
              <span style={{
                background: fmtOk ? '#d1fae5' : '#fef3c7',
                color:      fmtOk ? '#065f46' : '#92400e',
                borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
              }}>
                {fmtLabel}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDetail}</span>

              {/* 헤더 행 번호 (디버깅용) */}
              {headerRowNum !== null && (
                <span style={{
                  background: '#f1f5f9', border: '1px solid #cbd5e1',
                  borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#475569',
                }}>
                  헤더: {headerRowNum}행
                  {matchCount > 0 && ` (키워드 ${matchCount}개 일치)`}
                </span>
              )}
            </div>
          </div>
          <div className="spacer" />
          <Button variant="secondary" size="sm" onClick={resetUpload}>다시 선택</Button>
        </div>

        {/* 미매핑 경고 */}
        {unmappedCount > 0 && (
          <div style={{
            background: '#fef3c7', border: '1px solid var(--warning)', borderRadius: 6,
            padding: '8px 14px', marginBottom: 14, fontSize: 13,
          }}>
            ⚠️ {unmappedCount}개 필드가 자동 인식되지 않았습니다.
            수동으로 선택하거나 비워두면 빈 값으로 처리됩니다.
          </div>
        )}

        {/* 매핑 테이블 */}
        <table className="tbl" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th style={{ width: 140 }}>레퍼런스 필드</th>
              <th>Excel 컬럼 선택</th>
              <th style={{ width: 110 }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_DEFS.map(({ key, label, hint }) => {
              const val      = mapping[key] ?? '';
              const isAuto   = val !== '' && autoMap[key] === val;
              const isManual = val !== '' && autoMap[key] !== val;
              return (
                <tr key={key}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{label}</div>
                    {hint && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>
                    )}
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ width: '100%', fontSize: 13 }}
                      value={val}
                      onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value }))}
                    >
                      <option value="">— 미선택 —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={String(i)}>
                          {colLabel(i)}열 — {h || '(빈 헤더)'}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {isAuto   && <span style={{ color: 'var(--success)' }}>✓ 자동인식</span>}
                    {isManual && <span style={{ color: 'var(--text)' }}>✎ 수동 선택</span>}
                    {!val     && <span style={{ color: 'var(--warning)' }}>⚠ 미매핑</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 데이터 미리보기 */}
        {rawRows.length > 0 && (
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)', userSelect: 'none' }}>
              데이터 미리보기 (첫 3행) ▾
            </summary>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="tbl" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    {headers.map((h, i) => (
                      <th key={i} style={{ minWidth: 64 }}>
                        {colLabel(i)}<br />
                        <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{h}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 3).map((row, ri) => (
                    <tr key={ri}>
                      <td>{ri + 1}</td>
                      {headers.map((_, ci) => (
                        <td key={ci} style={{
                          maxWidth: 120, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {String(row[ci] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={resetUpload}>취소</Button>
          <Button onClick={confirmMapping}>미리보기 →</Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Step 3 — 검수 / 편집 / 저장
  // ════════════════════════════════════════════════════════════
  const checkedCount = rows.filter(r => r.checked).length;

  return (
    <div className="card card-pad">

      <div className="toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span style={{ fontWeight: 600 }}>{fileName}</span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            총 {rows.length}행 · 중복 의심 {dupCount}건
          </span>
        </div>
        <label className="row" style={{ gap: 5, fontSize: 13 }}>
          <input type="checkbox" checked={dupOnly}
            onChange={e => { setDupOnly(e.target.checked); setLimit(20); }} />
          중복 의심 건만 보기
        </label>
        <div className="spacer" />
        <Button variant="secondary" size="sm" onClick={() => setStep(2)}>← 매핑 수정</Button>
        <Button variant="secondary" size="sm" onClick={resetUpload}>다시 선택</Button>
        <Button size="sm" onClick={saveSelected}>
          선택 항목 저장 ({checkedCount}건)
        </Button>
      </div>

      {rows.length > 5000 && (
        <div style={{
          background: '#fef3c7', border: '1px solid var(--warning)', borderRadius: 6,
          padding: '8px 14px', marginBottom: 12, fontSize: 13,
        }}>
          ⚠️ 5,000행 초과 파일입니다. 분할 업로드를 권장합니다.
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        ※ 고객명 누락 또는 검수 미체크 행은 저장 시 <b>검수미완료</b>로 처리됩니다.
        중복 의심 행도 저장 가능하며 검수 후 직접 판단하세요.
      </p>

      <div className="table-wrap">
        <table className="tbl" style={{ minWidth: 940 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox"
                  checked={rows.length > 0 && rows.every(r => r.checked)}
                  onChange={e => setRows(rs => rs.map(r => ({ ...r, checked: e.target.checked })))}
                />
              </th>
              <th style={{ width: 58 }}>검수완료</th>
              <th style={{ minWidth: 90 }}>고객명</th>
              <th style={{ minWidth: 110 }}>사업명</th>
              <th style={{ minWidth: 100 }}>사업번호</th>
              <th style={{ width: 62 }}>연도</th>
              <th style={{ width: 72 }}>지역</th>
              <th style={{ width: 80 }}>산업군</th>
              <th style={{ minWidth: 100 }}>도입모듈</th>
              <th style={{ width: 76 }}>중복의심</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr><td colSpan={11} className="empty">표시할 행이 없습니다.</td></tr>
            ) : displayRows.map(r => {
              const dup = dupCheck(r);
              return (
                <tr key={r._id} style={{ background: dup ? '#fffbeb' : undefined }}>
                  <td>
                    <input type="checkbox" checked={r.checked}
                      onChange={e => setRowField(r._id, 'checked', e.target.checked)} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={r.verified}
                      onChange={e => setRowField(r._id, 'verified', e.target.checked)} />
                  </td>
                  <td>
                    <input className="input" value={r.customer}
                      style={{ fontSize: 12, height: 28, minWidth: 80 }}
                      onChange={e => setRowField(r._id, 'customer', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" value={r.project}
                      style={{ fontSize: 12, height: 28, minWidth: 100 }}
                      onChange={e => setRowField(r._id, 'project', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" value={r.bizNo}
                      style={{ fontSize: 12, height: 28, minWidth: 90 }}
                      onChange={e => setRowField(r._id, 'bizNo', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" value={r.year} type="number"
                      style={{ fontSize: 12, height: 28, width: 58 }}
                      onChange={e => setRowField(r._id, 'year', parseInt(e.target.value, 10) || '')} />
                  </td>
                  <td>
                    <input className="input" value={r.region}
                      style={{ fontSize: 12, height: 28, width: 68 }}
                      onChange={e => setRowField(r._id, 'region', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" value={r.industry}
                      style={{ fontSize: 12, height: 28, width: 76 }}
                      onChange={e => setRowField(r._id, 'industry', e.target.value)} />
                  </td>
                  <td>
                    {r.modules?.length
                      ? r.modules.map(m => <span key={m} className="tag">{m}</span>)
                      : <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td>{dup && <Badge color="red">중복의심</Badge>}</td>
                  <td>
                    <Button size="sm" variant="danger" onClick={() => removeRow(r._id)}>삭제</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredRows.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button variant="secondary" size="sm" onClick={() => setLimit(l => l + 20)}>
            더 보기 ({filteredRows.length - limit}건 남음)
          </Button>
        </div>
      )}
    </div>
  );
}
