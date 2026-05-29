/* =============================================================
   레퍼런스 조회기 모듈 (담당: 레퍼런스)
   2.1 검색 / 2.2 목록(lazy) / 2.3 상세·수정·삭제 / 2.4 업로드 미리보기
   2.5 중복 의심 / 2.6 CSV 다운로드
   ============================================================= */
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Input, Modal, Badge, Spinner, AccessDenied } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { SEED_REFERENCES } from '../../data/seedData.js';
import { MODULE_TREE } from '../../data/codeMaster.js';

const LAZY_STEP = 10;

export default function ReferenceModule() {
  const { currentUser, master, logAudit, toast } = useApp();
  const col = useCollection('references', SEED_REFERENCES);
  const [search, setSearch] = useState({ customer: '', project: '', bizNo: '', year: '', region: '', industry: '', orgType: '', modules: [] });
  const [applied, setApplied] = useState({});
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(LAZY_STEP);
  const [detail, setDetail] = useState(null);
  const [upload, setUpload] = useState(false);
  const [dupOnly, setDupOnly] = useState(false);

  if (!hasPermission(currentUser.role, 'reference:view')) return <AccessDenied />;

  const canEdit = hasPermission(currentUser.role, 'reference:edit');

  // 중복 의심 판정 (2.5)
  function isDuplicate(ref, others) {
    return others.some((o) => o.id !== ref.id && (
      (ref.bizNo && o.bizNo === ref.bizNo) ||
      (!ref.bizNo && o.customer === ref.customer && o.year === ref.year && o.project === ref.project)
    ));
  }

  const results = useMemo(() => {
    let r = col.items.filter((ref) => {
      const a = applied;
      if (a.customer && !ref.customer.includes(a.customer)) return false;
      if (a.project && !ref.project.includes(a.project)) return false;
      if (a.bizNo && !ref.bizNo.includes(a.bizNo)) return false;
      if (a.year && String(ref.year) !== String(a.year)) return false;
      if (a.region && !`${ref.region}${ref.address}`.includes(a.region)) return false;
      if (a.industry && ref.industry !== a.industry) return false;
      if (a.orgType && ref.orgType !== a.orgType) return false;
      if (a.modules?.length && !a.modules.every((m) => ref.modules.includes(m))) return false;
      return true;
    });
    r = [...r].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '')); // 최신순
    if (dupOnly) r = r.filter((ref) => isDuplicate(ref, col.items));
    return r;
  }, [col.items, applied, dupOnly]);

  function doSearch() {
    setLoading(true);
    setLimit(LAZY_STEP);
    // TODO: 서버 페이징/조회 API. MVP 는 지연 시뮬레이션
    setTimeout(() => { setApplied({ ...search }); setLoading(false); }, 300);
    logAudit({ category: AUDIT_CATEGORY.REFERENCE, eventType: 'SEARCH', result: 'SUCCESS', extra: search });
  }
  function reset() { setSearch({ customer: '', project: '', bizNo: '', year: '', region: '', industry: '', orgType: '', modules: [] }); setApplied({}); setDupOnly(false); }

  function downloadCsv() {
    const head = ['고객명', '사업명', '사업번호', '연도', '지역', '산업군', '기관유형', '도입모듈', '검수상태'];
    const rows = results.map((r) => [r.customer, r.project, r.bizNo, r.year, r.region, r.industry, r.orgType, r.modules.join('|'), r.status]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'references.csv'; a.click();
    toast('현재 검색 결과를 CSV 로 내보냈습니다.');
  }

  const set = (k) => (e) => setSearch({ ...search, [k]: e.target.value });
  const shown = results.slice(0, limit);

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ fontSize: 14 }}>레퍼런스 검색</div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <Input label="고객명" value={search.customer} onChange={set('customer')} onKeyDown={(e) => e.key === 'Enter' && doSearch()} className="mb0" />
          <Input label="사업명" value={search.project} onChange={set('project')} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          <Input label="사업번호" value={search.bizNo} onChange={set('bizNo')} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          <Input label="연도" value={search.year} onChange={(e) => /^\d*$/.test(e.target.value) && set('year')(e)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="숫자만" />
          <Input label="지역" value={search.region} onChange={set('region')} onKeyDown={(e) => e.key === 'Enter' && doSearch()} hint="주소/시도/시군구" />
          <Input label="산업군" as="select" value={search.industry} onChange={set('industry')}>
            <option value="">전체</option>{master.INDUSTRY.map((x) => <option key={x}>{x}</option>)}
          </Input>
          <Input label="기관/기업유형" as="select" value={search.orgType} onChange={set('orgType')}>
            <option value="">전체</option>{master.ORG_TYPE.map((x) => <option key={x}>{x}</option>)}
          </Input>
          <div className="field">
            <label>도입 모듈</label>
            <div className="checkbox-row" style={{ maxHeight: 70, overflowY: 'auto' }}>
              {Object.keys(MODULE_TREE).map((m) => (
                <label key={m}><input type="checkbox" checked={search.modules.includes(m)} onChange={() => setSearch((s) => ({ ...s, modules: s.modules.includes(m) ? s.modules.filter((x) => x !== m) : [...s.modules, m] }))} /> {m}</label>
              ))}
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <Button onClick={doSearch}>검색</Button>
          <Button variant="secondary" onClick={reset}>초기화</Button>
          <label className="row" style={{ gap: 5, marginLeft: 8 }}><input type="checkbox" checked={dupOnly} onChange={(e) => setDupOnly(e.target.checked)} /> 중복 의심 건만</label>
          <div className="spacer" />
          {canEdit && <Button variant="outline" onClick={() => setUpload(true)}>기존 데이터 업로드</Button>}
          <Button variant="secondary" onClick={downloadCsv}>CSV 다운로드</Button>
        </div>
      </div>

      <div className="toolbar"><span className="muted">검색 결과 <b>{results.length}</b>건</span></div>

      {loading ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>{['고객명', '사업명', '사업번호', '연도', '지역', '산업군', '기관유형', '도입모듈', '검수상태'].map((h) => <th key={h} style={{cursor:'default'}}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={9} className="empty">검색 결과가 없습니다.</td></tr> :
                shown.map((r) => {
                  const dup = isDuplicate(r, col.items);
                  return (
                    <tr key={r.id} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                      <td><span className="clickable">{r.customer}</span> {dup && <Badge color="red">중복의심</Badge>}</td>
                      <td>{r.project}</td><td><code style={{ fontSize: 12 }}>{r.bizNo}</code></td>
                      <td>{r.year}</td><td>{r.region}</td><td>{r.industry}</td><td>{r.orgType}</td>
                      <td>{r.modules.slice(0, 3).map((m) => <span key={m} className="tag">{m}</span>)}{r.modules.length > 3 && <span className="tag">+{r.modules.length - 3}</span>}</td>
                      <td><Badge color={r.status === '검수완료' ? 'green' : 'yellow'}>{r.status}</Badge></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      {shown.length < results.length && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button variant="secondary" onClick={() => setLimit((l) => l + LAZY_STEP)}>더 보기 ({results.length - shown.length}건 남음)</Button>
        </div>
      )}

      {detail && <DetailModal ref0={detail} canEdit={canEdit} master={master} onClose={() => setDetail(null)}
        onSave={(patch) => { col.update(detail.id, { ...patch, updatedAt: new Date().toISOString() }); logAudit({ category: AUDIT_CATEGORY.REFERENCE, eventType: 'UPDATE', targetType: 'REFERENCE', targetId: detail.id, targetName: detail.customer }); toast('수정되었습니다.'); setDetail(null); }}
        onDelete={() => { if (confirm('삭제하시겠습니까?')) { col.remove(detail.id); logAudit({ category: AUDIT_CATEGORY.REFERENCE, eventType: 'DELETE', targetType: 'REFERENCE', targetId: detail.id, targetName: detail.customer }); toast('삭제되었습니다.'); setDetail(null); } }} />}

      {upload && <UploadModal onClose={() => setUpload(false)} existing={col.items}
        onConfirm={(rows) => { rows.forEach((r) => col.add(r, 'R')); logAudit({ category: AUDIT_CATEGORY.REFERENCE, eventType: 'BULK_UPLOAD', extra: { count: rows.length } }); toast(`${rows.length}건이 등록되었습니다.`); setUpload(false); }} />}
    </div>
  );
}

function DetailModal({ ref0, canEdit, master, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...ref0 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="레퍼런스 상세" width={680} onClose={onClose}
      footer={<>
        {canEdit && <Button variant="danger" onClick={onDelete}>삭제</Button>}
        <div className="spacer" />
        <Button variant="secondary" onClick={onClose}>닫기</Button>
        {canEdit && <Button onClick={() => onSave(f)}>저장</Button>}
      </>}>
      <div className="form-grid">
        <Input label="고객명" value={f.customer} onChange={set('customer')} disabled={!canEdit} />
        <Input label="사업명" value={f.project} onChange={set('project')} disabled={!canEdit} />
        <Input label="사업번호" value={f.bizNo} onChange={set('bizNo')} disabled={!canEdit} />
        <Input label="연도" value={f.year} onChange={set('year')} disabled={!canEdit} />
        <Input label="지역/주소" value={f.region} onChange={set('region')} disabled={!canEdit} />
        <Input label="산업군" as="select" value={f.industry} onChange={set('industry')} disabled={!canEdit}>
          {master.INDUSTRY.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="기관/기업유형" as="select" value={f.orgType} onChange={set('orgType')} disabled={!canEdit}>
          {master.ORG_TYPE.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="담당영업" value={f.sales} onChange={set('sales')} disabled={!canEdit} />
        <Input label="담당엔지니어" value={f.engineer} onChange={set('engineer')} disabled={!canEdit} />
        <Input label="매출액" value={f.revenue} onChange={set('revenue')} disabled={!canEdit} />
        <Input label="발주처" value={f.orderer} onChange={set('orderer')} disabled={!canEdit} />
      </div>
      <div className="field"><label>도입 모듈</label><div>{f.modules.map((m) => <span key={m} className="tag">{m}</span>)}</div></div>
      <div className="field"><label>제품명 및 수량</label><div>{(f.products || []).map((p, i) => <div key={i} className="muted" style={{ fontSize: 13 }}>{p.name} — {p.qty}{p.unit} ({p.version})</div>)}</div></div>
    </Modal>
  );
}

/* 2.4 업로드 미리보기 — 엑셀 파싱은 MVP 더미(샘플 행). 행 삭제 + 검수 체크 */
function UploadModal({ onClose, onConfirm, existing }) {
  const fileRef = useRef();
  const [rows, setRows] = useState([]);

  function pickFile() {
    // TODO: 실제 .xlsx 파싱(SheetJS) + 컬럼 자동 감지. MVP 는 샘플 행 생성.
    const sample = [
      { customer: '카카오엔터프라이즈', project: '클라우드 통합관제', bizNo: '2025-KAKAO-001', year: 2025, region: '경기도 성남시', industry: '서비스', orgType: '민간기업', modules: ['EMS', 'APM'], status: '검수미완료', verified: false, products: [] },
      { customer: '국민건강보험공단', project: '보안관제 고도화', bizNo: '2025-NHIS-220', year: 2025, region: '강원도 원주시', industry: '공공', orgType: '준정부기관', modules: ['SIEM'], status: '검수미완료', verified: false, products: [] },
    ];
    setRows(sample);
  }
  function dupCheck(r) {
    return existing.some((o) => r.bizNo && o.bizNo === r.bizNo);
  }
  function confirm() {
    onConfirm(rows.map((r) => ({ ...r, status: r.verified ? '검수완료' : '검수미완료' })));
  }

  return (
    <Modal title="기존 데이터 업로드" width={760} onClose={onClose}
      footer={<><span className="hint" style={{ marginRight: 'auto' }}>※ 대용량은 5,000행 이하 분할 업로드 권장</span><Button variant="secondary" onClick={onClose}>취소</Button><Button disabled={!rows.length} onClick={confirm}>저장 ({rows.length}건)</Button></>}>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={pickFile} />
      <Button variant="outline" onClick={() => fileRef.current.click()}>엑셀 파일 선택 (.xlsx)</Button>
      <p className="hint">파일 선택 시 컬럼 자동 감지 후 미리보기를 표시합니다. (MVP: 샘플 데이터)</p>
      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead><tr>{['검수', '고객명', '사업명', '사업번호', '연도', '중복', '삭제'].map((h) => <th key={h} style={{cursor:'default'}}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input type="checkbox" checked={r.verified} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, verified: e.target.checked } : x))} /></td>
                  <td>{r.customer}</td><td>{r.project}</td><td>{r.bizNo}</td><td>{r.year}</td>
                  <td>{dupCheck(r) && <Badge color="red">중복의심</Badge>}</td>
                  <td><Button size="sm" variant="danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>삭제</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
