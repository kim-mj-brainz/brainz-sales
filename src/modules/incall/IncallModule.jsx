/* =============================================================
   InCall CRM 모듈 메인 (담당: 인콜)
   ============================================================= */
import React, { useState, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Badge, Pagination, pipelineColor, winrateColor } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { SEED_INCALLS } from '../../data/seedData.js';
import { getGasUrl, getGasToken, setGasConfig, isGasConfigured, testConnection } from '../../common/gasApi.js';
import IncallModal from './IncallModal.jsx';
import IncallDashboard from './IncallDashboard.jsx';

const PAGE_SIZE = 20;

const COLUMNS = [
  { id: 'num',           label: '#',          key: '',              defaultW: 44  },
  { id: 'inflowDate',    label: '유입일자',   key: 'inflowDate',    defaultW: 100 },
  { id: 'inflowType',    label: '유입유형',   key: 'inflowType',    defaultW: 90  },
  { id: 'endUser',       label: '엔드유저',   key: 'endUser',       defaultW: 130 },
  { id: 'company',       label: '문의회사',   key: 'company',       defaultW: 120 },
  { id: 'contactPerson', label: '문의담당자', key: 'contactPerson', defaultW: 100 },
  { id: 'contactPhone',  label: '문의연락처', key: 'contactPhone',  defaultW: 120 },
  { id: 'infra',         label: '문의인프라', key: '',              defaultW: 110 },
  { id: 'sales',         label: '담당영업',   key: 'sales',         defaultW: 90  },
  { id: 'status',        label: '진행상태',   key: 'status',        defaultW: 100 },
  { id: 'winrate',       label: '수주여부',   key: 'winrate',       defaultW: 80  },
  { id: 'salesCode',     label: '매출코드',   key: 'salesCode',     defaultW: 110 },
  { id: 'activity',      label: '활동내역',   key: '',              defaultW: 160 },
  { id: 'note',          label: '비고',       key: '',              defaultW: 120 },
  { id: 'actions',       label: '작업',       key: '',              defaultW: 90  },
];

const COL_WIDTHS_KEY = 'incall-col-widths';
function loadColWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || '{}');
    const defaults = Object.fromEntries(COLUMNS.map(c => [c.id, c.defaultW]));
    return { ...defaults, ...saved };
  } catch { return Object.fromEntries(COLUMNS.map(c => [c.id, c.defaultW])); }
}
function saveColWidths(widths) { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(widths)); }

export default function IncallModule({ initialTab = 'list' }) {
  const { currentUser, master, logAudit, toast } = useApp();
  const col = useCollection('incalls', SEED_INCALLS);
  const [tab, setTab] = useState(initialTab);
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSales, setFSales] = useState('');
  const [fInfra, setFInfra] = useState('');
  const [sort, setSort] = useState({ key: 'inflowDate', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [colWidths, setColWidths] = useState(loadColWidths);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [gasModalOpen, setGasModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  const updateColWidth = useCallback((colId, newW) => {
    setColWidths(prev => {
      const next = { ...prev, [colId]: Math.max(50, newW) };
      saveColWidths(next);
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    const all = col.items;
    if (hasPermission(currentUser.role, 'incall:viewAll')) return all;
    return all.filter(i => i.ownerId === currentUser.id);
  }, [col.items, currentUser]);

  const filtered = useMemo(() => {
    let r = visible.filter(i => {
      if (q && !`${i.endUser}${i.company}${i.contactPerson}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (fStatus && i.status !== fStatus) return false;
      if (fSales && i.sales !== fSales) return false;
      if (fInfra && !i.infra.includes(fInfra)) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      const c = va > vb ? 1 : va < vb ? -1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
    return r;
  }, [visible, q, fStatus, fSales, fInfra, sort]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
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

  function handleExcelExport() {
    const headers = ['유입일자','유입유형','엔드유저','문의회사','문의담당자','문의연락처','문의인프라','담당영업','진행상태','수주여부(%)','매출코드','활동내역','비고'];
    const rows = visible.map(r => [r.inflowDate, r.inflowType, r.endUser, r.company, r.contactPerson, r.contactPhone, (r.infra||[]).join('/'), r.sales, r.status, r.winrate, r.salesCode, r.activity, r.note]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'InCall목록');
    XLSX.writeFile(wb, `InCall목록_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast('엑셀 다운로드 완료!');
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const now = new Date().toISOString();
        let added = 0;
        rows.slice(1).filter(r => r[2]).forEach(r => {
          col.add({
            inflowDate: String(r[0]||'').slice(0,10)||now.slice(0,10),
            inflowType: String(r[1]||'홈페이지'),
            endUser: String(r[2]||''), company: String(r[3]||''),
            contactPerson: String(r[4]||''), contactPhone: String(r[5]||''),
            infra: String(r[6]||'').split('/').map(s=>s.trim()).filter(Boolean),
            sales: String(r[7]||''), status: String(r[8]||'컨택중'),
            winrate: Math.min(100,Math.max(0,parseInt(r[9])||0)),
            salesCode: String(r[10]||''), activity: String(r[11]||''), note: String(r[12]||''),
            ownerId: currentUser.id, createdAt: now, updatedAt: now,
          }, 'IC');
          added++;
        });
        toast(`${added}건 업로드 완료!`);
        setImportModalOpen(false);
      } catch (err) { toast('파일 파싱 오류: ' + err.message, 'err'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  const incomplete = visible.filter(i => i.winrate > 0 && i.winrate < 100 && i.status !== '영업실패').length;
  const totalW = COLUMNS.reduce((s, c) => s + (colWidths[c.id] || c.defaultW), 0);
  const gasOk = isGasConfigured();

  return (
    <div>
      <div className="tabs">
        <div className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          인콜 목록 {incomplete > 0 && <span className="badge-pill b-red" style={{ marginLeft: 4 }}>{incomplete}</span>}
        </div>
        <div className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>대시보드</div>
      </div>

      {tab === 'dashboard' && <IncallDashboard incalls={visible} onOpen={r => setModal({ record: r })} />}

      {tab === 'list' && (
        <div>
          <div className="toolbar">
            <input className="input" style={{ maxWidth: 220 }} placeholder="검색 (엔드유저/회사/담당자)"
              value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
            <select className="select" style={{ maxWidth: 130 }} value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }}>
              <option value="">진행상태</option>{master.PIPELINE_STATUS.map(x => <option key={x}>{x}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 120 }} value={fSales} onChange={e => { setFSales(e.target.value); setPage(1); }}>
              <option value="">담당영업</option>{master.SALES_PERSON.map(x => <option key={x}>{x}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 110 }} value={fInfra} onChange={e => { setFInfra(e.target.value); setPage(1); }}>
              <option value="">인프라</option>{master.INFRA_TYPE.map(x => <option key={x}>{x}</option>)}
            </select>
            <div className="spacer" />
            {/* GAS 설정 버튼 */}
            <Button variant={gasOk ? 'success' : 'secondary'} onClick={() => setGasModalOpen(true)}
              title={gasOk ? '구글 시트 연동 중' : '구글 시트 미연동'}>
              {gasOk ? '🟢 시트 연동' : '⚙️ GAS 설정'}
            </Button>
            <Button variant="secondary" onClick={() => setImportModalOpen(true)}>📂 엑셀 업로드</Button>
            <Button variant="secondary" onClick={handleExcelExport}>⬇️ 엑셀 다운로드</Button>
            <Button onClick={() => setModal({})}>+ 새 인콜 등록</Button>
          </div>

          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
            💡 열 헤더 오른쪽 경계선을 드래그해서 너비 조정 — 자동 저장됩니다
          </p>

          <ResizableTable columns={COLUMNS} colWidths={colWidths} onWidthChange={updateColWidth} totalW={totalW} sort={sort} onSort={toggleSort}>
            {pageData.length === 0
              ? <tr><td colSpan={COLUMNS.length} className="empty">인콜이 없습니다.</td></tr>
              : pageData.map((r, i) => (
                <tr key={r.id}>
                  <td className="num-cell">{(page-1)*PAGE_SIZE+i+1}</td>
                  <td>{r.inflowDate}</td>
                  <td><span className="tag">{r.inflowType}</span></td>
                  <td title={r.endUser}><b>{r.endUser}</b></td>
                  <td title={r.company}>{r.company}</td>
                  <td>{r.contactPerson||'-'}</td>
                  <td>{r.contactPhone||'-'}</td>
                  <td>{(r.infra||[]).map(t=><span key={t} className="tag">{t}</span>)}</td>
                  <td>{r.sales}</td>
                  <td><Badge color={pipelineColor(r.status)}>{r.status}</Badge></td>
                  <td><Badge color={winrateColor(r.winrate)}>{r.winrate}%</Badge></td>
                  <td title={r.salesCode}><code style={{fontSize:12}}>{r.salesCode||'-'}</code></td>
                  <td title={r.activity} style={{maxWidth:colWidths.activity,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.activity}</td>
                  <td title={r.note} style={{maxWidth:colWidths.note,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.note}</td>
                  <td>
                    <div className="row">
                      <Button size="sm" variant="secondary" onClick={() => setModal({ record: r })}>수정</Button>
                      {hasPermission(currentUser.role, 'incall:delete') && <Button size="sm" variant="danger" onClick={() => del(r)}>삭제</Button>}
                    </div>
                  </td>
                </tr>
              ))}
          </ResizableTable>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>총 {filtered.length}건</p>
        </div>
      )}

      {modal && <IncallModal record={modal.record} onClose={() => setModal(null)} onSave={saveRecord} />}
      {importModalOpen && <ExcelImportModal onClose={() => setImportModalOpen(false)} fileInputRef={fileInputRef} onFileChange={handleFileChange} />}
      {gasModalOpen && <GasSettingsModal onClose={() => setGasModalOpen(false)} toast={toast} />}
    </div>
  );
}

/* ── 열 너비 조정 가능한 테이블 ── */
function ResizableTable({ columns, colWidths, onWidthChange, totalW, sort, onSort, children }) {
  const isDragging = React.useRef(false);
  function startResize(e, colId) {
    e.preventDefault(); isDragging.current = true;
    const startX = e.clientX, startW = colWidths[colId];
    const onMove = ev => { if (isDragging.current) onWidthChange(colId, startW + ev.clientX - startX); };
    const onUp = () => { isDragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  }
  return (
    <div className="table-wrap">
      <table className="tbl" style={{ width: totalW, minWidth: '100%', tableLayout: 'fixed' }}>
        <thead><tr>
          {columns.map(c => (
            <th key={c.id} style={{ width: colWidths[c.id], minWidth: colWidths[c.id], position: 'relative', overflow: 'hidden' }}
                className={c.key ? 'sortable' : ''} onClick={() => c.key && onSort(c.key)}>
              {c.label}{c.key && sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              <span style={{ position:'absolute', right:0, top:0, bottom:0, width:5, cursor:'col-resize', zIndex:1 }}
                    onMouseDown={e => { e.stopPropagation(); startResize(e, c.id); }}
                    onClick={e => e.stopPropagation()} />
            </th>
          ))}
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ── GAS 설정 모달 ── */
function GasSettingsModal({ onClose, toast }) {
  const [url,   setUrl]   = React.useState(getGasUrl());
  const [token, setToken] = React.useState(getGasToken());
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState(null); // null | 'ok' | 'fail'

  async function handleTest() {
    if (!url.trim()) { toast('URL을 먼저 입력해 주세요.', 'err'); return; }
    setTesting(true); setTestResult(null);
    setGasConfig(url, token); // 테스트 전 임시 저장
    const ok = await testConnection();
    setTesting(false);
    setTestResult(ok ? 'ok' : 'fail');
  }

  function handleSave() {
    if (!url.trim()) { toast('URL을 입력해 주세요.', 'err'); return; }
    setGasConfig(url, token);
    toast('GAS 설정이 저장되었습니다. 이제 매출코드 입력 시 자동 조회됩니다.', 'ok');
    onClose();
  }

  function handleClear() {
    if (!confirm('GAS 연동을 해제하시겠습니까?')) return;
    setGasConfig('', '');
    toast('GAS 연동이 해제되었습니다.');
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h3>⚙️ 구글 시트(GAS) 연동 설정</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* 안내 */}
          <div style={{ padding: 12, background: '#eff6ff', borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
            <b>설정 순서</b><br />
            ① 영업 요약 구글 시트 → 확장 프로그램 → Apps Script<br />
            ② SpreadsheetGAS.gs 코드 붙여넣기 후 <code>setupToken()</code> 실행<br />
            ③ 배포 → 새 배포 → 웹앱 → 도메인 내 사용자 → 배포 URL 복사<br />
            ④ 아래에 URL과 토큰 입력 후 저장
          </div>

          <div className="field">
            <label>GAS 웹앱 배포 URL <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="input" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec" />
          </div>
          <div className="field">
            <label>인증 토큰 (setupToken() 에서 설정한 값)</label>
            <input className="input" type="password" value={token} onChange={e => setToken(e.target.value)}
              placeholder="brainz-incall-2026" />
            <div className="hint">GAS 스크립트의 AUTH_TOKEN 속성값과 동일하게 입력</div>
          </div>

          {/* 연결 테스트 결과 */}
          {testResult === 'ok'   && <div style={{ padding:'8px 12px', background:'#dcfce7', borderRadius:6, color:'#166534', fontSize:13, marginBottom:8 }}>✅ 연결 성공! 저장하면 바로 사용 가능합니다.</div>}
          {testResult === 'fail' && <div style={{ padding:'8px 12px', background:'#fee2e2', borderRadius:6, color:'#991b1b', fontSize:13, marginBottom:8 }}>❌ 연결 실패. URL·토큰 확인 또는 구글 로그인 상태 확인 후 재시도해 주세요.</div>}
        </div>
        <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
          <Button variant="danger" size="sm" onClick={handleClear}>연동 해제</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={onClose}>취소</Button>
            <Button variant="secondary" onClick={handleTest} disabled={testing}>{testing ? '테스트 중…' : '연결 테스트'}</Button>
            <Button onClick={handleSave}>저장</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 엑셀 업로드 모달 ── */
function ExcelImportModal({ onClose, fileInputRef, onFileChange }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-head"><h3>📂 엑셀로 인콜 일괄 업로드</h3><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div style={{ padding:12, background:'#eff6ff', borderRadius:8, fontSize:13, marginBottom:16 }}>
            <b>열 순서:</b> A:유입일자 · B:유입유형 · C:엔드유저* · D:문의회사 · E:문의담당자<br />
            F:문의연락처 · G:인프라(/ 구분) · H:담당영업 · I:진행상태 · J:수주여부(%) · K:매출코드 · L:활동내역 · M:비고
          </div>
          <div style={{ border:'2px dashed var(--border)', borderRadius:8, padding:32, textAlign:'center', cursor:'pointer' }}
               onClick={() => fileInputRef.current?.click()}>
            <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
            <div style={{ fontSize:13, color:'var(--muted)' }}>xlsx 파일 클릭해서 선택</div>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={onFileChange} />
        </div>
        <div className="modal-foot"><Button variant="secondary" onClick={onClose}>닫기</Button></div>
      </div>
    </div>
  );
}
