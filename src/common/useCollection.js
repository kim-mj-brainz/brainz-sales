/* =============================================================
   공통 컬렉션 훅 (담당: 공통영역)
   각 모듈이 자기 데이터(배열)를 localStorage 와 동기화하며 CRUD.
   사용: const c = useCollection('incalls', SEED_INCALLS)
        c.items / c.add / c.update / c.remove / c.replaceAll
   ============================================================= */
import { useState, useCallback, useEffect } from 'react';
import { load, save, uid } from './store.js';

export function useCollection(key, seed) {
  const [items, setItems] = useState(() => {
    const existing = load(key, null);
    if (existing == null) { save(key, seed); return seed; }
    return existing;
  });

  useEffect(() => { save(key, items); }, [key, items]);

  const add = useCallback((obj, idPrefix = 'id') => {
    const withId = { id: obj.id || uid(idPrefix), ...obj };
    setItems((cur) => [withId, ...cur]);
    return withId;
  }, []);

  const update = useCallback((id, patch) => {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const remove = useCallback((id) => {
    setItems((cur) => cur.filter((it) => it.id !== id));
  }, []);

  const replaceAll = useCallback((next) => setItems(next), []);

  return { items, add, update, remove, replaceAll, setItems };
}
