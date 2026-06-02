/* =============================================================
   내 정보 / 설정 화면 (담당: 공통영역 / auth)
   - 내 정보: 비밀번호/연락처 변경, 본인 로그인 이력 (FR-PROFILE)
   - 설정(ADMIN): 코드마스터 관리, 데이터 초기화, 저장소 사용량
   ============================================================= */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Badge, Table } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { getAuditLogs } from '../../common/audit.js';
import { usageBytes, clearAll } from '../../common/store.js';
import { DEFAULT_MASTER } from '../../data/codeMaster.js';

export function MyProfile({ userCollection }) {
  const { currentUser, toast } = useApp();
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [pw, setPw] = useState('');

  const myLogs = useMemo(() => getAuditLogs()
    .filter((l) => l.actorEmployeeNo === currentUser.employeeNo && l.category === 'AUTH')
    .slice(0, 30), [currentUser]);

  function saveProfile() {
    userCollection.update(currentUser.id, { phone, ...(pw ? { password: pw } : {}) });
    toast('내 정보가 수정되었습니다. (사번·이름·소속은 관리자만 변경 가능)');
    setPw('');
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
      <div className="card card-pad">
        <div className="card-title">내 정보</div>
        <Input label="사번" value={currentUser.employeeNo} disabled />
        <Input label="이름" value={currentUser.name} disabled />
        <Input label="소속팀" value={currentUser.team} disabled />
        <Input label="연락처" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="새 비밀번호" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="변경 시에만 입력" />
        <Button onClick={saveProfile}>저장</Button>
      </div>
      <div className="card card-pad">
        <div className="card-title">최근 로그인 이력 (최대 30건)</div>
        <div className="table-wrap">
          <table className="tbl"><thead><tr><th style={{cursor:'default'}}>일시</th><th style={{cursor:'default'}}>이벤트</th><th style={{cursor:'default'}}>결과</th></tr></thead>
            <tbody>
              {myLogs.length === 0 ? <tr><td colSpan={3} className="empty">이력 없음</td></tr> :
                myLogs.map((l) => <tr key={l.logId}><td>{new Date(l.eventTime).toLocaleString('ko-KR')}</td><td>{l.eventType}</td><td><Badge color={l.result==='SUCCESS'?'green':'red'}>{l.result}</Badge></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- 설정 / 코드마스터 (ADMIN) ---------- */
const MASTER_TABS = [
  { key: 'SALES_PERSON', label: '영업담당자' },
  { key: 'PRESALES', label: '프리세일즈' },
  { key: 'PIPELINE_STATUS', label: '진행상태' },
  { key: 'INFLOW_TYPE', label: '유입유형' },
  { key: 'INDUSTRY', label: '산업군' },
  { key: 'ORG_TYPE', label: '기관/기업유형' },
];

export function Settings() {
  const { currentUser, master, updateMaster, toast } = useApp();
  const [tab, setTab] = useState('SALES_PERSON');
  const [newVal, setNewVal] = useState('');
  const isAdmin = hasPermission(currentUser.role, 'system:codeMaster');

  function addItem() {
    const v = newVal.trim();
    if (!v) return;
    if ((master[tab] || []).includes(v)) { toast('이미 존재하는 항목입니다.', 'err'); return; }
    updateMaster({ ...master, [tab]: [...(master[tab] || []), v] });
    setNewVal(''); toast('추가되었습니다.');
  }
  function removeItem(v) {
    updateMaster({ ...master, [tab]: master[tab].filter((x) => x !== v) });
    toast('삭제되었습니다.');
  }
  function resetData() {
    if (!confirm('전체 데이터를 초기화하시겠습니까?')) return;
    if (!confirm('정말로 모든 데이터를 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
    clearAll();
    location.reload();
  }

  const usage = (usageBytes() / 1024).toFixed(1);

  return (
    <div>
      <div className="card-title">설정</div>
      {isAdmin && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ fontSize: 14 }}>기준정보(코드마스터) 관리</div>
          <div className="tabs">
            {MASTER_TABS.map((t) => <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</div>)}
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="항목 추가" onKeyDown={(e) => e.key === 'Enter' && addItem()} style={{ maxWidth: 240 }} />
            <Button onClick={addItem}>추가</Button>
          </div>
          <div>
            {(master[tab] || []).map((v) => (
              <span key={v} className="tag" style={{ fontSize: 13, padding: '4px 10px', marginRight: 6 }}>
                {v} <span style={{ cursor: 'pointer', color: 'var(--danger)', fontWeight: 700 }} onClick={() => removeItem(v)}>×</span>
              </span>
            ))}
          </div>
          <div className="hint">※ 인프라유형(EMS/SIEM/ITSM)은 시스템 고정값으로 변경할 수 없습니다.</div>
        </div>
      )}
      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>시스템</div>
        <p className="muted" style={{ marginBottom: 10 }}>로컬 저장소 사용량: <b>{usage} KB</b></p>
        {isAdmin && <Button variant="danger" onClick={resetData}>전체 데이터 초기화</Button>}
        <hr className="section-divider" />
        <p className="hint">※ MVP 는 브라우저 localStorage 에 저장됩니다. 실제 운영 시 PostgreSQL + REST API 로 전환 예정입니다. (환경변수/경로는 .env 기준 관리, 하드코딩 금지)</p>
      </div>
    </div>
  );
}
