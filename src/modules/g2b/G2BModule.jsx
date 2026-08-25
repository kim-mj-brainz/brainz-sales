/* =============================================================
   조달(G2B) (담당: 영업지원)
   [통계] [상세 실적] [설정] — 통계/상세 실적은 상세 요구사항 확정 전까지 플레이스홀더
   [설정] 추적 대상 대분류/업체 관리 — 업체 검색은 수집된 조달 데이터(g2b_procurement_records)
   중 업체명을 대상으로 함. 아직 수집 전이라면 검색 결과가 비어있는 게 정상이며,
   그 경우 업체명을 직접 입력해 등록할 수 있다.
   ============================================================= */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Input, Table, Modal, Pagination } from '../../common/components.jsx';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
const DEFAULT_G2B_BASE_URL = 'https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService/getSpcifyPrdlstPrcureInfoList';
const G2B_RECORDS_PAGE_SIZE = 20;

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

/* 시스템 > 설정 화면에서 렌더링 — 공공데이터포털 SERVICE_KEY/BASE_URL은
   조달(G2B) 업무 설정이 아니라 시스템 연동 설정으로 분류해 이동함. */
export function G2BApiSettings() {
  const { toast } = useApp();
  const [hasServiceKey, setHasServiceKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serviceKeyInput, setServiceKeyInput] = useState('');
  const [savingServiceKey, setSavingServiceKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [savingBaseUrl, setSavingBaseUrl] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/g2b/settings`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setHasServiceKey(!!data.hasServiceKey);
            setBaseUrl(data.baseUrl || DEFAULT_G2B_BASE_URL);
          }
        }
      } catch (error) {
        // 조회 실패는 화면 사용을 막지 않음
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function putG2BSettings(patch) {
    const res = await fetch(`${API_BASE}/g2b/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('저장 실패');
  }

  async function saveServiceKey() {
    const value = serviceKeyInput.trim();
    if (!value) { toast('SERVICE_KEY 값을 입력하세요.', 'err'); return; }
    setSavingServiceKey(true);
    try {
      await putG2BSettings({ serviceKey: value });
      setHasServiceKey(true);
      setServiceKeyInput('');
      toast('SERVICE_KEY가 저장되었습니다.');
    } catch (error) {
      toast('SERVICE_KEY 저장에 실패했습니다.', 'err');
    } finally {
      setSavingServiceKey(false);
    }
  }

  async function saveBaseUrl() {
    const value = baseUrl.trim();
    if (!value) { toast('BASE_URL을 입력하세요.', 'err'); return; }
    setSavingBaseUrl(true);
    try {
      await putG2BSettings({ baseUrl: value });
      toast('BASE_URL이 저장되었습니다.');
    } catch (error) {
      toast('BASE_URL 저장에 실패했습니다.', 'err');
    } finally {
      setSavingBaseUrl(false);
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ fontSize: 14 }}>조달(G2B) API 설정</div>
      <div style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ fontSize: 13, marginBottom: 4 }}>공공데이터포털 SERVICE_KEY</div>
        <p className="muted">{loading ? '확인 중...' : hasServiceKey ? '등록된 키: ******** (설정됨)' : '등록된 키가 없습니다.'}</p>
        <Input label="새 키 입력 (변경 시에만 입력)" type="password" value={serviceKeyInput}
          onChange={(e) => setServiceKeyInput(e.target.value)} placeholder="디코딩(Decoding)된 SERVICE_KEY" className="full" />
        <div className="row">
          <Button onClick={saveServiceKey} disabled={savingServiceKey}>{savingServiceKey ? '저장 중...' : '저장'}</Button>
        </div>
      </div>
      <hr className="section-divider" />
      <div style={{ marginTop: 16 }}>
        <div className="card-title" style={{ fontSize: 13, marginBottom: 4 }}>API 요청 주소 (BASE_URL)</div>
        <Input label="BASE_URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={DEFAULT_G2B_BASE_URL} className="full" />
        <div className="row">
          <Button onClick={saveBaseUrl} disabled={savingBaseUrl}>{savingBaseUrl ? '저장 중...' : '저장'}</Button>
        </div>
      </div>
    </div>
  );
}

export function G2BPerformance() {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, totalAmount: 0 });

  const totalPages = Math.max(1, Math.ceil(data.total / G2B_RECORDS_PAGE_SIZE));

  const fetchRecords = useCallback(async (targetPage, targetQuery) => {
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(G2B_RECORDS_PAGE_SIZE) });
      if (targetQuery) params.set('q', targetQuery);
      const res = await fetch(`${API_BASE}/g2b/records?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setData({
        items: Array.isArray(json.items) ? json.items : [],
        total: json.total || 0,
        totalAmount: json.totalAmount || 0,
      });
    } catch (error) {
      toast('조달실적 목록을 불러오지 못했습니다.', 'err');
    }
  }, [toast]);

  useEffect(() => { setPage(1); }, [q]);
  useEffect(() => { fetchRecords(page, q); }, [page, q, fetchRecords]);

  const query = q.trim();

  return (
    <div>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 320 }}
          placeholder="날짜/업체명/납품기관/물품식별번호/물품명/수량/금액 검색"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {query && (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="muted">검색결과 {data.total.toLocaleString()}건 · 총 금액</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{data.totalAmount.toLocaleString()}원</div>
        </div>
      )}
      <Table
        columns={[
          { key: 'dcisnDt', label: '날짜', render: (r) => r.dcisnDt ? new Date(r.dcisnDt).toLocaleDateString('ko-KR') : '-' },
          { key: 'corpNm', label: '업체명', render: (r) => r.corpNm || '-' },
          { key: 'dmndInsttNm', label: '납품기관', render: (r) => r.dmndInsttNm || '-' },
          { key: 'prdctIdntNo', label: '물품식별번호', render: (r) => r.prdctIdntNo || '-' },
          { key: 'dtlPrdctNm', label: '물품명', render: (r) => r.dtlPrdctNm || '-' },
          { key: 'dlvrQty', label: '수량', render: (r) => r.dlvrQty.toLocaleString() },
          { key: 'dlvrAmt', label: '금액', render: (r) => r.dlvrAmt.toLocaleString() },
        ]}
        data={data.items}
        emptyText={query ? '검색 결과가 없습니다.' : '수집된 조달실적이 없습니다. 조달(G2B)-설정에서 수집을 먼저 실행하세요.'}
      />
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
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

  const [dtlPrdctNos, setDtlPrdctNos] = useState([]);
  const [newCode, setNewCode] = useState('');
  const [savingCodes, setSavingCodes] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/g2b/settings`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setDtlPrdctNos(Array.isArray(data.dtlPrdctNos) ? data.dtlPrdctNos : []);
        }
      } catch (error) {
        // 조회 실패는 화면 사용을 막지 않음
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function putG2BSettings(patch) {
    const res = await fetch(`${API_BASE}/g2b/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('저장 실패');
  }

  function addCode() {
    const code = newCode.trim();
    if (!code) return;
    if (dtlPrdctNos.includes(code)) { toast('이미 등록된 코드입니다.', 'err'); return; }
    setDtlPrdctNos((cur) => [...cur, code]);
    setNewCode('');
  }

  function removeCode(code) {
    setDtlPrdctNos((cur) => cur.filter((c) => c !== code));
  }

  async function saveCodes() {
    setSavingCodes(true);
    try {
      await putG2BSettings({ dtlPrdctNos });
      toast('세부품명번호 목록이 저장되었습니다.');
    } catch (error) {
      toast('세부품명번호 저장에 실패했습니다.', 'err');
    } finally {
      setSavingCodes(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const oneYearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); })();
  const [collectStart, setCollectStart] = useState(oneYearAgo);
  const [collectEnd, setCollectEnd] = useState(today);
  const [collectStatus, setCollectStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const [progressDismissed, setProgressDismissed] = useState(false);
  const [clearingRecords, setClearingRecords] = useState(false);

  async function refreshCollectStatus() {
    try {
      const res = await fetch(`${API_BASE}/g2b/collect/status`);
      if (res.ok) setCollectStatus(await res.json());
    } catch (error) {
      // 무시 — 상태 표시만 실패
    }
  }

  useEffect(() => { refreshCollectStatus(); }, []);

  // 수집 진행 중에는 2초마다 상태를 갱신해 진행률 창에 반영
  useEffect(() => {
    if (!collectStatus?.running) return;
    const timer = setInterval(refreshCollectStatus, 2000);
    return () => clearInterval(timer);
  }, [collectStatus?.running]);

  async function startCollect() {
    setStarting(true);
    try {
      const res = await fetch(`${API_BASE}/g2b/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: collectStart, endDate: collectEnd }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || '수집 시작에 실패했습니다.', 'err'); return; }
      setProgressDismissed(false);
      toast('수집을 시작했습니다.');
      refreshCollectStatus();
    } catch (error) {
      toast('수집 시작에 실패했습니다.', 'err');
    } finally {
      setStarting(false);
    }
  }

  async function clearAllRecords() {
    if (!confirm('수집된 조달실적 데이터를 전체 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    setClearingRecords(true);
    try {
      const res = await fetch(`${API_BASE}/g2b/records`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      toast('수집된 조달실적 데이터를 모두 삭제했습니다.');
    } catch (error) {
      toast('삭제에 실패했습니다.', 'err');
    } finally {
      setClearingRecords(false);
    }
  }

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
      <div className="hint">SERVICE_KEY / BASE_URL은 시스템 &gt; 설정 화면으로 이동했습니다.</div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>세부품명번호 (수집 대상 코드)</div>
        <p className="muted">조달실적 수집 시 이 코드들을 기준으로 API를 호출합니다. 업종이 확장되면 코드를 추가해주세요.</p>
        <div className="row">
          <input className="input" style={{ maxWidth: 240 }} placeholder="예: 4323300101" value={newCode}
            onChange={(e) => setNewCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCode()} />
          <Button variant="secondary" onClick={addCode}>코드 추가</Button>
          <Button onClick={saveCodes} disabled={savingCodes}>{savingCodes ? '저장 중...' : '목록 저장'}</Button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          {dtlPrdctNos.length === 0 && <span className="muted">등록된 코드가 없습니다.</span>}
          {dtlPrdctNos.map((code) => (
            <span key={code} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {code}
              <button onClick={() => removeCode(code)} title="삭제"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b42318', fontWeight: 700 }}>×</button>
            </span>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>조달실적 수집 실행</div>
        <p className="muted">지정한 기간(최대 12개월 단위로 자동 분할) 동안, 위 세부품명번호 전체에 대해 조달실적을 수집합니다. 이미 있는 데이터는 갱신됩니다(idempotent).</p>
        <div className="form-grid">
          <Input label="시작일" type="date" value={collectStart} onChange={(e) => setCollectStart(e.target.value)} />
          <Input label="종료일" type="date" value={collectEnd} onChange={(e) => setCollectEnd(e.target.value)} />
        </div>
        <div className="row">
          <Button onClick={startCollect} disabled={starting || collectStatus?.running}>
            {collectStatus?.running ? '수집 진행 중...' : starting ? '시작 중...' : '수집 시작'}
          </Button>
          <Button variant="secondary" onClick={refreshCollectStatus}>상태 새로고침</Button>
        </div>
        {collectStatus?.lastResult && (
          <div className="hint" style={{ marginTop: 8 }}>
            마지막 실행: {collectStatus.lastRunAt ? new Date(collectStatus.lastRunAt).toLocaleString('ko-KR') : '-'}
            {' · '}처리 {collectStatus.lastResult.processed}건 / 저장 {collectStatus.lastResult.upserted}건 / 총액계약 제외 {collectStatus.lastResult.excluded}건
            {collectStatus.lastResult.errors?.length > 0 && (
              <div className="err-text">오류: {collectStatus.lastResult.errors.join(', ')}</div>
            )}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>수집 데이터 초기화</div>
        <p className="muted">수집된 조달실적(상세 실적 화면에 표시되는 데이터)을 전체 삭제합니다. 되돌릴 수 없습니다.</p>
        <div className="row">
          <Button variant="danger" onClick={clearAllRecords} disabled={clearingRecords}>
            {clearingRecords ? '삭제 중...' : '수집 데이터 전체 삭제'}
          </Button>
        </div>
      </div>

      {collectStatus?.running && !progressDismissed && (
        <Modal title="조달실적 수집 진행 중" onClose={() => setProgressDismissed(true)}>
          <p>
            코드 {collectStatus.progress?.codeIndex || 0} / {collectStatus.progress?.totalCodes || 0}
            {collectStatus.progress?.currentCode ? ` (${collectStatus.progress.currentCode})` : ''}
          </p>
          {collectStatus.progress?.currentRange && <p className="muted">기간: {collectStatus.progress.currentRange}</p>}
          <p>처리 {collectStatus.progress?.processed || 0}건 · 저장 {collectStatus.progress?.upserted || 0}건 · 총액계약 제외 {collectStatus.progress?.excluded || 0}건</p>
          <p className="hint">창을 닫아도 수집은 백그라운드에서 계속 진행됩니다.</p>
        </Modal>
      )}

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
