/* =============================================================
   검색 팝업 (담당: 문서생성)
   CompanySearchPopup: 거래처(신용등급 DB) 검색 → 주소 자동입력
   StaffSearchPopup: 담당영업/엔지니어 검색 (role 필터)
   ============================================================= */
import React, { useState } from 'react';
import { Modal, Button, Input } from '../../common/components.jsx';

export function CompanySearchPopup({ items = [], onClose, onSelect }) {
  const [q, setQ] = useState('');
  const query = q.trim();
  const filtered = items.filter((c) => {
    if (!query) return true;
    return `${c.company || ''}${c.ceo || ''}${c.address || ''}`.includes(query);
  });
  return (
    <Modal title="고객사 검색" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>닫기</Button>}>
      <input className="input" placeholder="고객사명 또는 주소" value={q} onChange={(e) => setQ(e.target.value)} autoFocus style={{ marginBottom: 12 }} />
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th style={{cursor:'default'}}>고객사명</th><th style={{cursor:'default'}}>주소</th><th style={{cursor:'default'}}></th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}><td>{c.company}</td><td className="muted" style={{ fontSize: 12 }}>{c.address || '-'}</td>
                <td><Button size="sm" onClick={() => onSelect(c)}>선택</Button></td></tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={3} className="empty">결과 없음</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function StaffSearchPopup({ items = [], role, onClose, onSelect }) {
  const [q, setQ] = useState('');
  const query = q.trim();
  const filtered = items.filter((s) => {
    if (role && s.role !== role) return false;
    if (!query) return true;
    return `${s.name}${s.phone || ''}${s.email || ''}`.includes(query);
  });

  return (
    <Modal title={`${role || '담당자'} 검색`} onClose={onClose} width={720} footer={<Button variant="secondary" onClick={onClose}>닫기</Button>}>
      <div className="toolbar staff-popup-toolbar">
        <input className="input" placeholder="이름, 전화번호, 이메일 검색" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th style={{cursor:'default'}}>이름</th><th style={{cursor:'default'}}>전화번호</th><th style={{cursor:'default'}}>이메일</th><th style={{cursor:'default'}}>구분</th><th style={{cursor:'default'}}></th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}><td>{s.name}</td><td>{s.phone || '-'}</td><td>{s.email || '-'}</td><td>{s.role}</td>
                <td><Button size="sm" onClick={() => onSelect(s)}>선택</Button></td></tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="empty">결과 없음</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
