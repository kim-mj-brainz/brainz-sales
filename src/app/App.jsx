/* =============================================================
   App (담당: 공통영역)
   로그인 분기: 미로그인 → LoginScreen, 로그인 → AppShell
   users 컬렉션을 최상위에서 보유하여 로그인/사용자관리가 공유.
   ============================================================= */
import React from 'react';
import { useApp } from '../common/AppContext.jsx';
import { useCollection } from '../common/useCollection.js';
import { SEED_USERS } from '../data/seedUsers.js';
import LoginScreen from '../modules/auth/LoginScreen.jsx';
import AppShell from './AppShell.jsx';

export default function App() {
  const { currentUser } = useApp();
  const userCol = useCollection('users', SEED_USERS);

  if (!currentUser) return <LoginScreen users={userCol.items} />;
  return <AppShell userCol={userCol} />;
}
