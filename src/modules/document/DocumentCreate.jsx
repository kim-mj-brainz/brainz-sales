/* =============================================================
   문서생성 화면 (담당: 문서생성)
   라이선스 증서 + 납품확인서 동시 생성. 견적서 PDF 업로드.
   매출코드 A12345 / 연번 3자리. 거래처 검색 → 주소 자동입력.
   ============================================================= */
import React, { useState, useRef } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Input, Modal } from '../../common/components.jsx';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { SALES_CODE_DOC } from '../../data/codeMaster.js';
import { CompanySearchPopup, StaffSearchPopup } from './SearchPopups.jsx';
import { extractPdfText } from './pdfText.js';
import { createLicensePptx, downloadBlob } from './licensePptx.js';
import { createInspectionXlsx } from './inspectionXlsx.js';
import { parseQuoteText } from './quoteParser.js';
import { DEFAULT_INSPECTION_MAIL_SETTINGS, sendInspectionMail } from './inspectionMail.js';

export default function DocumentCreate({ creditItems, docCollection }) {
  const { currentUser, logAudit, toast } = useApp();
  const staffCollection = useCollection('documentStaff', []);
  const mailSettingsCollection = useCollection('documentMailSettings', [DEFAULT_INSPECTION_MAIL_SETTINGS]);
  const pdfRef = useRef();
  const [f, setF] = useState({
    quoteNo: '',
    salesCode: '',
    seq: '',
    issueDate: new Date().toISOString().slice(0, 10),
    customer: '',
    address: '',
    project: '',
    sales: '',
    salesPhone: '',
    salesEmail: '',
    engineer: '',
    engineerPhone: '',
    engineerEmail: '',
    vendor: '',
  });
  const [err, setErr] = useState({});
  const [manual, setManual] = useState(false);
  const [products, setProducts] = useState([{ description: '', qty: 1, unit: 'EA' }]);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [pdfCheck, setPdfCheck] = useState({ status: 'idle', message: '', text: '', pageCount: 0, charCount: 0 });
  const [parsedQuote, setParsedQuote] = useState(null);
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState(null);
  const [popup, setPopup] = useState(null); // 'company' | 'sales' | 'engineer'
  const mailSettings = { ...DEFAULT_INSPECTION_MAIL_SETTINGS, ...(mailSettingsCollection.items[0] || {}) };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function onSalesCode(e) {
    const v = e.target.value.toUpperCase();
    if (v === '' || /^[A-Z]\d{0,5}$/.test(v)) setF({ ...f, salesCode: v }); // 영문 1자 + 숫자 5자리
  }
  function onSeq(e) { const v = e.target.value; if (/^\d{0,3}$/.test(v)) setF({ ...f, seq: v }); }

  function getLicenseDocumentNo(issueDate, salesCode, seq) {
    const date = new Date(`${issueDate}T00:00:00`);
    const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
    return `BC${year}-ZEV8.0-${salesCode.toUpperCase()}-${seq}`;
  }

  function getDocumentItems() {
    const manualItems = products
      .map((item) => ({
        description: item.description || item.name || '',
        qty: item.qty,
        unit: item.unit || 'EA',
      }))
      .filter((item) => item.description.trim());

    if (manualItems.length) return manualItems;
    return (parsedQuote?.items || []).map((item) => ({
      description: item.description,
      qty: item.qty,
      unit: item.unit || 'EA',
    }));
  }

  function getDocumentData() {
    return {
      quoteNo: f.quoteNo || parsedQuote?.quoteNo || '',
      issueDate: parsedQuote?.issueDate || f.issueDate,
      customer: f.customer || parsedQuote?.customer || '',
      address: f.address,
      project: f.project || parsedQuote?.project || '',
      contactName: f.sales || parsedQuote?.contactName || f.engineer,
      contactPhone: f.salesPhone || parsedQuote?.contactPhone || f.engineerPhone,
      contactEmail: f.salesEmail || parsedQuote?.contactEmail || f.engineerEmail,
      salesName: f.sales,
      salesEmail: f.salesEmail,
      engineerName: f.engineer,
      engineerEmail: f.engineerEmail,
      salesCode: f.salesCode,
      seq: f.seq,
    };
  }

  function validateDownload(kind, data, items) {
    const missing = [];
    if (!data.customer) missing.push('고객사');
    if (!data.project) missing.push('건명');
    if (kind === 'license' && !SALES_CODE_DOC.test(data.salesCode)) missing.push('매출코드(A12345)');
    if (kind === 'license' && !/^\d{3}$/.test(data.seq)) missing.push('연번(3자리)');
    if (!items.length) missing.push('품목');

    if (missing.length) {
      toast(`${missing.join(', ')} 값이 없어 문서를 생성할 수 없습니다. PDF 검사 결과를 확인하거나 수동입력에 값을 넣어주세요.`, 'err');
      return false;
    }

    return true;
  }

  function applyParsedQuote(parsed) {
    const nextItems = parsed.items.length ? parsed.items : null;

    setParsedQuote(parsed);
    setF((cur) => ({
      ...cur,
      quoteNo: parsed.quoteNo || cur.quoteNo,
      issueDate: parsed.issueDate || cur.issueDate,
      customer: parsed.customer || cur.customer,
      project: parsed.project || cur.project,
      sales: parsed.contactName || cur.sales,
      salesPhone: parsed.contactPhone || cur.salesPhone,
      salesEmail: parsed.contactEmail || cur.salesEmail,
    }));
    if (nextItems) {
      setProducts(nextItems);
      setManual(true);
    }
    setErr((cur) => ({
      ...cur,
      customer: parsed.customer ? undefined : cur.customer,
      project: parsed.project ? undefined : cur.project,
    }));

    return [
      parsed.customer ? `고객사 ${parsed.customer}` : '',
      parsed.project ? `건명 ${parsed.project}` : '',
      parsed.contactName ? `담당자 ${parsed.contactName}` : '',
      parsed.items.length ? `품목 ${parsed.items.length}개` : '',
    ].filter(Boolean).join(', ');
  }

  function selectPdf(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast('PDF 파일만 업로드할 수 있습니다.', 'err');
      return;
    }

    setPdfFile(file);
    setPdfName(file.name);
    setParsedQuote(null);
    setPdfCheck({ status: 'idle', message: '검사를 실행하면 PDF 문자 추출 결과를 확인합니다.', text: '', pageCount: 0, charCount: 0 });
  }

  function onPdf(e) {
    selectPdf(e.target.files[0]);
    e.target.value = '';
  }

  function onPdfDragOver(e) {
    e.preventDefault();
    setDragActive(true);
  }

  function onPdfDragLeave(e) {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    setDragActive(false);
  }

  function onPdfDrop(e) {
    e.preventDefault();
    setDragActive(false);
    selectPdf(e.dataTransfer.files[0]);
  }

  async function inspectPdf() {
    if (!pdfFile) {
      toast('먼저 PDF 파일을 업로드하세요.', 'err');
      return;
    }

    setPdfCheck({ status: 'checking', message: 'PDF 문자를 추출하는 중입니다.', text: '', pageCount: 0, charCount: 0 });
    try {
      const result = await extractPdfText(pdfFile);
      if (result.charCount > 0) {
        const parsed = parseQuoteText(result.text, pdfName);
        const parsedSummary = applyParsedQuote(parsed);
        setPdfCheck({
          status: 'success',
          message: `문자 추출 성공: ${result.pageCount}페이지, ${result.charCount.toLocaleString()}자${parsedSummary ? ` / 자동 반영: ${parsedSummary}` : ''}`,
          text: result.text,
          pageCount: result.pageCount,
          charCount: result.charCount,
        });
        toast('PDF 문자 추출을 확인했습니다.');
      } else {
        setPdfCheck({
          status: 'fail',
          message: '추출된 문자가 없습니다. 스캔본 PDF이거나 텍스트 레이어가 없을 수 있습니다.',
          text: '',
          pageCount: result.pageCount,
          charCount: 0,
        });
        toast('PDF에서 문자를 추출하지 못했습니다.', 'err');
      }
    } catch (error) {
      setPdfCheck({
        status: 'fail',
        message: `PDF 검사 실패: ${error.message || '파일을 읽을 수 없습니다.'}`,
        text: '',
        pageCount: 0,
        charCount: 0,
      });
      toast('PDF 검사 중 오류가 발생했습니다.', 'err');
    }
  }

  async function downloadLicense() {
    try {
      const items = getDocumentItems();
      const data = getDocumentData();
      if (!validateDownload('license', data, items)) return;
      const blob = await createLicensePptx({
        customer: data.customer,
        address: data.address,
        issueDate: data.issueDate,
        project: data.project,
        documentNo: getLicenseDocumentNo(data.issueDate, data.salesCode, data.seq),
        items,
      });
      const customer = data.customer || 'license';
      const safeName = customer.replace(/[\\/:*?"<>|]/g, '_');
      downloadBlob(blob, `${safeName}_license.pptx`);
      toast('라이선스 증서 PPT를 생성했습니다.');
    } catch (error) {
      toast(error.message || '라이선스 증서 생성에 실패했습니다.', 'err');
    }
  }

  async function downloadInspection() {
    try {
      const items = getDocumentItems();
      const data = getDocumentData();
      if (!validateDownload('inspection', data, items)) return;
      if (mailSettings.enabled && !data.engineerEmail) {
        toast('담당엔지니어 이메일이 없어 메일을 보낼 수 없습니다. 담당엔지니어를 선택하세요.', 'err');
        return;
      }
      const blob = await createInspectionXlsx({
        project: data.project,
        customer: data.customer,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        items,
      });
      const customer = data.customer || 'inspection';
      const safeName = customer.replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${safeName}_inspection.xlsx`;
      downloadBlob(blob, filename);
      toast('검수확인서 XLSX를 생성했습니다.');
      const documentNo = SALES_CODE_DOC.test(data.salesCode) && /^\d{3}$/.test(data.seq)
        ? getLicenseDocumentNo(data.issueDate, data.salesCode, data.seq)
        : data.quoteNo;
      const mailResult = await sendInspectionMail({
        settings: mailSettings,
        data,
        items,
        recipient: { name: data.engineerName, email: data.engineerEmail },
        cc: mailSettings.ccSales && data.salesEmail ? [{ name: data.salesName, email: data.salesEmail }] : [],
        blob,
        filename,
        documentNo,
      });
      if (mailResult.status === 'sent') toast('검수확인서를 담당엔지니어에게 메일로 발송했습니다.');
      if (mailResult.status === 'draft') toast('담당엔지니어 메일 초안을 열었습니다.');
    } catch (error) {
      toast(error.message || '검수확인서 생성에 실패했습니다.', 'err');
    }
  }

  function addStaff(role, staff) {
    return staffCollection.add({ ...staff, role }, role === '영업' ? 'SALES' : 'ENG');
  }

  function selectStaff(type, staff) {
    const prefix = type === 'sales' ? 'sales' : 'engineer';
    setF((cur) => ({
      ...cur,
      [prefix]: staff.name,
      [`${prefix}Phone`]: staff.phone || '',
      [`${prefix}Email`]: staff.email || '',
    }));
    setPopup(null);
  }

  function generate() {
    const er = {};
    if (!SALES_CODE_DOC.test(f.salesCode)) er.salesCode = '형식: A12345 (알파벳1+숫자5)';
    if (!/^\d{3}$/.test(f.seq)) er.seq = '숫자 3자리';
    if (!f.customer) er.customer = '고객사명을 입력하세요.';
    if (!f.project) er.project = '프로젝트명을 입력하세요.';
    setErr(er);
    if (Object.keys(er).length) { toast('입력값을 확인하세요.', 'err'); return; }

    // TODO: 문서 생성 API / Google Chat Webhook / 이메일 발송 위치
    const ok = Math.random() > 0.15;
    const now = new Date().toISOString();
    if (ok) {
      const doc = docCollection.add({
        createdAt: now,
        customer: f.customer,
        project: f.project,
        quoteNo: f.quoteNo,
        salesCode: f.salesCode,
        seq: f.seq || '001',
        status: 'SUCCESS',
        files: ['license', 'inspection'],
        ownerId: currentUser.id,
        sales: f.sales,
        salesPhone: f.salesPhone,
        salesEmail: f.salesEmail,
        engineer: f.engineer,
        engineerPhone: f.engineerPhone,
        engineerEmail: f.engineerEmail,
      }, 'DOC');
      logAudit({ category: AUDIT_CATEGORY.DOCUMENT, eventType: 'CREATE', targetType: 'DOCUMENT', targetId: doc.id, targetName: f.project });
      setResult({ ok: true });
      toast('문서가 생성되었습니다.');
    } else {
      const errorId = 'ERR-' + Date.now().toString().slice(-8);
      docCollection.add({
        createdAt: now,
        customer: f.customer,
        project: f.project,
        quoteNo: f.quoteNo,
        salesCode: f.salesCode,
        seq: f.seq || '001',
        status: 'FAIL',
        failReason: '문서 템플릿 처리 오류',
        errorId,
        ownerId: currentUser.id,
        sales: f.sales,
        salesPhone: f.salesPhone,
        salesEmail: f.salesEmail,
        engineer: f.engineer,
        engineerPhone: f.engineerPhone,
        engineerEmail: f.engineerEmail,
      }, 'DOC');
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
        <div
          className={`pdf-dropzone ${dragActive ? 'active' : ''} ${pdfFile ? 'has-file' : ''}`}
          onDragOver={onPdfDragOver}
          onDragLeave={onPdfDragLeave}
          onDrop={onPdfDrop}
          onClick={() => pdfRef.current.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pdfRef.current.click()}
        >
          <div className="pdf-drop-main">
            <strong>{pdfName || 'PDF 파일을 선택하거나 여기에 드래그하세요'}</strong>
            <span>{pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB` : '견적서 PDF만 업로드할 수 있습니다.'}</span>
          </div>
          <Button variant="outline" onClick={(e) => { e.stopPropagation(); pdfRef.current.click(); }}>PDF 선택</Button>
        </div>
        <div className="row pdf-action-row">
          <Button variant="secondary" onClick={inspectPdf} disabled={!pdfFile || pdfCheck.status === 'checking'}>
            {pdfCheck.status === 'checking' ? '검사 중' : '검사'}
          </Button>
          <Button variant="secondary" onClick={() => setManual((m) => !m)}>{manual ? '수동입력 닫기' : '수동입력'}</Button>
        </div>
        {pdfCheck.message && (
          <div className={`pdf-check-result ${pdfCheck.status}`}>
            <div className="pdf-check-title">{pdfCheck.message}</div>
            {pdfCheck.text && <pre>{pdfCheck.text.slice(0, 1000)}</pre>}
          </div>
        )}
      </div>

      {manual && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ fontSize: 14 }}>제품명 / 라이선스 수량</div>
          {products.map((p, i) => (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <input className="input" placeholder="Description" value={p.description || p.name || ''} onChange={(e) => setProducts((ps) => ps.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <input className="input" type="number" min="1" style={{ maxWidth: 100 }} value={p.qty} onChange={(e) => setProducts((ps) => ps.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x))} />
              <input className="input" style={{ maxWidth: 90 }} value={p.unit || 'EA'} onChange={(e) => setProducts((ps) => ps.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
              <Button size="sm" variant="secondary" onClick={() => setProducts((ps) => [...ps, { description: '', qty: 1, unit: 'EA' }])}>＋</Button>
              <Button size="sm" variant="secondary" disabled={products.length <= 1} onClick={() => setProducts((ps) => ps.filter((_, j) => j !== i))}>－</Button>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ fontSize: 14 }}>공통 입력 항목</div>
        <div className="form-grid doc-form-grid">
          <Input label="매출코드" req value={f.salesCode} onChange={onSalesCode} error={err.salesCode} hint="A12345 형식" />
          <Input label="연번" value={f.seq} onChange={onSeq} error={err.seq} hint="숫자 3자리" />
          <Input label="발급일" type="date" value={f.issueDate} onChange={set('issueDate')} />
          <Input label="견적번호" value={f.quoteNo} onChange={set('quoteNo')} />
          <div className="field">
            <label>고객사명 <span className="req">*</span></label>
            <div className="row">
              <input className={`input ${err.customer ? 'invalid' : ''}`} value={f.customer} onChange={set('customer')} placeholder="직접 입력 또는 검색" />
              <Button size="sm" variant="secondary" onClick={() => setPopup('company')}>검색</Button>
            </div>
            {err.customer && <div className="err-text">{err.customer}</div>}
          </div>
          <Input label="고객사 주소" value={f.address} onChange={set('address')} />
          <Input label="프로젝트명" req value={f.project} onChange={set('project')} error={err.project} />
          <ContactField
            label="담당영업"
            name={f.sales}
            phone={f.salesPhone}
            email={f.salesEmail}
            onSearch={() => setPopup('sales')}
          />
          <ContactField
            label="담당엔지니어"
            name={f.engineer}
            phone={f.engineerPhone}
            email={f.engineerEmail}
            onSearch={() => setPopup('engineer')}
          />
          <Input label="매출처명" value={f.vendor} onChange={set('vendor')} />
        </div>
      </div>

      <div className="row">
        <Button variant="secondary" onClick={() => setPreview(true)}>미리보기</Button>
        <Button variant="success" onClick={downloadLicense}>라이선스 PPT 생성</Button>
        <Button variant="success" onClick={downloadInspection}>검수확인서 XLSX 생성</Button>
        <Button variant="success" onClick={generate}>문서 생성</Button>
      </div>

      {preview && (
        <Modal title="문서 미리보기" onClose={() => setPreview(false)} footer={<Button variant="secondary" onClick={() => setPreview(false)}>닫기</Button>}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card card-pad"><b>라이선스 증서 (PPT)</b><p className="hint">{/* TODO: 실제 PPT 미리보기 API */}고객사: {f.customer || '-'}<br />프로젝트: {f.project || '-'}<br />매출코드: {f.salesCode || '-'}</p></div>
            <div className="card card-pad"><b>검수확인서 (XLSX)</b><p className="hint">{/* TODO: 실제 XLSX 미리보기 API */}B4 건명: {f.project || '-'}<br />B6 고객사: {f.customer || '-'}<br />품목: {products.filter((p) => p.description || p.name).map((p) => `${p.description || p.name}×${p.qty}`).join(', ') || '-'}</p></div>
          </div>
        </Modal>
      )}

      {result && (
        <Modal title={result.ok ? '생성 완료' : '생성 실패'} onClose={() => setResult(null)} footer={<Button variant="secondary" onClick={() => setResult(null)}>닫기</Button>}>
          {result.ok ? (
            <div>
              <p style={{ marginBottom: 14 }}>문서가 성공적으로 생성되었습니다.</p>
              <div className="row"><Button variant="success" onClick={downloadLicense}>라이선스 증서 다운로드</Button><Button variant="success" onClick={downloadInspection}>검수확인서 다운로드</Button></div>
            </div>
          ) : (
            <div><p className="err-text" style={{ fontSize: 14 }}>문서 생성에 실패했습니다.</p><p className="muted">오류 ID: <code>{result.errorId}</code></p></div>
          )}
        </Modal>
      )}

      {popup === 'company' && <CompanySearchPopup items={creditItems} onClose={() => setPopup(null)} onSelect={(c) => { setF((cur) => ({ ...cur, customer: c.company, address: c.address })); setPopup(null); }} />}
      {popup === 'sales' && <StaffSearchPopup items={staffCollection.items} role="영업" onAdd={(s) => addStaff('영업', s)} onClose={() => setPopup(null)} onSelect={(s) => selectStaff('sales', s)} />}
      {popup === 'engineer' && <StaffSearchPopup items={staffCollection.items} role="엔지니어" onAdd={(s) => addStaff('엔지니어', s)} onClose={() => setPopup(null)} onSelect={(s) => selectStaff('engineer', s)} />}
    </div>
  );
}

function ContactField({ label, name, phone, email, onSearch }) {
  return (
    <div className="field doc-contact-field">
      <label>{label}</label>
      <div className="row doc-search-row">
        <input className="input" value={name} readOnly placeholder="검색으로 선택" />
        <Button size="sm" variant="secondary" onClick={onSearch}>검색</Button>
      </div>
      <div className="doc-contact-meta">
        <input className="input" value={phone} readOnly placeholder="전화번호" />
        <input className="input" value={email} readOnly placeholder="이메일" />
      </div>
    </div>
  );
}
