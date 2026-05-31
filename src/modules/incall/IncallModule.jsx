/* =============================================================
   InCall CRM 모듈 메인 (담당: 인콜)
   신규 등록 시 알림 방법(이메일/구글챗/둘 다)을 모달에서 선택
   ============================================================= */
import React, { useState, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Badge, Pagination, pipelineColor, winrateColor } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { SEED_INCALLS } from '../../data/seedData.js';
import { getGasUrl, getGasToken, setGasConfig, isGasConfigured, testConnection, syncIncallToGAS } from '../../common/gasApi.js';
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
  { id: 'infra',         label: '문의인프라', key: '',              defaultW: 130 },
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
    return { ...Object.fromEntries(COLUMNS.map(c => [c.id, c.defaultW])), ...saved };
  } catch { return Object.fromEntries(COLUMNS.map(c => [c.id, c.defaultW])); }
}
function saveColWidths(widths) { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(widths)); }

// ── CSV 파서 ──────────────────────────────────────────────────
const INFRA_TYPES_SET = new Set(['EMS','SIEM','ITSM','유지보수 문의','기존 사업 관련','업그레이드','미공개','기타']);
const VALID_STATUSES  = new Set(['컨택중','견적서전달','고객미팅','계약완료','영업실패']);

function parseCSVText(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { field += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { row.push(field.trim()); field = ''; }
      else if (ch === '\r' && nx === '\n') { row.push(field.trim()); field = ''; if (row.some(c => c)) rows.push(row); row = []; i++; }
      else if (ch === '\n' || ch === '\r') { row.push(field.trim()); field = ''; if (row.some(c => c)) rows.push(row); row = []; }
      else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(c => c)) rows.push(row); }
  return rows;
}

function parseInfraField(raw) {
  if (!raw) return { infra: [], infraDetail: '' };
  const parts = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  const infra = [], detail = [];
  parts.forEach(p => INFRA_TYPES_SET.has(p) ? (!infra.includes(p) && infra.push(p)) : detail.push(p));
  return { infra, infraDetail: detail.join(', ') };
}

function rowsToIncalls(rows, ownerId) {
  if (!rows || rows.length < 2) return [];
  const now = new Date().toISOString();
  const header = rows[0].map(h => String(h || '').trim());
  const o = header.some(h => h === '인프라세부') ? 1 : 0;
  return rows.slice(1).filter(r => String(r[2] || '').trim()).map(r => {
    const { infra, infraDetail: pd } = parseInfraField(String(r[6] || ''));
    const statusRaw = String(r[8 + o] || '').trim();
    return {
      inflowDate: String(r[0] || '').slice(0, 10) || now.slice(0, 10),
      inflowType: String(r[1] || '기타').trim(),
      endUser: String(r[2] || '').trim(), company: String(r[3] || '').trim(),
      contactPerson: String(r[4] || '').trim(), contactPhone: String(r[5] || '').trim(),
      infra, infraDetail: o === 1 ? String(r[7] || '').trim() : pd,
      sales: String(r[7 + o] || '').trim(), presales: '',
      status: VALID_STATUSES.has(statusRaw) ? statusRaw : '컨택중',
      winrate: Math.min(100, Math.max(0, parseInt(String(r[9 + o] || '').replace('%', '')) || 0)),
      salesCode: String(r[10 + o] || '').replace(/\t/g, '').trim(),
      activity: String(r[11 + o] || '').trim(), note: String(r[12 + o] || '').trim(),
      ownerId, createdAt: now, updatedAt: now,
    };
  });
}

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
  const undoRef = useRef(null);
  const undoTimerRef = useRef(null);

  const updateColWidth = useCallback((colId, newW) => {
    setColWidths(prev => { const next = { ...prev, [colId]: Math.max(50, newW) }; saveColWidths(next); return next; });
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
      if (fInfra && !(i.infra || []).includes(fInfra)) return false;
      return true;
    });
    return [...r].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      const c = va > vb ? 1 : va < vb ? -1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
  }, [visible, q, fStatus, fSales, fInfra, sort]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  // notifyOpts: { enabled: boolean, method: 'email'|'chat'|'both' }
  function saveRecord(form, notifyOpts = { enabled: false, method: 'email' }) {
    const now = new Date().toISOString();
    if (modal.record) {
      col.update(modal.record.id, { ...form, updatedAt: now });
      logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'UPDATE', targetType: 'INCALL', targetId: modal.record.id, targetName: form.endUser });
      toast('인콜이 수정되었습니다.');
    } else {
      const rec = col.add({ ...form, ownerId: currentUser.id, createdAt: now, updatedAt: now }, 'IC');
      logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'CREATE', targetType: 'INCALL', targetId: rec.id, targetName: form.endUser });

      // 담당자 알림: 사용자가 선택한 방법으로 발송
      if (isGasConfigured() && notifyOpts.enabled) {
        syncIncallToGAS({ ...form, id: rec.id, ownerId: currentUser.id }, notifyOpts.method)
          .then(() => toast(`담당자에게 알림을 발송했습니다. (${notifyOpts.method === 'email' ? '이메일' : notifyOpts.method === 'chat' ? '구글챗' : '이메일+구글챗'})`))
          .catch(err => console.warn('GAS 알림 실패:', err.message));
      }
      toast('인콜이 등록되었습니다.');
    }
    setModal(null);
  }

  function del(rec) {
    if (!hasPermission(currentUser.role, 'incall:delete')) { toast('삭제 권한이 없습니다.', 'err'); return; }
    if (!confirm('이 인콜을 삭제하시겠습니까?')) return;
    const idx = col.items.findIndex(i => i.id === rec.id);
    undoRef.current = { item: rec, index: idx };
    col.remove(rec.id);
    logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'DELETE', targetType: 'INCALL', targetId: rec.id, targetName: rec.endUser });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => { undoRef.current = null; }, 5000);
    toast('삭제되었습니다. (5초 내 되돌리기 가능)');
  }

  function undoDelete() {
    if (!undoRef.current) { toast('되돌릴 항목이 없습니다.', 'err'); return; }
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { item, index } = undoRef.current;
    undoRef.current = null;
    const next = [...col.items]; next.splice(index, 0, item);
    col.replaceAll(next);
    logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'RESTORE', targetType: 'INCALL', targetId: item.id, targetName: item.endUser });
    toast(`'${item.endUser}' 인콜이 복원되었습니다.`);
  }

  function handleExcelExport() {
    const headers = ['유입일자','유입유형','엔드유저','문의회사','문의담당자','문의연락처','문의인프라','인프라세부','담당영업','진행상태','수주여부(%)','매출코드','활동내역','비고'];
    const rows = visible.map(r => [r.inflowDate, r.inflowType, r.endUser, r.company, r.contactPerson, r.contactPhone, (r.infra||[]).join('/'), r.infraDetail||'', r.sales, r.status, r.winrate, r.salesCode, r.activity, r.note]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'InCall목록');
    XLSX.writeFile(wb, `InCall목록_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast('엑셀 다운로드 완료!');
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const addRows = (rows) => {
      const items = rowsToIncalls(rows, currentUser.id);
      items.forEach(data => col.add(data, 'IC'));
      logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'IMPORT', targetType: 'INCALL', targetId: 'BULK', targetName: `${items.length}건` });
      toast(`${items.length}건 업로드 완료!`);
      setImportModalOpen(false);
    };
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = ev => { try { addRows(parseCSVText(ev.target.result)); } catch (err) { toast('CSV 파싱 오류: ' + err.message, 'err'); } };
      reader.readAsText(file, 'UTF-8');
    } else {
      const reader = new FileReader();
      reader.onload = ev => { try { const wb = XLSX.read(ev.target.result, { type: 'array' }); addRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })); } catch (err) { toast('파일 파싱 오류: ' + err.message, 'err'); } };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = '';
  }

  const incomplete = visible.filter(i => (i.winrate||0) > 0 && (i.winrate||0) < 100 && i.status !== '영업실패').length;
  const totalW = COLUMNS.reduce((s, c) => s + (colWidths[c.id] || c.defaultW), 0);
  const gasOk = isGasConfigured();
  const canUndo = !!undoRef.current;

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
            <input className="input" style={{ maxWidth: 220 }} placeholder="검색 (엔드유저/회사/담당자)" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
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
            <Button variant="secondary" onClick={undoDelete} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.4 }}>↩ 되돌리기</Button>
            <Button variant={gasOk ? 'success' : 'secondary'} onClick={() => setGasModalOpen(true)}>{gasOk ? '🟢 시트 연동' : '⚙️ GAS 설정'}</Button>
            <Button variant="secondary" onClick={() => setImportModalOpen(true)}>📂 업로드</Button>
            <Button variant="secondary" onClick={handleExcelExport}>⬇️ 엑셀 다운로드</Button>
            <Button onClick={() => setModal({})}>+ 새 인콜 등록</Button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>💡 열 헤더 오른쪽 경계선을 드래그해서 너비 조정 — 자동 저장됩니다</p>
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
                  <td>
                    {(r.infra||[]).map(t=><span key={t} className="tag">{t}</span>)}
                    {r.infraDetail && <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{r.infraDetail}</div>}
                  </td>
                  <td>{r.sales}</td>
                  <td><Badge color={pipelineColor(r.status)}>{r.status}</Badge></td>
                  <td><Badge color={winrateColor(r.winrate||0)}>{r.winrate||0}%</Badge></td>
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
      {importModalOpen && <ImportModal onClose={() => setImportModalOpen(false)} fileInputRef={fileInputRef} onFileChange={handleFileChange} />}
      {gasModalOpen && <GasSettingsModal onClose={() => setGasModalOpen(false)} toast={toast} />}
    </div>
  );
}

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
                    onMouseDown={e => { e.stopPropagation(); startResize(e, c.id); }} onClick={e => e.stopPropagation()} />
            </th>
          ))}
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function GasSettingsModal({ onClose, toast }) {
  const [url, setUrl] = React.useState(getGasUrl());
  const [token, setToken] = React.useState(getGasToken());
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState(null);
  async function handleTest() {
    if (!url.trim()) { toast('URL을 먼저 입력해 주세요.', 'err'); return; }
    setTesting(true); setTestResult(null);
    setGasConfig(url, token);
    const ok = await testConnection();
    setTesting(false); setTestResult(ok ? 'ok' : 'fail');
  }
  function handleSave() {
    if (!url.trim()) { toast('URL을 입력해 주세요.', 'err'); return; }
    setGasConfig(url, token); toast('GAS 설정이 저장되었습니다.', 'ok'); onClose();
  }
  function handleClear() {
    if (!confirm('GAS 연동을 해제하시겠습니까?')) return;
    setGasConfig('', ''); toast('GAS 연동이 해제되었습니다.'); onClose();
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-head"><h3>⚙️ 구글 시트(GAS) 연동 설정</h3><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div style={{ padding:12, background:'#eff6ff', borderRadius:8, fontSize:13, marginBottom:18 }}>
            ① Apps Script → SpreadsheetGAS.gs 붙여넣기<br />
            ② <code>setupToken()</code> 실행<br />
            ③ 배포 → 웹앱 → 모든 사용자 → URL 복사
          </div>
          <div className="field">
            <label>GAS 웹앱 배포 URL <span style={{ color:'var(--danger)' }}>*</span></label>
            <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
          </div>
          <div className="field">
            <label>인증 토큰</label>
            <input className="input" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="brainz-incall-2026" />
          </div>
          {testResult === 'ok'   && <div style={{ padding:'8px 12px', background:'#dcfce7', borderRadius:6, color:'#166534', fontSize:13 }}>✅ 연결 성공!</div>}
          {testResult === 'fail' && <div style={{ padding:'8px 12px', background:'#fee2e2', borderRadius:6, color:'#991b1b', fontSize:13 }}>❌ 연결 실패</div>}
        </div>
        <div className="modal-foot" style={{ justifyContent:'space-between' }}>
          <Button variant="danger" size="sm" onClick={handleClear}>연동 해제</Button>
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="secondary" onClick={onClose}>취소</Button>
            <Button variant="secondary" onClick={handleTest} disabled={testing}>{testing ? '테스트 중…' : '연결 테스트'}</Button>
            <Button onClick={handleSave}>저장</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose, fileInputRef, onFileChange }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-head"><h3>📂 인콜 일괄 업로드</h3><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div style={{ padding:12, background:'#eff6ff', borderRadius:8, fontSize:13, marginBottom:16 }}>
            <b>지원 형식:</b> Excel(.xlsx) 및 CSV(.csv)<br /><br />
            14열(앱 다운로드): 인프라세부 컬럼 포함 / 13열(기존 CSV): 미포함 — 자동 감지
          </div>
          <div style={{ border:'2px dashed var(--border)', borderRadius:8, padding:32, textAlign:'center', cursor:'pointer' }} onClick={() => fileInputRef.current?.click()}>
            <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
            <div style={{ fontSize:13, color:'var(--muted)' }}>xlsx / csv 파일을 클릭해서 선택</div>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }} onChange={onFileChange} />
        </div>
        <div className="modal-foot"><Button variant="secondary" onClick={onClose}>닫기</Button></div>
      </div>
    </div>
  );
}
