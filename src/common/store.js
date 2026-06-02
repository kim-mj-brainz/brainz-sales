/* =============================================================
   공통 저장소 모듈 (담당: 공통영역)
   MVP: localStorage 기반. 추후 PostgreSQL + REST API 전환 시
   이 파일의 load/save 구현만 fetch 로 교체하면 된다.
   localStorage 미지원 환경 대비 try/catch 필수.
   ============================================================= */

const PREFIX = 'sms-'; // sales management system

export function load(key, fallback) {
  // TODO: 실제 연동 시 GET /api/v1/{key} 로 교체
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
  // TODO: 실제 연동 시 PUT/POST /api/v1/{key} 로 교체
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
