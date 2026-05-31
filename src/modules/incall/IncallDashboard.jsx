/* =============================================================
   InCall 대시보드 (담당: 인콜)
   KPI 4개 + 차트 3개(순수 SVG/CSS, 외부 의존 없음) + 최근 7건
   수주확률 KPI: 전체 인콜 중 수주여부 90% 이상 건의 비율
   ============================================================= */
import React, { useMemo } from 'react';
import { Badge, pipelineColor, winrateColor } from '../../common/components.jsx';

export default function IncallDashboard({ incalls, onOpen }) {
  const kpi = useMemo(() => {
    const total = incalls.length;
    const inProgress = incalls.filter((i) => (i.winrate || 0) > 0 && (i.winrate || 0) < 100 && i.status !== '영업실패').length;
    const thisMonth = incalls.filter((i) => (i.inflowDate || '').startsWith(new Date().toISOString().slice(0, 7))).length;
    const highConf = incalls.filter((i) => (i.winrate || 0) >= 90);
    const winRate = total ? Math.round(highConf.length / total * 100) : 0;
    return { total, inProgress, thisMonth, winRate, highConfCount: highConf.length };
  }, [incalls]);

  const byInfra  = useMemo(() => groupCount(incalls.flatMap((i) => i.infra || [])), [incalls]);
  const byInflow = useMemo(() => groupCount(incalls.map((i) => i.inflowType)), [incalls]);
  const recent   = useMemo(() => [...incalls].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 7), [incalls]);

  return (
    <div>
      <div className="kpi-row" style={{ marginBottom: 16 }}>
        <Kpi label="총 인콜 수"   value={kpi.total}     color="var(--primary)" />
        <Kpi label="진행 중"       value={kpi.inProgress} color="var(--success)" />
        <Kpi label="이번 달 신규"  value={kpi.thisMonth}  color="var(--warning)" />
        <div className="kpi" style={{ '--accent': 'var(--purple)' }}>
          <div className="label">수주확률</div>
          <div className="value" style={{ color: 'var(--purple)' }}>{kpi.winRate}%</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            90%↑ {kpi.highConfCount}건 / 전체 {kpi.total}건
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="card-title" style={{ fontSize: 14 }}>인프라 유형별</div>
          <Donut data={byInfra} />
        </div>
        <div className="card card-pad">
          <div className="card-title" style={{ fontSize: 14 }}>유입유형별</div>
          <Bars data={byInflow} />
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-title" style={{ fontSize: 14 }}>최근 인콜 7건</div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>{['유입일자','엔드유저','인프라','담당영업','진행상태','수주여부'].map(h => <th key={h} style={{cursor:'default'}}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                  <td>{r.inflowDate}</td>
                  <td>{r.endUser}</td>
                  <td>{(r.infra || []).map((t) => <span key={t} className="tag">{t}</span>)}</td>
                  <td>{r.sales}</td>
                  <td><Badge color={pipelineColor(r.status)}>{r.status}</Badge></td>
                  <td><Badge color={winrateColor(r.winrate || 0)}>{r.winrate || 0}%</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="kpi" style={{ '--accent': color }}>
      <div className="label">{label}</div>
      <div className="value" style={{ color }}>{value}</div>
    </div>
  );
}

function groupCount(arr) {
  const m = {};
  arr.forEach((x) => { if (x) m[x] = (m[x] || 0) + 1; });
  return Object.entries(m).map(([k, v]) => ({ label: k, value: v }));
}

const PALETTE = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899'];

function Donut({ data }) {
  if (!data.length) return <div style={{ color:'var(--muted)', fontSize:13, padding:'12px 0' }}>데이터 없음</div>;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const R = 60, C = 2 * Math.PI * R;
  return (
    <div className="row" style={{ gap: 24 }}>
      <svg width="150" height="150" viewBox="0 0 150 150">
        <g transform="rotate(-90 75 75)">
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = `${frac * C} ${C}`;
            const off  = -acc * C; acc += frac;
            return <circle key={d.label} cx="75" cy="75" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="22" strokeDasharray={dash} strokeDashoffset={off} />;
          })}
        </g>
        <text x="75" y="80" textAnchor="middle" fontSize="20" fontWeight="800">{total}</text>
      </svg>
      <div>
        {data.map((d, i) => (
          <div key={d.label} className="row" style={{ marginBottom: 4 }}>
            <span style={{ width:12, height:12, borderRadius:3, background:PALETTE[i%PALETTE.length], display:'inline-block' }} />
            <span style={{ fontSize:13 }}>{d.label} ({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ data }) {
  if (!data.length) return <div style={{ color:'var(--muted)', fontSize:13, padding:'12px 0' }}>데이터 없음</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      {data.map((d, i) => (
        <div key={d.label} className="row" style={{ marginBottom: 8 }}>
          <span style={{ width:70, fontSize:12, textAlign:'right' }} className="muted">{d.label}</span>
          <div style={{ flex:1, background:'#f1f5f9', borderRadius:4, height:18 }}>
            <div style={{ width:`${(d.value/max)*100}%`, background:PALETTE[i%PALETTE.length], height:'100%', borderRadius:4, transition:'width .4s' }} />
          </div>
          <span style={{ width:24, fontSize:12, fontWeight:700 }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}
