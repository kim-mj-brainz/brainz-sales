/* =============================================================
   생성이력 / 거래처관리(신용등급) (담당: 문서생성)
   생성이력: 최근 1개월 기본, 검색, 성공 다운로드 / 실패사유 팝업
   거래처관리: [조회 탭] 신용등급 조회 + 조회요청 / [관리 탭] 등록(권한)
   ============================================================= */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { apiLoad, apiSave, uid } from '../../common/store.js';
import { Button, Input, Modal, Badge, Table, Pagination } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { CREDIT_GRADES, SALES_CODE_DOC } from '../../data/codeMaster.js';
import { DEFAULT_INSPECTION_MAIL_SETTINGS, buildCreditInputUrl, createCreditLookupRequest, sendCreditGoogleChatWebhook } from './inspectionMail.js';
import { createLicensePptx, downloadBlob } from './licensePptx.js';
import { createInspectionXlsx } from './inspectionXlsx.js';

function safeFileName(value, fallback) {
  return String(value || fallback || 'document').replace(/[\\/:*?"<>|]/g, '_');
}

function sameCompanyName(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function sameCollectionItem(left, right) {
  const leftId = String(left?.id || '').trim();
  const rightId = String(right?.id || '').trim();
  if (leftId && rightId) return leftId === rightId;
  return sameCompanyName(left?.company || left?.customer, right?.company || right?.customer);
}

function normalizeMonthValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }

  const raw = String(value || '').trim();
  if (!raw) return '';

  const excelSerial = Number(raw);
  if (/^\d+(\.\d+)?$/.test(raw) && excelSerial > 20000) {
    const date = new Date(Math.round((excelSerial - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
  }

  const match = raw.match(/(\d{4})\D{0,3}(\d{1,2})/);
  if (!match) return raw;
  return `${match[1]}-${match[2].padStart(2, '0')}`;
}

function FullCompanyName({ value, clickable = false, onClick }) {
  const content = value || '-';
  return (
    <span
      className={clickable ? 'clickable' : undefined}
      title={content}
      onClick={onClick}
      style={{ whiteSpace: 'normal', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
    >
      {content}
    </span>
  );
}

function monthInputValue(value) {
  const normalized = normalizeMonthValue(value);
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : '';
}

function pickExcelValue(row, keys) {
  const entries = Object.entries(row || {});
  const normalize = (value) => String(value || '').replace(/\s/g, '').toLowerCase();
  for (const key of keys) {
    const direct = row?.[key];
    if (String(direct ?? '').trim()) return direct;
  }
  const found = entries.find(([key]) => keys.some((target) => normalize(key) === normalize(target)));
  return found ? found[1] : '';
}

function creditFromExcelRow(row) {
  const company = String(pickExcelValue(row, ['회사명', '고객사명', 'company', 'Company']) || '').trim();
  if (!company) return null;

  return {
    company,
    ceo: String(pickExcelValue(row, ['대표자명', '대표자', 'ceo', 'CEO']) || '').trim(),
    grade: String(pickExcelValue(row, ['신용등급', '등급', 'grade', 'Grade']) || 'A').trim().toUpperCase(),
    expireMonth: normalizeMonthValue(pickExcelValue(row, ['만료월', '만료일', 'expireMonth', 'Expire Month'])),
    address: String(pickExcelValue(row, ['주소', '회사 주소', 'address', 'Address']) || '').trim(),
    bizNo: String(pickExcelValue(row, ['사업자번호', '사업자 등록번호', 'bizNo', 'Business No']) || '').trim(),
  };
}

function getHistoryItems(record) {
  return (record.items || record.products || [])
    .map((item) => ({
      item: item.item || item.code || '',
      description: item.description || item.name || '',
      qty: item.qty,
      unit: item.unit || 'EA',
    }))
    .filter((item) => String(item.description || '').trim());
}

function getHistoryDocumentNo(record) {
  if (record.documentNo) return record.documentNo;
  if (!SALES_CODE_DOC.test(record.salesCode || '') || !/^\d{3}$/.test(record.seq || '')) return record.quoteNo || '';

  const dateSource = record.issueDate || String(record.createdAt || '').slice(0, 10);
  const date = new Date(`${dateSource}T00:00:00`);
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  return `BC${year}-ZEV8.0-${record.salesCode.toUpperCase()}-${record.seq}`;
}

/* ---------- 생성이력 ---------- */
export function DocHistory({ docCollection }) {
  const { currentUser } = useApp();
  const [q, setQ] = useState('');
  const [failModal, setFailModal] = useState(null);
  const { toast } = useApp();

  // 권한: USER 는 본인 것만
  const visible = useMemo(() => {
    const all = docCollection.items;
    if (hasPermission(currentUser.role, 'document:viewAll')) return all;
    return all.filter((d) => d.ownerId === currentUser.id);
  }, [docCollection.items, currentUser]);

  const filtered = visible.filter((d) => `${d.customer}${d.project}${d.salesCode}`.includes(q));

  async function downloadHistoryLicense(record) {
    try {
      const items = getHistoryItems(record);
      if (!items.length) {
        toast('이 이력에는 품목 정보가 없어 다시 받을 수 없습니다. 문서생성에서 다시 발급하면 이후 이력은 재다운로드됩니다.', 'err');
        return;
      }
      const blob = await createLicensePptx({
        customer: record.customer,
        address: record.address,
        issueDate: record.issueDate,
        project: record.project,
        documentNo: getHistoryDocumentNo(record),
        items,
      });
      downloadBlob(blob, `${safeFileName(record.customer, 'license')}_license.pptx`);
      toast('라이선스 증서를 다시 생성했습니다.');
    } catch (error) {
      toast(error.message || '라이선스 증서 재다운로드에 실패했습니다.', 'err');
    }
  }

  async function downloadHistoryInspection(record) {
    try {
      const items = getHistoryItems(record);
      if (!items.length) {
        toast('이 이력에는 품목 정보가 없어 다시 받을 수 없습니다. 문서생성에서 다시 발급하면 이후 이력은 재다운로드됩니다.', 'err');
        return;
      }
      const blob = await createInspectionXlsx({
        project: record.project,
        customer: record.customer,
        contactName: record.contactName || record.sales,
        contactPhone: record.contactPhone || record.salesPhone,
        contactEmail: record.contactEmail || record.salesEmail,
        items,
      });
      downloadBlob(blob, `${safeFileName(record.customer, 'inspection')}_inspection.xlsx`);
      toast('검수확인서를 다시 생성했습니다.');
    } catch (error) {
      toast(error.message || '검수확인서 재다운로드에 실패했습니다.', 'err');
    }
  }

  const columns = [
    { key: 'createdAt', label: '생성일시', render: (r) => new Date(r.createdAt).toLocaleString('ko-KR') },
    { key: 'customer', label: '고객사', render: (r) => <FullCompanyName value={r.customer} /> },
    { key: 'project', label: '프로젝트명' },
    { key: 'salesCode', label: '매출코드', render: (r) => <code style={{ fontSize: 12 }}>{r.salesCode}</code> },
    { key: 'seq', label: '연번' },
    { key: 'status', label: '상태', render: (r) => <Badge color={r.status === 'SUCCESS' ? 'green' : 'red'}>{r.status === 'SUCCESS' ? '성공' : '실패'}</Badge> },
    { key: 'act', label: '다운로드/사유', render: (r) => r.status === 'SUCCESS'
      ? <div className="row"><Button size="sm" variant="secondary" onClick={() => downloadHistoryLicense(r)}>증서</Button><Button size="sm" variant="secondary" onClick={() => downloadHistoryInspection(r)}>확인서</Button></div>
      : <Button size="sm" variant="danger" onClick={() => setFailModal(r)}>실패사유</Button> },
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="card-title mb0">생성이력 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· 기본 최근 1개월</span></div>
        <div className="spacer" />
        <input className="input" style={{ maxWidth: 240 }} placeholder="고객사/프로젝트/매출코드" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Table columns={columns} data={filtered} emptyText="생성 이력이 없습니다." />
      {failModal && (
        <Modal title="실패 사유" onClose={() => setFailModal(null)} footer={<Button variant="secondary" onClick={() => setFailModal(null)}>닫기</Button>}>
          <p className="err-text" style={{ fontSize: 14 }}>{failModal.failReason}</p>
          <p className="muted">오류 ID: <code>{failModal.errorId}</code></p>
        </Modal>
      )}
    </div>
  );
}

/* ---------- 거래처 관리 (신용등급) ---------- */
const CREDIT_PAGE_SIZE = 10;
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

export function CreditModule({ creditCollection }) {
  const { currentUser } = useApp();
  const customerCollection = useCollection('documentCustomers', []);
  const [tab, setTab] = useState('view');
  const canManage = hasPermission(currentUser.role, 'credit:manage');

  useEffect(() => {
    let cancelled = false;
    async function syncSavedCredits() {
      try {
        const saved = await apiLoad('credits', null);
        if (!cancelled && Array.isArray(saved)) creditCollection.replaceAll(saved);
      } catch (error) {
        // DB 동기화 실패는 화면 사용을 막지 않습니다.
      }
    }

    function handleMessage(event) {
      if (event.origin === window.location.origin && event.data?.type === 'DOCUMENT_CREDIT_SAVED') syncSavedCredits();
    }

    function handleVisibilityChange() {
      if (!document.hidden) syncSavedCredits();
    }

    syncSavedCredits();
    window.addEventListener('message', handleMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [creditCollection.replaceAll]);

  return (
    <div>
      <div className="card-title">거래처 관리</div>
      <div className="tabs">
        <div className={`tab ${tab === 'view' ? 'active' : ''}`} onClick={() => setTab('view')}>조회 (신용등급 조회)</div>
        <div className={`tab ${tab === 'customers' ? 'active' : ''}`} onClick={() => setTab('customers')}>고객사</div>
        {canManage && <div className={`tab ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>관리 (등록)</div>}
      </div>
      {tab === 'view' && <CreditView creditCollection={creditCollection} />}
      {tab === 'customers' && <CustomerView customerCollection={customerCollection} />}
      {tab === 'manage' && <CreditManage creditCollection={creditCollection} />}
    </div>
  );
}

function CreditView({ creditCollection }) {
  const { currentUser, logAudit, toast } = useApp();
  const settingsCollection = useCollection('documentMailSettings', [DEFAULT_INSPECTION_MAIL_SETTINGS]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [reqConfirm, setReqConfirm] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState({ items: [], total: 0 });

  const canEdit = hasPermission(currentUser.role, 'credit:editGrade');
  const documentSettings = { ...DEFAULT_INSPECTION_MAIL_SETTINGS, ...(settingsCollection.items[0] || {}) };
  const query = q.trim();
  const totalPages = Math.max(1, Math.ceil(pageData.total / CREDIT_PAGE_SIZE));

  const fetchPage = useCallback(async (targetPage, targetQuery) => {
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(CREDIT_PAGE_SIZE) });
      if (targetQuery) params.set('q', targetQuery);
      const res = await fetch(`${API_BASE}/credits/page?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setPageData({ items: Array.isArray(data.items) ? data.items : [], total: data.total || 0 });
    } catch (error) {
      toast('거래처 목록을 불러오지 못했습니다.', 'err');
    }
  }, [toast]);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { fetchPage(page, query); }, [page, query, fetchPage, creditCollection.items]);

  function search() {
    logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_VIEW', result: 'SUCCESS', extra: { query } });
  }

  async function deleteCredit(item) {
    if (!canEdit) return;
    const company = item.company || '거래처';
    if (!confirm(`${company} 정보를 삭제하시겠습니까?`)) return;
    const next = creditCollection.items.filter((it) => !sameCollectionItem(it, item));
    if (next.length === creditCollection.items.length) {
      toast('삭제할 거래처를 찾지 못했습니다.', 'err');
      return;
    }

    creditCollection.replaceAll(next);
    const saved = await apiSave('credits', next);
    if (!saved) {
      const latest = await apiLoad('credits', []);
      if (Array.isArray(latest)) creditCollection.replaceAll(latest);
      toast('거래처 삭제 저장에 실패했습니다. API 서버와 DB 연결을 확인하세요.', 'err');
      return;
    }

    logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_DELETE', targetType: 'CUSTOMER', targetId: item.id, targetName: company });
    toast('거래처 정보를 삭제했습니다.');
    fetchPage(page, query);
  }

  async function requestCreditLookup() {
    const query = q.trim();
    if (!query) {
      toast('조회 요청할 검색어를 입력하세요.', 'err');
      return;
    }

    setSendingRequest(true);
    try {
      const requestId = uid('CRREQ');
      const inputUrl = buildCreditInputUrl({ company: query, requestId });
      await createCreditLookupRequest({
        requestId,
        company: query,
        requester: currentUser,
        inputUrl,
      });
      await sendCreditGoogleChatWebhook({
        settings: documentSettings,
        company: query,
        requester: currentUser,
        inputUrl,
      });
      logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_REQUEST', result: 'SUCCESS', extra: { company: query, requestId, inputUrl } });
      toast('Google Chat으로 신용도 조회요청을 전송했습니다.');
      setReqConfirm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Chat 웹훅 전송에 실패했습니다.';
      logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_REQUEST', result: 'FAIL', extra: { company: query, error: message } });
      toast(message, 'err');
    } finally {
      setSendingRequest(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 260 }} placeholder="회사명 또는 대표자명" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <Button onClick={search}>검색</Button>
        {query && <Button variant="outline" onClick={() => setReqConfirm(true)}>조회요청</Button>}
      </div>
      <Table
        columns={[
          { key: 'company', label: '회사명', render: (r) => <FullCompanyName value={r.company} clickable={canEdit} onClick={canEdit ? () => setEdit(r) : undefined} /> },
          { key: 'ceo', label: '대표자명', render: (r) => r.ceo || '-' },
          { key: 'grade', label: '신용등급', render: (r) => {
            const grade = r.grade || '-';
            return <Badge color={grade.startsWith('A') ? 'green' : grade.startsWith('B') ? 'yellow' : 'red'}>{grade}</Badge>;
          } },
          { key: 'expireMonth', label: '만료월', render: (r) => <ExpiredMonth value={r.expireMonth} /> },
          ...(canEdit ? [{ key: 'actions', label: '관리', render: (r) => <Button size="sm" variant="danger" onClick={() => deleteCredit(r)}>삭제</Button> }] : []),
        ]}
        data={pageData.items} emptyText={query ? '검색 결과가 없습니다.' : '등록된 거래처가 없습니다.'}
      />
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      {edit && <CreditEditModal item={edit} onClose={() => setEdit(null)} onSave={async (patch) => {
        const next = creditCollection.items.map((it) => (it.id === edit.id ? { ...it, ...patch } : it));
        creditCollection.replaceAll(next);
        const saved = await apiSave('credits', next);
        if (!saved) {
          const latest = await apiLoad('credits', []);
          if (Array.isArray(latest)) creditCollection.replaceAll(latest);
          toast('거래처 수정 저장에 실패했습니다. API 서버와 DB 연결을 확인하세요.', 'err');
          return;
        }
        logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_UPDATE', targetType: 'CUSTOMER', targetId: edit.id, targetName: edit.company });
        toast('수정되었습니다.'); setEdit(null);
        fetchPage(page, query);
      }} />}
      {reqConfirm && (
        <Modal title="신용등급 조회요청" onClose={() => setReqConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setReqConfirm(false)}>취소</Button><Button onClick={requestCreditLookup} disabled={sendingRequest}>{sendingRequest ? '전송 중...' : '요청 전송'}</Button></>}>
          <p>입력한 검색어 <b>"{q}"</b> 로 미등록 업체 신용등급 조회를 관리팀에 요청합니다.</p>
          {!documentSettings.creditGoogleChatWebhookUrl && <p className="hint">문서-설정에서 Google Chat 웹훅 URL을 먼저 저장하세요.</p>}
        </Modal>
      )}
    </div>
  );
}

function isExpiredMonth(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return false;
  const expireIndex = Number(match[1]) * 12 + Number(match[2]);
  const now = new Date();
  const currentIndex = now.getFullYear() * 12 + now.getMonth() + 1;
  return expireIndex < currentIndex;
}

function ExpiredMonth({ value }) {
  const expired = isExpiredMonth(value);
  return (
    <span style={{ color: expired ? '#b42318' : undefined, fontWeight: expired ? 700 : undefined }}>
      {value || '-'}
    </span>
  );
}

function CustomerView({ customerCollection }) {
  const { currentUser, logAudit, toast } = useApp();
  const [edit, setEdit] = useState(null);
  const canDelete = hasPermission(currentUser.role, 'credit:manage');
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState({ items: [], total: 0 });
  const totalPages = Math.max(1, Math.ceil(pageData.total / CREDIT_PAGE_SIZE));

  const fetchPage = useCallback(async (targetPage) => {
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(CREDIT_PAGE_SIZE) });
      const res = await fetch(`${API_BASE}/document-customers/page?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setPageData({ items: Array.isArray(data.items) ? data.items : [], total: data.total || 0 });
    } catch (error) {
      toast('고객사 목록을 불러오지 못했습니다.', 'err');
    }
  }, [toast]);

  useEffect(() => { fetchPage(page); }, [page, fetchPage]);

  async function deleteCustomer(item) {
    if (!canDelete) return;
    const company = item.company || '고객사';
    if (!confirm(`${company} 정보를 삭제하시겠습니까?`)) return;
    const next = customerCollection.items.filter((it) => !sameCollectionItem(it, item));
    if (next.length === customerCollection.items.length) {
      toast('삭제할 고객사를 찾지 못했습니다.', 'err');
      return;
    }

    customerCollection.replaceAll(next);
    const saved = await apiSave('documentCustomers', next);
    if (!saved) {
      const latest = await apiLoad('documentCustomers', []);
      if (Array.isArray(latest)) customerCollection.replaceAll(latest);
      toast('고객사 삭제 저장에 실패했습니다. API 서버와 DB 연결을 확인하세요.', 'err');
      return;
    }

    logAudit({ category: AUDIT_CATEGORY.DOCUMENT, eventType: 'CUSTOMER_DELETE', targetType: 'CUSTOMER', targetId: item.id, targetName: company });
    toast('고객사 정보를 삭제했습니다.');
    fetchPage(page);
  }

  return (
    <div>
      <Table
        columns={[
          { key: 'company', label: '고객사명', render: (r) => <FullCompanyName value={r.company} clickable onClick={() => setEdit(r)} /> },
          { key: 'address', label: '주소', render: (r) => r.address || '-' },
          ...(canDelete ? [{ key: 'actions', label: '관리', render: (r) => <Button size="sm" variant="danger" onClick={() => deleteCustomer(r)}>삭제</Button> }] : []),
        ]}
        data={pageData.items}
        emptyText="발급된 문서의 고객사 정보가 없습니다."
      />
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      {edit && <CustomerEditModal item={edit} onClose={() => setEdit(null)} onSave={async (patch) => {
        const nextPatch = { ...patch, updatedAt: new Date().toISOString() };
        const next = customerCollection.items.map((it) => (it.id === edit.id ? { ...it, ...nextPatch } : it));
        customerCollection.replaceAll(next);
        const saved = await apiSave('documentCustomers', next);
        if (!saved) {
          const latest = await apiLoad('documentCustomers', []);
          if (Array.isArray(latest)) customerCollection.replaceAll(latest);
          toast('고객사 수정 저장에 실패했습니다. API 서버와 DB 연결을 확인하세요.', 'err');
          return;
        }
        logAudit({ category: AUDIT_CATEGORY.DOCUMENT, eventType: 'CUSTOMER_UPDATE', targetType: 'CUSTOMER', targetId: edit.id, targetName: patch.company });
        toast('고객사 정보가 수정되었습니다.');
        setEdit(null);
        fetchPage(page);
      }} />}
    </div>
  );
}

function CustomerEditModal({ item, onClose, onSave }) {
  const [f, setF] = useState({ company: item.company || '', address: item.address || '' });
  const set = (key) => (event) => setF({ ...f, [key]: event.target.value });
  return (
    <Modal title="고객사 수정" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={() => onSave(f)}>저장</Button></>}>
      <div className="form-grid">
        <Input label="고객사명" value={f.company} onChange={set('company')} />
        <Input label="주소" value={f.address} onChange={set('address')} className="full" />
      </div>
    </Modal>
  );
}

function CreditManage({ creditCollection }) {
  const { logAudit, toast } = useApp();
  const uploadRef = useRef(null);
  const [f, setF] = useState({ company: '', grade: 'A', ceo: '', bizNo: '', address: '', expireMonth: '' });
  const set = (k) => (e) => setF({ ...f, [k]: k === 'expireMonth' ? normalizeMonthValue(e.target.value) : e.target.value });

  function register() {
    if (!f.company) { toast('회사명을 입력하세요.', 'err'); return; }
    creditCollection.add({ ...f, expireMonth: normalizeMonthValue(f.expireMonth), updatedAt: new Date().toISOString() }, 'CR');
    logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_REGISTER', targetType: 'CUSTOMER', targetName: f.company });
    toast('거래처가 등록되었습니다.');
    setF({ company: '', grade: 'A', ceo: '', bizNo: '', address: '', expireMonth: '' });
  }

  function downloadCreditTemplate() {
    const headers = ['회사명', '대표자명', '신용등급', '만료월', '주소', '사업자번호'];
    const rows = [...creditCollection.items]
      .sort((a, b) => String(a.company || '').localeCompare(String(b.company || ''), 'ko-KR'))
      .map((item) => ({
        회사명: item.company || '',
        대표자명: item.ceo || '',
        신용등급: item.grade || '',
        만료월: item.expireMonth || '',
        주소: item.address || '',
        사업자번호: item.bizNo || '',
      }));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    sheet['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 46 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '거래처');
    XLSX.writeFile(workbook, `거래처_신용등급_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('거래처 데이터를 엑셀로 다운로드했습니다.');
  }

  async function uploadCreditExcel(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) {
        toast('업로드할 시트를 찾지 못했습니다.', 'err');
        return;
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      const now = new Date().toISOString();
      const next = [...creditCollection.items];
      let imported = 0;
      let skipped = 0;

      rows.forEach((row) => {
        const parsed = creditFromExcelRow(row);
        if (!parsed) {
          skipped += 1;
          return;
        }
        const index = next.findIndex((item) => sameCompanyName(item.company, parsed.company));
        if (index >= 0) {
          next[index] = { ...next[index], ...parsed, updatedAt: now };
        } else {
          next.unshift({ id: uid('CR'), ...parsed, createdAt: now, updatedAt: now });
        }
        imported += 1;
      });

      if (!imported) {
        toast('업로드할 거래처 데이터가 없습니다. 회사명 컬럼을 확인하세요.', 'err');
        return;
      }

      creditCollection.replaceAll(next);
      logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_IMPORT', result: 'SUCCESS', extra: { imported, skipped } });
      toast(`거래처 ${imported}건을 DB에 업로드했습니다.${skipped ? ` 회사명 없는 ${skipped}건은 제외했습니다.` : ''}`);
    } catch (error) {
      logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_IMPORT', result: 'FAIL', failReason: error.message });
      toast(error.message || '엑셀 업로드에 실패했습니다.', 'err');
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>수동 등록</div>
        <div className="form-grid">
          <Input label="회사명" value={f.company} onChange={set('company')} />
          <Input label="신용등급" as="select" value={f.grade} onChange={set('grade')}>{CREDIT_GRADES.map((g) => <option key={g}>{g}</option>)}</Input>
          <Input label="대표자" value={f.ceo} onChange={set('ceo')} />
          <Input label="사업자번호" value={f.bizNo} onChange={set('bizNo')} />
          <Input label="주소" value={f.address} onChange={set('address')} className="full" />
          <Input label="만료월 (YYYY-MM)" type="month" value={monthInputValue(f.expireMonth)} onChange={set('expireMonth')} placeholder="2026-12" />
        </div>
        <div className="row"><Button onClick={register}>등록</Button><Button variant="secondary" onClick={() => setF({ company: '', grade: 'A', ceo: '', bizNo: '', address: '', expireMonth: '' })}>초기화</Button></div>
      </div>
      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>엑셀 일괄 등록</div>
        <input ref={uploadRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={uploadCreditExcel} />
        <div className="row">
          <Button variant="secondary" onClick={downloadCreditTemplate}>템플릿 다운로드</Button>
          <Button variant="outline" onClick={() => uploadRef.current?.click()}>엑셀 파일 업로드 (.xlsx)</Button>
        </div>
        <p className="hint">현재 DB 데이터를 내려받고, 업로드 시 회사명 기준으로 기존 거래처는 수정하고 신규 거래처는 추가합니다.</p>
      </div>
    </div>
  );
}

function CreditEditModal({ item, onClose, onSave }) {
  const [f, setF] = useState({ ...item });
  const set = (k) => (e) => setF({ ...f, [k]: k === 'expireMonth' ? normalizeMonthValue(e.target.value) : e.target.value });
  return (
    <Modal title="신용등급 수정" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={() => onSave(f)}>저장</Button></>}>
      <div className="form-grid">
        <Input label="회사명" value={f.company} onChange={set('company')} />
        <Input label="신용등급" as="select" value={f.grade} onChange={set('grade')}>{CREDIT_GRADES.map((g) => <option key={g}>{g}</option>)}</Input>
        <Input label="대표자" value={f.ceo} onChange={set('ceo')} />
        <Input label="사업자번호" value={f.bizNo} onChange={set('bizNo')} />
        <Input label="주소" value={f.address} onChange={set('address')} className="full" />
        <Input label="만료월" type="month" value={monthInputValue(f.expireMonth)} onChange={set('expireMonth')} placeholder="2026-12" />
      </div>
      <p className="hint">신용등급은 셀렉트박스로만 선택 가능 (직접 입력 불가)</p>
    </Modal>
  );
}
