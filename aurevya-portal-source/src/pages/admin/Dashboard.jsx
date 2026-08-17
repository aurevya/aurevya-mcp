import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase.js'
import { Users, Building2, DollarSign, AlertTriangle, Plus, ArrowRight, Activity } from 'lucide-react'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ clients: 0, entities: 0, revenue: 0, kyc_pending: 0 })
  const [alerts, setAlerts] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const [clientRes, entityRes, invRes, kycRes, dlRes, actRes] = await Promise.all([
      supabase.from('profiles').select('id', { count:'exact' }).eq('role', 'client'),
      supabase.from('entities').select('id', { count:'exact' }),
      supabase.from('invoices').select('amount').eq('status', 'outstanding'),
      supabase.from('kyc_checks').select('id,profiles(full_name),risk_score,status,checked_at').in('status', ['review','escalated']).limit(5),
      supabase.from('compliance_deadlines').select('*,entities(name,profiles(full_name))').eq('status','pending').order('due_date').limit(5),
      supabase.from('activity_log').select('*,profiles(full_name)').order('created_at', { ascending:false }).limit(10)
    ])

    const totalRevenue = (invRes.data || []).reduce((s,i) => s + (i.amount || 0), 0)

    setStats({
      clients: clientRes.count || 0,
      entities: entityRes.count || 0,
      revenue: totalRevenue,
      kyc_pending: kycRes.data?.length || 0
    })
    setAlerts(kycRes.data || [])
    setDeadlines(dlRes.data || [])
    setActivity(actRes.data || [])
    setLoading(false)
  }

  const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / 86400000)

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Staff Dashboard</div>
          <div className="page-title-sub">Real-time operational overview · {new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/clients')}>
            <Plus size={13}/> New Client
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/kyc')}>
            <AlertTriangle size={13}/> KYC Queue {stats.kyc_pending > 0 && `(${stats.kyc_pending})`}
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card" onClick={() => navigate('/admin/clients')} style={{ cursor:'pointer' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <Users size={18} style={{ color:'#C9A84C' }}/>
              <span style={{ fontSize:11,color:'#10B981' }}>▲ 3 this month</span>
            </div>
            <div className="stat-value">{stats.clients}</div>
            <div className="stat-label">Active Clients</div>
          </div>
          <div className="stat-card" onClick={() => navigate('/admin/clients')} style={{ cursor:'pointer' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <Building2 size={18} style={{ color:'#C9A84C' }}/>
              <span style={{ fontSize:11,color:'#10B981' }}>▲ 5 this quarter</span>
            </div>
            <div className="stat-value">{stats.entities}</div>
            <div className="stat-label">Entities Under Mgmt</div>
          </div>
          <div className="stat-card" onClick={() => navigate('/admin/invoices')} style={{ cursor:'pointer' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <DollarSign size={18} style={{ color:'#C9A84C' }}/>
            </div>
            <div className="stat-value">${stats.revenue.toLocaleString()}</div>
            <div className="stat-label">Outstanding Invoices</div>
          </div>
          <div className="stat-card" onClick={() => navigate('/admin/kyc')} style={{ cursor:'pointer', borderLeftColor: stats.kyc_pending > 0 ? '#EF4444' : '#C9A84C' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <AlertTriangle size={18} style={{ color: stats.kyc_pending > 0 ? '#EF4444' : '#C9A84C' }}/>
              {stats.kyc_pending > 0 && <span style={{ fontSize:11,color:'#EF4444' }}>Requires action</span>}
            </div>
            <div className="stat-value" style={{ color: stats.kyc_pending > 0 ? '#EF4444' : undefined }}>{stats.kyc_pending}</div>
            <div className="stat-label">KYC Actions Required</div>
          </div>
        </div>

        <div className="grid-2">
          {/* Urgent Alerts */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ color:'#EF4444', display:'flex', alignItems:'center', gap:6 }}>
                <AlertTriangle size={15}/> Urgent Alerts
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => navigate('/admin/kyc')}>View all <ArrowRight size={11}/></button>
            </div>
            {alerts.length === 0 ? (
              <div style={{ fontSize:13, color:'#10B981', padding:'8px 0' }}>✓ No urgent alerts</div>
            ) : alerts.map(a => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: a.status==='escalated'?'#EF4444':'#F59E0B', flexShrink:0 }}></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13 }}>{a.profiles?.full_name}</div>
                  <div style={{ fontSize:11, color:'#8fa3bc' }}>KYC {a.status} · Risk: <span className={`risk-${a.risk_score?.toLowerCase()}`}>{a.risk_score}</span></div>
                </div>
                <button className="btn btn-danger btn-xs" onClick={() => navigate('/admin/kyc')}>Review</button>
              </div>
            ))}
          </div>

          {/* Deadlines This Week */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Deadlines This Week</div>
              <button className="btn btn-ghost btn-xs">View all <ArrowRight size={11}/></button>
            </div>
            {deadlines.length === 0 ? (
              <div style={{ fontSize:13, color:'#10B981', padding:'8px 0' }}>✓ No deadlines this week</div>
            ) : deadlines.map(d => {
              const days = daysUntil(d.due_date)
              return (
                <div key={d.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:36, height:36, borderRadius:6, background: days<=7?'rgba(239,68,68,0.1)':'rgba(245,158,11,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:13, fontWeight:700, color: days<=7?'#EF4444':'#F59E0B' }}>{days <= 0 ? '!' : days}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>{d.deadline_type?.replace(/_/g,' ')}</div>
                    <div style={{ fontSize:11, color:'#8fa3bc' }}>{d.entities?.name}</div>
                  </div>
                  {days <= 7 ? (
                    <button className="btn btn-danger btn-xs">File Today</button>
                  ) : days <= 30 ? (
                    <button className="btn btn-secondary btn-xs" style={{ borderColor:'#F59E0B', color:'#F59E0B' }}>5 days</button>
                  ) : (
                    <span style={{ fontSize:11, color:'#8fa3bc' }}>{days}d</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card" style={{ marginTop:20 }}>
          <div className="card-header">
            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
              <Activity size={15} style={{ color:'#C9A84C' }}/>
              <div className="card-title">Recent Activity</div>
            </div>
          </div>
          {activity.length === 0 ? (
            <div className="empty-state"><p>No recent activity</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Action</th><th>Client</th><th>Description</th><th>Time</th></tr></thead>
                <tbody>
                  {activity.map(a => (
                    <tr key={a.id}>
                      <td><span className="badge badge-gold">{a.action}</span></td>
                      <td style={{ fontSize:12 }}>{a.profiles?.full_name || '—'}</td>
                      <td style={{ fontSize:12, color:'#8fa3bc' }}>{a.description}</td>
                      <td style={{ fontSize:11, color:'#5a7390' }}>{new Date(a.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
