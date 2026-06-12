/* =============================================================
   앱 셸 (담당: 공통영역)
   사이드바 메뉴(동적 권한), topbar, 라우팅.
   공통적으로 쓰이는 collection(users/credits/docs)을 여기서 보유하고
   각 모듈에 props 로 내려준다. 모듈 추가/제거는 MENU 배열만 수정.
   ============================================================= */
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../common/AppContext.jsx';
import { useCollection } from '../common/useCollection.js';
import { hasPermission, ROLE_LABEL } from '../common/permissions.js';

// 모듈 import
import Dashboard from '../modules/dashboard/Dashboard.jsx';
import IncallModule from '../modules/incall/IncallModule.jsx';
import ReferenceModule from '../modules/reference/ReferenceModule.jsx';
import DocumentCreate from '../modules/document/DocumentCreate.jsx';
import { DocHistory, CreditModule } from '../modules/document/DocumentHistory.jsx';
import DocumentSettings from '../modules/document/DocumentSettings.jsx';
import UserManage from '../modules/auth/UserManage.jsx';
import AuditLog from '../modules/auth/AuditLog.jsx';
import { MyProfile, Settings } from '../modules/auth/ProfileSettings.jsx';
import { NotFound, Button } from '../common/components.jsx';

/* 메뉴 정의: perm 이 있으면 권한 있는 사용자만 노출 (FR-AUTHZ-03 동적 메뉴) */
const MENU = [
  { id: 'dashboard', label: '대시보드', icon: '🏠' },
  { group: '문서' },
  { id: 'doc-create', label: '문서생성', icon: '📄' },
  { id: 'doc-history', label: '생성이력', icon: '🗂' },
  { id: 'credit', label: '거래처 관리', icon: '🏢' },
  { id: 'doc-settings', label: '문서-설정', icon: '⚙️' },
  { group: '영업' },
  { id: 'reference', label: '레퍼런스 조회', icon: '🔎' },
  { id: 'incall', label: '인콜 트래킹', icon: '📞' },
  { group: '시스템' },
  { id: 'audit', label: '감사로그', icon: '📋', perm: 'audit:view' },
  { id: 'users', label: '사용자 관리', icon: '👥', perm: 'system:userManage' },
  { id: 'profile', label: '내 정보', icon: '👤' },
  { id: 'settings', label: '설정', icon: '⚙️' },
];

const KNOWN_ROUTES = ['dashboard', 'doc-create', 'doc-history', 'credit', 'doc-settings', 'reference', 'incall', 'audit', 'users', 'profile', 'settings'];
const IDLE_WARN_MIN = 25;
const IDLE_LOGOUT_MIN = 30;

export default function AppShell({ userCol }) {
  const { currentUser, logout, logAudit, theme, toggleTheme } = useApp();
  const [route, setRoute] = useState('dashboard');
  const [now, setNow] = useState(new Date());
  const [idleWarning, setIdleWarning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());

  // 공통 보유 컬렉션 (users 는 App 에서 내려받음)
  const creditCol = useCollection('credits', []);
  const docCol = useCollection('docs', []);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  // 사용자 활동 감지 — 마우스/키보드/클릭 시 타이머 초기화
  useEffect(() => {
    const reset = () => { lastActivityRef.current = Date.now(); setIdleWarning(false); };
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('click', reset);
    return () => { window.removeEventListener('mousemove', reset); window.removeEventListener('keydown', reset); window.removeEventListener('click', reset); };
  }, []);

  // 세션 타임아웃 체크 (30초 간격)
  useEffect(() => {
    const t = setInterval(() => {
      const idleMin = (Date.now() - lastActivityRef.current) / 60000;
      if (idleMin >= IDLE_LOGOUT_MIN) {
        logAudit({ category: 'AUTH', eventType: 'SESSION_EXPIRE', result: 'SUCCESS' });
        logout();
      } else if (idleMin >= IDLE_WARN_MIN) {
        setIdleWarning(true);
      }
    }, 30000);
    return () => clearInterval(t);
  }, [logAudit, logout]);

  function doLogout() {
    logAudit({ category: 'AUTH', eventType: 'LOGOUT', result: 'SUCCESS' });
    logout();
  }

  const visibleMenu = MENU.filter((m) => m.group || !m.perm || hasPermission(currentUser.role, m.perm));
  const currentLabel = MENU.find((m) => m.id === route)?.label || '';

  function navigate(id) { setRoute(id); setSidebarOpen(false); }

  return (
    <div className="app-shell">
      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Brainz company" />
        </div>
        <div className="sidebar-user">
          <div className="name">{currentUser.name}</div>
          <div className="role">{currentUser.employeeNo} · {ROLE_LABEL[currentUser.role]}</div>
        </div>
        <nav className="nav">
          {visibleMenu.map((m, i) => m.group
            ? <div key={'g' + i} className="nav-group-label">{m.group}</div>
            : <div key={m.id} className={`nav-item ${route === m.id ? 'active' : ''}`} onClick={() => navigate(m.id)}>
                <span>{m.icon}</span><span>{m.label}</span>
              </div>
          )}
        </nav>
        <div className="sidebar-foot"><button className="logout-btn" onClick={doLogout}>로그아웃</button></div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="menu-toggle" onClick={() => setSidebarOpen(o => !o)}>☰</button>
            <h1>{currentLabel}</h1>
          </div>
          <div className="topbar-right">
            <button className="theme-btn" onClick={toggleTheme} title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <div className="clock">{now.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
          </div>
        </header>
        <div className="content">
          {route === 'dashboard' && <Dashboard docCollection={docCol} onNavigate={setRoute} />}
          {route === 'doc-create' && <DocumentCreate creditItems={creditCol.items} docCollection={docCol} />}
          {route === 'doc-history' && <DocHistory docCollection={docCol} />}
          {route === 'credit' && <CreditModule creditCollection={creditCol} />}
          {route === 'doc-settings' && <DocumentSettings />}
          {route === 'reference' && <ReferenceModule />}
          {route === 'incall' && <IncallModule />}
          {route === 'audit' && <AuditLog />}
          {route === 'users' && <UserManage collection={userCol} />}
          {route === 'profile' && <MyProfile userCollection={userCol} />}
          {route === 'settings' && <Settings />}
          {!KNOWN_ROUTES.includes(route) && <NotFound onBack={() => setRoute('doc-create')} />}
        </div>
      </div>
      {idleWarning && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div className="modal-head"><h3>세션 만료 경고</h3></div>
            <div className="modal-body">
              <p>25분 이상 활동이 없습니다. 계속 사용하시겠습니까?</p>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>응답이 없으면 30분 후 자동 로그아웃됩니다.</p>
            </div>
            <div className="modal-foot">
              <Button onClick={() => { lastActivityRef.current = Date.now(); setIdleWarning(false); }}>계속 사용</Button>
              <Button variant="secondary" onClick={doLogout}>지금 로그아웃</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
