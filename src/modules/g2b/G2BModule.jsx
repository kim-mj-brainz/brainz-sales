/* =============================================================
   조달(G2B) (담당: 영업지원)
   [통계] [상세 실적] [설정] — 통계/상세 실적은 상세 요구사항 확정 전까지 플레이스홀더
   [설정] 추적 대상 대분류/업체 관리 — 업체 검색은 수집된 조달 데이터(g2b_procurement_records)
   중 업체명을 대상으로 함. 아직 수집 전이라면 검색 결과가 비어있는 게 정상이며,
   그 경우 업체명을 직접 입력해 등록할 수 있다.
   ============================================================= */
import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Input, Table, Modal, Pagination, Badge } from '../../common/components.jsx';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
const DEFAULT_G2B_BASE_URL = 'https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService/getSpcifyPrdlstPrcureInfoList';
const G2B_RECORDS_PAGE_SIZE = 20;
const IS_OWN_COMPANY = (name) => String(name || '').includes('브레인즈');
const OWN_COLOR = '#1557F5';
const COMPETITOR_COLORS = ['#d97706', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#be185d', '#4b5563'];
const toEok = (won) => won / 100000000;

/* 업체별 매출추이 라인차트 — 단위 억원. series: [{ name, color, own, values: {year: amount} }] */
function G2BTrendChart({ series, years, height = 240 }) {
  const width = 640;
  const marginLeft = 44, marginRight = 12, marginTop = 12, marginBottom = 26;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const allVals = series.flatMap((s) => years.map((y) => toEok(s.values[y] || 0)));
  const rawMax = Math.max(1, ...allVals);
  const maxVal = rawMax * 1.15;

  const xFor = (i) => marginLeft + (years.length <= 1 ? plotW / 2 : (plotW * i) / (years.length - 1));
  const yFor = (v) => marginTop + plotH - (v / maxVal) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxVal);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={marginLeft} y1={yFor(t)} x2={width - marginRight} y2={yFor(t)} stroke="var(--border)" strokeWidth="1" />
          <text x={marginLeft - 6} y={yFor(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{t.toFixed(0)}</text>
        </g>
      ))}
      {years.map((y, i) => (
        <text key={y} x={xFor(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{y}</text>
      ))}
      {series.map((s) => {
        const points = years.map((y, i) => `${xFor(i)},${yFor(toEok(s.values[y] || 0))}`).join(' ');
        return (
          <g key={s.name}>
            <polyline points={points} fill="none" stroke={s.color} strokeWidth={s.own ? 3 : 2} />
            {years.map((y, i) => (
              <circle key={y} cx={xFor(i)} cy={yFor(toEok(s.values[y] || 0))} r={s.own ? 4 : 3} fill={s.color}>
                <title>{`${s.name} ${y}년: ${toEok(s.values[y] || 0).toFixed(1)}억원`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function G2BPlaceholder({ title }) {
  return (
    <div className="card card-pad">
      <div className="card-title">{title}</div>
      <p className="muted">준비 중입니다. 상세 요구사항 확정 후 구현됩니다.</p>
    </div>
  );
}

/* 조달(G2B) 통계 — 대분류를 선택(기본 EMS)하면 그 대분류에 등록된 업체만 대상으로
   1) 최근 5년 매출추이(억원, 합쳐보기/업체별보기 전환) 2) 연도 선택 시 업체별 TOP10 수요기관 을 보여준다. */
export function G2BStats() {
  const categoryCollection = useCollection('g2bCategories', []);
  const targetCollection = useCollection('g2bTargets', []);
  const [statsRows, setStatsRows] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [instRows, setInstRows] = useState([]);
  const [loadingInst, setLoadingInst] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [chartMode, setChartMode] = useState('combined');
  const [selectedYear, setSelectedYear] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/g2b/stats`);
        const data = res.ok ? await res.json() : { items: [] };
        if (!cancelled) setStatsRows(Array.isArray(data.items) ? data.items : []);
      } catch (error) {
        if (!cancelled) setStatsRows([]);
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => (
    [...categoryCollection.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR'))
  ), [categoryCollection.items]);

  const targetsByCategory = useMemo(() => {
    const map = new Map();
    for (const t of targetCollection.items) {
      const list = map.get(t.category) || [];
      list.push(t);
      map.set(t.category, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR'));
    }
    return map;
  }, [targetCollection.items]);

  useEffect(() => {
    if (selectedCategory || !categories.length) return;
    const ems = categories.find((c) => c.name === 'EMS');
    setSelectedCategory((ems || categories[0]).name);
  }, [categories, selectedCategory]);

  const targets = targetsByCategory.get(selectedCategory) || [];
  const targetNamesKey = targets.map((t) => t.name).join('|');

  useEffect(() => {
    if (!targetNamesKey) { setInstRows([]); return; }
    let cancelled = false;
    setLoadingInst(true);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/g2b/stats/institutions?corpNames=${encodeURIComponent(targetNamesKey.split('|').join(','))}`);
        const data = res.ok ? await res.json() : { items: [] };
        if (!cancelled) setInstRows(Array.isArray(data.items) ? data.items : []);
      } catch (error) {
        if (!cancelled) setInstRows([]);
      } finally {
        if (!cancelled) setLoadingInst(false);
      }
    })();
    return () => { cancelled = true; };
  }, [targetNamesKey]);

  // 업체명 -> { amount, qty, count, byYear: { year: amount } }
  const totalsByCompany = useMemo(() => {
    const map = new Map();
    for (const row of statsRows || []) {
      const cur = map.get(row.corpNm) || { amount: 0, qty: 0, count: 0, byYear: {} };
      cur.amount += row.amount;
      cur.qty += row.qty;
      cur.count += row.count;
      cur.byYear[row.year] = (cur.byYear[row.year] || 0) + row.amount;
      map.set(row.corpNm, cur);
    }
    return map;
  }, [statsRows]);

  const currentYear = new Date().getFullYear();
  const trendYears = useMemo(() => {
    const arr = [];
    for (let y = currentYear - 4; y <= currentYear; y++) arr.push(y);
    return arr;
  }, [currentYear]);

  const availableYears = useMemo(() => (
    [...new Set((statsRows || []).map((r) => r.year))].sort((a, b) => b - a)
  ), [statsRows]);

  useEffect(() => {
    if (selectedYear || !availableYears.length) return;
    setSelectedYear(availableYears[0]);
  }, [availableYears, selectedYear]);

  if (loadingStats) return <div className="card card-pad"><p className="muted">불러오는 중...</p></div>;

  if (categories.length === 0) {
    return (
      <div className="card card-pad">
        <div className="card-title">조달(G2B) 통계</div>
        <p className="muted">조달(G2B)-설정에서 대분류와 업체를 먼저 등록해야 통계를 볼 수 있습니다.</p>
      </div>
    );
  }

  const series = targets.map((t, i) => ({
    name: t.name,
    own: IS_OWN_COMPANY(t.name),
    color: IS_OWN_COMPANY(t.name) ? OWN_COLOR : COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
    values: (totalsByCompany.get(t.name) || { byYear: {} }).byYear,
  }));

  const instYearRows = (instRows || []).filter((r) => r.year === selectedYear);
  const top10ByCompany = targets.map((t) => ({
    name: t.name,
    own: IS_OWN_COMPANY(t.name),
    rows: instYearRows.filter((r) => r.corpNm === t.name).sort((a, b) => b.amount - a.amount).slice(0, 10),
  }));

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {categories.map((c) => (
            <Button key={c.id} size="sm" variant={selectedCategory === c.name ? 'primary' : 'secondary'}
              onClick={() => setSelectedCategory(c.name)}>{c.name}</Button>
          ))}
        </div>
      </div>

      {targets.length === 0 ? (
        <div className="card card-pad">
          <p className="muted">'{selectedCategory}'에 등록된 업체가 없습니다. 조달(G2B)-설정에서 업체를 등록하세요.</p>
        </div>
      ) : (
        <>
          <div className="card card-pad">
            <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
              <div className="card-title" style={{ fontSize: 15 }}>업체별 최근 5년 매출추이 (단위: 억원)</div>
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" variant={chartMode === 'combined' ? 'primary' : 'secondary'} onClick={() => setChartMode('combined')}>한 그래프로 보기</Button>
                <Button size="sm" variant={chartMode === 'separate' ? 'primary' : 'secondary'} onClick={() => setChartMode('separate')}>업체별로 보기</Button>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>{currentYear}년은 현재까지 수집된 데이터 기준입니다.</p>

            {chartMode === 'combined' ? (
              <div style={{ marginTop: 12, maxWidth: 560 }}>
                <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
                  {series.map((s) => (
                    <span key={s.name} className="row" style={{ gap: 6, fontSize: 12, alignItems: 'center' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                      {s.name}{s.own && ' (자사)'}
                    </span>
                  ))}
                </div>
                <G2BTrendChart series={series} years={trendYears} height={200} />
              </div>
            ) : (
              <div className="grid" style={{ gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 12 }}>
                {series.map((s) => (
                  <div key={s.name}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                      {s.name}{s.own && <span style={{ marginLeft: 6 }}><Badge color="blue">자사</Badge></span>}
                    </div>
                    <G2BTrendChart series={[s]} years={trendYears} height={180} />
                  </div>
                ))}
              </div>
            )}

            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>업체명</th>
                    {trendYears.map((y) => <th key={y} style={{ textAlign: 'right' }}>{y}년</th>)}
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}{s.own && <span style={{ marginLeft: 6 }}><Badge color="blue">자사</Badge></span>}</td>
                      {trendYears.map((y) => (
                        <td key={y} style={{ textAlign: 'right' }} title={(s.values[y] || 0).toLocaleString() + '원'}>
                          {(s.values[y] || 0) > 0 ? toEok(s.values[y] || 0).toFixed(1) + '억원' : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card card-pad">
            <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
              <div className="card-title" style={{ fontSize: 15 }}>연도별 업체별 TOP10 수요기관</div>
              {availableYears.length > 0 && (
                <Input as="select" value={selectedYear || ''} onChange={(e) => setSelectedYear(Number(e.target.value))} style={{ maxWidth: 140 }}>
                  {availableYears.map((y) => <option key={y} value={y}>{y}년</option>)}
                </Input>
              )}
            </div>
            {availableYears.length === 0 ? (
              <p className="muted" style={{ marginTop: 8 }}>수집된 데이터가 없습니다.</p>
            ) : loadingInst ? (
              <p className="muted" style={{ marginTop: 8 }}>불러오는 중...</p>
            ) : (
              <div className="grid" style={{ gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginTop: 12 }}>
                {top10ByCompany.map((c) => (
                  <div key={c.name}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                      {c.name}{c.own && <span style={{ marginLeft: 6 }}><Badge color="blue">자사</Badge></span>}
                    </div>
                    {c.rows.length === 0 ? (
                      <p className="muted">해당 연도 데이터가 없습니다.</p>
                    ) : (
                      <Table
                        columns={[
                          { key: 'rank', label: '순위', render: (r, i) => i + 1 },
                          { key: 'dmndInsttNm', label: '수요기관', render: (r) => r.dmndInsttNm },
                          { key: 'amount', label: '금액', render: (r) => r.amount.toLocaleString() + '원' },
                        ]}
                        data={c.rows}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
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

const G2B_EMPTY_FILTERS = {
  startDate: '', endDate: '', corpNm: '', dmndInsttNm: '', prdctIdntNo: '', dtlPrdctNm: '',
};

/* 검색일 기본값: 최근 1개월 */
function defaultG2BFilters() {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  const toDash = (d) => d.toISOString().slice(0, 10);
  return { ...G2B_EMPTY_FILTERS, startDate: toDash(start), endDate: toDash(end) };
}

export function G2BPerformance() {
  const { toast } = useApp();
  const [filters, setFilters] = useState(defaultG2BFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, totalAmount: 0 });

  const totalPages = Math.max(1, Math.ceil(data.total / G2B_RECORDS_PAGE_SIZE));
  const hasFilter = Object.values(filters).some((v) => v.trim());

  useEffect(() => { setPage(1); }, [filters]);

  // 검색어 입력마다 즉시 요청이 발생하므로(디바운스 없음), 응답 순서가 뒤바뀌면
  // 이전(더 짧은) 검색어의 결과가 늦게 도착해 최신 결과를 덮어쓸 수 있다.
  // cancelled 플래그로 최신 요청의 응답만 반영한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(G2B_RECORDS_PAGE_SIZE) });
        Object.entries(filters).forEach(([key, value]) => {
          if (value.trim()) params.set(key, value.trim());
        });
        const res = await fetch(`${API_BASE}/g2b/records?${params.toString()}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setData({
          items: Array.isArray(json.items) ? json.items : [],
          total: json.total || 0,
          totalAmount: json.totalAmount || 0,
        });
      } catch (error) {
        if (!cancelled) toast('조달실적 목록을 불러오지 못했습니다.', 'err');
      }
    })();
    return () => { cancelled = true; };
  }, [page, filters, toast]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const resetFilters = () => setFilters(defaultG2BFilters());

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ fontSize: 14 }}>검색 (입력한 항목은 모두 AND로 적용)</div>
        <div className="form-grid">
          <Input label="시작일" type="date" value={filters.startDate} onChange={setFilter('startDate')} />
          <Input label="종료일" type="date" value={filters.endDate} onChange={setFilter('endDate')} />
          <Input label="업체명" value={filters.corpNm} onChange={setFilter('corpNm')} placeholder="예: 브레인즈컴퍼니" />
          <Input label="납품기관" value={filters.dmndInsttNm} onChange={setFilter('dmndInsttNm')} />
          <Input label="물품식별번호" value={filters.prdctIdntNo} onChange={setFilter('prdctIdntNo')} />
          <Input label="물품명" value={filters.dtlPrdctNm} onChange={setFilter('dtlPrdctNm')} />
        </div>
        <div className="row">
          <Button variant="secondary" onClick={resetFilters}>검색조건 초기화</Button>
        </div>
      </div>
      {hasFilter && (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="muted">검색결과 {data.total.toLocaleString()}건 · 총 금액</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{data.totalAmount.toLocaleString()}원</div>
        </div>
      )}
      <div className="g2b-perf-table">
        <Table
          columns={[
            { key: 'dcisnDt', label: '날짜', render: (r) => r.dcisnDt ? new Date(r.dcisnDt).toLocaleDateString('ko-KR') : '-' },
            { key: 'corpNm', label: '업체명', render: (r) => r.corpNm || '-' },
            { key: 'dmndInsttNm', label: '납품기관', render: (r) => r.dmndInsttNm || '-' },
            { key: 'dlvrReqNm', label: '사업명', render: (r) => r.dlvrReqNm || '-' },
            { key: 'prdctIdntNo', label: '물품식별번호', render: (r) => r.prdctIdntNo || '-' },
            { key: 'dtlPrdctNm', label: '물품명', render: (r) => r.dtlPrdctNm || '-' },
            { key: 'dlvrQty', label: '수량', render: (r) => r.dlvrQty.toLocaleString() },
            { key: 'dlvrAmt', label: '금액', render: (r) => r.dlvrAmt.toLocaleString() },
          ]}
          data={data.items}
          emptyText={hasFilter ? '검색 결과가 없습니다.' : '수집된 조달실적이 없습니다. 조달(G2B)-설정에서 수집을 먼저 실행하세요.'}
        />
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

/* 조달(G2B)-설정은 담당자(사번 10043) 계정만 수정 가능. 다른 계정은 조회만 가능. */
const G2B_SETTINGS_EDITOR_EMPLOYEE_NO = '10043';

export function G2BSettings() {
  const { toast, currentUser } = useApp();
  const canEdit = currentUser?.employeeNo === G2B_SETTINGS_EDITOR_EMPLOYEE_NO;
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
    if (!canEdit) return;
    const code = newCode.trim();
    if (!code) return;
    if (dtlPrdctNos.includes(code)) { toast('이미 등록된 코드입니다.', 'err'); return; }
    setDtlPrdctNos((cur) => [...cur, code]);
    setNewCode('');
  }

  function removeCode(code) {
    if (!canEdit) return;
    setDtlPrdctNos((cur) => cur.filter((c) => c !== code));
  }

  async function saveCodes() {
    if (!canEdit) return;
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
  const [collectLogs, setCollectLogs] = useState([]);
  const [logSearch, setLogSearch] = useState({ startDate: '', endDate: '' });

  async function refreshCollectLogs(search = logSearch) {
    try {
      const params = new URLSearchParams();
      if (search.startDate) params.set('startDate', search.startDate);
      if (search.endDate) params.set('endDate', search.endDate);
      const qs = params.toString();
      const res = await fetch(`${API_BASE}/g2b/collect/logs${qs ? `?${qs}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setCollectLogs(Array.isArray(data.items) ? data.items : []);
      }
    } catch (error) {
      // 무시 — 로그 표시만 실패
    }
  }

  function searchCollectLogs() {
    refreshCollectLogs(logSearch);
  }

  function resetCollectLogsSearch() {
    const cleared = { startDate: '', endDate: '' };
    setLogSearch(cleared);
    refreshCollectLogs(cleared);
  }

  async function refreshCollectStatus() {
    try {
      const res = await fetch(`${API_BASE}/g2b/collect/status`);
      if (res.ok) setCollectStatus(await res.json());
    } catch (error) {
      // 무시 — 상태 표시만 실패
    }
    refreshCollectLogs();
  }

  useEffect(() => { refreshCollectStatus(); }, []);

  // 수집 진행 중에는 2초마다 상태를 갱신해 진행률 창에 반영
  useEffect(() => {
    if (!collectStatus?.running) return;
    const timer = setInterval(refreshCollectStatus, 2000);
    return () => clearInterval(timer);
  }, [collectStatus?.running]);

  async function startCollect() {
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    [...categoryCollection.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR'))
  ), [categoryCollection.items]);

  const targetsByCategory = useMemo(() => {
    const map = new Map();
    for (const t of targetCollection.items) {
      const list = map.get(t.category) || [];
      list.push(t);
      map.set(t.category, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR'));
    }
    return map;
  }, [targetCollection.items]);

  function addCategory() {
    if (!canEdit) return;
    const name = newCategory.trim();
    if (!name) { toast('대분류명을 입력하세요.', 'err'); return; }
    if (categories.some((c) => c.name === name)) { toast('이미 등록된 대분류입니다.', 'err'); return; }
    const nextOrder = categories.length ? Math.max(...categories.map((c) => c.order ?? 0)) + 1 : 0;
    categoryCollection.add({ name, order: nextOrder }, 'G2BCAT');
    setNewCategory('');
    toast('대분류가 추가되었습니다.');
  }

  function deleteCategory(cat) {
    if (!canEdit) return;
    if (!confirm(`'${cat.name}' 대분류를 삭제하시겠습니까? 하위 업체 목록도 함께 삭제됩니다.`)) return;
    categoryCollection.remove(cat.id);
    targetCollection.replaceAll(targetCollection.items.filter((t) => t.category !== cat.name));
    if (selectedCategory === cat.name) setSelectedCategory('');
  }

  function moveCategory(id, direction) {
    if (!canEdit) return;
    const sorted = categories.map((c, i) => ({ ...c, order: i }));
    const idx = sorted.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx].order, sorted[swapIdx].order] = [sorted[swapIdx].order, sorted[idx].order];
    categoryCollection.replaceAll(sorted);
  }

  function moveTarget(category, id, direction) {
    if (!canEdit) return;
    const group = (targetsByCategory.get(category) || []).map((t, i) => ({ ...t, order: i }));
    const others = targetCollection.items.filter((t) => t.category !== category);
    const idx = group.findIndex((t) => t.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= group.length) return;
    [group[idx].order, group[swapIdx].order] = [group[swapIdx].order, group[idx].order];
    targetCollection.replaceAll([...others, ...group]);
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
    if (!canEdit) return;
    const category = selectedCategory;
    const name = selectedName.trim();
    if (!category) { toast('대분류를 선택하세요.', 'err'); return; }
    if (!name) { toast('업체명을 입력하거나 검색 결과에서 선택하세요.', 'err'); return; }
    if (targetCollection.items.some((t) => t.category === category && t.name === name)) {
      toast('이미 등록된 업체입니다.', 'err');
      return;
    }
    const group = targetsByCategory.get(category) || [];
    const nextOrder = group.length ? Math.max(...group.map((t) => t.order ?? 0)) + 1 : 0;
    targetCollection.add({ category, name, query: query.trim(), order: nextOrder }, 'G2BTGT');
    setSelectedName('');
    setQuery('');
    setSearchResults([]);
    setSearched(false);
    toast('업체가 등록되었습니다.');
  }

  function deleteTarget(t) {
    if (!canEdit) return;
    if (!confirm(`'${t.name}' 업체를 삭제하시겠습니까?`)) return;
    targetCollection.remove(t.id);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="hint">SERVICE_KEY / BASE_URL은 시스템 &gt; 설정 화면으로 이동했습니다.</div>
      {!canEdit && (
        <div className="hint" style={{ color: '#9a6700' }}>
          이 화면은 담당자(사번 {G2B_SETTINGS_EDITOR_EMPLOYEE_NO})만 수정할 수 있습니다. 현재 계정은 조회만 가능합니다.
        </div>
      )}

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>세부품명번호 (수집 대상 코드)</div>
        <p className="muted">조달실적 수집 시 이 코드들을 기준으로 API를 호출합니다. 업종이 확장되면 코드를 추가해주세요.</p>
        <div className="row">
          <input className="input" style={{ maxWidth: 240 }} placeholder="예: 4323300101" value={newCode} disabled={!canEdit}
            onChange={(e) => setNewCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCode()} />
          <Button variant="secondary" onClick={addCode} disabled={!canEdit}>코드 추가</Button>
          <Button onClick={saveCodes} disabled={!canEdit || savingCodes}>{savingCodes ? '저장 중...' : '목록 저장'}</Button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          {dtlPrdctNos.length === 0 && <span className="muted">등록된 코드가 없습니다.</span>}
          {dtlPrdctNos.map((code) => (
            <span key={code} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {code}
              {canEdit && (
                <button onClick={() => removeCode(code)} title="삭제"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b42318', fontWeight: 700 }}>×</button>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>조달실적 수집 실행</div>
        <p className="muted">지정한 기간(최대 12개월 단위로 자동 분할) 동안, 위 세부품명번호 전체에 대해 조달실적을 수집합니다. 이미 있는 데이터는 갱신됩니다(idempotent).</p>
        <div className="form-grid">
          <Input label="시작일" type="date" value={collectStart} onChange={(e) => setCollectStart(e.target.value)} disabled={!canEdit} />
          <Input label="종료일" type="date" value={collectEnd} onChange={(e) => setCollectEnd(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="row">
          <Button onClick={startCollect} disabled={!canEdit || starting || collectStatus?.running}>
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
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="card-title" style={{ fontSize: 14 }}>수집 실행 이력</div>
          <Button size="sm" variant="secondary" onClick={() => refreshCollectLogs()}>새로고침</Button>
        </div>
        <p className="muted">
          기본적으로 최근 10일치만 표시됩니다. 매일 08:00에 전날 데이터를 자동 수집합니다(자동). 수동 실행 이력도 함께 표시됩니다.
        </p>
        <div className="form-grid">
          <Input label="시작일" type="date" value={logSearch.startDate}
            onChange={(e) => setLogSearch((s) => ({ ...s, startDate: e.target.value }))} />
          <Input label="종료일" type="date" value={logSearch.endDate}
            onChange={(e) => setLogSearch((s) => ({ ...s, endDate: e.target.value }))} />
        </div>
        <div className="row">
          <Button size="sm" onClick={searchCollectLogs}>조회</Button>
          <Button size="sm" variant="secondary" onClick={resetCollectLogsSearch}>최근 10일로 초기화</Button>
        </div>
        <Table
          columns={[
            { key: 'runAt', label: '실행시각', render: (r) => r.runAt ? new Date(r.runAt).toLocaleString('ko-KR') : '-' },
            { key: 'trigger', label: '구분', render: (r) => r.trigger === 'scheduled' ? '자동' : '수동' },
            { key: 'range', label: '대상기간', render: (r) => `${r.startDate ? String(r.startDate).slice(0, 10) : '-'} ~ ${r.endDate ? String(r.endDate).slice(0, 10) : '-'}` },
            { key: 'processed', label: '처리', render: (r) => r.processed.toLocaleString() },
            { key: 'upserted', label: '저장', render: (r) => r.upserted.toLocaleString() },
            { key: 'excluded', label: '총액계약 제외', render: (r) => r.excluded.toLocaleString() },
            { key: 'errors', label: '오류', render: (r) => r.errors ? <span className="err-text">{r.errors}</span> : '-' },
          ]}
          data={collectLogs}
          emptyText="수집 실행 이력이 없습니다."
        />
      </div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>수집 데이터 초기화</div>
        <p className="muted">수집된 조달실적(상세 실적 화면에 표시되는 데이터)을 전체 삭제합니다. 되돌릴 수 없습니다.</p>
        <div className="row">
          <Button variant="danger" onClick={clearAllRecords} disabled={!canEdit || clearingRecords}>
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
          <input className="input" style={{ maxWidth: 240 }} placeholder="예: EMS, SIEM" value={newCategory} disabled={!canEdit}
            onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
          <Button onClick={addCategory} disabled={!canEdit}>대분류 추가</Button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          {categories.length === 0 && <span className="muted">등록된 대분류가 없습니다.</span>}
          {categories.map((c, i) => (
            <span key={c.id} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {canEdit && (
                <>
                  <button onClick={() => moveCategory(c.id, -1)} disabled={i === 0} title="위로"
                    style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, padding: '0 2px' }}>▲</button>
                  <button onClick={() => moveCategory(c.id, 1)} disabled={i === categories.length - 1} title="아래로"
                    style={{ border: 'none', background: 'none', cursor: i === categories.length - 1 ? 'default' : 'pointer', opacity: i === categories.length - 1 ? 0.3 : 1, padding: '0 2px' }}>▼</button>
                </>
              )}
              {c.name}
              {canEdit && (
                <button onClick={() => deleteCategory(c)} title="삭제"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b42318', fontWeight: 700 }}>×</button>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>업체 등록</div>
        <div className="form-grid">
          <Input label="대분류" as="select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} disabled={!canEdit}>
            <option value="">선택하세요</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Input>
          <Input label="검색어" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchCompanies(); } }}
            placeholder="예: 브레인즈컴퍼니" disabled={!canEdit} />
        </div>
        <div className="row">
          <Button variant="secondary" onClick={searchCompanies} disabled={!canEdit || searching}>{searching ? '검색 중...' : '업체 검색'}</Button>
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
            placeholder="예: 브레인즈컴퍼니(주)" className="full" disabled={!canEdit} />
        </div>
        <div className="row"><Button onClick={addTarget} disabled={!canEdit}>업체 등록</Button></div>
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
                <div className="g2b-target-table">
                  <Table
                    columns={[
                      { key: 'name', label: '업체명', render: (r) => r.name },
                      { key: 'query', label: '검색어', render: (r) => r.query || '-' },
                      { key: 'actions', label: '관리', render: (r, idx) => (
                        canEdit ? (
                          <div className="row">
                            <Button size="sm" variant="secondary" disabled={idx === 0} onClick={() => moveTarget(c.name, r.id, -1)}>▲</Button>
                            <Button size="sm" variant="secondary" disabled={idx === list.length - 1} onClick={() => moveTarget(c.name, r.id, 1)}>▼</Button>
                            <Button size="sm" variant="danger" onClick={() => deleteTarget(r)}>삭제</Button>
                          </div>
                        ) : <span className="muted">-</span>
                      ) },
                    ]}
                    data={list}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
