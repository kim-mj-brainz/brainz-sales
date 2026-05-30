/* =============================================================
   InCall CRM 등록/수정 모달 (담당: 인콜)
   InCall 정의서 7항 필드 구성. 매출코드 A12345-01 검증.
   수주여부: 20/50/60/70/80/90/95/100% 고정 선택.
   ============================================================= */
import React, { useState } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { Button, Input, Modal } from '../../common/components.jsx';
import { SALES_CODE_INCALL } from '../../data/codeMaster.js';

const WINRATE_OPTIONS = [20, 50, 60, 70, 80, 90, 95, 100];

const EMPTY = {
  inflowDate: new Date().toISOString().slice(0, 10), inflowType: '홈페이지', endUser: '', company: '',
  contactPerson: '', contactPhone: '', infra: [], infraDetail: '', sales: '', presales: '',
  status: '컨택중', winrate: 20, salesCode: '', activity: '', note: '',
};

export default function IncallModal({ record, onClose, onSave }) {
  const { master } = useApp();
  const [f, setF] = useState(record ? { ...record } : { ...EMPTY });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function toggleInfra(t) {
    setF((cur) => ({ ...cur, infra: cur.infra.includes(t) ? cur.infra.filter((x) => x !== t) : [...cur.infra, t] }));
  }

  function submit() {
    const e = {};
    if (!f.endUser.trim()) e.endUser = '엔드유저는 필수입니다.';
    if (!f.sales) e.sales = '담당영업은 필수입니다.';
    if (f.salesCode && !SALES_CODE_INCALL.test(f.salesCode)) e.salesCode = '형식: A12345-01';
    setErr(e);
    if (Object.keys(e).length) return;
    onSave(f);
  }

  function onSalesCode(e) {
    const v = e.target.value;
    setF((cur) => ({ ...cur, salesCode: v }));
    // TODO: 0.8초 디바운스 후 {GAS_URL}?action=getActivity&code=v&token=... 호출
  }

  return (
    <Modal title={record ? '인콜 수정' : '새 인콜 등록'} width={640} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={submit}>저장</Button></>}>
      <div className="form-grid">
        <Input label="유입일자" type="date" value={f.inflowDate} onChange={set('inflowDate')} />
        <Input label="유입유형" as="select" value={f.inflowType} onChange={set('inflowType')}>
          {master.INFLOW_TYPE.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="엔드유저" req value={f.endUser} onChange={set('endUser')} error={err.endUser} />
        <Input label="문의회사" value={f.company} onChange={set('company')} />
        <Input label="문의담당자" value={f.contactPerson} onChange={set('contactPerson')} />
        <Input label="문의연락처" value={f.contactPhone} onChange={set('contactPhone')} />
      </div>

      <div className="field">
        <label>문의인프라</label>
        <div className="checkbox-row">
          {master.INFRA_TYPE.map((t) => (
            <label key={t}><input type="checkbox" checked={f.infra.includes(t)} onChange={() => toggleInfra(t)} /> {t}</label>
          ))}
        </div>
      </div>
      <Input label="인프라세부" as="textarea" value={f.infraDetail} onChange={set('infraDetail')} />

      <div className="form-grid">
        <Input label="담당영업" req as="select" value={f.sales} onChange={set('sales')} error={err.sales}>
          <option value="">선택</option>
          {master.SALES_PERSON.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="프리세일즈" as="select" value={f.presales} onChange={set('presales')}>
          <option value="">선택</option>
          {master.PRESALES.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="진행상태" as="select" value={f.status} onChange={set('status')}>
          {master.PIPELINE_STATUS.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="매출코드" value={f.salesCode} onChange={onSalesCode} error={err.salesCode} hint="A12345-01 형식" />
      </div>

      <div className="field">
        <label>수주여부 (%)</label>
        <select
          className="select"
          value={f.winrate}
          onChange={(e) => setF({ ...f, winrate: Number(e.target.value) })}
        >
          {WINRATE_OPTIONS.map((v) => (
            <option key={v} value={v}>{v}%</option>
          ))}
        </select>
      </div>

      <Input label="활동내역 (GAS 연동 자동입력)" as="textarea" value={f.activity} onChange={set('activity')} />
      <Input label="기타비고" as="textarea" value={f.note} onChange={set('note')} />
    </Modal>
  );
}
