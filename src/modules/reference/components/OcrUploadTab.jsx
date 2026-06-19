/* 라이선스 증서 OCR 등록 탭
   흐름: PDF 업로드 → OCR 추출(로딩) → 증서별 검수 → 저장 */
import React, { useState, useRef } from 'react';
import { Button, Input, Modal, Spinner } from '../../../common/components.jsx';
import { AUDIT_CATEGORY } from '../../../common/audit.js';
import { useApp } from '../../../common/AppContext.jsx';
import { EMS_SUB_MODULES } from '../constants/moduleOptions.js';
import { isDuplicate } from '../utils/duplicateCheck.js';
import { parseCertificatePdf, extractRegion } from '../utils/ocrParser.js';
import ModuleMultiSelect from './ModuleMultiSelect.jsx';

const REQUIRED_FIELDS = ['customer', 'issuedDate', 'bizNo', 'address', 'region', 'project', 'industry', 'orgType'];
const REQUIRED_LABELS = {
  customer:   '고객명',
  issuedDate: '증서발행일',
  bizNo:      '제품번호/사업번호',
  address:    '주소',
  region:     '지역',
  project:    '사업명',
  industry:   '산업군',
  orgType:    '기관/기업 유형',
};

export default function OcrUploadTab({ col, logAudit, toast }) {
  const { master } = useApp();
  const industryOptions = master?.INDUSTRY || [];
  const orgTypeOptions  = master?.ORG_TYPE  || [];
  const dropRef  = useRef();
  const inputRef = useRef();

  const [files,   setFiles]   = useState([]);
  const [step,    setStep]    = useState(1);   // 1=업로드, 2=검수
  const [entries, setEntries] = useState([]);
  const [idx,     setIdx]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inspected,   setInspected]   = useState(false);

  const entry = entries[idx] || {};
  const isDup = entry.bizNo
    ? isDuplicate({ id: '__ocr__', bizNo: entry.bizNo }, col.items)
    : false;

  /* 파일 추가 — PDF만 허용, 기존 파일 유지 */
  function addFiles(fileList) {
    const arr     = Array.from(fileList);
    const pdfs    = arr.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    const notPdfs = arr.filter((f) => !f.name.toLowerCase().endsWith('.pdf'));
    if (notPdfs.length > 0) toast('레퍼런스 증서 PDF만 올릴 수 있습니다.', 'err');
    setFiles((prev) => [...prev, ...pdfs].slice(0, 10));
  }

  function removeFile(i) { setFiles((fs) => fs.filter((_, j) => j !== i)); }

  function handleDrop(e) {
    e.preventDefault();
    dropRef.current?.classList.remove('drag');
    addFiles(e.dataTransfer.files);
  }

  /* OCR 추출 시작 — PDF.js로 실제 텍스트 추출
     TODO: 외부 OCR API 연동 시 parseCertificatePdf를 API 호출로 교체 */
  async function startOcr() {
    if (!files.length) return;
    setLoading(true);
    setIdx(0);
    try {
      const parsed = await Promise.all(files.map((f) => parseCertificatePdf(f)));
      setEntries(parsed);
      setErrors({});
      setInspected(false);
      setStep(2);
    } catch {
      toast('PDF 파싱 중 오류가 발생했습니다.', 'err');
    } finally {
      setLoading(false);
    }
  }

  /* 현재 항목 필드 수정
     issuedDate 변경 시 year/month 자동 파생 (UI에서 별도 편집 불필요)
     address 변경 시 region 자동 파생 (수정 가능) */
  function setField(k, v) {
    setEntries((es) => es.map((e, i) => {
      if (i !== idx) return e;
      const update = { ...e, [k]: v };
      if (k === 'issuedDate' && v) {
        const [y, m] = v.split('-');
        update.year  = y ? +y : '';
        update.month = m ? +m : '';
      }
      if (k === 'address') {
        update.region = extractRegion(v);
      }
      return update;
    }));
    if (errors[k]) setErrors((er) => { const n = { ...er }; delete n[k]; return n; });
  }

  function setProductField(pi, k, v) {
    setEntries((es) => es.map((e, i) => {
      if (i !== idx) return e;
      return { ...e, products: e.products.map((p, j) => j === pi ? { ...p, [k]: v } : p) };
    }));
  }

  function addProduct() {
    setEntries((es) => es.map((e, i) => i === idx
      ? { ...e, products: [...e.products, { name: '', qty: '', unit: '', version: '' }] }
      : e
    ));
  }

  function removeProduct(pi) {
    setEntries((es) => es.map((e, i) => i === idx
      ? { ...e, products: e.products.filter((_, j) => j !== pi) }
      : e
    ));
  }

  /* 저장 전 필수값 검증 */
  function validate() {
    const errs = {};
    REQUIRED_FIELDS.forEach((k) => {
      if (!entry[k]) errs[k] = `${REQUIRED_LABELS[k]}을(를) 입력해주세요.`;
    });
    if (!entry.modules || entry.modules.length === 0) {
      errs.modules = '도입 모듈을 1개 이상 선택해주세요.';
    } else if (
      entry.modules.includes('EMS') &&
      !EMS_SUB_MODULES.some((m) => entry.modules.includes(m))
    ) {
      errs.modules = 'EMS를 선택한 경우 하위 모듈을 1개 이상 선택해야 합니다.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function openConfirm() {
    if (!validate()) return;
    setInspected(false);
    setConfirmOpen(true);
  }

  /* 검수 확인 후 저장 */
  function saveEntry() {
    const { filename, ...data } = entry;
    col.add({
      ...data,
      status: '검수완료',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'R');
    logAudit({
      category: AUDIT_CATEGORY.REFERENCE,
      eventType: 'OCR_REGISTER',
      targetType: 'REFERENCE',
      targetName: entry.customer,
      extra: { filename, bizNo: entry.bizNo },
    });
    toast(`"${entry.customer}" 증서가 등록되었습니다.`);
    setConfirmOpen(false);
    setInspected(false);

    if (idx < entries.length - 1) {
      setIdx((i) => i + 1);
      setErrors({});
    } else {
      resetAll();
    }
  }

  /* 현재 증서 목록에서 제외 */
  function excludeEntry() {
    const next = entries.filter((_, i) => i !== idx);
    if (next.length === 0) {
      resetAll();
      return;
    }
    setEntries(next);
    setIdx((i) => Math.min(i, next.length - 1));
    setErrors({});
    setInspected(false);
  }

  function resetAll() {
    setStep(1);
    setFiles([]);
    setEntries([]);
    setIdx(0);
    setErrors({});
  }

  /* OCR 처리 중 로딩 화면 */
  if (loading) return (
    <div className="card card-pad" style={{ textAlign: 'center', padding: 60 }}>
      <Spinner />
      <p className="muted" style={{ marginTop: 12 }}>OCR 추출 중... ({files.length}개 파일)</p>
      <p style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
        스캔 PDF는 브라우저 OCR(Tesseract.js)을 실행합니다.
        최초 실행 시 언어 파일(kor+eng, ~13 MB) 다운로드로 30초 내외 소요될 수 있습니다.
      </p>
    </div>
  );

  /* ── Step 1: PDF 업로드 ── */
  if (step === 1) return (
    <div className="card card-pad">
      <div className="card-title" style={{ fontSize: 14 }}>증서 PDF 업로드 (최대 10개)</div>
      <div
        ref={dropRef}
        style={{
          border: '2px dashed var(--border)', borderRadius: 8,
          padding: '40px 24px', textAlign: 'center', cursor: 'pointer', color: 'var(--muted)',
        }}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); dropRef.current.classList.add('drag'); }}
        onDragLeave={() => dropRef.current.classList.remove('drag')}
        onDrop={handleDrop}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>PDF 파일을 드래그하거나 클릭하여 업로드</div>
        <div style={{ fontSize: 12 }}>PDF 형식만 허용 · 최대 10개</div>
      </div>
      <input
        ref={inputRef} type="file" accept=".pdf" multiple
        style={{ display: 'none' }}
        onChange={(e) => addFiles(e.target.files)}
      />

      {files.length > 0 && (
        <>
          <div style={{ marginTop: 12, marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
            업로드 목록 ({files.length} / 10)
          </div>
          {files.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, marginTop: 6,
            }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{(f.size / 1024).toFixed(1)} KB</div>
              </div>
              <Button size="sm" variant="danger" onClick={() => removeFile(i)}>삭제</Button>
            </div>
          ))}
          <div style={{ marginTop: 16 }}>
            <Button onClick={startOcr}>OCR 추출 및 검수 시작 ({files.length}개)</Button>
          </div>
        </>
      )}
    </div>
  );

  /* ── Step 2: OCR 결과 검수 ── */
  return (
    <div className="card card-pad">
      {/* 증서 네비게이션 */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Button variant="secondary" disabled={idx === 0} onClick={() => { setIdx((i) => i - 1); setErrors({}); }}>
          ‹ 이전
        </Button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {entry.filename} ({idx + 1} / {entries.length})
        </span>
        <Button variant="secondary" disabled={idx === entries.length - 1} onClick={() => { setIdx((i) => i + 1); setErrors({}); }}>
          다음 ›
        </Button>
      </div>

      {/* 중복 의심 알림 */}
      {isDup && (
        <div style={{
          background: '#fef3c7', border: '1px solid var(--warning)', borderRadius: 6,
          padding: '10px 16px', marginBottom: 14, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ⚠️ <b>중복 의심</b> — 동일한 사업번호가 이미 등록되어 있습니다. 검수 후 판단해주세요.
        </div>
      )}

      {/* 기본 정보 폼
          year / month는 UI에 표시하지 않음 — issuedDate 저장 시 자동 파생됨 */}
      <div className="form-grid">
        <Input label="고객명"           req value={entry.customer   || ''} onChange={(e) => setField('customer',   e.target.value)} error={errors.customer} />
        <Input label="증서발행일"       req type="date" value={entry.issuedDate || ''} onChange={(e) => setField('issuedDate', e.target.value)} error={errors.issuedDate} />
        <Input label="제품번호/사업번호" req value={entry.bizNo    || ''} onChange={(e) => setField('bizNo',    e.target.value)} error={errors.bizNo} />
        <Input label="사업명"           req value={entry.project  || ''} onChange={(e) => setField('project',  e.target.value)} error={errors.project} />
        <Input label="주소" req className="full"
               value={entry.address || ''} onChange={(e) => setField('address', e.target.value)} error={errors.address} />
        <Input label="지역" req value={entry.region || ''} onChange={(e) => setField('region', e.target.value)} error={errors.region}
               hint="주소 변경 시 자동 갱신" />
        <Input label="산업군" req as="select" value={entry.industry || ''} onChange={(e) => setField('industry', e.target.value)} error={errors.industry}>
          <option value="">선택</option>
          {industryOptions.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="기관/기업 유형" req as="select" value={entry.orgType || ''} onChange={(e) => setField('orgType', e.target.value)} error={errors.orgType}>
          <option value="">선택</option>
          {orgTypeOptions.map((x) => <option key={x}>{x}</option>)}
        </Input>
      </div>

      {/* 도입 모듈 */}
      <div className="field">
        <label>도입 모듈 <span className="req">*</span></label>
        <ModuleMultiSelect
          selected={entry.modules || []}
          onChange={(v) => setField('modules', v)}
          placeholder="모듈 선택 (1개 이상 필수)..."
        />
        {errors.modules && <div className="err-text">{errors.modules}</div>}
      </div>

      {/* 제품 상세 */}
      <div className="field">
        <label>제품 상세</label>
        {(entry.products || []).map((p, pi) => (
          <div key={pi} className="row" style={{ marginBottom: 6, gap: 6 }}>
            <input className="input" placeholder="제품명"  value={p.name    || ''} onChange={(e) => setProductField(pi, 'name',    e.target.value)} style={{ flex: 3 }} />
            <input className="input" placeholder="수량"    value={p.qty     || ''} onChange={(e) => setProductField(pi, 'qty',     e.target.value)} style={{ flex: 1 }} type="number" />
            <input className="input" placeholder="단위"    value={p.unit    || ''} onChange={(e) => setProductField(pi, 'unit',    e.target.value)} style={{ flex: 1 }} />
            <input className="input" placeholder="버전"    value={p.version || ''} onChange={(e) => setProductField(pi, 'version', e.target.value)} style={{ flex: 1 }} />
            <Button size="sm" variant="danger" disabled={(entry.products || []).length <= 1} onClick={() => removeProduct(pi)}>－</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={addProduct} style={{ marginTop: 4 }}>+ 제품 추가</Button>
      </div>

      {/* 액션 버튼 */}
      <div className="row" style={{ marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
        <Button variant="secondary" onClick={resetAll}>처음으로</Button>
        <div className="row" style={{ gap: 8 }}>
          <Button
            variant="danger"
            onClick={excludeEntry}
            title="이 증서를 목록에서 제외합니다"
          >
            🗑 이 증서 제외
          </Button>
          <Button onClick={openConfirm}>저장</Button>
        </div>
      </div>

      {/* 검수 확인 모달 */}
      {confirmOpen && (
        <Modal
          title="저장 전 검수 확인"
          width={420}
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>취소</Button>
              <Button disabled={!inspected} onClick={saveEntry}>등록</Button>
            </>
          }
        >
          {isDup && (
            <div style={{
              background: '#fef3c7', border: '1px solid var(--warning)', borderRadius: 6,
              padding: '10px 14px', marginBottom: 14, fontSize: 13,
            }}>
              ⚠️ 중복 의심 건입니다. 확인 후 등록해주세요.
            </div>
          )}
          <p style={{ marginBottom: 14, fontSize: 13, color: 'var(--muted)' }}>
            해당 증서 정보를 레퍼런스로 등록합니다. 검수 완료 여부를 확인해주세요.
          </p>
          <label className="row" style={{ gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={inspected} onChange={(e) => setInspected(e.target.checked)} />
            검수가 완료되었습니다
          </label>
        </Modal>
      )}
    </div>
  );
}
