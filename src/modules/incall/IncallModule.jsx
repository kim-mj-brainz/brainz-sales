/* =============================================================
   InCall CRM 모듈 메인 (담당: 인콜)
   대시보드 / 인콜 목록 탭. 역할별 접근(USER 본인 건만).
   목록: 검색·필터·정렬·페이지네이션(20건).
   열 너비: localStorage('incall-col-widths')에 저장 → 다음 사용자도 동일.
   엑셀: 일괄 업로드(xlsx) / 전체 다운로드.
   ============================================================= */
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Badge, Pagination, pipelineColor, winrateColor } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { AUDIT_CATEGORY } from '../../common/audit.js';
import { SEED_INCALLS } from '../../data/seedData.js';
import IncallModal from './IncallModal.jsx';
import IncallDashboard from './IncallDashboard.jsx';

const PAGE_SIZE = 20;

/* 컬럼 정의 */
const COLUMNS = [
  { id: 'num',           label: '#',          key: '',            defaultW: 44  },
  { id: 'inflowDate',    label: '유입일자',   key: 'inflowDate',  defaultW: 100 },
  { id: 'inflowType',    label: '유입유형',   key: 'inflowType',  defaultW: 90  },
  { id: 'endUser',       label: '엔드유저',   key: 'endUser',     defaultW: 130 },
  { id: 'company',       label: '문의회사',   key: 'company',     defaultW: 120 },
  { id: 'contactPerson', label: '문의담당자', key: 'contactPerson', defaultW: 100 },
  { id: 'contactPhone',  label: '문의연락처', key: 'contactPhone',  defaultW: 120 },
  { id: 'infra',         label: '문의인프라', key: '',            defaultW: 110 },
  { id: 'sales',         label: '담당영업',   key: 'sales',       defaultW: 90  },
  { id: 'status',        label: '진행상태',   key: 'status',      defaultW: 100 },
  { id: 'winrate',       label: '수주여부',   key: 'winrate',     defaultW: 80  },
  { id: 'salesCode',     label: '매출코드',   key: 'salesCode',   defaultW: 110 },
  { id: 'activity',      label: '활동내역',   key: '',            defaultW: 160 },
  { id: 'note',          label: '비고',       key: '',            defaultW: 120 },
  { id: 'actions',       label: '작업',       key: '',            defaultW: 90  },
];

const COL_WIDTHS_KEY = 'incall-col-widths';
function loadColWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || '{}');
    const defaults = Object.fromEntries(COLUMNS.map(c => [c.id, c.defaultW]));
    return { ...defaults, ...saved };
  } catch { return Object.fromEntries(COLUMNS.map(c => [c.id, c.defaultW])); }
}
function saveColWidths(widths) {
  localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(widths));
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
  const fileInputRef = useRef(null);

  // 열 너비 변경 → localStorage 저장
  const updateColWidth = useCallback((colId, newW) => {
    setColWidths(prev => {
      const next = { ...prev, [colId]: Math.max(50, newW) };
      saveColWidths(next);
      return next;
    });
  }, []);

  // 역할별 데이터 범위
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

  /* ── 엑셀 다운로드 ── */
  function handleExcelExport() {
    const headers = ['유입일자','유입유형','엔드유저','문의회사','문의담당자','문의연락처','문의인프라','담당영업','진행상태','수주여부(%)','매출코드','활동내역','비고'];
    const rows = visible.map(r => [
      r.inflowDate, r.inflowType, r.endUser, r.company,
      r.contactPerson, r.contactPhone, (r.infra || []).join('/'),
      r.sales, r.status, r.winrate, r.salesCode, r.activity, r.note,
    ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'InCall목록');
    XLSX.writeFile(wb, `InCall목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('엑셀 다운로드 완료!');
  }

  /* ── 엑셀 업로드 ── */
  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const data = rows.slice(1).filter(r => r[2]); // 헤더 제외, 엔드유저 있는 행
        const now = new Date().toISOString();
        let added = 0;
        data.forEach(r => {
          col.add({
            inflowDate: String(r[0] || '').slice(0, 10) || now.slice(0, 10),
            inflowType: String(r[1] || '홈페이지'),
            endUser:    String(r[2] || ''),
            company:    String(r[3] || ''),
            contactPerson: String(r[4] || ''),
            contactPhone:  String(r[5] || ''),
            infra: String(r[6] || '').split('/').map(s => s.trim()).filter(Boolean),
            sales:    String(r[7] || ''),
            status:   String(r[8] || '컨택중'),
            winrate:  Math.min(100, Math.max(0, parseInt(r[9]) || 0)),
            salesCode: String(r[10] || ''),
            activity:  String(r[11] || ''),
            note:      String(r[12] || ''),
            ownerId: currentUser.id, createdAt: now, updatedAt: now,
          }, 'IC');
          added++;
        });
        logAudit({ category: AUDIT_CATEGORY.INCALL, eventType: 'IMPORT', targetType: 'INCALL', targetId: 'BULK', targetName: `${added}건` });
        toast(`${added}건 업로드 완료!`);
        setImportModalOpen(false);
      } catch (err) {
        toast('파일 파싱 오류: ' + err.message, 'err');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function downloadTemplate() {
    const headers = ['유입일자','유입유형','엔드유저','문의회사','문의담당자','문의연락처','문의인프라','담당영업','진행상태','수주여부(%)','매출코드','활동내역','비고'];
    const sample = ['2026-05-30','홈페이지','샘플엔드유저','샘플회사','홍길동','010-1234-5678','EMS/SIEM','김영업','컨택중',30,'A12345-01','초기 문의','비고 내용'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    XLSX.utils.book_append_sheet(wb, ws, '인콜업로드양식');
    XLSX.writeFile(wb, '인콜업로드양식.xlsx');
  }

  const incomplete = visible.filter(i => i.winrate > 0 && i.winrate < 100 && i.status !== '영업실패').length;
  const totalW = COLUMNS.reduce((s, c) => s + (colWidths[c.id] || c.defaultW), 0);

  return (
    <div>
      {/* ── 탭: 목록 먼저, 대시보드 나중 ── */}
      <div className="tabs">
        <div className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          인콜 목록 {incomplete > 0 && <span className="badge-pill b-red" style={{ marginLeft: 4 }}>{incomplete}</span>}
        </div>
        <div className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>대시보드</div>
      </div>

      {tab === 'dashboard' && <IncallDashboard incalls={visible} onOpen={r => setModal({ record: r })} />}

      {tab === 'list' && (
        <div>
          {/* 툴바 */}
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
            <Button variant="secondary" onClick={() => setImportModalOpen(true)}>📂 엑셀 업로드</Button>
            <Button variant="secondary" onClick={handleExcelExport}>⬇️ 엑셀 다운로드</Button>
            <Button onClick={() => setModal({})}>+ 새 인콜 등록</Button>
          </div>

          {/* 열너비 안내 */}
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
            💡 열 헤더 오른쪽 경계선을 드래그해서 너비 조정 — 설정은 자동 저장됩니다
          </p>

          {/* 테이블 */}
          <ResizableTable
            columns={COLUMNS}
            colWidths={colWidths}
            onWidthChange={updateColWidth}
            totalW={totalW}
            sort={sort}
            onSort={toggleSort}
          >
            {pageData.length === 0
              ? <tr><td colSpan={COLUMNS.length} className="empty">인콜이 없습니다.</td></tr>
              : pageData.map((r, i) => (
                <tr key={r.id}>
                  <td className="num-cell">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td>{r.inflowDate}</td>
                  <td><span className="tag">{r.inflowType}</span></td>
                  <td title={r.endUser}><b>{r.endUser}</b></td>
                  <td title={r.company}>{r.company}</td>
                  <td title={r.contactPerson}>{r.contactPerson || '-'}</td>
                  <td title={r.contactPhone}>{r.contactPhone || '-'}</td>
                  <td>{(r.infra || []).map(t => <span key={t} className="tag">{t}</span>)}</td>
                  <td>{r.sales}</td>
                  <td><Badge color={pipelineColor(r.status)}>{r.status}</Badge></td>
                  <td><Badge color={winrateColor(r.winrate)}>{r.winrate}%</Badge></td>
                  <td title={r.salesCode}><code style={{ fontSize: 12 }}>{r.salesCode || '-'}</code></td>
                  <td title={r.activity} style={{ maxWidth: colWidths.activity, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.activity}</td>
                  <td title={r.note} style={{ maxWidth: colWidths.note, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</td>
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

      {/* 등록/수정 모달 */}
      {modal && <IncallModal record={modal.record} onClose={() => setModal(null)} onSave={saveRecord} />}

      {/* 엑셀 업로드 모달 */}
      {importModalOpen && (
        <ExcelImportModal
          onClose={() => setImportModalOpen(false)}
          onDownloadTemplate={downloadTemplate}
          onFileChange={handleFileChange}
          fileInputRef={fileInputRef}
        />
      )}
    </div>
  );
}

/* ── 열 너비 조정 가능한 테이블 헤더 ── */
function ResizableTable({ columns, colWidths, onWidthChange, totalW, sort, onSort, children }) {
  const isDragging = useRef(false);

  function startResize(e, colId) {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startW = colWidths[colId];

    function onMove(ev) {
      if (!isDragging.current) return;
      onWidthChange(colId, startW + ev.clientX - startX);
    }
    function onUp() {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div className="table-wrap">
      <table className="tbl" style={{ width: totalW, minWidth: '100%', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.id}
                style={{ width: colWidths[c.id], minWidth: colWidths[c.id], position: 'relative', overflow: 'hidden' }}
                className={c.key ? 'sortable' : ''}
                onClick={() => c.key && onSort(c.key)}
              >
                {c.label}{c.key && sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                {/* 리사이즈 핸들 */}
                <span
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 1 }}
                  onMouseDown={e => { e.stopPropagation(); startResize(e, c.id); }}
                  onClick={e => e.stopPropagation()}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ── 엑셀 업로드 모달 ── */
function ExcelImportModal({ onClose, onDownloadTemplate, onFileChange, fileInputRef }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3>📂 엑셀로 인콜 일괄 업로드</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: 12, background: '#eff6ff', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            <b>업로드 형식 안내</b><br />
            A: 유입일자(YYYY-MM-DD) · B: 유입유형 · C: 엔드유저 · D: 문의회사<br />
            E: 문의담당자 · F: 문의연락처 · G: 문의인프라(EMS/SIEM, /로 구분)<br />
            H: 담당영업 · I: 진행상태 · J: 수주여부(0~100) · K: 매출코드<br />
            L: 활동내역 · M: 비고<br /><br />
            <b>1행은 헤더</b>(건너뜀). 기존 인콜은 유지되고 새 행만 추가됩니다.
          </div>
          <Button variant="secondary" size="sm" onClick={onDownloadTemplate} style={{ marginBottom: 12 }}>
            📥 업로드 양식 다운로드
          </Button>
          <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 32, textAlign: 'center', cursor: 'pointer', marginTop: 8 }}
               onClick={() => fileInputRef.current?.click()}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>엑셀 파일(.xlsx/.xls)을 클릭해서 선택</div>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFileChange} />
        </div>
        <div className="modal-foot">
          <Button variant="secondary" onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}
