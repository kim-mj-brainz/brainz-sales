/* =============================================================
   생성이력 / 거래처관리(신용등급) (담당: 문서생성)
   생성이력: 최근 1개월 기본, 검색, 성공 다운로드 / 실패사유 팝업
   거래처관리: [조회 탭] 신용등급 조회 + 조회요청 / [관리 탭] 등록(권한)
   ============================================================= */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Modal, Badge, Table } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { CREDIT_GRADES } from '../../data/codeMaster.js';

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

  const columns = [
    { key: 'createdAt', label: '생성일시', render: (r) => new Date(r.createdAt).toLocaleString('ko-KR') },
    { key: 'customer', label: '고객사' },
    { key: 'project', label: '프로젝트명' },
    { key: 'salesCode', label: '매출코드', render: (r) => <code style={{ fontSize: 12 }}>{r.salesCode}</code> },
    { key: 'seq', label: '연번' },
    { key: 'status', label: '상태', render: (r) => <Badge color={r.status === 'SUCCESS' ? 'green' : 'red'}>{r.status === 'SUCCESS' ? '성공' : '실패'}</Badge> },
    { key: 'act', label: '다운로드/사유', render: (r) => r.status === 'SUCCESS'
      ? <div className="row"><Button size="sm" variant="secondary" onClick={() => toast('라이선스 다운로드 (더미)')}>증서</Button><Button size="sm" variant="secondary" onClick={() => toast('납품확인서 다운로드 (더미)')}>확인서</Button></div>
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
export function CreditModule({ creditCollection }) {
  const { currentUser } = useApp();
  const [tab, setTab] = useState('view');
  const canManage = hasPermission(currentUser.role, 'credit:manage');

  return (
    <div>
      <div className="card-title">거래처 관리</div>
      <div className="tabs">
        <div className={`tab ${tab === 'view' ? 'active' : ''}`} onClick={() => setTab('view')}>조회 (신용등급 조회)</div>
        {canManage && <div className={`tab ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>관리 (등록)</div>}
      </div>
      {tab === 'view' ? <CreditView creditCollection={creditCollection} /> : <CreditManage creditCollection={creditCollection} />}
    </div>
  );
}

function CreditView({ creditCollection }) {
  const { currentUser, logAudit, toast } = useApp();
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState(false);
  const [edit, setEdit] = useState(null);
  const [reqConfirm, setReqConfirm] = useState(false);

  const canEdit = hasPermission(currentUser.role, 'credit:editGrade');
  const results = useMemo(() => searched ? creditCollection.items.filter((c) => `${c.company}${c.ceo}`.includes(q)) : [], [searched, q, creditCollection.items]);

  function search() {
    setSearched(true);
    logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_VIEW', result: 'SUCCESS', extra: { query: q } });
  }

  return (
    <div>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 260 }} placeholder="회사명 또는 대표자명" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <Button onClick={search}>검색</Button>
        {searched && <Button variant="outline" onClick={() => setReqConfirm(true)}>조회요청</Button>}
      </div>
      {searched && (
        <Table
          columns={[
            { key: 'company', label: '회사명', render: (r) => canEdit ? <span className="clickable" onClick={() => setEdit(r)}>{r.company}</span> : r.company },
            { key: 'grade', label: '신용등급', render: (r) => <Badge color={r.grade.startsWith('A') ? 'green' : r.grade.startsWith('B') ? 'yellow' : 'red'}>{r.grade}</Badge> },
            { key: 'ceo', label: '대표자' }, { key: 'bizNo', label: '사업자번호' },
            { key: 'address', label: '주소' }, { key: 'expireMonth', label: '만료월' },
          ]}
          data={results} emptyText="검색 결과가 없습니다."
        />
      )}
      {edit && <CreditEditModal item={edit} onClose={() => setEdit(null)} onSave={(patch) => {
        creditCollection.update(edit.id, patch);
        logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_UPDATE', targetType: 'CUSTOMER', targetId: edit.id, targetName: edit.company });
        toast('수정되었습니다.'); setEdit(null);
      }} />}
      {reqConfirm && (
        <Modal title="신용등급 조회요청" onClose={() => setReqConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setReqConfirm(false)}>취소</Button><Button onClick={() => { logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_REQUEST', extra: { query: q } }); toast('관리팀에 조회요청을 전송했습니다. (구글챗/메일 더미)'); setReqConfirm(false); }}>요청 전송</Button></>}>
          <p>입력한 검색어 <b>"{q}"</b> 로 미등록 업체 신용등급 조회를 관리팀에 요청합니다.</p>
          <p className="hint">{/* TODO: 조회요청 API / Google Chat Webhook */}</p>
        </Modal>
      )}
    </div>
  );
}

function CreditManage({ creditCollection }) {
  const { logAudit, toast } = useApp();
  const [f, setF] = useState({ company: '', grade: 'A', ceo: '', bizNo: '', address: '', expireMonth: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function register() {
    if (!f.company) { toast('회사명을 입력하세요.', 'err'); return; }
    creditCollection.add({ ...f }, 'CR');
    logAudit({ category: AUDIT_CATEGORY.CREDIT, eventType: 'CREDIT_REGISTER', targetType: 'CUSTOMER', targetName: f.company });
    toast('거래처가 등록되었습니다.');
    setF({ company: '', grade: 'A', ceo: '', bizNo: '', address: '', expireMonth: '' });
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
          <Input label="만료월 (YYYY-MM)" value={f.expireMonth} onChange={set('expireMonth')} placeholder="2026-12" />
        </div>
        <div className="row"><Button onClick={register}>등록</Button><Button variant="secondary" onClick={() => setF({ company: '', grade: 'A', ceo: '', bizNo: '', address: '', expireMonth: '' })}>초기화</Button></div>
      </div>
      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>엑셀 일괄 등록</div>
        <div className="row">
          <Button variant="secondary" onClick={() => toast('엑셀 템플릿 다운로드 (더미)')}>템플릿 다운로드</Button>
          <Button variant="outline" onClick={() => toast('엑셀 업로드 (더미) — TODO: 파싱/등록 API')}>엑셀 파일 업로드 (.xlsx)</Button>
        </div>
        <p className="hint">{/* TODO: 수동 등록 API / 엑셀 업로드 API / 템플릿 다운로드 API */}</p>
      </div>
    </div>
  );
}

function CreditEditModal({ item, onClose, onSave }) {
  const [f, setF] = useState({ ...item });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="신용등급 수정" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={() => onSave(f)}>저장</Button></>}>
      <div className="form-grid">
        <Input label="회사명" value={f.company} onChange={set('company')} />
        <Input label="신용등급" as="select" value={f.grade} onChange={set('grade')}>{CREDIT_GRADES.map((g) => <option key={g}>{g}</option>)}</Input>
        <Input label="대표자" value={f.ceo} onChange={set('ceo')} />
        <Input label="사업자번호" value={f.bizNo} onChange={set('bizNo')} />
        <Input label="주소" value={f.address} onChange={set('address')} className="full" />
        <Input label="만료월" value={f.expireMonth} onChange={set('expireMonth')} />
      </div>
      <p className="hint">신용등급은 셀렉트박스로만 선택 가능 (직접 입력 불가)</p>
    </Modal>
  );
}
