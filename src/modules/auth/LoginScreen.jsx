/* =============================================================
   로그인 화면 (담당: 공통영역 / auth 파트)
   FR-LOGIN-01: 사번 + 비밀번호 로그인
   FR-LOGIN-03: 실패 5회 시 30분 잠금 (MVP: 메모리 카운트)
   감사로그: 로그인 성공/실패 기록
   ============================================================= */
import React, { useState } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input } from '../../common/components.jsx';
import { AUDIT_CATEGORY, logAudit } from '../../common/audit.js';
import { ROLE_LABEL } from '../../common/permissions.js';

const MAX_FAIL = 5;
const failCounts = {}; // 사번별 실패 횟수 (MVP, 메모리)

export default function LoginScreen({ users }) {
  const { login } = useApp();
  const [empNo, setEmpNo] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  function submit(e) {
    e?.preventDefault();
    setErr('');
    const user = users.find((u) => u.employeeNo === empNo.trim());

    if (failCounts[empNo] >= MAX_FAIL) {
      setErr('로그인 실패 횟수를 초과했습니다. 30분 후 다시 시도하세요.');
      logAudit({ employeeNo: empNo }, { category: AUDIT_CATEGORY.AUTH, eventType: 'ACCOUNT_LOCKED', result: 'FAIL', failReason: 'TOO_MANY_ATTEMPTS' });
      return;
    }
    if (!user) {
      bumpFail(empNo);
      setErr('사번 또는 비밀번호가 올바르지 않습니다.');
      logAudit({ employeeNo: empNo }, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_FAIL', result: 'FAIL', failReason: 'USER_NOT_FOUND' });
      return;
    }
    if (!user.active) {
      setErr('비활성화된 계정입니다. 관리자에게 문의하세요.');
      logAudit(user, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_FAIL', result: 'FAIL', failReason: 'INACTIVE' });
      return;
    }
    // TODO: 실제 연동 시 서버에서 bcrypt/argon2 해시 비교 (FR-LOGIN-02)
    if (user.password !== pw) {
      bumpFail(empNo);
      const left = MAX_FAIL - (failCounts[empNo] || 0);
      setErr(`사번 또는 비밀번호가 올바르지 않습니다. (남은 시도: ${Math.max(left, 0)}회)`);
      logAudit(user, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_FAIL', result: 'FAIL', failReason: 'INVALID_PASSWORD' });
      return;
    }
    // 성공
    failCounts[empNo] = 0;
    const { password, ...safeUser } = user;
    logAudit(user, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_SUCCESS', result: 'SUCCESS' });
    login(safeUser);
  }

  function bumpFail(no) { failCounts[no] = (failCounts[no] || 0) + 1; }

  function quickLogin(u) {
    setEmpNo(u.employeeNo); setPw(u.password);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e2d3d 0%, #2b3f56 100%)', padding: 20 }}>
      <div style={{ width: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24, color: '#fff' }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>brainz</div>
          <div style={{ fontSize: 13, color: '#94a8c0', marginTop: 4 }}>영업관리시스템 · Sales Management System</div>
        </div>
        <form className="card card-pad" onSubmit={submit} style={{ padding: 26 }}>
          <Input label="사번 (ID)" value={empNo} onChange={(e) => setEmpNo(e.target.value)} placeholder="예: E001" autoFocus />
          <Input label="비밀번호" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호" />
          {err && <div className="err-text" style={{ marginBottom: 12 }}>{err}</div>}
          <Button type="submit" variant="primary" style={{ width: '100%', padding: 11 }}>로그인</Button>
        </form>
        <div className="card card-pad" style={{ marginTop: 14, fontSize: 12 }}>
          <div className="muted" style={{ marginBottom: 8, fontWeight: 600 }}>데모 계정 (클릭 시 자동 입력 · 비밀번호 1234)</div>
          {users.map((u) => (
            <div key={u.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0', cursor: 'pointer' }} onClick={() => quickLogin(u)}>
              <span><b>{u.employeeNo}</b> {u.name}</span>
              <span className="tag">{ROLE_LABEL[u.role]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
