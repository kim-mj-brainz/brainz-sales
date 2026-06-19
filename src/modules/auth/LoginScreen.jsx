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
    <div className="login-page">
      {/* 왼쪽 브랜드 패널 */}
      <div className="login-brand">
        {/* 장식용 원형 */}
        <div style={{ position:'absolute', top:-120, right:-120, width:400, height:400, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.07)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:-60, right:-60, width:240, height:240, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.05)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-100, left:-80, width:320, height:320, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.06)', pointerEvents:'none' }} />

        {/* 로고 */}
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Brainz company"
          style={{ height: 40, objectFit: 'contain', marginBottom: 56, filter: 'brightness(0) invert(1)' }} />

        {/* 헤드라인 */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 18, textAlign: 'center' }}>
          Brainz Company
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1.18, letterSpacing: '-0.5px', marginBottom: 14, textAlign: 'center' }}>
          영업관리시스템
        </div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', marginBottom: 56, textAlign: 'center' }}>
          Sales Management System
        </div>

        {/* 기능 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
          {[
            '3단계 권한 기반 접근 제어',
            '감사로그 및 이상행위 탐지',
            '문서 생성 · 인콜 · 레퍼런스 관리',
          ].map((text) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 오른쪽 로그인 패널 */}
      <div className="login-form">
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', marginBottom: 6 }}>로그인</div>
          <div style={{ fontSize: 13.5, color: '#94a3b8' }}>사번과 비밀번호를 입력하세요</div>
        </div>

        <form onSubmit={submit}>
          <Input label="사번 (ID)" value={empNo} onChange={(e) => setEmpNo(e.target.value)} placeholder="예: E001" autoFocus />
          <Input label="비밀번호" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호 입력" />
          {err && (
            <div style={{
              background: '#ffebe9', border: '1px solid #ffcecb',
              borderRadius: 8, padding: '10px 12px',
              fontSize: 12.5, color: '#cf222e', marginBottom: 14,
            }}>{err}</div>
          )}
          <Button type="submit" variant="primary" style={{ width: '100%', padding: '11px', fontSize: 14, borderRadius: 8, marginTop: 4 }}>
            로그인
          </Button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#eaeef2' }} />
          <span style={{ fontSize: 12, color: '#8b949e' }}>또는</span>
          <div style={{ flex: 1, height: 1, background: '#eaeef2' }} />
        </div>

        {hasGoogleSso ? (
          <div id="google-btn-container" style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
        ) : (
          <button style={{
            width: '100%', padding: '10px', borderRadius: 8,
            border: '1px solid #d0d7de', background: '#fff', color: '#1f2328',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: 'not-allowed', opacity: 0.6, fontSize: 13, fontWeight: 600,
            fontFamily: 'Inter, sans-serif',
          }} disabled>
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.909-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
            Google로 로그인 (준비 중)
          </button>
        )}

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>데모 계정</span>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>· 비밀번호 1234</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {users.map((u) => (
              <div key={u.id} onClick={() => quickLogin(u)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                transition: 'background .1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 13, color: '#334155' }}>
                  <span style={{ fontWeight: 700, color: '#1557F5', marginRight: 7 }}>{u.employeeNo}</span>
                  {u.name}
                </span>
                <span className="tag" style={{ fontSize: 11 }}>{ROLE_LABEL[u.role]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
