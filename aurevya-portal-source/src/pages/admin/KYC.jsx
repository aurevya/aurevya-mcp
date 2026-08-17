import { useState, useEffect } from 'react'
import { supabase } from '../../supabase.js'
import { Shield, CheckCircle, XCircle, AlertTriangle, RefreshCw, Download, FileText } from 'lucide-react'

export default function AdminKYC() {
  const [checks, setChecks] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('kyc_checks')
      .select('*, profiles(full_name, email, company)')
      .order('checked_at', { ascending: false })
    setChecks(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('kyc_checks').update({ status }).eq('id', id)
    setChecks(c => c.map(x => x.id === id ? { ...x, status } : x))
    if (selected?.id === id) setSelected(s => ({ ...s, status }))
  }

  const displayed = tab === 'all' ? checks : checks.filter(c => c.status === tab)

  const statusBadge = (s) => {
    const m = { approved:'badge-success', review:'badge-warning', escalated:'badge-danger', pending:'badge-muted' }
    return m[s] || 'badge-muted'
  }

  const riskColor = (r) => {
    if (r === 'High') return '#EF4444'
    if (r === 'Medium') return '#F59E0B'
    return '#10B981'
  }

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">KYC / Worldcheck Screening</div>
          <div className="page-title-sub">{checks.length} total screenings · {checks.filter(c=>c.status==='review'||c.status==='escalated').length} require action</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm"><Download size={13}/> Export Report</button>
          <button className="btn btn-primary btn-sm"><Shield size={13}/> Run New Screen</button>
        </div>
      </div>

      <div className="page-body">
        {/* Stats bar */}
        <div className="stats-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginBottom:20 }}>
          {[
            { label:'Screened This Month', value: checks.filter(c => new Date(c.checked_at) > new Date(Date.now()-30*86400000)).length, color:'#C9A84C' },
            { label:'Flagged / Under Review', value: checks.filter(c=>c.status==='review').length, color:'#F59E0B' },
            { label:'Escalated to MLRO', value: checks.filter(c=>c.status==='escalated').length, color:'#EF4444' },
            { label:'Avg Screening Time', value: '4m', color:'#10B981' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ '--accent':s.color }}>
              <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap:20 }}>
          {/* Table */}
          <div className="card">
            <div className="tabs">
              {[['all','All'],['review','Under Review'],['escalated','Escalated'],['approved','Approved']].map(([k,l]) => (
                <div key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</div>
              ))}
            </div>

            {displayed.length === 0 ? (
              <div className="empty-state"><Shield size={40}/><p style={{marginTop:12}}>No screenings found</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Screen Date</th>
                      <th>PEP</th>
                      <th>Sanctions</th>
                      <th>Adverse Media</th>
                      <th>Risk Score</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map(c => (
                      <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor:'pointer', background: selected?.id === c.id ? 'var(--bg-hover)' : undefined }}>
                        <td>
                          <div style={{ fontSize:13, fontWeight:500 }}>{c.profiles?.full_name}</div>
                          <div style={{ fontSize:11, color:'#5a7390' }}>{c.profiles?.company}</div>
                        </td>
                        <td style={{ fontSize:12, color:'#8fa3bc' }}>{c.checked_at ? new Date(c.checked_at).toLocaleDateString('en-GB') : '—'}</td>
                        <td><span className={`badge ${c.pep_status==='CLEAR'?'badge-success':c.pep_status==='REVIEW'?'badge-warning':'badge-danger'}`}>{c.pep_status || '—'}</span></td>
                        <td><span className={`badge ${c.sanctions_status==='CLEAR'?'badge-success':c.sanctions_status==='MATCH'?'badge-danger':'badge-warning'}`}>{c.sanctions_status || '—'}</span></td>
                        <td><span className={`badge ${c.adverse_media==='CLEAR'?'badge-success':c.adverse_media==='REVIEW'?'badge-warning':'badge-danger'}`}>{c.adverse_media || '—'}</span></td>
                        <td><span style={{ fontWeight:700, color:riskColor(c.risk_score) }}>{c.risk_score || '—'}</span></td>
                        <td><span className={`badge ${statusBadge(c.status)} badge-dot`}>{c.status}</span></td>
                        <td>
                          <div style={{ display:'flex', gap:4 }}>
                            {c.status === 'review' && <>
                              <button className="btn btn-xs" style={{ background:'rgba(16,185,129,0.15)',color:'#10B981',border:'1px solid rgba(16,185,129,0.3)' }} onClick={e=>{e.stopPropagation();updateStatus(c.id,'approved')}}>Approve</button>
                              <button className="btn btn-danger btn-xs" onClick={e=>{e.stopPropagation();updateStatus(c.id,'escalated')}}>Escalate</button>
                            </>}
                            {c.status === 'escalated' && <button className="btn btn-secondary btn-xs"><RefreshCw size={11}/> Re-screen</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI Risk Memo Panel */}
          {selected && (
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:600 }}>AI Risk Assessment Memo</div>
                <span style={{ fontSize:10, color:'#8fa3bc', background:'rgba(59,130,246,0.1)', padding:'3px 8px', borderRadius:10, border:'1px solid rgba(59,130,246,0.2)' }}>AI Generated</span>
              </div>

              <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:14, marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#C9A84C', marginBottom:8 }}>KYC Risk Assessment — {selected.profiles?.full_name}</div>
                <div style={{ fontSize:12, color:'#8fa3bc', lineHeight:1.7 }}>
                  {selected.ai_memo || `Based on Worldcheck screening conducted on ${selected.checked_at ? new Date(selected.checked_at).toLocaleDateString('en-GB') : 'today'}, the subject returned a ${selected.pep_status === 'REVIEW' ? 'PEP match flag' : 'clear PEP status'}. Sanctions screening returned ${selected.sanctions_status}. Adverse media screening returned ${selected.adverse_media}.\n\nOverall risk classification: ${selected.risk_score || 'Low'}. ${selected.risk_score === 'Medium' ? 'Enhanced due diligence is recommended before onboarding. Additional source of funds documentation should be requested.' : selected.risk_score === 'High' ? 'This client requires immediate MLRO review. Do not proceed with onboarding until cleared.' : 'Client meets standard onboarding criteria. Proceed subject to compliance officer sign-off.'}`}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
                {[
                  { label:'PEP Check', value:selected.pep_status, ok: selected.pep_status==='CLEAR' },
                  { label:'Sanctions', value:selected.sanctions_status, ok: selected.sanctions_status==='CLEAR' },
                  { label:'Adverse Media', value:selected.adverse_media, ok: selected.adverse_media==='CLEAR' },
                  { label:'Risk Score', value:selected.risk_score, ok: selected.risk_score==='Low' },
                ].map(item => (
                  <div key={item.label} style={{ background:'var(--bg-secondary)', padding:'10px 12px', borderRadius:7 }}>
                    <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{item.label}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      {item.ok ? <CheckCircle size={13} style={{ color:'#10B981' }}/> : <XCircle size={13} style={{ color:'#EF4444' }}/>}
                      <span style={{ fontSize:13, fontWeight:600, color:item.ok?'#10B981':'#EF4444' }}>{item.value || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-sm" style={{ flex:1, justifyContent:'center', background:'rgba(16,185,129,0.15)', color:'#10B981', border:'1px solid rgba(16,185,129,0.3)' }}
                  onClick={() => updateStatus(selected.id, 'approved')}>
                  <CheckCircle size={13}/> Approve & File
                </button>
                <button className="btn btn-secondary btn-sm" style={{ flex:1, justifyContent:'center' }}>
                  <FileText size={13}/> Edit Memo
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => updateStatus(selected.id, 'escalated')}>
                  <AlertTriangle size={13}/> Escalate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
