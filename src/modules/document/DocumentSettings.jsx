import React from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Input } from '../../common/components.jsx';
import { DEFAULT_INSPECTION_MAIL_SETTINGS } from './inspectionMail.js';

export default function DocumentSettingsPage() {
  const { currentUser } = useApp();
  const collection = useCollection('documentMailSettings', [DEFAULT_INSPECTION_MAIL_SETTINGS]);
  const settings = { ...DEFAULT_INSPECTION_MAIL_SETTINGS, ...(collection.items[0] || {}) };

  function saveSettings(patch) {
    collection.replaceAll([{ ...settings, ...patch, id: 'default' }]);
  }

  return <DocumentSettingsForm settings={settings} onChange={saveSettings} currentUser={currentUser} />;
}

function DocumentSettingsForm({ settings, onChange, currentUser }) {
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const setChecked = (key) => (e) => onChange({ [key]: e.target.checked });

  return (
    <div className="card card-pad">
      <div className="card-title" style={{ fontSize: 14 }}>문서 설정</div>
      <div className="grid" style={{ gap: 16 }}>
        <div>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 10 }}>검수확인서 메일</div>
          <div className="checkbox-row" style={{ marginBottom: 14 }}>
            <label><input type="checkbox" checked={settings.enabled} onChange={setChecked('enabled')} /> 생성 후 담당엔지니어 메일</label>
            <label><input type="checkbox" checked={settings.ccSales} onChange={setChecked('ccSales')} /> 담당영업 참조</label>
          </div>
          <div className="form-grid doc-form-grid">
            <Input label="메일 API URL" value={settings.apiUrl} onChange={set('apiUrl')} placeholder="/api/document-mails/inspection" />
            <Input label="발신자명" value={settings.senderName} onChange={set('senderName')} placeholder={currentUser.name} />
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>메일 제목</label>
              <input className="input" value={settings.subject} onChange={set('subject')} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>메일 본문</label>
              <textarea className="textarea" rows={7} value={settings.body} onChange={set('body')} />
            </div>
          </div>
        </div>

        <hr className="section-divider" />

        <div>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 10 }}>거래처 관리 웹훅</div>
          <Input
            label="신용도 조회 Google Chat 웹훅 URL"
            value={settings.creditGoogleChatWebhookUrl}
            onChange={set('creditGoogleChatWebhookUrl')}
            placeholder="https://chat.googleapis.com/v1/spaces/..."
          />
        </div>
      </div>
    </div>
  );
}
