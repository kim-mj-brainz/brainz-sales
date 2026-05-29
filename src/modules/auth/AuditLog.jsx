/* =============================================================
   감사로그 조회 화면 (담당: 공통영역 / auth)  권한: ADMIN/MANAGER
   FR-AUDIT-02 조회 권한 제한, 3.2 필터/정렬/상세, 다운로드(ADMIN)
   ============================================================= */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Table, Modal, Badge, AccessDenied } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { getAuditLogs, AUDIT_CATEGORY } from '../../common/audit.js';

const catColor = { AUTH: 'blue', ACCOUNT: 'gray', AUTHZ: 'purple', CREDIT: 'yellow', DOCUMENT: 'green', REFERENCE: 'blue', INCALL: 'purple', SYSTEM: 'red' };

export default function AuditLog() {
  const { currentUser, logAudit, toast } = useApp();
  const [filters, setFilters] = useState({ from: '', to: '', actor: '', category: '', result: '' });
  const [detail, setDetail] = useState(null);
  const [refresh, setRefresh] = useState(0);

  if (!hasPermission(currentUser.role, 'audit:view')) return <AccessDenied />;

  const logs = useMemo(() => getAuditLogs(), [refresh]);

  const filtered = useMemo(() => logs.filter((l) => {
    if (filters.category && l.category !== filters.category) return false;
    if (filters.result && l.result !== filters.result) return false;
    if (filters.actor && !(`${l.actorName}${l.actorEmployeeNo}`.includes(filters.actor))) return false;
    if (filters.from && l.eventTime < filters.from) return false;
    if (filters.to && l.eventTime > filters.to + 'T23:59:59Z') return false;
    return true;
  }), [logs, filters]);

  function download() {
    if (!hasPermission(currentUser.role, 'audit:download')) { toast('다운로드 권한이 없습니다.', 'err'); return; }
    const head = ['eventTime', 'actorEmployeeNo', 'actorName', 'role', 'category', 'eventType', 'target', 'result', 'failReason'];
    const rows = filtered.map((l) => [l.eventTime, l.actorEmployeeNo, l.actorName, l.actorRole, l.category, l.eventType, l.targetName, l.result, l.failReason]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit_log.csv'; a.click();
    // 다운로드 행위 자체도 감사로그 기록 (3.2)
    logAudit({ category: AUDIT_CATEGORY.SYSTEM, eventType: 'AUDIT_DOWNLOAD', result: 'SUCCESS' });
    setRefresh((r) => r + 1);
  }

  const fmt = (iso) => { try { return new Date(iso).toLocaleString('ko-KR'); } catch { return iso; } };
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  const columns = [
    { key: 'eventTime', label: '발생일시', render: (r) => fmt(r.eventTime) },
    { key: 'actorName', label: '행위자', render: (r) => `${r.actorName} (${r.actorEmployeeNo})` },
    { key: 'category', label: '분류', render: (r) => <Badge color={catColor[r.category] || 'gray'}>{r.category}</Badge> },
    { key: 'eventType', label: '이벤트' },
    { key: 'targetName', label: '대상' },
    { key: 'result', label: '결과', render: (r) => <Badge color={r.result === 'SUCCESS' ? 'green' : 'red'}>{r.result}</Badge> },
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="card-title mb0">감사로그</div>
        <div className="spacer" />
        {hasPermission(currentUser.role, 'audit:download') && <Button variant="secondary" onClick={download}>CSV 다운로드</Button>}
      </div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
          <Input label="시작일" type="date" value={filters.from} onChange={set('from')} className="mb0" />
          <Input label="종료일" type="date" value={filters.to} onChange={set('to')} />
          <Input label="행위자(이름/사번)" value={filters.actor} onChange={set('actor')} />
          <Input label="분류" as="select" value={filters.category} onChange={set('category')}>
            <option value="">전체</option>
            {Object.values(AUDIT_CATEGORY).map((c) => <option key={c} value={c}>{c}</option>)}
          </Input>
          <Input label="결과" as="select" value={filters.result} onChange={set('result')}>
            <option value="">전체</option><option value="SUCCESS">SUCCESS</option><option value="FAIL">FAIL</option>
          </Input>
        </div>
      </div>
      <Table columns={columns} data={filtered} onRowClick={setDetail} emptyText="감사로그가 없습니다." />
      {detail && (
        <Modal title="감사로그 상세" onClose={() => setDetail(null)} footer={<Button variant="secondary" onClick={() => setDetail(null)}>닫기</Button>}>
          <table className="tbl"><tbody>
            {Object.entries({ '발생일시': fmt(detail.eventTime), '행위자': `${detail.actorName} (${detail.actorEmployeeNo})`, '권한': detail.actorRole, '소속': detail.actorTeam, 'IP': detail.actorIp, 'User-Agent': detail.userAgent, '분류': detail.category, '이벤트': detail.eventType, '대상': `${detail.targetType} / ${detail.targetName}`, '결과': detail.result, '실패사유': detail.failReason || '-', '추가정보': detail.extra ? JSON.stringify(detail.extra) : '-' }).map(([k, v]) => (
              <tr key={k}><th style={{ width: 130, cursor: 'default' }}>{k}</th><td>{v}</td></tr>
            ))}
          </tbody></table>
        </Modal>
      )}
    </div>
  );
}
