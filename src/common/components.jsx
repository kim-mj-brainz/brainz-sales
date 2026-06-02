/* =============================================================
   공통 UI 컴포넌트 (담당: 공통영역)
   문서생성 정의서의 공통 컴포넌트 명세 기준.
   모든 모듈이 재사용. 디자인 변경 시 styles.css + 이 파일만 수정.
   ============================================================= */
import React from 'react';

export function Button({ variant = 'primary', size = 'md', children, ...rest }) {
  const cls = `btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}`;
  return <button className={cls} {...rest}>{children}</button>;
}

export function Input({ label, req, error, hint, className = '', as = 'input', children, ...rest }) {
  const Tag = as === 'textarea' ? 'textarea' : as === 'select' ? 'select' : 'input';
  const base = as === 'textarea' ? 'textarea' : as === 'select' ? 'select' : 'input';
  return (
    <div className="field">
      {label && <label>{label} {req && <span className="req">*</span>}</label>}
      <Tag className={`${base} ${error ? 'invalid' : ''} ${className}`} {...rest}>{children}</Tag>
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err-text">{error}</div>}
    </div>
  );
}

export function Modal({ title, children, footer, onClose, width = 560 }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* columns: [{ key, label, render?, sortable?, className? }] */
export function Table({ columns, data, onRowClick, sortKey, sortDir, onSort, emptyText = '데이터가 없습니다.' }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}
                  className={c.className}
                  onClick={() => c.sortable && onSort?.(c.key)}
                  style={{ cursor: c.sortable ? 'pointer' : 'default' }}>
                {c.label}
                {c.sortable && sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty">{emptyText}</td></tr>
          ) : data.map((row, i) => (
            <tr key={row.id || i} onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
              {columns.map((c) => (
                <td key={c.key} className={c.cellClass}>
                  {c.render ? c.render(row, i) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({ color = 'gray', children }) {
  return <span className={`badge-pill b-${color}`}>{children}</span>;
}

export function Spinner() { return <div className="spinner" />; }

export function AccessDenied() {
  return (
    <div className="access-denied">
      <div className="code">403</div>
      <h2>접근 권한이 없습니다</h2>
      <p className="muted">이 기능에 접근할 권한이 없습니다. 관리자에게 문의하세요.</p>
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let p = start; p <= end; p++) pages.push(p);
  return (
    <div className="pagination">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}>‹</button>
      {pages.map((p) => (
        <button key={p} className={p === page ? 'active' : ''} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}>›</button>
    </div>
  );
}

/* 진행상태 / 수주여부 뱃지 색상 매핑 (InCall 정의서) */
export function pipelineColor(status) {
  return ({ '컨택중': 'blue', '견적서전달': 'yellow', '고객미팅': 'purple', '계약완료': 'green', '영업실패': 'red' })[status] || 'gray';
}
export function winrateColor(v) { return v >= 70 ? 'green' : v >= 40 ? 'yellow' : 'red'; }
