/* =============================================================
   대시보드 (담당: 공통영역)
   로그인 후 첫 화면 — 문서·인콜·레퍼런스·메일 현황 한눈에
   ============================================================= */
import React, { useMemo } from 'react';
import { useApp } from '../../common/AppContext.jsx';
import { useCollection } from '../../common/useCollection.js';
import { SEED_INCALLS, SEED_REFERENCES } from '../../data/seedData.js';

const SEED_EMAILS = [
  { id: 'M-001', sentAt: '2026-06-05T09:23:00', to: '김철수 <cs@abcmulsan.com>', subject: '[제안서] ABC물산 EMS 도입 제안', byName: '이민수', status: 'OPENED' },
  { id: 'M-002', sentAt: '2026-06-05T08:10:00', to: '이영희 <yh@defsoft.co.kr>', subject: '[견적서] DEF소프트웨어 SIEM 솔루션', byName: '박지현', status: 'SENT' },
  { id: 'M-003', sentAt: '2026-06-04T16:05:00', to: '박민준 <mj@ghisys.kr>', subject: '[계약서] GHI시스템즈 ITSM 구축', byName: '김영우', status: 'SENT' },
  { id: 'M-004', sentAt: '2026-06-04T11:44:00', to: '최수진 <sj@jklcorp.com>', subject: '[제안서] JKL기업 보안 통합 솔루션', byName: '이민수', status: 'BOUNCED' },
  { id: 'M-005', sentAt: '2026-06-03T10:30:00', to: '홍길동 <gd@mnonet.kr>', subject: '[견적서] MNO네트웍스 EMS 구축', byName: '김영우', status: 'SENT' },
  { id: 'M-006', sentAt: '2026-06-02T14:20:00', to: '정다은 <de@pqr.co.kr>', subject: '[제안서] PQR 솔루션 도입 검토', byName: '박지현', status: 'SENT' },
];

const SEED_INCALLS_TODAY = [
  { id: 'IC-T001', inflowDate: '2026-06-05', company: '스마트IT(주)', contactPerson: '오준혁', infra: ['EMS', 'SIEM'], sales: '이민수', status: 'OPEN', ownerId: null, createdAt: '2026-06-05T09:00:00' },
  { id: 'IC-T002', inflowDate: '2026-06-05', company: '(주)한국데이터', contactPerson: '윤서연', infra: ['ITSM'], sales: '박지현', status: 'OPEN', ownerId: null, createdAt: '2026-06-05T10:30:00' },
  { id: 'IC-T003', inflowDate: '2026-06-05', company: '네오시스템', contactPerson: '강민호', infra: ['EMS'], sales: '김영우', status: 'HOLD', ownerId: null, createdAt: '2026-06-05T11:15:00' },
];

const STATUS_DOC = {
  SUCCESS: { label: '완료', cls: 'b-green' },
  FAIL:    { label: '실패', cls: 'b-red' },
  DRAFT:   { label: '임시', cls: 'b-gray' },
};
const STATUS_INCALL = {
  OPEN:   { label: '진행중', cls: 'b-blue' },
  WIN:    { label: '수주',   cls: 'b-green' },
  LOSE:   { label: '실패',   cls: 'b-red' },
  HOLD:   { label: '보류',   cls: 'b-yellow' },
  CLOSED: { label: '종료',   cls: 'b-gray' },
};
const STATUS_EMAIL = {
  SENT:    { label: '발송됨', cls: 'b-blue' },
  OPENED:  { label: '열람됨', cls: 'b-green' },
  BOUNCED: { label: '반송',   cls: 'b-red' },
};

function fmtRelative(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(diff / 86400000);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: '20px',
      boxShadow: 'var(--shadow-xs)', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, background: color, borderRadius: '3px 0 0 3px',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
          {label}
        </div>
        <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, marginTop: 10, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 7 }}>{sub}</div>}
    </div>
  );
}

function DashCard({ title, icon, onMore, children }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xs)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{title}</span>
        </div>
        {onMore && (
          <button onClick={onMore} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--primary)', fontWeight: 600,
            padding: 0, fontFamily: 'var(--font)', opacity: 0.85,
          }}>전체보기 →</button>
        )}
      </div>
      <div style={{ flex: 1, padding: '8px 10px 10px' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ left, right, badge, badgeCls, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 8px', borderRadius: 7, transition: 'background .1s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{left}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {right && <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{right}</span>}
        {badge && <span className={`badge-pill ${badgeCls}`}>{badge}</span>}
      </div>
    </div>
  );
}

function EmptyMsg({ text }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '28px 0' }}>
      {text}
    </div>
  );
}

export default function Dashboard({ docCollection, onNavigate }) {
  const { currentUser } = useApp();

  const incallCol = useCollection('incalls', [...SEED_INCALLS, ...SEED_INCALLS_TODAY]);
  const refCol    = useCollection('references', SEED_REFERENCES);
  const emailCol  = useCollection('emails', SEED_EMAILS);

  const canViewAll = currentUser.role !== 'USER';
  const today      = new Date().toISOString().slice(0, 10);
  const weekAgo    = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7);

  const weekDocs = useMemo(() =>
    docCollection.items.filter(d =>
      (canViewAll || d.ownerId === currentUser.id) && d.createdAt >= weekAgo
    ).length,
  [docCollection.items, canViewAll, currentUser.id, weekAgo]);

  const todayIncallCount = useMemo(() =>
    incallCol.items.filter(i =>
      (canViewAll || i.ownerId === currentUser.id) && i.inflowDate === today
    ).length,
  [incallCol.items, canViewAll, currentUser.id, today]);

  const monthEmailCount = useMemo(() =>
    emailCol.items.filter(e => e.sentAt.startsWith(monthStart)).length,
  [emailCol.items, monthStart]);

  const recentDocs = useMemo(() =>
    docCollection.items
      .filter(d => canViewAll || d.ownerId === currentUser.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6),
  [docCollection.items, canViewAll, currentUser.id]);

  const recentIncalls = useMemo(() =>
    incallCol.items
      .filter(i => canViewAll || i.ownerId === currentUser.id)
      .sort((a, b) => (b.inflowDate || '').localeCompare(a.inflowDate || ''))
      .slice(0, 6),
  [incallCol.items, canViewAll, currentUser.id]);

  const recentRefs = useMemo(() =>
    [...refCol.items]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 6),
  [refCol.items]);

  const recentEmails = useMemo(() =>
    [...emailCol.items]
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, 6),
  [emailCol.items]);

  const dayLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* 웰컴 배너 */}
      <div style={{
        background: 'linear-gradient(135deg, #1557F5 0%, #0f3fbf 60%, #0d35a0 100%)',
        borderRadius: 'var(--radius-lg)', padding: '24px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 4px 24px rgba(21,87,245,0.3)',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
            안녕하세요, {currentUser.name}님 👋
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 5 }}>
            {dayLabel} — 오늘도 좋은 하루 되세요.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: '이번주 문서', val: weekDocs },
            { label: '오늘 인콜',   val: todayIncallCount },
            { label: '이달 메일',   val: monthEmailCount },
          ].map(({ label, val }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.14)', borderRadius: 12,
              padding: '10px 18px', textAlign: 'center', minWidth: 72,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="dash-kpi-grid">
        <KpiCard icon="📄" label="이번 주 문서 생성"   value={weekDocs}          sub="최근 7일 기준"        color="#1557F5" />
        <KpiCard icon="📞" label="오늘 인콜"            value={todayIncallCount}  sub={today}               color="#0ea5e9" />
        <KpiCard icon="🔎" label="레퍼런스 총계"        value={refCol.items.length} sub="전체 등록 건수"    color="#8b5cf6" />
        <KpiCard icon="✉️" label="이달 발송 메일"       value={monthEmailCount}   sub={`${monthStart} 기준`} color="#10b981" />
      </div>

      {/* 메인 카드 그리드 */}
      <div className="dash-main-grid">

        {/* 최근 문서 생성 */}
        <DashCard title="최근 문서 생성" icon="📄" onMore={() => onNavigate('doc-history')}>
          {recentDocs.length === 0
            ? <EmptyMsg text="생성된 문서가 없습니다" />
            : recentDocs.map(d => (
              <Row key={d.id}
                left={`${d.customer} — ${d.project}`}
                sub={`${d.salesCode} · ${fmtRelative(d.createdAt)}`}
                badge={(STATUS_DOC[d.status] || STATUS_DOC.DRAFT).label}
                badgeCls={(STATUS_DOC[d.status] || STATUS_DOC.DRAFT).cls}
              />
            ))
          }
        </DashCard>

        {/* 최근 인콜 */}
        <DashCard title="최근 인콜" icon="📞" onMore={() => onNavigate('incall')}>
          {recentIncalls.length === 0
            ? <EmptyMsg text="인콜 데이터가 없습니다" />
            : recentIncalls.map(i => (
              <Row key={i.id}
                left={`${i.company} · ${i.contactPerson}`}
                sub={`${Array.isArray(i.infra) ? i.infra.join(', ') : (i.infra || '-')} · ${i.inflowDate}`}
                badge={(STATUS_INCALL[i.status] || STATUS_INCALL.OPEN).label}
                badgeCls={(STATUS_INCALL[i.status] || STATUS_INCALL.OPEN).cls}
              />
            ))
          }
        </DashCard>

        {/* 최근 레퍼런스 */}
        <DashCard title="최근 레퍼런스" icon="🔎" onMore={() => onNavigate('reference')}>
          {recentRefs.length === 0
            ? <EmptyMsg text="등록된 레퍼런스가 없습니다" />
            : recentRefs.map(r => (
              <Row key={r.id}
                left={`${r.customer} — ${r.project}`}
                sub={`${r.year}년 · ${r.region} · ${Array.isArray(r.modules) ? r.modules.slice(0, 2).join(', ') : '-'}`}
                right={r.sales}
              />
            ))
          }
        </DashCard>

        {/* 메일 발송 이력 */}
        <DashCard title="메일 발송 이력" icon="✉️">
          {recentEmails.length === 0
            ? <EmptyMsg text="발송 이력이 없습니다" />
            : recentEmails.map(m => (
              <Row key={m.id}
                left={m.subject}
                sub={`${m.to.split(' <')[0]} · ${m.byName} · ${fmtRelative(m.sentAt)}`}
                badge={(STATUS_EMAIL[m.status] || STATUS_EMAIL.SENT).label}
                badgeCls={(STATUS_EMAIL[m.status] || STATUS_EMAIL.SENT).cls}
              />
            ))
          }
        </DashCard>
      </div>
    </div>
  );
}
