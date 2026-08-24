/* =============================================================
   조달(G2B) (담당: 영업지원)
   [통계] [상세 실적] [설정] — 통계/상세 실적은 상세 요구사항 확정 전까지 플레이스홀더
   [설정] 추적 대상 대분류/업체 관리 — 업체 검색은 수집된 조달 데이터(g2b_procurement_records)
   중 업체명을 대상으로 함. 아직 수집 전이라면 검색 결과가 비어있는 게 정상이며,
   그 경우 업체명을 직접 입력해 등록할 수 있다.
   ============================================================= */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Input, Table } from '../../common/components.jsx';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

function G2BPlaceholder({ title }) {
  return (
    <div className="card card-pad">
      <div className="card-title">{title}</div>
      <p className="muted">준비 중입니다. 상세 요구사항 확정 후 구현됩니다.</p>
    </div>
  );
}

export function G2BStats() {
  return <G2BPlaceholder title="조달(G2B) 통계" />;
}

export function G2BPerformance() {
  return <G2BPlaceholder title="조달(G2B) 상세 실적" />;
}

export function G2BSettings() {
  const { toast } = useApp();
  const categoryCollection = useCollection('g2bCategories', []);
  const targetCollection = useCollection('g2bTargets', []);

  const [newCategory, setNewCategory] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const categories = useMemo(() => (
    [...categoryCollection.items].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR'))
  ), [categoryCollection.items]);

  const targetsByCategory = useMemo(() => {
    const map = new Map();
    for (const t of targetCollection.items) {
      const list = map.get(t.category) || [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [targetCollection.items]);

  function addCategory() {
    const name = newCategory.trim();
    if (!name) { toast('대분류명을 입력하세요.', 'err'); return; }
    if (categories.some((c) => c.name === name)) { toast('이미 등록된 대분류입니다.', 'err'); return; }
    categoryCollection.add({ name }, 'G2BCAT');
    setNewCategory('');
    toast('대분류가 추가되었습니다.');
  }

  function deleteCategory(cat) {
    if (!confirm(`'${cat.name}' 대분류를 삭제하시겠습니까? 하위 업체 목록도 함께 삭제됩니다.`)) return;
    categoryCollection.remove(cat.id);
    targetCollection.replaceAll(targetCollection.items.filter((t) => t.category !== cat.name));
    if (selectedCategory === cat.name) setSelectedCategory('');
  }

  async function searchCompanies() {
    const q = query.trim();
    if (!q) { toast('검색어를 입력하세요.', 'err'); return; }
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/g2b/companies/search?q=${encodeURIComponent(q)}`);
      const data = res.ok ? await res.json() : { items: [] };
      setSearchResults(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      toast('업체 검색에 실패했습니다.', 'err');
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }

  function addTarget() {
    const category = selectedCategory;
    const name = selectedName.trim();
    if (!category) { toast('대분류를 선택하세요.', 'err'); return; }
    if (!name) { toast('업체명을 입력하거나 검색 결과에서 선택하세요.', 'err'); return; }
    if (targetCollection.items.some((t) => t.category === category && t.name === name)) {
      toast('이미 등록된 업체입니다.', 'err');
      return;
    }
    targetCollection.add({ category, name, query: query.trim() }, 'G2BTGT');
    setSelectedName('');
    setQuery('');
    setSearchResults([]);
    setSearched(false);
    toast('업체가 등록되었습니다.');
  }

  function deleteTarget(t) {
    if (!confirm(`'${t.name}' 업체를 삭제하시겠습니까?`)) return;
    targetCollection.remove(t.id);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>대분류 관리</div>
        <div className="row">
          <input className="input" style={{ maxWidth: 240 }} placeholder="예: EMS, SIEM" value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
          <Button onClick={addCategory}>대분류 추가</Button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          {categories.length === 0 && <span className="muted">등록된 대분류가 없습니다.</span>}
          {categories.map((c) => (
            <span key={c.id} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {c.name}
              <button onClick={() => deleteCategory(c)} title="삭제"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b42318', fontWeight: 700 }}>×</button>
            </span>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>업체 등록</div>
        <div className="form-grid">
          <Input label="대분류" as="select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="">선택하세요</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Input>
          <Input label="검색어" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchCompanies(); } }}
            placeholder="예: 브레인즈컴퍼니" />
        </div>
        <div className="row">
          <Button variant="secondary" onClick={searchCompanies} disabled={searching}>{searching ? '검색 중...' : '업체 검색'}</Button>
        </div>
        {searchResults.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {searchResults.map((name) => (
              <button key={name} className="tag" style={{ cursor: 'pointer' }} onClick={() => setSelectedName(name)}>{name}</button>
            ))}
          </div>
        )}
        {searched && !searching && searchResults.length === 0 && (
          <p className="hint">검색 결과가 없습니다. 수집된 조달 데이터가 아직 없거나 일치하는 업체가 없는 경우입니다 — 아래에 정확한 업체명을 직접 입력해 등록할 수 있습니다.</p>
        )}
        <div className="form-grid" style={{ marginTop: 8 }}>
          <Input label="등록할 업체명 (풀네임)" value={selectedName} onChange={(e) => setSelectedName(e.target.value)}
            placeholder="예: 브레인즈컴퍼니(주)" className="full" />
        </div>
        <div className="row"><Button onClick={addTarget}>업체 등록</Button></div>
      </div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>등록된 업체 목록</div>
        {categories.length === 0 && <p className="muted">대분류를 먼저 등록하세요.</p>}
        {categories.map((c) => {
          const list = targetsByCategory.get(c.name) || [];
          return (
            <div key={c.id} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {c.name} <span className="muted" style={{ fontWeight: 400 }}>({list.length})</span>
              </div>
              {list.length === 0 ? (
                <p className="muted" style={{ marginLeft: 8 }}>등록된 업체가 없습니다.</p>
              ) : (
                <Table
                  columns={[
                    { key: 'name', label: '업체명', render: (r) => r.name },
                    { key: 'query', label: '검색어', render: (r) => r.query || '-' },
                    { key: 'actions', label: '관리', render: (r) => <Button size="sm" variant="danger" onClick={() => deleteTarget(r)}>삭제</Button> },
                  ]}
                  data={list}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
