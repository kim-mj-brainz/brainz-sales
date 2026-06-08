/* 도입 모듈 다중 선택 컴포넌트
   EMS를 선택한 경우 하위 모듈 1개 이상 필수 (저장 시 유효성 검사 책임은 호출측) */
import React, { useState, useRef, useCallback } from 'react';
import { MODULE_GROUPS, EMS_SUB_MODULES } from '../constants/moduleOptions.js';

export default function ModuleMultiSelect({ selected = [], onChange, placeholder = '모듈 선택...' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const containerRef = useRef();

  const handleBlur = useCallback((e) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget)) {
      setOpen(false);
    }
  }, []);

  function toggle(name) {
    onChange(selected.includes(name)
      ? selected.filter((x) => x !== name)
      : [...selected, name]
    );
  }

  function removeTag(name, e) {
    e.stopPropagation();
    onChange(selected.filter((x) => x !== name));
  }

  const emsConstraintError =
    selected.includes('EMS') && !EMS_SUB_MODULES.some((m) => selected.includes(m));

  // 검색어 기준으로 그룹 필터링
  function matchesQuery(name) {
    return name.toLowerCase().includes(q.toLowerCase());
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onBlur={handleBlur}>
      {/* 선택된 태그 표시 */}
      <div
        className="input"
        style={{
          minHeight: 36, height: 'auto', cursor: 'pointer',
          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 8px',
        }}
        onClick={() => { setOpen((o) => !o); setQ(''); }}
        tabIndex={0}
      >
        {selected.length === 0 && (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{placeholder}</span>
        )}
        {selected.map((m) => (
          <span key={m} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {m}
            <span
              style={{ cursor: 'pointer', color: 'var(--danger)', fontWeight: 700, fontSize: 11, lineHeight: 1 }}
              onMouseDown={(e) => { e.preventDefault(); removeTag(m, e); }}
            >×</span>
          </span>
        ))}
      </div>

      {/* EMS 제약 경고 */}
      {emsConstraintError && (
        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>
          EMS를 선택한 경우 하위 모듈을 1개 이상 선택해야 합니다.
        </div>
      )}

      {/* 드롭다운 */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: 'var(--shadow)', maxHeight: 300, display: 'flex', flexDirection: 'column',
        }}>
          <input
            className="input"
            style={{ borderRadius: 0, borderWidth: '0 0 1px 0', fontSize: 12, flexShrink: 0 }}
            placeholder="모듈 검색..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            autoFocus
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {MODULE_GROUPS.map((group) => {
              const filteredChildren = group.children.filter(matchesQuery);
              const parentMatches = group.parentKey && matchesQuery(group.parentKey);
              const showGroup = parentMatches || filteredChildren.length > 0;
              if (!showGroup) return null;

              return (
                <div key={group.label}>
                  {/* 그룹 헤더 */}
                  <div style={{
                    padding: '5px 12px 3px', fontSize: 11, fontWeight: 700,
                    color: 'var(--muted)', background: '#f9fafb',
                    borderBottom: '1px solid var(--border)', position: 'sticky', top: 0,
                  }}>
                    {group.label}
                  </div>

                  {/* EMS 부모 항목 */}
                  {group.parentKey && (parentMatches || filteredChildren.length > 0) && (
                    <div
                      onMouseDown={(e) => { e.preventDefault(); toggle(group.parentKey); }}
                      style={{
                        padding: '7px 12px', fontSize: 13, cursor: 'pointer',
                        background: selected.includes(group.parentKey) ? '#eff6ff' : 'transparent',
                        fontWeight: selected.includes(group.parentKey) ? 600 : 400,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <input type="checkbox" readOnly checked={selected.includes(group.parentKey)} style={{ pointerEvents: 'none' }} />
                      {group.parentKey}
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
                        (하위 모듈 1개 이상 필수)
                      </span>
                    </div>
                  )}

                  {/* 하위 모듈 목록 */}
                  {filteredChildren.map((m) => (
                    <div
                      key={m}
                      onMouseDown={(e) => { e.preventDefault(); toggle(m); }}
                      style={{
                        padding: '6px 12px',
                        paddingLeft: group.parentKey ? 28 : 12,
                        fontSize: 13, cursor: 'pointer',
                        background: selected.includes(m) ? '#eff6ff' : 'transparent',
                        fontWeight: selected.includes(m) ? 600 : 400,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <input type="checkbox" readOnly checked={selected.includes(m)} style={{ pointerEvents: 'none' }} />
                      {m}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
