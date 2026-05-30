/* =============================================================
   InCall CRM 등록/수정 모달 (담당: 인콜)
   매출코드 입력 시 GAS(구글 시트 영업 요약 탭) 자동 조회:
     - E열 매출코드 일치 → K열 수주확률 → 수주여부 자동 입력
     - E열 매출코드 일치 → L열 주간보고  → 활동내역 자동 입력
   수주여부: 0/20/50/60/70/80/90/95/100% 고정 선택.
   ============================================================= */
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Modal } from '../../common/components.jsx';
import { SALES_CODE_INCALL } from '../../data/codeMaster.js';
import { lookupByCode, syncIncallToGAS, GAS_URL } from '../../common/gasApi.js';

const WINRATE_OPTIONS = [0, 20, 50, 60, 70, 80, 90, 95, 100];

const EMPTY = {
  inflowDate: new Date().toISOString().slice(0, 10), inflowType: '홈페이지', endUser: '', company: '',
  contactPerson: '', contactPhone: '', infra: [], infraDetail: '', sales: '', presales: '',
  status: '컨택중', winrate: 20, salesCode: '', activity: '', note: '',
};

export default function IncallModal({ record, onClose, onSave }) {
  const { master, toast } = useApp();
  const [f, setF] = useState(record ? { ...record } : { ...EMPTY });
  const [err, setErr] = useState({});
  const [gasStatus, setGasStatus] = useState('idle'); // idle | loading | found | notfound | error
  const debounceRef = useRef(null);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  // 초기 로드 시 기존 레코드의 매출코드로 바로 조회
  useEffect(() => {
    if (record?.salesCode && GAS_URL) {
      triggerLookup(record.salesCode);
    }
  }, []);

  function toggleInfra(t) {
    setF(cur => ({ ...cur, infra: cur.infra.includes(t) ? cur.infra.filter(x => x !== t) : [...cur.infra, t] }));
  }

  // 매출코드 변경 → 0.8초 디바운스 후 GAS 조회
  function onSalesCode(e) {
    const v = e.target.value;
    setF(prev => ({ ...prev, salesCode: v }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim() || !GAS_URL) { setGasStatus('idle'); return; }
    setGasStatus('loading');
    debounceRef.current = setTimeout(() => triggerLookup(v.trim()), 800);
  }

  async function triggerLookup(code) {
    if (!GAS_URL) return;
    try {
      setGasStatus('loading');
      const result = await lookupByCode(code);
      if (result.found) {
        setGasStatus('found');
        setF(prev => {
          const next = { ...prev };
          // 수주확률: GAS 값이 WINRATE_OPTIONS에 있으면 적용, 없으면 가장 가까운 값
          if (result.winrate !== null) {
            const closest = WINRATE_OPTIONS.reduce((a, b) =>
              Math.abs(b - result.winrate) < Math.abs(a - result.winrate) ? b : a
            );
            next.winrate = closest;
          }
          // 활동내역: 기존 내용 + GAS 주간보고 (중복 방지)
          if (result.activity && !prev.activity.includes(result.activity)) {
            next.activity = result.activity + (prev.activity ? '\n\n[기존]\n' + prev.activity : '');
          }
          return next;
        });
        toast('구글 시트에서 수주확률·활동내역을 가져왔습니다.', 'ok');
      } else {
        setGasStatus('notfound');
      }
    } catch (e) {
      setGasStatus('error');
      console.warn('GAS 조회 실패:', e.message);
    }
  }

  function submit() {
    const e = {};
    if (!f.endUser.trim()) e.endUser = '엔드유저는 필수입니다.';
    if (!f.sales) e.sales = '담당영업은 필수입니다.';
    if (f.salesCode && !SALES_CODE_INCALL.test(f.salesCode)) e.salesCode = '형식: A12345-01';
    setErr(e);
    if (Object.keys(e).length) return;

    // GAS에 인콜 데이터 동기화 (비동기, 실패해도 로컬 저장은 진행)
    if (GAS_URL && f.salesCode) {
      syncIncallToGAS({ ...f, id: record?.id || 'NEW' }).catch(err =>
        console.warn('GAS 동기화 실패 (로컬 저장은 정상):', err.message)
      );
    }

    onSave(f);
  }

  // GAS 상태 뱃지
  const gasLabel = {
    idle:     null,
    loading:  <span style={badge('#e0f2fe','#0369a1')}>🔄 구글 시트 조회 중…</span>,
    found:    <span style={badge('#dcfce7','#166534')}>✅ 시트 연동됨 — 수주확률·활동내역 자동 입력</span>,
    notfound: <span style={badge('#fef3c7','#92400e')}>⚠️ 매출코드 없음 (수동 입력)</span>,
    error:    <span style={badge('#fee2e2','#991b1b')}>❌ GAS 연결 실패 (수동 입력)</span>,
  }[gasStatus];

  return (
    <Modal title={record ? '인콜 수정' : '새 인콜 등록'} width={660} onClose={onClose}
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
            <label key={t}><input type="checkbox" checked={f.infra.includes(t)} onChange={() => toggleInfra(t)} /> {t}</label>
          ))}
        </div>
      </div>
      <Input label="인프라세부" as="textarea" value={f.infraDetail} onChange={set('infraDetail')} />

      <div className="form-grid">
        <Input label="담당영업" req as="select" value={f.sales} onChange={set('sales')} error={err.sales}>
          <option value="">선택</option>
          {master.SALES_PERSON.map(x => <option key={x}>{x}</option>)}
        </Input>
        <Input label="프리세일즈" as="select" value={f.presales} onChange={set('presales')}>
          <option value="">선택</option>
          {master.PRESALES.map(x => <option key={x}>{x}</option>)}
        </Input>
        <Input label="진행상태" as="select" value={f.status} onChange={set('status')}>
          {master.PIPELINE_STATUS.map(x => <option key={x}>{x}</option>)}
        </Input>

        {/* 매출코드: 입력 시 GAS 자동 조회 */}
        <div className="field">
          <label>매출코드 {GAS_URL && <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>입력 시 시트 자동 조회</span>}</label>
          <input
            className={`input${err.salesCode ? ' invalid' : ''}`}
            value={f.salesCode}
            onChange={onSalesCode}
            placeholder="A12345-01 형식"
          />
          {err.salesCode && <div className="err-text">{err.salesCode}</div>}
          <div className="hint">A12345-01 형식</div>
          {gasLabel && <div style={{ marginTop: 6 }}>{gasLabel}</div>}
        </div>
      </div>

      {/* 수주여부: 고정 선택 + GAS 자동 반영 */}
      <div className="field">
        <label>수주여부 (%) {gasStatus === 'found' && <span style={{ fontWeight: 400, color: 'var(--success)', fontSize: 11 }}>← 시트 K열 자동 반영</span>}</label>
        <select className="select" value={f.winrate} onChange={e => setF(prev => ({ ...prev, winrate: Number(e.target.value) }))}>
          {WINRATE_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
        </select>
      </div>

      {/* 활동내역: GAS 주간보고 자동 반영 */}
      <div className="field">
        <label>활동내역 {gasStatus === 'found' && <span style={{ fontWeight: 400, color: 'var(--success)', fontSize: 11 }}>← 시트 L열(주간보고) 자동 반영</span>}</label>
        <textarea className="textarea" style={{ minHeight: 80 }} value={f.activity} onChange={set('activity')} />
      </div>

      <Input label="기타비고" as="textarea" value={f.note} onChange={set('note')} />
    </Modal>
  );
}

function badge(bg, color) {
  return { display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: bg, color };
}
