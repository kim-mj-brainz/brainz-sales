/* =============================================================
   사용자 관리 화면 (담당: 공통영역 / auth)  권한: ADMIN 전용
   FR-AUTH-02 계정 승인/권한변경, FR-AUTH-03 비활성화(삭제 금지)
   ============================================================= */
import React, { useState } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Table, Modal, Badge } from '../../common/components.jsx';
import { ROLES, ROLE_LABEL, hasPermission } from '../../common/permissions.js';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { AccessDenied } from '../../common/components.jsx';

export default function UserManage({ collection }) {
  const { currentUser, logAudit, toast } = useApp();
  const [editing, setEditing] = useState(null);

  if (!hasPermission(currentUser.role, 'system:userManage')) return <AccessDenied />;

  const { items, update, add } = collection;

  function save(form) {
    if (editing.isNew) {
      add({ ...form, active: true, password: '1234' });
      logAudit({ category: AUDIT_CATEGORY.ACCOUNT, eventType: 'USER_CREATE', targetType: 'USER', targetId: form.employeeNo, targetName: form.name });
      toast('사용자가 등록되었습니다.');
    } else {
      const before = items.find((u) => u.id === editing.id);
      update(editing.id, form);
      if (before.role !== form.role) {
        logAudit({ category: AUDIT_CATEGORY.AUTHZ, eventType: 'ROLE_CHANGE', targetType: 'USER', targetId: before.employeeNo, targetName: before.name, extra: { old: before.role, new: form.role } });
      }
      logAudit({ category: AUDIT_CATEGORY.ACCOUNT, eventType: 'USER_UPDATE', targetType: 'USER', targetId: before.employeeNo, targetName: before.name });
      toast('사용자 정보가 수정되었습니다.');
    }
    setEditing(null);
  }

  function toggleActive(u) {
    update(u.id, { active: !u.active });
    logAudit({ category: AUDIT_CATEGORY.ACCOUNT, eventType: u.active ? 'USER_DEACTIVATE' : 'USER_ACTIVATE', targetType: 'USER', targetId: u.employeeNo, targetName: u.name });
    toast(u.active ? '비활성화되었습니다.' : '활성화되었습니다.');
  }

  const columns = [
    { key: 'employeeNo', label: '사번' },
    { key: 'name', label: '이름' },
    { key: 'team', label: '소속팀' },
    { key: 'email', label: '이메일' },
    { key: 'role', label: '권한', render: (r) => <Badge color={r.role === 'ADMIN' ? 'purple' : r.role === 'MANAGER' ? 'blue' : 'gray'}>{ROLE_LABEL[r.role]}</Badge> },
    { key: 'active', label: '상태', render: (r) => r.active ? <Badge color="green">활성</Badge> : <Badge color="red">비활성</Badge> },
    { key: 'act', label: '작업', render: (r) => (
      <div className="row">
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setEditing(r); }}>수정</Button>
        <Button size="sm" variant={r.active ? 'danger' : 'success'} onClick={(e) => { e.stopPropagation(); toggleActive(r); }}>{r.active ? '비활성' : '활성'}</Button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="card-title mb0">사용자 관리</div>
        <div className="spacer" />
        <Button onClick={() => setEditing({ isNew: true, employeeNo: '', name: '', team: '', email: '', phone: '', role: ROLES.USER })}>+ 사용자 등록</Button>
      </div>
      <Table columns={columns} data={items} />
      {editing && <UserModal user={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function UserModal({ user, onClose, onSave }) {
  const [f, setF] = useState({ employeeNo: user.employeeNo, name: user.name, team: user.team, email: user.email, phone: user.phone, role: user.role });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.employeeNo && f.name;
  return (
    <Modal title={user.isNew ? '사용자 등록' : '사용자 수정'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button disabled={!valid} onClick={() => onSave(f)}>저장</Button></>}>
      <div className="form-grid">
        <Input label="사번" req value={f.employeeNo} onChange={set('employeeNo')} disabled={!user.isNew} />
        <Input label="이름" req value={f.name} onChange={set('name')} />
        <Input label="소속팀" value={f.team} onChange={set('team')} />
        <Input label="권한" as="select" value={f.role} onChange={set('role')}>
          {Object.values(ROLES).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Input>
        <Input label="이메일" value={f.email} onChange={set('email')} />
        <Input label="연락처" value={f.phone} onChange={set('phone')} />
      </div>
      <div className="hint">기본 비밀번호는 1234 로 설정됩니다. (TODO: 서버에서 해시 저장)</div>
    </Modal>
  );
}
