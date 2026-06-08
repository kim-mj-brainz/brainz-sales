/* =============================================================
   공통 저장소 모듈

   [localStorage] load / save / remove / clearAll / usageBytes
     → session, auth, settings 등 브라우저별 즉시 필요한 데이터

   [API (MySQL)] apiLoad / apiSave
     → useCollection 이 사용하는 공유 컬렉션 데이터
   ============================================================= */

/* ── localStorage 영역 (동기) ── */

const PREFIX = 'sms-';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('store.load 실패', key, e);
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('store.save 실패', key, e);
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* noop */ }
}

export function usageBytes() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) total += (localStorage.getItem(k) || '').length + k.length;
    }
    return total;
  } catch (e) { return 0; }
}

export function clearAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* noop */ }
}

export function uid(prefix = 'id') {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── API 영역 (비동기, MySQL 백엔드) ── */

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

export async function apiLoad(key, fallback) {
  try {
    const res = await fetch(`${API_BASE}/collection/${key}`);
    if (!res.ok) return fallback;
    const data = await res.json();
    return data ?? fallback;
  } catch (e) {
    console.warn('apiLoad 실패 (서버가 켜져 있나요?)', key, e);
    return fallback;
  }
}

export async function apiSave(key, value) {
  try {
    const res = await fetch(`${API_BASE}/collection/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch (e) {
    console.warn('apiSave 실패', key, e);
    return false;
  }
}
