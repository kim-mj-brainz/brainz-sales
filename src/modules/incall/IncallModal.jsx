/* =============================================================
   InCall CRM 등록/수정 모달 (담당: 인콜)
   수주여부: 0/20/50/60/70/80/90/95/100% 고정 선택.
   GAS 연동: 매출코드 입력 시 수주확률·주간보고 자동 조회.
   알림: 신규 등록 시 담당자에게 이메일/구글챗 선택 발송.
   ============================================================= */
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Modal } from '../../common/components.jsx';
import { SALES_CODE_INCALL } from '../../data/codeMaster.js';
import { lookupByCode, isGasConfigured } from '../../common/gasApi.js';

const WINRATE_OPTIONS = [0, 20, 50, 60, 70, 80, 90, 95, 100];

const EMPTY = {
  inflowDate: new Date().toISOString().slice(0, 10), inflowType: '홈페이지', endUser: '', company: '',
  contactPerson: '', contactPhone: '', infra: [], infraDetail: '', sales: '', presales: '',
  status: '컨택중', winrate: 20, salesCode: '', activity: '', note: '',
};

export default function IncallModal({ record, onClose, onSave }) {
  const { master, toast } = useApp();
  const [f, setF] = useState(record ? { ...record, infra: record.infra || [] } : { ...EMPTY });
  const [err, setErr] = useState({});
  const [gasStatus, setGasStatus] = useState('idle');
  // 알림 설정 (신규 등록 시에만 표시)
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyMethod, setNotifyMethod] = useState('email'); // 'email' | 'chat' | 'both'
  const debounceRef = useRef(null);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  useEffect(() => {
    if (record?.salesCode && isGasConfigured()) triggerLookup(record.salesCode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleInfra(t) {
    setF(cur => {
      const infra = cur.infra || [];
      return { ...cur, infra: infra.includes(t) ? infra.filter(x => x !== t) : [...infra, t] };
    });
  }

  function onSalesCode(e) {
    const v = e.target.value;
    setF(prev => ({ ...prev, salesCode: v }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim() || !isGasConfigured()) { setGasStatus('idle'); return; }
    setGasStatus('loading');
    debounceRef.current = setTimeout(() => triggerLookup(v.trim()), 800);
  }

  async function triggerLookup(code) {
    if (!isGasConfigured()) return;
    try {
      setGasStatus('loading');
      const result = await lookupByCode(code);
      if (result.found) {
        setGasStatus('found');
        setF(prev => {
          const next = { ...prev };
          if (result.winrate !== null && result.winrate !== undefined) {
            const closest = WINRATE_OPTIONS.reduce((a, b) =>
              Math.abs(b - result.winrate) < Math.abs(a - result.winrate) ? b : a);
            next.winrate = closest;
          }
          if (result.activity && !(prev.activity || '').includes(result.activity)) {
            next.activity = result.activity + (prev.activity ? '\n\n[기존]\n' + prev.activity : '');
          }
          return next;
        });
        toast('구글 시트에서 수주확률·활동내역을 가져왔습니다.');
      } else {
        setGasStatus('notfound');
      }
    } catch {
      setGasStatus('error');
    }
  }

  function submit() {
    const e = {};
    if (!f.endUser.trim()) e.endUser = '엔드유저는 필수입니다.';
    if (f.salesCode && !SALES_CODE_INCALL.test(f.salesCode)) e.salesCode = '형식: A12345-01';
    setErr(e);
    if (Object.keys(e).length) return;
    // 알림 설정을 함께 전달
    onSave(f, { enabled: !record && notifyEnabled, method: notifyMethod });
  }

  const gasLabel = {
    idle:     null,
    loading:  <span style={badge('#e0f2fe','#0369a1')}>🔄 구글 시트 조회 중…</span>,
    found:    <span style={badge('#dcfce7','#166534')}>✅ 시트 연동됨</span>,
    notfound: <span style={badge('#fef3c7','#92400e')}>⚠️ 매출코드 없음</span>,
    error:    <span style={badge('#fee2e2','#991b1b')}>❌ GAS 연결 실패</span>,
  }[gasStatus];

  const infra = f.infra || [];
  const isNew = !record;
  const gasOk = isGasConfigured();

  return (
    <Modal title={isNew ? '새 인콜 등록' : '인콜 수정'} width={660} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={submit}>저장</Button></>}>

      <div className="form-grid">
        <Input label="유입일자" type="date" value={f.inflowDate} onChange={set('inflowDate')} />
        <Input label="유입유형" as="select" value={f.inflowType} onChange={set('inflowType')}>
          {master.INFLOW_TYPE.map(x => <option key={x}>{x}</option>)}
        </Input>
        <Input label="엔드유저" req value={f.endUser} onChange={set('endUser')} error={err.endUser} />
        <Input label="문의회사" value={f.company} onChange={set('company')} />
        <Input label="문의담당자" value={f.contactPerson} onChange={set('contactPerson')} />
        <Input label="문의연락처" value={f.contactPhone} onChange={set('contactPhone')} />
      </div>

      <div className="field">
        <label>문의인프라</label>
        <div className="checkbox-row">
          {master.INFRA_TYPE.map(t => (
            <label key={t}><input type="checkbox" checked={infra.includes(t)} onChange={() => toggleInfra(t)} /> {t}</label>
          ))}
        </div>
      </div>
      <Input label="인프라세부" as="textarea" value={f.infraDetail || ''} onChange={set('infraDetail')} />

      <div className="form-grid">
        <Input label="담당영업" as="select" value={f.sales || ''} onChange={set('sales')}>
          <option value="">선택</option>
          {master.SALES_PERSON.map(x => <option key={x}>{x}</option>)}
        </Input>
        <Input label="프리세일즈" as="select" value={f.presales || ''} onChange={set('presales')}>
          <option value="">선택</option>
          {master.PRESALES.map(x => <option key={x}>{x}</option>)}
        </Input>
        <Input label="진행상태" as="select" value={f.status} onChange={set('status')}>
          {master.PIPELINE_STATUS.map(x => <option key={x}>{x}</option>)}
        </Input>

        <div className="field">
          <label>매출코드 {gasOk && <span style={{ fontWeight:400, color:'var(--muted)', fontSize:11 }}>입력 시 시트 자동 조회</span>}</label>
          <input className={`input${err.salesCode ? ' invalid' : ''}`} value={f.salesCode || ''} onChange={onSalesCode} placeholder="A12345-01 형식" />
          {err.salesCode && <div className="err-text">{err.salesCode}</div>}
          <div className="hint">A12345-01 형식</div>
          {gasLabel && <div style={{ marginTop:6 }}>{gasLabel}</div>}
        </div>
      </div>

      <div className="field">
        <label>수주여부 (%)</label>
        <select className="select" value={f.winrate ?? 20} onChange={e => setF(prev => ({ ...prev, winrate: Number(e.target.value) }))}>
          {WINRATE_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
        </select>
      </div>

      <div className="field">
        <label>활동내역 {gasStatus === 'found' && <span style={{ fontWeight:400, color:'var(--success)', fontSize:11 }}>← 시트 자동 반영</span>}</label>
        <textarea className="textarea" style={{ minHeight:80 }} value={f.activity || ''} onChange={set('activity')} />
      </div>

      <Input label="기타비고" as="textarea" value={f.note || ''} onChange={set('note')} />

      {/* ── 담당자 알림 발송 (신규 등록 + GAS 연동 시에만 표시) ── */}
      {isNew && gasOk && (
        <div style={{ marginTop:16, padding:14, background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontWeight:600, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={notifyEnabled} onChange={e => setNotifyEnabled(e.target.checked)}
              style={{ width:16, height:16 }} />
            담당자에게 알림 발송 (담당영업·프리세일즈)
          </label>
          {notifyEnabled && (
            <div style={{ marginTop:10, display:'flex', gap:16, paddingLeft:24 }}>
              {[['email','📧 이메일'],['chat','💬 구글챗'],['both','둘 다']].map(([val, label]) => (
                <label key={val} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13 }}>
                  <input type="radio" name="notifyMethod" value={val}
                    checked={notifyMethod === val} onChange={() => setNotifyMethod(val)} />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function badge(bg, color) {
  return { display:'inline-block', padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:600, background:bg, color };
}
