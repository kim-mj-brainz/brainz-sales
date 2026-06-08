/* =============================================================
   레퍼런스 모듈 — 탭 라우터
   권한: reference:view 전체, reference:edit/upload/ocr → ADMIN/MANAGER
   ============================================================= */
import React, { useState } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { AccessDenied } from '../../common/components.jsx';
import { hasPermission } from '../../common/permissions.js';
import { SEED_REFERENCES } from '../../data/seedData.js';
import ReferenceSearchTab from './components/ReferenceSearchTab.jsx';
import ExcelUploadTab     from './components/ExcelUploadTab.jsx';
import OcrUploadTab       from './components/OcrUploadTab.jsx';

export default function ReferenceModule() {
  const { currentUser, logAudit, toast } = useApp();
  const col = useCollection('references', SEED_REFERENCES);
  const [tab, setTab] = useState('search');

  if (!hasPermission(currentUser.role, 'reference:view')) return <AccessDenied />;

  const canEdit   = hasPermission(currentUser.role, 'reference:edit');
  const canUpload = hasPermission(currentUser.role, 'reference:upload');
  const canOcr    = hasPermission(currentUser.role, 'reference:ocr');

  return (
    <div>
      <div className="tabs">
        <div className={`tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>
          레퍼런스 검색
        </div>
        {canUpload && (
          <div className={`tab ${tab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')}>
            기존 데이터 업로드
          </div>
        )}
        {canOcr && (
          <div className={`tab ${tab === 'ocr' ? 'active' : ''}`} onClick={() => setTab('ocr')}>
            라이선스 증서 OCR 등록
          </div>
        )}
      </div>

      {tab === 'search' && (
        <ReferenceSearchTab col={col} canEdit={canEdit} logAudit={logAudit} toast={toast} />
      )}
      {tab === 'upload' && canUpload && (
        <ExcelUploadTab col={col} logAudit={logAudit} toast={toast} />
      )}
      {tab === 'ocr' && canOcr && (
        <OcrUploadTab col={col} logAudit={logAudit} toast={toast} />
      )}
    </div>
  );
}
