/* =============================================================
   내 정보 / 설정 화면 (담당: 공통영역 / auth)
   - 내 정보: 비밀번호/연락처 변경, 본인 로그인 이력 (FR-PROFILE)
   - 설정(ADMIN): 코드마스터 관리, 데이터 초기화, 저장소 사용량
   ============================================================= */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Badge } from '../../common/components.jsx';
import { hasPermission, ROLES, ROLE_LABEL } from '../../common/permissions.js';
import { getAuditLogs, AUDIT_CATEGORY } from '../../common/audit.js';
import { clearLock, isLocked } from './LoginScreen.jsx';
import { usageBytes, clearAll, apiSave } from '../../common/store.js';
import { DEFAULT_MASTER } from '../../data/codeMaster.js';
import { useCollection } from '../../common/useCollection.js';
import { DEFAULT_INSPECTION_MAIL_SETTINGS, sendSmtpTestMail, sendGoogleChatTestWebhook } from '../document/inspectionMail.js';
import { getGasUrl, getGasToken, setGasConfig, testConnection, getIncallZsalesEmail, getIncallChatWebhook, getIncallMailOptions, setIncallSettings } from '../../common/gasApi.js';

export function MyProfile({ userCollection }) {
  const { currentUser, toast, logout } = useApp();
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [pw, setPw] = useState('');

  const myLogs = useMemo(() => getAuditLogs()
    .filter((l) => l.actorEmployeeNo === currentUser.employeeNo && l.category === 'AUTH')
    .slice(0, 30), [currentUser]);

  function saveProfile() {
    userCollection.update(currentUser.id, { phone, ...(pw ? { password: pw } : {}) });
    if (pw) {
      toast('비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
      setTimeout(() => logout(), 1500);
    } else {
      toast('내 정보가 수정되었습니다. (사번·이름·소속은 관리자만 변경 가능)');
    }
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
  { key: 'PIPELINE_STATUS', label: '진행상태' },
  { key: 'INFLOW_TYPE', label: '유입유형' },
  { key: 'INDUSTRY', label: '산업군' },
  { key: 'ORG_TYPE', label: '기관/기업유형' },
];

export function Settings({ userCollection }) {
  const { currentUser, master, updateMaster, toast, logAudit, maintenanceMode, toggleMaintenance } = useApp();
  const [tab, setTab] = useState('PIPELINE_STATUS');
  const [newVal, setNewVal] = useState('');
  const isAdmin = hasPermission(currentUser.role, 'system:codeMaster');

  // 담당자 관리
  const staffCollection = useCollection('documentStaff', []);
  const [staffTab, setStaffTab] = useState('영업');
  const [staffForm, setStaffForm] = useState(null);

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

  function openAddStaff(role) { setStaffForm({ id: null, name: '', phone: '', email: '', role }); }
  function openEditStaff(s) { setStaffForm({ ...s }); }
  function saveStaff() {
    const next = { name: (staffForm.name || '').trim(), phone: (staffForm.phone || '').trim(), email: (staffForm.email || '').trim(), role: staffForm.role };
    if (!next.name) { toast('이름을 입력하세요.', 'err'); return; }
    if (staffForm.id) {
      staffCollection.update(staffForm.id, next);
      toast('수정되었습니다.');
    } else {
      staffCollection.add(next, staffForm.role === '영업' ? 'SALES' : 'ENG');
      toast('추가되었습니다.');
    }
    setStaffForm(null);
  }
  function deleteStaff(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    staffCollection.remove(id);
    toast('삭제되었습니다.');
  }

  const usage = (usageBytes() / 1024).toFixed(1);
  const staffByTab = staffCollection.items.filter((s) => s.role === staffTab);

  return (
    <div>
      <div className="card-title">설정</div>
      {isAdmin && (
        <>
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

          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ fontSize: 14 }}>담당자 관리</div>
            <div className="hint" style={{ marginBottom: 8 }}>영업 탭에 추가된 인원은 인콜 등록 시 담당영업 드롭다운에 자동 반영됩니다.</div>
            <div className="tabs">
              {['영업', '엔지니어'].map((r) => (
                <div key={r} className={`tab ${staffTab === r ? 'active' : ''}`} onClick={() => { setStaffTab(r); setStaffForm(null); }}>{r}</div>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <Button size="sm" onClick={() => openAddStaff(staffTab)}>+ 추가</Button>
            </div>
            {staffForm && staffForm.role === staffTab && (
              <div className="card card-pad" style={{ marginBottom: 12 }}>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <Input label="이름" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} />
                  <Input label="전화번호" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} placeholder="010-0000-0000" />
                  <Input label="이메일" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="name@brainz.co.kr" />
                </div>
                <div className="row">
                  <Button size="sm" onClick={saveStaff}>{staffForm.id ? '수정' : '추가'}</Button>
                  <Button size="sm" variant="secondary" onClick={() => setStaffForm(null)}>취소</Button>
                </div>
              </div>
            )}
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th style={{ cursor: 'default' }}>이름</th><th style={{ cursor: 'default' }}>전화번호</th><th style={{ cursor: 'default' }}>이메일</th><th style={{ cursor: 'default' }}></th></tr></thead>
                <tbody>
                  {staffByTab.length === 0 && <tr><td colSpan={4} className="empty">등록된 담당자 없음</td></tr>}
                  {staffByTab.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.phone || '-'}</td>
                      <td>{s.email || '-'}</td>
                      <td>
                        <div className="row">
                          <Button size="sm" variant="secondary" onClick={() => openEditStaff(s)}>수정</Button>
                          <Button size="sm" variant="danger" onClick={() => deleteStaff(s.id)}>삭제</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {userCollection && <UserManageSection collection={userCollection} logAudit={logAudit} toast={toast} currentUser={currentUser} />}

          <NotificationSettings toast={toast} currentUser={currentUser} />
        </>
      )}
      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>시스템</div>
        <p className="muted" style={{ marginBottom: 10 }}>로컬 저장소 사용량: <b>{usage} KB</b></p>
        {isAdmin && (
          <div className="row" style={{ marginBottom: 12, alignItems: 'center', gap: 12 }}>
            <Button
              variant={maintenanceMode ? 'danger' : 'secondary'}
              onClick={() => {
                const next = !maintenanceMode;
                toggleMaintenance(next);
                logAudit({ category: 'SYSTEM', eventType: 'MAINTENANCE_MODE', result: 'SUCCESS', extra: { enabled: next } });
                toast(next ? '점검 모드 활성화 — 관리자 외 접근이 차단됩니다.' : '점검 모드가 해제되었습니다.');
              }}
            >
              {maintenanceMode ? '점검 모드 해제' : '점검 모드 활성화'}
            </Button>
            {maintenanceMode && <span className="badge-pill b-red">점검 중</span>}
          </div>
        )}
        {isAdmin && <Button variant="danger" onClick={resetData}>전체 데이터 초기화</Button>}
        <hr className="section-divider" />
        <p className="hint">※ MVP 는 브라우저 localStorage 에 저장됩니다. 실제 운영 시 PostgreSQL + REST API 로 전환 예정입니다. (환경변수/경로는 .env 기준 관리, 하드코딩 금지)</p>
      </div>
    </div>
  );
}

/* ---------- 사용자 관리 (ADMIN 전용) ---------- */
function UserManageSection({ collection, logAudit, toast, currentUser }) {
  const [editing, setEditing] = useState(null);
  const [, forceUpdate] = useState(0);
  const { items, update, add, remove } = collection;

  function save(form) {
    const employeeNo = String(form.employeeNo || '').trim();
    if (!employeeNo) {
      toast('사번을 입력하세요.', 'err');
      return;
    }
    const duplicated = items.some((u) => String(u.employeeNo || '').trim() === employeeNo && (editing.isNew || u.id !== editing.id));
    if (duplicated) {
      toast('이미 등록된 사번입니다. 동일 사번은 등록할 수 없습니다.', 'err');
      return;
    }
    const nextForm = { ...form, id: employeeNo, employeeNo };
    if (editing.isNew) {
      add({ ...nextForm, active: true, password: '1234' });
      logAudit({ category: AUDIT_CATEGORY.ACCOUNT, eventType: 'USER_CREATE', targetType: 'USER', targetId: employeeNo, targetName: form.name });
      toast('사용자가 등록되었습니다. (초기 비밀번호: 1234)');
    } else {
      const before = items.find((u) => u.id === editing.id);
      update(editing.id, nextForm);
      if (before.role !== form.role) {
        logAudit({ category: AUDIT_CATEGORY.AUTHZ, eventType: 'ROLE_CHANGE', targetType: 'USER', targetId: before.employeeNo, targetName: before.name, extra: { old: before.role, new: form.role } });
      }
      logAudit({ category: AUDIT_CATEGORY.ACCOUNT, eventType: 'USER_UPDATE', targetType: 'USER', targetId: before.employeeNo, targetName: before.name });
      toast('사용자 정보가 수정되었습니다.');
    }
    setEditing(null);
  }

  function toggleActive(u) {
    if (u.id === currentUser.id) { toast('본인 계정은 비활성화할 수 없습니다.', 'err'); return; }
    update(u.id, { active: !u.active });
    logAudit({ category: AUDIT_CATEGORY.ACCOUNT, eventType: u.active ? 'USER_DEACTIVATE' : 'USER_ACTIVATE', targetType: 'USER', targetId: u.employeeNo, targetName: u.name });
    toast(u.active ? '비활성화되었습니다.' : '활성화되었습니다.');
  }

  function deleteUser(u) {
    if (u.id === currentUser.id || u.employeeNo === currentUser.employeeNo) {
      toast('본인 계정은 삭제할 수 없습니다.', 'err');
      return;
    }
    if (!window.confirm(`${u.name} 사용자를 삭제하시겠습니까?`)) return;
    clearLock(u.employeeNo);
    remove(u.id);
    logAudit({ category: AUDIT_CATEGORY.ACCOUNT, eventType: 'USER_DELETE', targetType: 'USER', targetId: u.employeeNo, targetName: u.name });
    toast('사용자가 삭제되었습니다.');
  }

  function unlock(u) {
    clearLock(u.employeeNo);
    logAudit({ category: AUDIT_CATEGORY.AUTH, eventType: 'ACCOUNT_UNLOCK', targetType: 'USER', targetId: u.employeeNo, targetName: u.name, result: 'SUCCESS' });
    toast(`${u.name} 계정 잠금이 해제되었습니다.`);
    forceUpdate((n) => n + 1);
  }

  const roleColor = { ADMIN: 'purple', USER: 'gray' };

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="toolbar">
        <div className="card-title mb0" style={{ fontSize: 14 }}>사용자 관리</div>
        <div className="spacer" />
        <Button size="sm" onClick={() => setEditing({ isNew: true, employeeNo: '', name: '', team: '', email: '', phone: '', role: ROLES.USER })}>+ 사용자 등록</Button>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ cursor: 'default' }}>사번</th>
              <th style={{ cursor: 'default' }}>이름</th>
              <th style={{ cursor: 'default' }}>소속팀</th>
              <th style={{ cursor: 'default' }}>이메일</th>
              <th style={{ cursor: 'default' }}>권한</th>
              <th style={{ cursor: 'default' }}>상태</th>
              <th style={{ cursor: 'default' }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.employeeNo}</td>
                <td>{u.name}</td>
                <td>{u.team || '-'}</td>
                <td>{u.email || '-'}</td>
                <td><Badge color={roleColor[u.role] || 'gray'}>{ROLE_LABEL[u.role] || u.role}</Badge></td>
                <td>
                  {isLocked(u.employeeNo)
                    ? <Badge color="yellow">잠금</Badge>
                    : u.active ? <Badge color="green">활성</Badge> : <Badge color="red">비활성</Badge>}
                </td>
                <td>
                  <div className="row">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>수정</Button>
                    <Button size="sm" variant={u.active ? 'danger' : 'success'} onClick={() => toggleActive(u)}>{u.active ? '비활성' : '활성'}</Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={u.id === currentUser.id || u.employeeNo === currentUser.employeeNo}
                      title={u.id === currentUser.id || u.employeeNo === currentUser.employeeNo ? '본인 계정은 삭제할 수 없습니다.' : '사용자 삭제'}
                      onClick={() => deleteUser(u)}
                    >삭제</Button>
                    {isLocked(u.employeeNo) && <Button size="sm" variant="warning" onClick={() => unlock(u)}>잠금해제</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UserFormModal user={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function UserFormModal({ user, onClose, onSave }) {
  const [f, setF] = useState({ employeeNo: user.employeeNo || '', name: user.name || '', team: user.team || '', email: user.email || '', phone: user.phone || '', role: user.role || ROLES.USER });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.employeeNo && f.name;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-head"><h3>{user.isNew ? '사용자 등록' : '사용자 수정'}</h3><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <Input label="사번" req value={f.employeeNo} onChange={set('employeeNo')} disabled={!user.isNew} />
            <Input label="이름" req value={f.name} onChange={set('name')} />
            <Input label="소속팀" value={f.team} onChange={set('team')} />
            <div className="field">
              <label>권한</label>
              <select className="select" value={f.role} onChange={set('role')}>
                <option value={ROLES.ADMIN}>{ROLE_LABEL.ADMIN} — 전체 관리 + 설정</option>
                <option value={ROLES.USER}>{ROLE_LABEL.USER} — 본인 데이터만</option>
              </select>
            </div>
            <Input label="이메일" value={f.email} onChange={set('email')} />
            <Input label="연락처" value={f.phone} onChange={set('phone')} />
          </div>
          {user.isNew && <div className="hint" style={{ marginTop: 8 }}>초기 비밀번호는 1234로 설정됩니다.</div>}
        </div>
        <div className="modal-foot">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button disabled={!valid} onClick={() => onSave(f)}>저장</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 알림 설정 (GAS + 문서 이메일 통합) ---------- */
function NotificationSettings({ toast, currentUser }) {
  const mailCol = useCollection('documentMailSettings', [DEFAULT_INSPECTION_MAIL_SETTINGS]);
  const savedSettings = mailCol.items[0] || null;
  const settingsFromDb = useMemo(() => ({
    ...DEFAULT_INSPECTION_MAIL_SETTINGS,
    ...(savedSettings || {}),
    apiUrl: DEFAULT_INSPECTION_MAIL_SETTINGS.apiUrl,
  }), [savedSettings]);

  const [gasUrl, setGasUrl] = useState(getGasUrl);
  const [gasToken, setGasToken] = useState(getGasToken);
  const [gasTesting, setGasTesting] = useState(false);
  const [gasTestResult, setGasTestResult] = useState(null);

  // 인콜 알림 설정 — 별도 state로 관리, GAS 저장 버튼에 통합
  const [incallZsalesEmail, setIncallZsalesEmail] = useState(() => getIncallZsalesEmail());
  const [incallChatWebhook, setIncallChatWebhook] = useState(() => getIncallChatWebhook());
  const [incallMailFromName, setIncallMailFromName] = useState(() => getIncallMailOptions().fromName);
  const [incallMailFromEmail, setIncallMailFromEmail] = useState(() => getIncallMailOptions().fromEmail);
  const [incallMailReplyToEmail, setIncallMailReplyToEmail] = useState(() => getIncallMailOptions().replyToEmail);

  const [form, setForm] = useState(settingsFromDb);
  const [testing, setTesting] = useState('');
  const dirtyRef = useRef(false);
  const set = (key) => (e) => { dirtyRef.current = true; setForm((f) => ({ ...f, [key]: e.target.value })); };
  const setChecked = (key) => (e) => { dirtyRef.current = true; setForm((f) => ({ ...f, [key]: e.target.checked })); };

  useEffect(() => {
    if (dirtyRef.current) return;
    setForm(settingsFromDb);
  }, [settingsFromDb]);

  async function saveMail(message = '알림 설정을 저장했습니다.') {
    const next = [{ ...DEFAULT_INSPECTION_MAIL_SETTINGS, ...form, apiUrl: DEFAULT_INSPECTION_MAIL_SETTINGS.apiUrl, id: 'default' }];
    dirtyRef.current = false;
    mailCol.replaceAll(next);
    const ok = await apiSave('documentMailSettings', next);
    toast(ok ? message : 'DB 저장에 실패했습니다. API 서버 상태를 확인하세요.', ok ? undefined : 'err');
  }

  async function testSmtp() {
    setTesting('smtp');
    try {
      await sendSmtpTestMail({ settings: form, requester: currentUser });
      toast('SMTP 테스트 메일을 전송했습니다.');
    } catch (e) { toast(e.message || 'SMTP 테스트 실패', 'err'); }
    finally { setTesting(''); }
  }

  async function testChat() {
    setTesting('chat');
    try {
      await sendGoogleChatTestWebhook({ settings: form, requester: currentUser });
      toast('Google Chat 테스트를 전송했습니다.');
    } catch (e) { toast(e.message || 'Chat 테스트 실패', 'err'); }
    finally { setTesting(''); }
  }

  async function testGas() {
    if (!gasUrl.trim()) { toast('GAS URL을 입력하세요.', 'err'); return; }
    setGasTesting(true); setGasTestResult(null);
    setGasConfig(gasUrl, gasToken);
    const ok = await testConnection();
    setGasTesting(false); setGasTestResult(ok ? 'ok' : 'fail');
  }

  // GAS URL/토큰 + zsales 이메일 + 챗 웹훅 한 번에 저장
  function saveGas() {
    if (!gasUrl.trim()) { toast('GAS URL을 입력하세요.', 'err'); return; }
    setGasConfig(gasUrl, gasToken);
    setIncallSettings(incallZsalesEmail, incallChatWebhook, {
      fromName: incallMailFromName,
      fromEmail: incallMailFromEmail,
      replyToEmail: incallMailReplyToEmail,
    });
    setGasTestResult(null);
    toast('인콜 설정이 저장되었습니다.');
  }

  function clearGas() {
    if (!confirm('GAS 연동을 해제하시겠습니까?')) return;
    setGasConfig('', '');
    setGasUrl(''); setGasToken('');
    setGasTestResult(null);
    toast('GAS 연동이 해제되었습니다.');
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ fontSize: 14 }}>알림 설정</div>

      <div style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>인콜 알림 (GAS 연동)</div>
        <div style={{ padding: 10, background: 'var(--surface-2, #eff6ff)', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
          ① Apps Script → SpreadsheetGAS.gs 붙여넣기&nbsp;&nbsp;
          ② <code>setupToken()</code> 실행&nbsp;&nbsp;
          ③ 배포 → 웹앱 → 모든 사용자 → URL 복사
        </div>
        <Input label="GAS 웹앱 URL" value={gasUrl} onChange={(e) => setGasUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
        <Input label="인증 토큰" type="password" value={gasToken} onChange={(e) => setGasToken(e.target.value)} placeholder="brainz-incall-2026" />

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>인콜시스템 알림 세부 설정</div>
          <Input
            label="zsales 수신 이메일"
            value={incallZsalesEmail}
            onChange={(e) => setIncallZsalesEmail(e.target.value)}
            placeholder="zsales@brainz.co.kr"
            autoComplete="off"
          />
          <div className="hint" style={{ marginBottom: 10 }}>신규 인콜 등록 시 배정 요청 메일을 받을 주소 (테스트: rbdud1@brainz.co.kr / 실운영: zsales@brainz.co.kr)</div>
          <Input
            label="인콜 구글챗 웹훅 URL"
            value={incallChatWebhook}
            onChange={(e) => setIncallChatWebhook(e.target.value)}
            placeholder="https://chat.googleapis.com/v1/spaces/..."
            autoComplete="off"
          />
          <div className="hint" style={{ marginBottom: 10 }}>신규 인콜 등록 시 구글챗 알림을 보낼 웹훅 URL (인콜시스템 전용)</div>
          <div className="form-grid doc-form-grid">
            <Input
              label="인콜 메일 표시 발신자명"
              value={incallMailFromName}
              onChange={(e) => setIncallMailFromName(e.target.value)}
              placeholder="브레인즈 영업관리"
              autoComplete="off"
            />
            <Input
              label="인콜 메일 표시 발신 이메일"
              value={incallMailFromEmail}
              onChange={(e) => setIncallMailFromEmail(e.target.value)}
              placeholder="sales@brainz.co.kr"
              autoComplete="off"
            />
            <Input
              label="인콜 메일 답장 받을 이메일"
              value={incallMailReplyToEmail}
              onChange={(e) => setIncallMailReplyToEmail(e.target.value)}
              placeholder={currentUser.email}
              autoComplete="off"
            />
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            표시 발신 이메일은 Apps Script를 실행하는 Google 계정의 Gmail 발신 별칭에 등록된 주소일 때만 적용됩니다.
            답장 받을 이메일은 Reply-To로 전달됩니다.
          </div>
        </div>

        {gasTestResult === 'ok' && <div style={{ padding: '6px 10px', background: '#dcfce7', borderRadius: 4, color: '#166534', fontSize: 12, marginBottom: 8 }}>연결 성공!</div>}
        {gasTestResult === 'fail' && <div style={{ padding: '6px 10px', background: '#fee2e2', borderRadius: 4, color: '#991b1b', fontSize: 12, marginBottom: 8 }}>연결 실패</div>}
        <div className="row">
          <Button variant="secondary" onClick={testGas} disabled={gasTesting}>{gasTesting ? '테스트 중…' : '연결 테스트'}</Button>
          <Button onClick={saveGas}>저장</Button>
          <Button variant="danger" size="sm" onClick={clearGas}>연동 해제</Button>
        </div>
      </div>

      <hr className="section-divider" />

      <div style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <div className="card-title mb0" style={{ fontSize: 13 }}>검수확인서 메일</div>
          <div className="spacer" />
          <Button onClick={() => saveMail()}>전체 저장</Button>
        </div>
        <div className="checkbox-row" style={{ marginBottom: 14 }}>
          <label><input type="checkbox" checked={form.enabled} onChange={setChecked('enabled')} /> 생성 후 담당엔지니어 메일</label>
          <label><input type="checkbox" checked={form.ccSales} onChange={setChecked('ccSales')} /> 담당영업 참조</label>
        </div>
        <div className="form-grid doc-form-grid">
          <Input label="발신자명" value={form.senderName} onChange={set('senderName')} placeholder={currentUser.name} />
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label><input type="checkbox" checked={form.smtpEnabled} onChange={setChecked('smtpEnabled')} /> SMTP 설정 사용</label>
            <div className="hint">담당엔지니어는 받는사람, 담당영업은 참조로 메일 API에 전달됩니다.</div>
          </div>
          {form.smtpEnabled && (
            <>
              <Input label="SMTP Host" value={form.smtpHost} onChange={set('smtpHost')} placeholder="smtp.example.com" />
              <Input label="SMTP Port" type="number" value={form.smtpPort} onChange={set('smtpPort')} placeholder="587" />
              <Input label="SMTP 계정" value={form.smtpUser} onChange={set('smtpUser')} placeholder="user@example.com" />
              <Input label="SMTP 비밀번호" type="password" value={form.smtpPassword} onChange={set('smtpPassword')} />
              <Input label="수신자 표시 발신 이메일" value={form.smtpFromEmail} onChange={set('smtpFromEmail')} placeholder="sales@example.com" />
              <Input label="답장 받을 이메일" value={form.smtpReplyToEmail || ''} onChange={set('smtpReplyToEmail')} placeholder={currentUser.email} />
              <Input label="답장 표시명" value={form.smtpReplyToName || ''} onChange={set('smtpReplyToName')} placeholder={form.senderName || currentUser.name} />
              <div className="field">
                <label><input type="checkbox" checked={form.smtpSecure} onChange={setChecked('smtpSecure')} /> SSL/TLS 보안 연결</label>
                <div className="hint">465 포트는 보통 켜고, 587 포트는 보통 끄니다.</div>
              </div>
              <div className="hint" style={{ gridColumn: '1 / -1' }}>
                SMTP 계정은 실제 로그인/반송 계정으로 사용하고, 수신자에게 보이는 From은 발신자명과 수신자 표시 발신 이메일로 구성됩니다.
              </div>
            </>
          )}
          <Input label="테스트 수신 이메일" value={form.smtpTestEmail} onChange={set('smtpTestEmail')} placeholder={currentUser.email} />
          <div className="field">
            <label>&nbsp;</label>
            <div className="row">
              <Button onClick={() => saveMail('SMTP 설정을 저장했습니다.')}>SMTP 설정 저장</Button>
              <Button variant="secondary" onClick={testSmtp} disabled={testing === 'smtp'}>{testing === 'smtp' ? '테스트 중' : '메일 테스트'}</Button>
            </div>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>메일 제목</label>
            <input className="input" value={form.subject} onChange={set('subject')} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>메일 본문</label>
            <textarea className="textarea" rows={7} value={form.body} onChange={set('body')} />
            <div className="hint">
              사용 가능 변수: {'{customer}'}, {'{project}'}, {'{salesCode}'}, {'{issueDate}'}, {'{documentNo}'}, {'{engineer}'}, {'{engineerEmail}'}, {'{sales}'}, {'{salesEmail}'}, {'{itemCount}'}, {'{filename}'}
            </div>
          </div>
        </div>
      </div>

      <hr className="section-divider" />

      <div>
        <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>거래처 관리 웹훅</div>
        <Input
          label="신용도 조회 Google Chat 웹훅 URL"
          value={form.creditGoogleChatWebhookUrl}
          onChange={set('creditGoogleChatWebhookUrl')}
          placeholder="https://chat.googleapis.com/v1/spaces/..."
        />
        <div className="field" style={{ marginTop: 10 }}>
          <label>신용도 조회 요청 문구</label>
          <textarea className="textarea" rows={6} value={form.creditGoogleChatRequestTemplate} onChange={set('creditGoogleChatRequestTemplate')} />
          <div className="hint">
            사용 가능 변수: {'{requestedAt}'}, {'{requester}'}, {'{requesterEmail}'}, {'{company}'}, {'{query}'} · 입력 화면은 하단의 신용도 입력 버튼으로 연결됩니다.
          </div>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>테스트 메시지</label>
          <textarea className="textarea" rows={3} value={form.creditGoogleChatTestMessage} onChange={set('creditGoogleChatTestMessage')} />
        </div>
        <div className="row">
          <Button onClick={() => saveMail('웹훅 URL을 저장했습니다.')}>웹훅 저장</Button>
          <Button variant="secondary" onClick={testChat} disabled={testing === 'chat'}>{testing === 'chat' ? '테스트 중' : 'Chat 테스트'}</Button>
        </div>
      </div>
    </div>
  );
}
