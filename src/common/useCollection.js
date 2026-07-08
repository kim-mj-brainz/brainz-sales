/* =============================================================
   공통 컬렉션 훅
   API 비동기 기반. 초기 로드 후 변경마다 서버에 저장.
   사용: const c = useCollection('incalls', SEED_INCALLS)
        c.items / c.add / c.addBulk / c.update / c.remove / c.replaceAll / c.loading
   ============================================================= */
import { useState, useCallback, useEffect, useRef } from 'react';
import { apiLoad, apiSave, uid } from './store.js';

export function useCollection(key, seed) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  // 초기 데이터 로드
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    readyRef.current = false;

    apiLoad(key, null).then((existing) => {
      if (cancelled) return;
      if (existing == null) {
        apiSave(key, seed);
        setItems(seed);
      } else {
        setItems(existing);
      }
      readyRef.current = true;
      setReady(true);
    });

    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // 변경 시 서버 저장
  useEffect(() => {
    if (!readyRef.current) return;
    let cancelled = false;
    apiSave(key, items).then(async (ok) => {
      if (ok || cancelled) return;
      const existing = await apiLoad(key, null);
      if (!cancelled && existing != null) setItems(existing);
    });
    return () => { cancelled = true; };
  }, [key, items]);

  const add = useCallback((obj, idPrefix = 'id') => {
    const withId = { ...obj, id: obj.id || uid(idPrefix) };
    setItems((cur) => [withId, ...cur]);
    return withId;
  }, []);

  // 여러 건을 한 번에 추가 — 단일 setItems → 단일 apiSave (race condition 방지)
  const addBulk = useCallback((objs, idPrefix = 'id') => {
    const withIds = objs.map(obj => ({ ...obj, id: obj.id || uid(idPrefix) }));
    setItems((cur) => [...withIds, ...cur]);
    return withIds;
  }, []);

  const update = useCallback((id, patch) => {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const remove = useCallback((id) => {
    setItems((cur) => cur.filter((it) => it.id !== id));
  }, []);

  const replaceAll = useCallback((next) => setItems(next), []);

  return { items, add, addBulk, update, remove, replaceAll, setItems, loading: !ready };
}
