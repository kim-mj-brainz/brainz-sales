/* =============================================================
   전역 컨텍스트 (담당: 공통영역)
   - AuthContext: 현재 로그인 사용자 (role 포함)
   - 코드마스터 (master) 상태
   - 토스트 알림
   다른 모듈은 useApp() 으로 currentUser, master, toast, logAudit 접근.
   ============================================================= */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { load, save, uid } from './store.js';
import { DEFAULT_MASTER } from '../data/codeMaster.js';
import { logAudit as _logAudit } from './audit.js';

const AppContext = createContext(null);
export function useApp() { return useContext(AppContext); }

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => load('session', null));
  const [master, setMaster] = useState(() => {
    const m = load('master', null);
    // INFRA_TYPE 마이그레이션: 항상 EMS/SIEM/ITSM 으로 강제 (InCall 정의서)
    const merged = { ...DEFAULT_MASTER, ...(m || {}) };
    merged.INFRA_TYPE = ['EMS', 'SIEM', 'ITSM'];
    return merged;
  });
  const [toasts, setToasts] = useState([]);
  const [maintenanceMode, setMaintenanceMode] = useState(() => load('maintenance', false));
  const [theme, setTheme] = useState(() => localStorage.getItem('brainz_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('brainz_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  useEffect(() => { save('master', master); }, [master]);

  // 중복 로그인 감지: 다른 기기/탭에서 로그인 시 현재 세션 강제 종료
  useEffect(() => {
    if (!currentUser?._sessionToken) return;
    const check = setInterval(() => {
      const stored = load('session', null);
      if (stored && stored._sessionToken !== currentUser._sessionToken) {
        _logAudit(currentUser, { category: 'AUTH', eventType: 'SESSION_TAKEOVER', result: 'FAIL', failReason: 'CONCURRENT_LOGIN' });
        save('session', null);
        setCurrentUser(null);
      }
    }, 5000);
    return () => clearInterval(check);
  }, [currentUser]);

  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const login = useCallback((user) => {
    const session = { ...user, _sessionToken: uid('tok') };
    setCurrentUser(session);
    save('session', session);
  }, []);

  const logout = useCallback(() => {
    save('session', null);
    setCurrentUser(null);
  }, []);

  // 현재 사용자 기준 감사로그 기록 헬퍼
  const logAudit = useCallback((payload) => {
    return _logAudit(currentUser, payload);
  }, [currentUser]);

  const updateMaster = useCallback((next) => setMaster(next), []);
  const toggleMaintenance = useCallback((v) => { setMaintenanceMode(v); save('maintenance', v); }, []);

  const value = { currentUser, login, logout, master, updateMaster, toast, logAudit, maintenanceMode, toggleMaintenance, theme, toggleTheme };

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </AppContext.Provider>
  );
}
