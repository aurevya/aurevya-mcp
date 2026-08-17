import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import { Building2, ChevronDown, ChevronRight, CheckCircle, Clock, Circle, MapPin, Calendar, User } from 'lucide-react'

export default function ClientEntities() {
  const { user } = useAuth()
  const [entities, setEntities] = useState([])
  const [selected, setSelected] = useState(null)
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    const { data } = await supabase.from('entities').select('*').eq('client_id', user.id).order('created_at', { ascending: false })
    setEntities(data || [])
    if (data?.length > 0) selectEntity(data[0])
    setLoading(false)
  }

  async function selectEntity(e) {
    setSelected(e)
    const { data } = await supabase.from('formation_steps').select('*').eq('entity_id', e.id).order('step_number')
    setSteps(data || [])
  }

  const typeIcon = (t) => {
    const icons = { GBC: '🏢', AC: '🏛️', Trust: '⚖️', Foundation: '🏗️', 'Domestic Company': '🏠' }
    return icons[t] || '🏢'
  }

  const statusBadge = (s) => {
    const m = { active:'badge-success', in_progress:'badge-warning', pending:'badge-info', completed:'badge-muted', dissolved:'badge-danger' }
    return m[s] || 'badge-muted'
  }

  const progress = (s) => {
    if (!s?.length) return 0
    return Math.round((s.filter(x => x.status === 'completed').length / s.length) * 100)
  }

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Entities & Structures</div>
          <div className="page-title-sub">All corporate structures managed by Aurevya</div>
        </div>
      </div>

      <div className="page-body">
        {entities.length === 0 ? (
          <div className="card"><div className="empty-state"><Building2 size={40}/><p style={{marginTop:12}}>No entities on file. Contact your advisor to get started.</p></div></div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:20 }}>
            {/* Entity list */}
            <div>
              {entities.map(e => (
                <div key={e.id}
                  className="card"
                  style={{ marginBottom:10, cursor:'pointer', borderColor: selected?.id === e.id ? 'var(--gold)' : 'var(--border)', transition:'all 0.15s' }}
                  onClick={() => selectEntity(e)}
                >
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                    <div style={{ fontSize:24, lineHeight:1 }}>{typeIcon(e.type)}</div>
                    <div style={{ flex:1, overflow:'hidden' }}>
                      <div style={{ fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.name}</div>
                      <div style={{ fontSize:12, color:'#8fa3bc', margin:'2px 0' }}>{e.type} · {e.jurisdiction}</div>
                      <span className={`badge ${statusBadge(e.status)}`}>{e.status?.replace('_',' ')}</span>
                    </div>
                    <ChevronRight size={14} style={{ color:'#5a7390', flexShrink:0, marginTop:3 }}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Detail panel */}
            {selected && (
              <div>
                <div className="card" style={{ marginBottom:20 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                        <span style={{ fontSize:28 }}>{typeIcon(selected.type)}</span>
                        <div>
                          <div style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:600 }}>{selected.name}</div>
                          <div style={{ fontSize:13, color:'#8fa3bc' }}>{selected.type}</div>
                        </div>
                      </div>
                      <span className={`badge ${statusBadge(selected.status)}`}>{selected.status?.replace('_',' ')}</span>
                    </div>
                    {steps.length > 0 && (
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:24, fontWeight:700, color: progress(steps) === 100 ? '#10B981' : '#C9A84C' }}>{progress(steps)}%</div>
                        <div style={{ fontSize:11, color:'#5a7390' }}>Complete</div>
                        <div className="progress-bar" style={{ width:80, marginTop:6 }}>
                          <div className="progress-fill" style={{ width:`${progress(steps)}%` }}></div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                    {[
                      { icon: MapPin, label:'Jurisdiction', value: selected.jurisdiction },
                      { icon: Calendar, label:'Formation Date', value: selected.formation_date ? new Date(selected.formation_date).toLocaleDateString('en-GB') : 'Pending' },
                      { icon: User, label:'Assigned Advisor', value: selected.assigned_advisor || 'Sarah Okonkwo' },
                    ].map(item => (
                      <div key={item.label} style={{ background:'var(--bg-secondary)', padding:'12px 14px', borderRadius:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                          <item.icon size={12} style={{ color:'#C9A84C' }}/>
                          <span style={{ fontSize:11, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.05em' }}>{item.label}</span>
                        </div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Formation timeline */}
                {steps.length > 0 && (
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Formation Timeline</div>
                    </div>
                    <div className="timeline">
                      {steps.map((step, i) => (
                        <div key={step.id} className="timeline-item">
                          <div className={`timeline-dot ${step.status === 'completed' ? 'done' : step.status === 'in_progress' ? 'active' : ''}`}>
                            {step.status === 'completed' ? <CheckCircle size={14}/> : step.status === 'in_progress' ? <Clock size={14}/> : <span style={{ fontSize:11 }}>{i + 1}</span>}
                          </div>
                          <div className="timeline-content">
                            <div className="timeline-title">{step.title}</div>
                            {step.description && <div style={{ fontSize:12, color:'#8fa3bc', marginTop:2 }}>{step.description}</div>}
                            {step.completed_at && <div className="timeline-date">Completed {new Date(step.completed_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div>}
                            {step.status === 'in_progress' && <div className="timeline-date" style={{ color:'#F59E0B' }}>In progress</div>}
                            {step.status === 'pending' && i > 0 && <div className="timeline-date">Pending</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
