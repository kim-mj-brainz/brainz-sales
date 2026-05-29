/* =============================================================
   앱 셸 (담당: 공통영역)
   사이드바 메뉴(동적 권한), topbar, 라우팅.
   공통적으로 쓰이는 collection(users/credits/docs)을 여기서 보유하고
   각 모듈에 props 로 내려준다. 모듈 추가/제거는 MENU 배열만 수정.
   ============================================================= */
import React, { useState, useEffect } from 'react';
import { useApp } from '../common/AppContext.jsx';
import { useCollection } from '../common/useCollection.js';
import { hasPermission, ROLE_LABEL } from '../common/permissions.js';
import { SEED_CREDITS, SEED_DOCS } from '../data/seedData.js';

// 모듈 import
import IncallModule from '../modules/incall/IncallModule.jsx';
import ReferenceModule from '../modules/reference/ReferenceModule.jsx';
import DocumentCreate from '../modules/document/DocumentCreate.jsx';
import { DocHistory, CreditModule } from '../modules/document/DocumentHistory.jsx';
import UserManage from '../modules/auth/UserManage.jsx';
import AuditLog from '../modules/auth/AuditLog.jsx';
import { MyProfile, Settings } from '../modules/auth/ProfileSettings.jsx';

/* 메뉴 정의: perm 이 있으면 권한 있는 사용자만 노출 (FR-AUTHZ-03 동적 메뉴) */
const MENU = [
  { group: '문서' },
  { id: 'doc-create', label: '문서생성', icon: '📄' },
  { id: 'doc-history', label: '생성이력', icon: '🗂' },
  { id: 'credit', label: '거래처 관리', icon: '🏢' },
  { group: '영업' },
  { id: 'reference', label: '레퍼런스 조회', icon: '🔎' },
  { id: 'incall', label: '인콜 트래킹', icon: '📞' },
  { group: '시스템' },
  { id: 'audit', label: '감사로그', icon: '📋', perm: 'audit:view' },
  { id: 'users', label: '사용자 관리', icon: '👥', perm: 'system:userManage' },
  { id: 'profile', label: '내 정보', icon: '👤' },
  { id: 'settings', label: '설정', icon: '⚙️' },
];

export default function AppShell({ userCol }) {
  const { currentUser, logout, logAudit } = useApp();
  const [route, setRoute] = useState('doc-create');
  const [now, setNow] = useState(new Date());

  // 공통 보유 컬렉션 (users 는 App 에서 내려받음)
  const creditCol = useCollection('credits', SEED_CREDITS);
  const docCol = useCollection('docs', SEED_DOCS);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  function doLogout() {
    logAudit({ category: 'AUTH', eventType: 'LOGOUT', result: 'SUCCESS' });
    logout();
  }

  const visibleMenu = MENU.filter((m) => m.group || !m.perm || hasPermission(currentUser.role, m.perm));
  const currentLabel = MENU.find((m) => m.id === route)?.label || '';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">brainz<small>영업관리시스템</small></div>
        <div className="sidebar-user">
          <div className="name">{currentUser.name}</div>
          <div className="role">{currentUser.employeeNo} · {ROLE_LABEL[currentUser.role]}</div>
        </div>
        <nav className="nav">
          {visibleMenu.map((m, i) => m.group
            ? <div key={'g' + i} className="nav-group-label">{m.group}</div>
            : <div key={m.id} className={`nav-item ${route === m.id ? 'active' : ''}`} onClick={() => setRoute(m.id)}>
                <span>{m.icon}</span><span>{m.label}</span>
              </div>
          )}
        </nav>
        <div className="sidebar-foot"><button className="logout-btn" onClick={doLogout}>로그아웃</button></div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{currentLabel}</h1>
          <div className="clock">{now.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </header>
        <div className="content">
          {route === 'doc-create' && <DocumentCreate creditItems={creditCol.items} docCollection={docCol} />}
          {route === 'doc-history' && <DocHistory docCollection={docCol} />}
          {route === 'credit' && <CreditModule creditCollection={creditCol} />}
          {route === 'reference' && <ReferenceModule />}
          {route === 'incall' && <IncallModule />}
          {route === 'audit' && <AuditLog />}
          {route === 'users' && <UserManage collection={userCol} />}
          {route === 'profile' && <MyProfile userCollection={userCol} />}
          {route === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
}
