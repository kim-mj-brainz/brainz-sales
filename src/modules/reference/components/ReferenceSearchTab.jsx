/* 레퍼런스 검색 탭 */
import React, { useState, useMemo } from 'react';
import { Button, Input, Badge, Spinner } from '../../../common/components.jsx';
import { AUDIT_CATEGORY } from '../../../common/audit.js';
import { useApp } from '../../../common/AppContext.jsx';
import { isDuplicate } from '../utils/duplicateCheck.js';
import ModuleMultiSelect from './ModuleMultiSelect.jsx';
import ReferenceDetailModal from './ReferenceDetailModal.jsx';

const LAZY_STEP = 10;

export default function ReferenceSearchTab({ col, canEdit, logAudit, toast }) {
  const { master } = useApp();
  const industryOptions = master?.INDUSTRY || [];
  const orgTypeOptions  = master?.ORG_TYPE  || [];
  const [search, setSearch] = useState({
    customer: '', project: '', bizNo: '', year: '',
    region: '', industry: '', orgType: '', modules: [],
  });
  const [applied, setApplied] = useState({});
  const [loading, setLoading] = useState(false);
  const [limit, setLimit]     = useState(LAZY_STEP);
  const [detail, setDetail]   = useState(null);
  const [dupOnly, setDupOnly] = useState(false);

  const results = useMemo(() => {
    let r = col.items.filter((ref) => {
      const a = applied;
      if (a.customer && !ref.customer?.includes(a.customer))                         return false;
      if (a.project  && !ref.project?.includes(a.project))                           return false;
      if (a.bizNo    && !(ref.bizNo || '').includes(a.bizNo))                        return false;
      if (a.year     && String(ref.year) !== String(a.year))                         return false;
      if (a.region   && !`${ref.region ?? ''}${ref.address ?? ''}`.includes(a.region)) return false;
      if (a.industry && ref.industry !== a.industry)                                  return false;
      if (a.orgType  && ref.orgType  !== a.orgType)                                   return false;
      if (a.modules?.length && !a.modules.every((m) => ref.modules?.includes(m)))    return false;
      return true;
    });
    r = [...r].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
    if (dupOnly) r = r.filter((ref) => isDuplicate(ref, col.items));
    return r;
  }, [col.items, applied, dupOnly]);

  function doSearch() {
    setLoading(true);
    setLimit(LAZY_STEP);
    // TODO: 서버 API 조회. MVP는 클라이언트 필터 + 지연 시뮬레이션.
    setTimeout(() => { setApplied({ ...search }); setLoading(false); }, 300);
    logAudit({ category: AUDIT_CATEGORY.REFERENCE, eventType: 'SEARCH', result: 'SUCCESS', extra: search });
  }

  function reset() {
    setSearch({ customer: '', project: '', bizNo: '', year: '', region: '', industry: '', orgType: '', modules: [] });
    setApplied({});
    setDupOnly(false);
    setLimit(LAZY_STEP);
  }

  function downloadCsv() {
    const head = ['고객명', '사업명', '사업번호', '연도', '지역', '산업군', '기관유형', '도입모듈', '검수상태'];
    const rows = results.map((r) => [
      r.customer, r.project, r.bizNo, r.year,
      r.region, r.industry, r.orgType,
      (r.modules || []).join('|'), r.status,
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'references.csv';
    a.click();
    toast('현재 검색 결과를 CSV로 내보냈습니다.');
  }

  const set    = (k) => (e) => setSearch((s) => ({ ...s, [k]: e.target.value }));
  const shown  = results.slice(0, limit);

  return (
    <div>
      {/* 검색 필터 */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ fontSize: 14 }}>검색 조건</div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <Input label="고객명"         value={search.customer}  onChange={set('customer')}  onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          <Input label="사업명"         value={search.project}   onChange={set('project')}   onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          <Input label="사업번호"       value={search.bizNo}     onChange={set('bizNo')}     onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          <Input label="연도"           value={search.year}
            onChange={(e) => /^\d*$/.test(e.target.value) && set('year')(e)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="숫자만"
          />
          <Input label="지역"           value={search.region}    onChange={set('region')}    onKeyDown={(e) => e.key === 'Enter' && doSearch()} hint="시도/시군구" />
          <Input label="산업군" as="select" value={search.industry} onChange={set('industry')}>
            <option value="">전체</option>
            {industryOptions.map((x) => <option key={x}>{x}</option>)}
          </Input>
          <Input label="기관/기업유형" as="select" value={search.orgType} onChange={set('orgType')}>
            <option value="">전체</option>
            {orgTypeOptions.map((x) => <option key={x}>{x}</option>)}
          </Input>
          <div className="field">
            <label>도입 모듈</label>
            <ModuleMultiSelect
              selected={search.modules}
              onChange={(v) => setSearch((s) => ({ ...s, modules: v }))}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
          <Button onClick={doSearch}>검색</Button>
          <Button variant="secondary" onClick={reset}>초기화</Button>
          <label className="row" style={{ gap: 5 }}>
            <input type="checkbox" checked={dupOnly} onChange={(e) => setDupOnly(e.target.checked)} />
            중복 의심 건만 보기
          </label>
          <div className="spacer" />
          <Button variant="secondary" onClick={downloadCsv}>CSV 다운로드</Button>
        </div>
      </div>

      {/* 결과 카운트 */}
      <div className="toolbar">
        <span className="muted">검색 결과 <b>{results.length}</b>건</span>
      </div>

      {loading ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {['고객명', '사업명', '사업번호', '연도', '지역', '산업군', '기관유형', '도입모듈', '검수상태'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={9} className="empty">검색 결과가 없습니다.</td></tr>
              ) : shown.map((r) => {
                const dup = isDuplicate(r, col.items);
                return (
                  <tr key={r.id} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className="clickable">{r.customer}</span>
                      {dup && <Badge color="red" style={{ marginLeft: 4 }}>중복의심</Badge>}
                    </td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.project}
                    </td>
                    <td><code style={{ fontSize: 12 }}>{r.bizNo}</code></td>
                    <td>{r.year}</td>
                    <td>{r.region}</td>
                    <td>{r.industry}</td>
                    <td>{r.orgType}</td>
                    <td>
                      {(r.modules || []).slice(0, 3).map((m) => <span key={m} className="tag">{m}</span>)}
                      {(r.modules || []).length > 3 && <span className="tag">+{r.modules.length - 3}</span>}
                    </td>
                    <td>
                      <Badge color={r.status === '검수완료' ? 'green' : 'yellow'}>{r.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {shown.length < results.length && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button variant="secondary" onClick={() => setLimit((l) => l + LAZY_STEP)}>
            더 보기 ({results.length - shown.length}건 남음)
          </Button>
        </div>
      )}

      {detail && (
        <ReferenceDetailModal
          record={detail}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            col.update(detail.id, { ...patch, updatedAt: new Date().toISOString() });
            logAudit({
              category: AUDIT_CATEGORY.REFERENCE, eventType: 'UPDATE',
              targetType: 'REFERENCE', targetId: detail.id, targetName: detail.customer,
            });
            toast('수정되었습니다.');
            setDetail(null);
          }}
          onDelete={() => {
            if (!confirm('삭제하시겠습니까?')) return;
            col.remove(detail.id);
            logAudit({
              category: AUDIT_CATEGORY.REFERENCE, eventType: 'DELETE',
              targetType: 'REFERENCE', targetId: detail.id, targetName: detail.customer,
            });
            toast('삭제되었습니다.');
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}
