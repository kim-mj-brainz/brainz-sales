/* 레퍼런스 상세 / 수정 / 삭제 모달 */
import React, { useState } from 'react';
import { Button, Input, Modal } from '../../../common/components.jsx';
import { INDUSTRY_OPTIONS, ORG_TYPE_OPTIONS } from '../constants/referenceOptions.js';
import { EMS_SUB_MODULES } from '../constants/moduleOptions.js';
import ModuleMultiSelect from './ModuleMultiSelect.jsx';

export default function ReferenceDetailModal({ record, canEdit, onClose, onSave, onDelete }) {
  const [f, setF]         = useState({ ...record });
  const [products, setProducts] = useState(
    record.products?.length ? record.products : [{ name: '', qty: '', unit: '', version: '' }]
  );
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  function setProduct(i, k, v) {
    setProducts((ps) => ps.map((p, j) => j === i ? { ...p, [k]: v } : p));
  }
  function addProduct() {
    setProducts((ps) => [...ps, { name: '', qty: '', unit: '', version: '' }]);
  }
  function removeProduct(i) {
    setProducts((ps) => ps.filter((_, j) => j !== i));
  }

  function validate() {
    const errs = {};
    if (f.modules?.includes('EMS') && !EMS_SUB_MODULES.some((m) => f.modules.includes(m))) {
      errs.modules = 'EMS를 선택한 경우 하위 모듈을 1개 이상 선택해야 합니다.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    onSave({ ...f, products });
  }

  return (
    <Modal
      title="레퍼런스 상세"
      width={720}
      onClose={onClose}
      footer={
        <>
          {canEdit && <Button variant="danger" onClick={onDelete}>삭제</Button>}
          <div className="spacer" />
          <Button variant="secondary" onClick={onClose}>닫기</Button>
          {canEdit && <Button onClick={handleSave}>저장</Button>}
        </>
      }
    >
      <div className="form-grid">
        <Input label="고객명"         value={f.customer  ?? ''} onChange={set('customer')}  disabled={!canEdit} />
        <Input label="사업명"         value={f.project   ?? ''} onChange={set('project')}   disabled={!canEdit} />
        <Input label="사업번호"       value={f.bizNo     ?? ''} onChange={set('bizNo')}     disabled={!canEdit} />
        <Input label="연도"           value={f.year      ?? ''} onChange={set('year')}      disabled={!canEdit} />
        <Input label="주소"     className="full"
                                      value={f.address   ?? ''} onChange={set('address')}   disabled={!canEdit} />
        <Input label="지역"           value={f.region    ?? ''} onChange={set('region')}    disabled={!canEdit} />
        <Input label="산업군" as="select" value={f.industry ?? ''} onChange={set('industry')} disabled={!canEdit}>
          <option value="">선택</option>
          {INDUSTRY_OPTIONS.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="기관/기업유형" as="select" value={f.orgType ?? ''} onChange={set('orgType')} disabled={!canEdit}>
          <option value="">선택</option>
          {ORG_TYPE_OPTIONS.map((x) => <option key={x}>{x}</option>)}
        </Input>
        <Input label="담당 영업"      value={f.sales     ?? ''} onChange={set('sales')}     disabled={!canEdit} />
        <Input label="담당 엔지니어"  value={f.engineer  ?? ''} onChange={set('engineer')}  disabled={!canEdit} />
        <Input label="매출액"         value={f.revenue   ?? ''} onChange={set('revenue')}   disabled={!canEdit} />
        <Input label="발주처"         value={f.orderer   ?? ''} onChange={set('orderer')}   disabled={!canEdit} />
      </div>

      <div className="field">
        <label>도입 모듈</label>
        {canEdit ? (
          <ModuleMultiSelect
            selected={f.modules || []}
            onChange={(v) => {
              setF((prev) => ({ ...prev, modules: v }));
              if (errors.modules) setErrors((er) => { const n = { ...er }; delete n.modules; return n; });
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(f.modules || []).map((m) => <span key={m} className="tag">{m}</span>)}
          </div>
        )}
        {errors.modules && <div className="err-text">{errors.modules}</div>}
      </div>

      <div className="field" style={{ marginTop: 8 }}>
        <label>제품 상세</label>
        {products.map((p, i) => (
          <div key={i} className="row" style={{ marginBottom: 6, flexWrap: 'nowrap', gap: 6 }}>
            <input className="input" placeholder="제품명"  value={p.name    ?? ''} disabled={!canEdit} onChange={(e) => setProduct(i, 'name',    e.target.value)} style={{ flex: 3 }} />
            <input className="input" placeholder="수량"    value={p.qty     ?? ''} disabled={!canEdit} onChange={(e) => setProduct(i, 'qty',     e.target.value)} style={{ flex: 1 }} type="number" />
            <input className="input" placeholder="단위"    value={p.unit    ?? ''} disabled={!canEdit} onChange={(e) => setProduct(i, 'unit',    e.target.value)} style={{ flex: 1 }} />
            <input className="input" placeholder="버전"    value={p.version ?? ''} disabled={!canEdit} onChange={(e) => setProduct(i, 'version', e.target.value)} style={{ flex: 1 }} />
            {canEdit && (
              <Button size="sm" variant="danger" onClick={() => removeProduct(i)} disabled={products.length <= 1}>－</Button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={addProduct} style={{ marginTop: 4 }}>
            + 제품 추가
          </Button>
        )}
      </div>
    </Modal>
  );
}
