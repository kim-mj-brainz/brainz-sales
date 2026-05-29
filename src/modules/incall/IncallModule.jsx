/* =============================================================
   InCall CRM 모듈 메인 (담당: 인콜)
   대시보드 / 인콜 목록 탭. 역할별 접근(USER 본인 건만).
   목록: 검색·필터·정렬·페이지네이션(20건).
   ============================================================= */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Input, Badge, Pagination, pipelineColor, winrateColor } from '../../common/components.jsx';
import { hasPermission, ROLES } from '../../common/permissions.js';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { SEED_INCALLS } from '../../data/seedData.js';
import IncallModal from './IncallModal.jsx';
import IncallDashboard from './IncallDashboard.jsx';

const PAGE_SIZE = 20;

export default function IncallModule({ initialTab = 'dashboard' }) {
  const { currentUser, master, logAudit, toast } = useApp();
  const col = useCollection('incalls', SEED_INCALLS);
  const [tab, setTab] = useState(initialTab);
  const [modal, setModal] = useState(null); // {record} | {} (new)
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSales, setFSales] = useState('');
  const [fInfra, setFInfra] = useState('');
  const [sort, setSort] = useState({ key: 'inflowDate', dir: 'desc' });
  const [page, setPage] = useState(1);

  // 역할별 데이터 범위: USER 는 본인(ownerId) 건만
  const visible = useMemo(() => {
    const all = col.items;
    if (hasPermission(currentUser.role, 'incall:viewAll')) return all;
    return all.filter((i) => i.ownerId === currentUser.id);
  }, [col.items, currentUser]);

  const filtered = useMemo(() => {
    let r = visible.filter((i) => {
      if (q && !`${i.endUser}${i.company}${i.contactPerson}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (fStatus && i.status !== fStatus) return false;
      if (fSales && i.sales !== fSales) return false;
      if (fInfra && !i.infra.includes(fInfra)) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      const c = (va > vb ? 1 : va < vb ? -1 : 0);
      return sort.dir === 'asc' ? c : -c;
    });
    return r;
  }, [visible, q, fStatus, fSales, fInfra, sort]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key) {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  function saveRecord(form) {
    const now = new Date().toISOString();
    if (modal.record) {
      col.update(modal.record.id, { ...form, updatedAt: now });
      logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'UPDATE', targetType: 'INCALL', targetId: modal.record.id, targetName: form.endUser });
      toast('인콜이 수정되었습니다.');
    } else {
      const rec = col.add({ ...form, ownerId: currentUser.id, createdAt: now, updatedAt: now }, 'IC');
      logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'CREATE', targetType: 'INCALL', targetId: rec.id, targetName: form.endUser });
      toast('인콜이 등록되었습니다.');
    }
    setModal(null);
  }

  function del(rec) {
    if (!hasPermission(currentUser.role, 'incall:delete')) { toast('삭제 권한이 없습니다.', 'err'); return; }
    if (!confirm('이 인콜을 삭제하시겠습니까?')) return;
    col.remove(rec.id);
    logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'DELETE', targetType: 'INCALL', targetId: rec.id, targetName: rec.endUser });
    toast('삭제되었습니다.');
  }

  const incomplete = visible.filter((i) => i.winrate > 0 && i.winrate < 100 && i.status !== '영업실패').length;

  return (
    <div>
      <div className="tabs">
        <div className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>대시보드</div>
        <div className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          인콜 목록 {incomplete > 0 && <span className="badge-pill b-red" style={{ marginLeft: 4 }}>{incomplete}</span>}
        </div>
      </div>

      {tab === 'dashboard' && <IncallDashboard incalls={visible} onOpen={(r) => setModal({ record: r })} />}

      {tab === 'list' && (
        <div>
          <div className="toolbar">
            <input className="input" style={{ maxWidth: 220 }} placeholder="검색 (엔드유저/회사/담당자)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            <select className="select" style={{ maxWidth: 130 }} value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }}>
              <option value="">진행상태</option>{master.PIPELINE_STATUS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 120 }} value={fSales} onChange={(e) => { setFSales(e.target.value); setPage(1); }}>
              <option value="">담당영업</option>{master.SALES_PERSON.map((x) => <option key={x}>{x}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 110 }} value={fInfra} onChange={(e) => { setFInfra(e.target.value); setPage(1); }}>
              <option value="">인프라</option>{master.INFRA_TYPE.map((x) => <option key={x}>{x}</option>)}
            </select>
            <div className="spacer" />
            <Button onClick={() => setModal({})}>+ 새 인콜 등록</Button>
          </div>

          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th style={{cursor:'default'}}>#</th>
                {[['inflowDate', '유입일자'], ['inflowType', '유입유형'], ['endUser', '엔드유저/회사'], ['', '인프라'], ['sales', '담당영업'], ['presales', '프리세일즈'], ['status', '진행상태'], ['winrate', '수주여부'], ['salesCode', '매출코드'], ['', '활동내역'], ['', '작업']].map(([k, label]) => (
                  <th key={label} onClick={() => k && toggleSort(k)} style={{ cursor: k ? 'pointer' : 'default' }}>
                    {label}{k && sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {pageData.length === 0 ? <tr><td colSpan={12} className="empty">인콜이 없습니다.</td></tr> :
                  pageData.map((r, i) => (
                    <tr key={r.id}>
                      <td className="num-cell">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td>{r.inflowDate}</td>
                      <td><span className="tag">{r.inflowType}</span></td>
                      <td><b>{r.endUser}</b><br /><span className="muted" style={{ fontSize: 12 }}>{r.company}</span></td>
                      <td>{r.infra.map((t) => <span key={t} className="tag">{t}</span>)}</td>
                      <td>{r.sales}</td>
                      <td>{r.presales || '-'}</td>
                      <td><Badge color={pipelineColor(r.status)}>{r.status}</Badge></td>
                      <td><Badge color={winrateColor(r.winrate)}>{r.winrate}%</Badge></td>
                      <td><code style={{ fontSize: 12 }}>{r.salesCode || '-'}</code></td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.activity}</td>
                      <td><div className="row">
                        <Button size="sm" variant="secondary" onClick={() => setModal({ record: r })}>수정</Button>
                        {hasPermission(currentUser.role, 'incall:delete') && <Button size="sm" variant="danger" onClick={() => del(r)}>삭제</Button>}
                      </div></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      {modal && <IncallModal record={modal.record} onClose={() => setModal(null)} onSave={saveRecord} />}
    </div>
  );
}
