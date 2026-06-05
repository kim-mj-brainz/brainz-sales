/* =============================================================
   로그인 화면 (담당: 공통영역 / auth 파트)
   FR-LOGIN-01: 사번 + 비밀번호 로그인
   FR-LOGIN-03: 실패 5회 시 잠금 (localStorage 영속화)
   FR-SSO-01:   Google Identity Services (GIS) OAuth 2.0
   감사로그: 로그인 성공/실패 기록
   ============================================================= */
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input } from '../../common/components.jsx';
import { AUDIT_CATEGORY, logAudit } from '../../common/audit.js';
import { ROLE_LABEL } from '../../common/permissions.js';
import { load, save } from '../../common/store.js';

const MAX_FAIL = 5;
const LOCK_KEY = 'lockstate'; // { [employeeNo]: { count, lockedAt } }

function getLockState() { return load(LOCK_KEY, {}); }
function saveLockState(s) { save(LOCK_KEY, s); }
export function clearLock(employeeNo) {
  const s = getLockState();
  delete s[employeeNo];
  saveLockState(s);
}
export function isLocked(employeeNo) {
  const s = getLockState();
  return s[employeeNo]?.count >= MAX_FAIL;
}

/* JWT payload 디코딩 (Google ID 토큰은 서명 검증 불필요 — 서버 연동 시 서버에서 검증) */
function decodeJwtPayload(token) {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

export default function LoginScreen({ users }) {
  const { login } = useApp();
  const [empNo, setEmpNo] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  const loginRef = useRef(login);
  const usersRef = useRef(users);
  useEffect(() => { loginRef.current = login; }, [login]);
  useEffect(() => { usersRef.current = users; }, [users]);

  /* Google SSO 초기화 — VITE_GOOGLE_CLIENT_ID 환경변수가 있을 때만 활성화 */
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    function handleGoogleCredential(response) {
      try {
        const payload = decodeJwtPayload(response.credential);
        const email = payload.email;
        const user = usersRef.current.find((u) => u.email === email);

        if (!user) {
          setErr(`Google 계정(${email})과 연결된 사용자가 없습니다. 관리자에게 문의하세요.`);
          logAudit({ employeeNo: email }, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_FAIL', result: 'FAIL', failReason: 'SSO_USER_NOT_FOUND' });
          return;
        }
        if (!user.active) {
          setErr('비활성화된 계정입니다. 관리자에게 문의하세요.');
          logAudit(user, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_FAIL', result: 'FAIL', failReason: 'INACTIVE' });
          return;
        }
        const { password, ...safeUser } = user;
        logAudit(user, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_SUCCESS', result: 'SUCCESS', extra: { method: 'GOOGLE_SSO', email } });
        loginRef.current(safeUser);
      } catch (e) {
        setErr('Google 로그인 처리 중 오류가 발생했습니다.');
      }
    }

    function initGsi() {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
      });
      const container = document.getElementById('google-btn-container');
      if (container) {
        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          width: 330,
          locale: 'ko',
          text: 'signin_with',
        });
      }
    }

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      // GIS 스크립트 로드 완료 대기
      const poll = setInterval(() => {
        if (window.google?.accounts?.id) { clearInterval(poll); initGsi(); }
      }, 200);
      return () => clearInterval(poll);
    }
  }, []);

  function submit(e) {
    e?.preventDefault();
    setErr('');
    const id = empNo.trim();
    const user = users.find((u) => u.employeeNo === id);
    const lockState = getLockState();

    if (lockState[id]?.count >= MAX_FAIL) {
      setErr('로그인 실패 횟수를 초과했습니다. 관리자에게 잠금 해제를 요청하세요.');
      logAudit({ employeeNo: id }, { category: AUDIT_CATEGORY.AUTH, eventType: 'ACCOUNT_LOCKED', result: 'FAIL', failReason: 'TOO_MANY_ATTEMPTS' });
      return;
    }
    if (!user) {
      bumpFail(id);
      setErr('사번 또는 비밀번호가 올바르지 않습니다.');
      logAudit({ employeeNo: id }, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_FAIL', result: 'FAIL', failReason: 'USER_NOT_FOUND' });
      return;
    }
    if (!user.active) {
      setErr('비활성화된 계정입니다. 관리자에게 문의하세요.');
      logAudit(user, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_FAIL', result: 'FAIL', failReason: 'INACTIVE' });
      return;
    }
    // TODO: 실제 연동 시 서버에서 bcrypt/argon2 해시 비교 (FR-LOGIN-02)
    if (user.password !== pw) {
      bumpFail(id);
      const updated = getLockState();
      const left = MAX_FAIL - (updated[id]?.count || 0);
      setErr(`사번 또는 비밀번호가 올바르지 않습니다. (남은 시도: ${Math.max(left, 0)}회)`);
      logAudit(user, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_FAIL', result: 'FAIL', failReason: 'INVALID_PASSWORD' });
      return;
    }
    const s = getLockState();
    delete s[id];
    saveLockState(s);
    const { password, ...safeUser } = user;
    logAudit(user, { category: AUDIT_CATEGORY.AUTH, eventType: 'LOGIN_SUCCESS', result: 'SUCCESS' });
    login(safeUser);
  }

  function bumpFail(no) {
    const s = getLockState();
    s[no] = { count: (s[no]?.count || 0) + 1, lockedAt: new Date().toISOString() };
    saveLockState(s);
  }

  function quickLogin(u) { setEmpNo(u.employeeNo); setPw(u.password); }

  const hasGoogleSso = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

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

        {/* Google SSO */}
        <div className="card card-pad" style={{ marginTop: 14, textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>또는 Google 계정으로 로그인</div>
          {hasGoogleSso ? (
            <div id="google-btn-container" style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
          ) : (
            <div style={{ padding: '8px 0' }}>
              <p className="hint" style={{ marginBottom: 6 }}>Google 로그인을 사용하려면 <code>.env</code> 파일에 아래 설정이 필요합니다.</p>
              <code style={{ fontSize: 11, background: '#f3f4f6', padding: '4px 8px', borderRadius: 4, display: 'block' }}>
                VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
              </code>
            </div>
          )}
        </div>

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
