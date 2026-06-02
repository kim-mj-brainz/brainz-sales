/* =============================================================
   문서생성 화면 (담당: 문서생성)
   라이선스 증서 + 납품확인서 동시 생성. 견적서 PDF 업로드.
   매출코드 A12345 / 연번 3자리. 거래처 검색 → 주소 자동입력.
   ============================================================= */
import React, { useState, useRef } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Modal } from '../../common/components.jsx';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { SALES_CODE_DOC } from '../../data/codeMaster.js';
import { SEED_STAFF } from '../../data/seedData.js';
import { CompanySearchPopup, StaffSearchPopup } from './SearchPopups.jsx';

export default function DocumentCreate({ creditItems, docCollection }) {
  const { currentUser, logAudit, toast } = useApp();
  const pdfRef = useRef();
  const [f, setF] = useState({ salesCode: '', seq: '', issueDate: new Date().toISOString().slice(0, 10), customer: '', address: '', project: '', engineer: '', vendor: '' });
  const [err, setErr] = useState({});
  const [manual, setManual] = useState(false);
  const [products, setProducts] = useState([{ name: '', qty: 1 }]);
  const [pdfName, setPdfName] = useState('');
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState(null);
  const [popup, setPopup] = useState(null); // 'company' | 'engineer'

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function onSalesCode(e) {
    const v = e.target.value.toUpperCase();
    if (v === '' || /^[A-Z]?\d{0,5}$/.test(v)) setF({ ...f, salesCode: v }); // 형식 외 입력 차단
  }
  function onSeq(e) { const v = e.target.value; if (/^\d{0,3}$/.test(v)) setF({ ...f, seq: v }); }

  function onPdf(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) { toast('PDF 파일만 업로드할 수 있습니다.', 'err'); e.target.value = ''; return; }
    setPdfName(file.name);
  }

  function generate() {
    const er = {};
    if (!SALES_CODE_DOC.test(f.salesCode)) er.salesCode = '형식: A12345 (알파벳1+숫자5)';
    if (!f.customer) er.customer = '고객사명을 입력하세요.';
    if (!f.project) er.project = '프로젝트명을 입력하세요.';
    setErr(er);
    if (Object.keys(er).length) { toast('입력값을 확인하세요.', 'err'); return; }

    // TODO: 문서 생성 API / Google Chat Webhook / 이메일 발송 위치
    const ok = Math.random() > 0.15;
    const now = new Date().toISOString();
    if (ok) {
      const doc = docCollection.add({ createdAt: now, customer: f.customer, project: f.project, salesCode: f.salesCode, seq: f.seq || '001', status: 'SUCCESS', files: ['license', 'delivery'], ownerId: currentUser.id }, 'DOC');
      logAudit({ category: AUDIT_CATEGORY.DOCUMENT, eventType: 'CREATE', targetType: 'DOCUMENT', targetId: doc.id, targetName: f.project });
      setResult({ ok: true });
      toast('문서가 생성되었습니다.');
    } else {
      const errorId = 'ERR-' + Date.now().toString().slice(-8);
      docCollection.add({ createdAt: now, customer: f.customer, project: f.project, salesCode: f.salesCode, seq: f.seq || '001', status: 'FAIL', failReason: '문서 템플릿 처리 오류', errorId, ownerId: currentUser.id }, 'DOC');
      logAudit({ category: AUDIT_CATEGORY.DOCUMENT, eventType: 'CREATE', result: 'FAIL', failReason: 'TEMPLATE_ERROR', targetName: f.project });
      setResult({ ok: false, errorId });
    }
  }

  return (
    <div>
      <div className="card-title">문서생성 <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· 라이선스 증서 + 납품확인서 동시 생성</span></div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ fontSize: 14 }}>견적서 PDF 업로드</div>
        <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={onPdf} />
        <div className="row">
          <Button variant="outline" onClick={() => pdfRef.current.click()}>PDF 선택</Button>
          {pdfName && <span className="tag" style={{ fontSize: 13 }}>{pdfName}</span>}
          <div className="spacer" />
          <Button variant="secondary" onClick={() => setManual((m) => !m)}>{manual ? '수동입력 닫기' : '수동입력'}</Button>
        </div>
      </div>

      {manual && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ fontSize: 14 }}>제품명 / 라이선스 수량</div>
          {products.map((p, i) => (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <input className="input" placeholder="제품명" value={p.name} onChange={(e) => setProducts((ps) => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <input className="input" type="number" min="1" style={{ maxWidth: 100 }} value={p.qty} onChange={(e) => setProducts((ps) => ps.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x))} />
              <Button size="sm" variant="secondary" onClick={() => setProducts((ps) => [...ps, { name: '', qty: 1 }])}>＋</Button>
              <Button size="sm" variant="secondary" disabled={products.length <= 1} onClick={() => setProducts((ps) => ps.filter((_, j) => j !== i))}>－</Button>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ fontSize: 14 }}>공통 입력 항목</div>
        <div className="form-grid">
          <Input label="매출코드" req value={f.salesCode} onChange={onSalesCode} error={err.salesCode} hint="A12345 형식" />
          <Input label="연번" value={f.seq} onChange={onSeq} hint="숫자 3자리" />
          <Input label="발급일" type="date" value={f.issueDate} onChange={set('issueDate')} />
          <div className="field">
            <label>고객사명 <span className="req">*</span></label>
            <div className="row">
              <input className={`input ${err.customer ? 'invalid' : ''}`} value={f.customer} onChange={set('customer')} placeholder="직접 입력 또는 검색" />
              <Button size="sm" variant="secondary" onClick={() => setPopup('company')}>검색</Button>
            </div>
            {err.customer && <div className="err-text">{err.customer}</div>}
          </div>
          <Input label="고객사 주소" value={f.address} onChange={set('address')} className="full" />
          <Input label="프로젝트명" req value={f.project} onChange={set('project')} error={err.project} />
          <div className="field">
            <label>담당엔지니어</label>
            <div className="row">
              <input className="input" value={f.engineer} readOnly placeholder="검색으로 선택" />
              <Button size="sm" variant="secondary" onClick={() => setPopup('engineer')}>검색</Button>
            </div>
          </div>
          <Input label="매출처명" value={f.vendor} onChange={set('vendor')} />
        </div>
      </div>

      <div className="row">
        <Button variant="secondary" onClick={() => setPreview(true)}>미리보기</Button>
        <Button variant="success" onClick={generate}>문서 생성</Button>
      </div>

      {preview && (
        <Modal title="문서 미리보기" onClose={() => setPreview(false)} footer={<Button variant="secondary" onClick={() => setPreview(false)}>닫기</Button>}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card card-pad"><b>라이선스 증서 (PPT)</b><p className="hint">{/* TODO: 실제 PPT 미리보기 API */}고객사: {f.customer || '-'}<br />프로젝트: {f.project || '-'}<br />매출코드: {f.salesCode || '-'}</p></div>
            <div className="card card-pad"><b>납품확인서 (XLS)</b><p className="hint">{/* TODO: 실제 XLS 미리보기 API */}발급일: {f.issueDate}<br />제품: {products.filter((p) => p.name).map((p) => `${p.name}×${p.qty}`).join(', ') || '-'}</p></div>
          </div>
        </Modal>
      )}

      {result && (
        <Modal title={result.ok ? '생성 완료' : '생성 실패'} onClose={() => setResult(null)} footer={<Button variant="secondary" onClick={() => setResult(null)}>닫기</Button>}>
          {result.ok ? (
            <div>
              <p style={{ marginBottom: 14 }}>문서가 성공적으로 생성되었습니다.</p>
              <div className="row"><Button variant="success" onClick={() => toast('라이선스 증서 다운로드 (더미)')}>라이선스 증서 다운로드</Button><Button variant="success" onClick={() => toast('납품확인서 다운로드 (더미)')}>납품확인서 다운로드</Button></div>
            </div>
          ) : (
            <div><p className="err-text" style={{ fontSize: 14 }}>문서 생성에 실패했습니다.</p><p className="muted">오류 ID: <code>{result.errorId}</code></p></div>
          )}
        </Modal>
      )}

      {popup === 'company' && <CompanySearchPopup items={creditItems} onClose={() => setPopup(null)} onSelect={(c) => { setF((cur) => ({ ...cur, customer: c.company, address: c.address })); setPopup(null); }} />}
      {popup === 'engineer' && <StaffSearchPopup items={SEED_STAFF} role="엔지니어" onClose={() => setPopup(null)} onSelect={(s) => { setF((cur) => ({ ...cur, engineer: s.name })); setPopup(null); }} />}
    </div>
  );
}
