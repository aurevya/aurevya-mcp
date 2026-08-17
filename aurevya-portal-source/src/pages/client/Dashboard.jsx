import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import { Building2, FileText, Receipt, AlertCircle, TrendingUp, Calendar, ChevronRight, Clock } from 'lucide-react'

export default function ClientDashboard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ entities: 0, docs: 0, outstanding: 0, deadlines: 0 })
  const [entities, setEntities] = useState([])
  const [activity, setActivity] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadData()
  }, [user])

  async function loadData() {
    const [entRes, docRes, invRes, dlRes, actRes] = await Promise.all([
      supabase.from('entities').select('*').eq('client_id', user.id).order('created_at', { ascending: false }),
      supabase.from('documents').select('id').eq('client_id', user.id),
      supabase.from('invoices').select('amount').eq('client_id', user.id).eq('status', 'outstanding'),
      supabase.from('compliance_deadlines').select('*,entities(name)').eq('client_id', user.id).eq('status', 'pending').order('due_date').limit(5),
      supabase.from('activity_log').select('*').eq('client_id', user.id).order('created_at', { ascending: false }).limit(8),
    ])

    const totalOutstanding = (invRes.data || []).reduce((s, i) => s + (i.amount || 0), 0)

    setStats({
      entities: entRes.data?.length || 0,
      docs: docRes.data?.length || 0,
      outstanding: totalOutstanding,
      deadlines: dlRes.data?.length || 0
    })
    setEntities(entRes.data?.slice(0, 4) || [])
    setDeadlines(dlRes.data || [])
    setActivity(actRes.data || [])
    setLoading(false)
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const statusColor = (s) => {
    if (s === 'active') return 'badge-success'
    if (s === 'in_progress' || s === 'pending') return 'badge-warning'
    if (s === 'completed') return 'badge-muted'
    return 'badge-info'
  }

  const daysUntil = (d) => {
    const diff = new Date(d) - new Date()
    return Math.ceil(diff / 86400000)
  }

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">{greeting()}, {profile?.full_name?.split(' ')[0] || 'Client'}</div>
          <div className="page-title-sub">{new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          {stats.deadlines > 0 && (
            <span className="badge badge-warning badge-dot">{stats.deadlines} upcoming deadline{stats.deadlines !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card" onClick={() => navigate('/portal/entities')} style={{ cursor:'pointer' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <Building2 size={18} style={{ color:'#C9A84C' }}/>
              <ChevronRight size={14} style={{ color:'#5a7390' }}/>
            </div>
            <div className="stat-value">{stats.entities}</div>
            <div className="stat-label">Active Structures</div>
          </div>
          <div className="stat-card" onClick={() => navigate('/portal/documents')} style={{ cursor:'pointer' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <FileText size={18} style={{ color:'#C9A84C' }}/>
              <ChevronRight size={14} style={{ color:'#5a7390' }}/>
            </div>
            <div className="stat-value">{stats.docs}</div>
            <div className="stat-label">Documents on File</div>
          </div>
          <div className="stat-card" onClick={() => navigate('/portal/invoices')} style={{ cursor:'pointer' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <Receipt size={18} style={{ color:'#C9A84C' }}/>
              <ChevronRight size={14} style={{ color:'#5a7390' }}/>
            </div>
            <div className="stat-value">${stats.outstanding.toLocaleString()}</div>
            <div className="stat-label">Outstanding Invoices</div>
            {stats.outstanding > 0 && <div className="stat-delta negative">Action required</div>}
          </div>
          <div className="stat-card">
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <Calendar size={18} style={{ color:'#C9A84C' }}/>
            </div>
            <div className="stat-value">{stats.deadlines}</div>
            <div className="stat-label">Upcoming Deadlines</div>
            {stats.deadlines > 0 && <div className="stat-delta">Next 60 days</div>}
          </div>
        </div>

        <div className="grid-2">
          {/* My Structures */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">My Structures</div>
                <div className="card-subtitle">All entities under management</div>
              </div>
              <button className="btn btn-secondary btn-xs" onClick={() => navigate('/portal/entities')}>View all</button>
            </div>
            {entities.length === 0 ? (
              <div className="empty-state">
                <Building2 size={32}/>
                <p>No structures on file yet</p>
              </div>
            ) : (
              <div>
                {entities.map(e => (
                  <div key={e.id} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)' }} className="cursor-pointer">
                    <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                      <div style={{ width:36,height:36,borderRadius:8,background:'rgba(201,168,76,0.1)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <Building2 size={16} style={{ color:'#C9A84C' }}/>
                      </div>
                      <div>
                        <div style={{ fontSize:13,fontWeight:500 }}>{e.name}</div>
                        <div style={{ fontSize:11,color:'#5a7390' }}>{e.type} · {e.jurisdiction}</div>
                      </div>
                    </div>
                    <span className={`badge ${statusColor(e.status)}`}>{e.status?.replace('_',' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Upcoming Deadlines</div>
                <div className="card-subtitle">Compliance & statutory calendar</div>
              </div>
            </div>
            {deadlines.length === 0 ? (
              <div className="empty-state">
                <Calendar size={32}/>
                <p>No upcoming deadlines</p>
              </div>
            ) : (
              <div>
                {deadlines.map(d => {
                  const days = daysUntil(d.due_date)
                  return (
                    <div key={d.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:40,height:40,borderRadius:8,background: days <= 7 ? 'rgba(239,68,68,0.1)' : days <= 30 ? 'rgba(245,158,11,0.1)' : 'rgba(201,168,76,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                        <Calendar size={16} style={{ color: days <= 7 ? '#EF4444' : days <= 30 ? '#F59E0B' : '#C9A84C' }}/>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13,fontWeight:500 }}>{d.deadline_type?.replace(/_/g,' ')}</div>
                        <div style={{ fontSize:11,color:'#5a7390' }}>{d.entities?.name}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:11,fontWeight:600,color: days <= 7 ? '#EF4444' : days <= 30 ? '#F59E0B' : '#C9A84C' }}>
                          {days <= 0 ? 'Overdue' : `${days}d`}
                        </div>
                        <div style={{ fontSize:10,color:'#5a7390' }}>{new Date(d.due_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card" style={{ marginTop:20 }}>
          <div className="card-header">
            <div className="card-title">Recent Activity</div>
          </div>
          {activity.length === 0 ? (
            <div className="empty-state"><p>No recent activity</p></div>
          ) : (
            <div>
              {activity.map(a => (
                <div key={a.id} className="activity-item">
                  <div className="activity-dot"></div>
                  <div className="activity-content">
                    <div className="activity-text">{a.description}</div>
                    <div className="activity-time">
                      <Clock size={11} style={{ display:'inline',marginRight:3 }}/>
                      {new Date(a.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
