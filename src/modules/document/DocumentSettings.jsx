import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { Button, Input } from '../../common/components.jsx';
import { DEFAULT_INSPECTION_MAIL_SETTINGS, sendGoogleChatTestWebhook, sendSmtpTestMail } from './inspectionMail.js';

export default function DocumentSettingsPage() {
  const { currentUser, toast } = useApp();
  const collection = useCollection('documentMailSettings', [DEFAULT_INSPECTION_MAIL_SETTINGS]);
  const savedSettings = collection.items[0] || null;
  const settings = useMemo(() => ({
    ...DEFAULT_INSPECTION_MAIL_SETTINGS,
    ...(savedSettings || {}),
    apiUrl: DEFAULT_INSPECTION_MAIL_SETTINGS.apiUrl,
  }), [savedSettings]);

  function saveSettings(nextSettings, message = '문서 설정을 저장했습니다.') {
    collection.replaceAll([{ ...DEFAULT_INSPECTION_MAIL_SETTINGS, ...nextSettings, apiUrl: DEFAULT_INSPECTION_MAIL_SETTINGS.apiUrl, id: 'default' }]);
    toast(message);
  }

  return <DocumentSettingsForm settings={settings} onSave={saveSettings} currentUser={currentUser} toast={toast} />;
}

function DocumentSettingsForm({ settings, onSave, currentUser, toast }) {
  const [form, setForm] = useState(settings);
  const [testing, setTesting] = useState('');
  const dirtyRef = useRef(false);
  const set = (key) => (e) => {
    dirtyRef.current = true;
    setForm((current) => ({ ...current, [key]: e.target.value }));
  };
  const setChecked = (key) => (e) => {
    dirtyRef.current = true;
    setForm((current) => ({ ...current, [key]: e.target.checked }));
  };

  useEffect(() => {
    if (dirtyRef.current) return;
    setForm(settings);
  }, [settings]);

  function save(message = '문서 설정을 저장했습니다.') {
    dirtyRef.current = false;
    onSave(form, message);
  }

  async function testSmtp() {
    setTesting('smtp');
    try {
      await sendSmtpTestMail({ settings: form, requester: currentUser });
      toast('SMTP 테스트 메일을 전송했습니다.');
    } catch (error) {
      toast(error.message || 'SMTP 테스트 메일 전송에 실패했습니다.', 'err');
    } finally {
      setTesting('');
    }
  }

  async function testChat() {
    setTesting('chat');
    try {
      await sendGoogleChatTestWebhook({ settings: form, requester: currentUser });
      toast('Google Chat 테스트 메시지를 전송했습니다.');
    } catch (error) {
      toast(error.message || 'Google Chat 테스트 전송에 실패했습니다.', 'err');
    } finally {
      setTesting('');
    }
  }

  return (
    <div className="card card-pad">
      <div className="toolbar">
        <div className="card-title mb0" style={{ fontSize: 14 }}>문서 설정</div>
        <div className="spacer" />
        <Button onClick={() => save()}>전체 저장</Button>
      </div>
      <div className="grid" style={{ gap: 16 }}>
        <div>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 10 }}>검수확인서 메일</div>
          <div className="checkbox-row" style={{ marginBottom: 14 }}>
            <label><input type="checkbox" checked={form.enabled} onChange={setChecked('enabled')} /> 생성 후 담당엔지니어 메일</label>
            <label><input type="checkbox" checked={form.ccSales} onChange={setChecked('ccSales')} /> 담당영업 참조</label>
          </div>
          <div className="form-grid doc-form-grid">
            <Input label="발신자명" value={form.senderName} onChange={set('senderName')} placeholder={currentUser.name} />
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label><input type="checkbox" checked={form.smtpEnabled} onChange={setChecked('smtpEnabled')} /> SMTP 설정 사용</label>
              <div className="hint">담당엔지니어는 받는사람, 담당영업은 참조로 메일 API에 전달됩니다.</div>
            </div>
            {form.smtpEnabled && (
              <>
                <Input label="SMTP Host" value={form.smtpHost} onChange={set('smtpHost')} placeholder="smtp.example.com" />
                <Input label="SMTP Port" type="number" value={form.smtpPort} onChange={set('smtpPort')} placeholder="587" />
                <Input label="SMTP 계정" value={form.smtpUser} onChange={set('smtpUser')} placeholder="user@example.com" />
                <Input label="SMTP 비밀번호" type="password" value={form.smtpPassword} onChange={set('smtpPassword')} />
                <Input label="발신 이메일" value={form.smtpFromEmail} onChange={set('smtpFromEmail')} placeholder="sales@example.com" />
                <div className="field">
                  <label><input type="checkbox" checked={form.smtpSecure} onChange={setChecked('smtpSecure')} /> SSL/TLS 보안 연결</label>
                  <div className="hint">465 포트는 보통 켜고, 587 포트는 보통 끕니다.</div>
                </div>
              </>
            )}
            <Input label="테스트 수신 이메일" type="email" value={form.smtpTestEmail} onChange={set('smtpTestEmail')} placeholder={currentUser.email} />
            <div className="field">
              <label>&nbsp;</label>
              <div className="row">
                <Button onClick={() => save('SMTP 설정을 DB에 저장했습니다.')}>SMTP 설정 저장</Button>
                <Button variant="secondary" onClick={testSmtp} disabled={testing === 'smtp'}>{testing === 'smtp' ? '테스트 중' : '메일 테스트'}</Button>
              </div>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>메일 제목</label>
              <input className="input" value={form.subject} onChange={set('subject')} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>메일 본문</label>
              <textarea className="textarea" rows={7} value={form.body} onChange={set('body')} />
              <div className="hint">
                사용 가능 변수: {'{customer}'}, {'{project}'}, {'{salesCode}'}, {'{issueDate}'}, {'{documentNo}'}, {'{engineer}'}, {'{engineerEmail}'}, {'{sales}'}, {'{salesEmail}'}, {'{itemCount}'}, {'{filename}'}
              </div>
            </div>
          </div>
        </div>

        <hr className="section-divider" />

        <div>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 10 }}>거래처 관리 웹훅</div>
          <Input
            label="신용도 조회 Google Chat 웹훅 URL"
            value={form.creditGoogleChatWebhookUrl}
            onChange={set('creditGoogleChatWebhookUrl')}
            placeholder="https://chat.googleapis.com/v1/spaces/..."
          />
          <div className="field" style={{ marginTop: 10 }}>
            <label>신용도 조회 요청 문구</label>
            <textarea className="textarea" rows={6} value={form.creditGoogleChatRequestTemplate} onChange={set('creditGoogleChatRequestTemplate')} />
            <div className="hint">
              사용 가능 변수: {'{requestedAt}'}, {'{requester}'}, {'{requesterEmail}'}, {'{company}'}, {'{query}'}, {'{inputUrl}'}
            </div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>테스트 메시지</label>
            <textarea className="textarea" rows={3} value={form.creditGoogleChatTestMessage} onChange={set('creditGoogleChatTestMessage')} />
          </div>
          <div className="row">
            <Button onClick={() => save('웹훅 URL을 DB에 저장했습니다.')}>웹훅 저장</Button>
            <Button variant="secondary" onClick={testChat} disabled={testing === 'chat'}>{testing === 'chat' ? '테스트 중' : 'Chat 테스트'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
