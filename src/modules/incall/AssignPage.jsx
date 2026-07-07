/* =============================================================
   담당자 지정 페이지 (로그인 불필요 — 이메일 링크 전용)
   /?assign=INCALL_ID&t=ASSIGN_TOKEN 으로 접근
   ============================================================= */
import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

async function apiGet(key) {
  const r = await fetch(`${API}/api/collection/${key}`);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function apiPut(key, data) {
  const r = await fetch(`${API}/api/collection/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`저장 오류 ${r.status}`);
  return r.json();
}

async function gasPost(gasUrl, gasToken, body) {
  await fetch(gasUrl, {
    method: 'POST',
    mode: 'no-cors',
    credentials: 'include',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...body, token: gasToken }),
  });
}

export default function AssignPage({ incallId, token }) {
  const [status, setStatus]           = useState('loading'); // loading | invalid | ready | saved
  const [incall, setIncall]           = useState(null);
  const [allIncalls, setAllIncalls]   = useState([]);
  const [salesStaff, setSalesStaff]   = useState([]);
  const [selectedSales, setSelectedSales] = useState('');
  const [notifying, setNotifying]     = useState('');
  const [msg, setMsg]                 = useState(null); // { text, ok }

  useEffect(() => {
    (async () => {
      try {
        const [incalls, staff] = await Promise.all([
          apiGet('incalls'),
          apiGet('documentStaff'),
        ]);
        const found = (incalls || []).find(i => i.id === incallId && i.assignToken === token);
        if (!found) { setStatus('invalid'); return; }
        setAllIncalls(incalls);
        setIncall(found);
        setSelectedSales(found.sales || '');
        setSalesStaff((staff || []).filter(s => s.role === '영업'));
        setStatus('ready');
      } catch (e) {
        setMsg({ text: '데이터 로드 실패: ' + e.message, ok: false });
        setStatus('invalid');
      }
    })();
  }, [incallId, token]);

  async function persistSelectedSales() {
    const updated  = { ...incall, sales: selectedSales, updatedAt: new Date().toISOString() };
    const nextList = allIncalls.map(i => i.id === incall.id ? updated : i);
    await apiPut('incalls', nextList);
    setIncall(updated);
    setAllIncalls(nextList);
    setStatus('saved');
    return updated;
  }

  async function save() {
    try {
      await persistSelectedSales();
      setMsg({ text: '담당자가 저장되었습니다.', ok: true });
    } catch (e) {
      setMsg({ text: '저장 실패: ' + e.message, ok: false });
    }
  }

  async function notify(method) {
    setNotifying(method);
    try {
      const current = await persistSelectedSales();
      if (!current.gasUrl) {
        setMsg({ text: 'GAS가 설정되지 않아 알림을 보낼 수 없습니다.', ok: false });
        return;
      }
      await gasPost(current.gasUrl, current.gasToken, {
        action: 'addIncall',
        data: current,
        notifyMethod: method,
      });
      const label = method === 'both' ? '이메일·채팅' : method === 'chat' ? '채팅' : '이메일';
      setMsg({ text: `${label} 알림을 발송했습니다.`, ok: true });
    } catch (e) {
      setMsg({ text: '알림 발송 실패: ' + e.message, ok: false });
    } finally {
      setNotifying('');
    }
  }

  // ── 로딩 ──
  if (status === 'loading') {
    return (
      <div style={S.page}>
        <div style={S.card}><p style={S.muted}>불러오는 중...</p></div>
      </div>
    );
  }

  // ── 유효하지 않은 링크 ──
  if (status === 'invalid') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <h2 style={S.heading}>링크가 유효하지 않습니다</h2>
          <p style={S.muted}>{msg?.text || '인콜을 찾을 수 없거나 링크가 만료되었습니다.'}</p>
        </div>
      </div>
    );
  }

  // ── 메인 ──
  const staffSelected = salesStaff.find(s => s.name === selectedSales);
  const infra = [(incall.infra || []).join(', '), incall.infraDetail].filter(Boolean).join(' / ') || '-';

  const infoRows = [
    ['엔드유저',   incall.endUser],
    ['문의회사',   incall.company],
    ['유입유형',   incall.inflowType],
    ['유입일자',   incall.inflowDate],
    ['문의인프라', infra],
    ['문의담당자', [incall.contactPerson, incall.contactPhone].filter(Boolean).join(' ')],
    ['비고',       incall.note],
  ].filter(([, v]) => v);

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* 헤더 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>brainz InCall CRM</div>
          <h2 style={S.heading}>담당자 지정 요청</h2>
          <p style={S.muted}>아래 인콜 건의 담당영업을 지정하고 알림을 발송하세요.</p>
        </div>

        {/* 인콜 정보 */}
        <div style={S.infoBox}>
          {infoRows.map(([label, value]) => (
            <div key={label} style={S.infoRow}>
              <span style={S.infoLabel}>{label}</span>
              <span style={S.infoValue}>{value}</span>
            </div>
          ))}
        </div>

        {/* 담당자 선택 */}
        <div style={{ marginTop: 24 }}>
          <label style={S.label}>담당영업 선택</label>
          <select style={S.select} value={selectedSales} onChange={e => setSelectedSales(e.target.value)}>
            <option value="">-- 선택하세요 --</option>
            {salesStaff.map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          {staffSelected && (
            <div style={S.staffMeta}>
              {staffSelected.email && <span>{staffSelected.email}</span>}
              {staffSelected.phone && <span style={{ marginLeft: 12 }}>{staffSelected.phone}</span>}
            </div>
          )}
        </div>

        {/* 메시지 */}
        {msg && (
          <div style={{ ...S.msgBox, background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? '#166534' : '#991b1b' }}>
            {msg.text}
          </div>
        )}

        {/* 버튼 */}
        <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...S.btn, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }}
                  onClick={save} disabled={!selectedSales}>
            저장
          </button>
          <button style={S.btn} onClick={() => notify('email')} disabled={!selectedSales || !!notifying}>
            {notifying === 'email' ? '발송 중...' : '이메일 알림'}
          </button>
          <button style={S.btn} onClick={() => notify('chat')} disabled={!selectedSales || !!notifying}>
            {notifying === 'chat' ? '발송 중...' : 'Chat 알림'}
          </button>
          <button style={S.btn} onClick={() => notify('both')} disabled={!selectedSales || !!notifying}>
            {notifying === 'both' ? '발송 중...' : '이메일+Chat'}
          </button>
        </div>

        <p style={{ ...S.muted, marginTop: 20, fontSize: 11 }}>
          저장 없이 알림 버튼을 누르면 현재 선택한 담당자로 발송됩니다.
        </p>
      </div>
    </div>
  );
}

const S = {
  page:      { minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:      { background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, maxWidth: 560, width: '100%' },
  heading:   { fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' },
  muted:     { color: '#64748b', fontSize: 13, margin: 0 },
  infoBox:   { background: '#f8fafc', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0' },
  infoRow:   { display: 'flex', gap: 12, marginBottom: 6, fontSize: 14 },
  infoLabel: { color: '#64748b', minWidth: 72, flexShrink: 0 },
  infoValue: { color: '#1e293b', fontWeight: 500 },
  label:     { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  select:    { width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  staffMeta: { marginTop: 6, fontSize: 12, color: '#64748b' },
  msgBox:    { marginTop: 14, padding: '9px 14px', borderRadius: 6, fontSize: 13 },
  btn:       { padding: '9px 18px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 14, cursor: 'pointer', fontWeight: 500 },
};
