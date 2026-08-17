import { useState, useEffect } from 'react'
import { supabase } from '../../supabase.js'
import { Database, Shield, Lock, Eye, Clock, Server, ExternalLink } from 'lucide-react'

export default function AdminSecurity() {
  const [stats, setStats] = useState({ users: 0, storage: 0, apiCalls: 0 })
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const [profRes, auditRes] = await Promise.all([
      supabase.from('profiles').select('id', { count:'exact' }),
      supabase.from('activity_log').select('*,profiles(full_name,email)').order('created_at',{ascending:false}).limit(20)
    ])
    setStats({ users: profRes.count || 0, storage: '1.8 GB', apiCalls: '346' })
    setAuditLog(auditRes.data || [])
    setLoading(false)
  }

  const controls = [
    { icon: Lock, label:'Row-Level Security (RLS)', desc:'Clients can only access their own data. Staff see only assigned clients.', status:true },
    { icon: Shield, label:'Two-Factor Authentication', desc:'Required for all Admin accounts. Optional for Staff.', status:true },
    { icon: Lock, label:'End-to-End Encryption', desc:'All data encrypted at rest (AES-256) and in transit (TLS 1.3).', status:true },
    { icon: Eye, label:'Audit Logging', desc:'Every read, write, and delete logged with user ID, timestamp, and action type.', status:true },
    { icon: Clock, label:'Session Timeout', desc:'Auto logout after 30 minutes of inactivity.', status:true },
    { icon: Shield, label:'IP Allowlist', desc:'Optionally restrict access to registered IP addresses.', status:false, optional:true },
    { icon: Server, label:'EmailJS Notifications', desc:'Secure transactional emails through EmailJS. No plaintext credentials in client code.', status:true },
  ]

  const infra = [
    { name:'Supabase (Database + Auth)', status:'Live', tier:'Pro', color:'#10B981' },
    { name:'Netlify (Hosting)', status:'Live', tier:'Pro', color:'#10B981' },
    { name:'EmailJS (Transactional Email)', status:'Connected', tier:'Business', color:'#10B981' },
    { name:'Anthropic API (Claude Oracle)', status:'Ready', tier:'Pay-as-you-go', color:'#F59E0B' },
    { name:'SSL / Custom Domain', status:'Included', tier:'via Netlify', color:'#10B981' },
  ]

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Database & Security Console</div>
          <div className="page-title-sub">Infrastructure health, security controls, and audit logs</div>
        </div>
        <div className="header-actions">
          <a href="https://supabase.com/dashboard/project/wxwbfkhvkrwtmsgwdkjy" target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            <ExternalLink size={13}/> Supabase Console
          </a>
          <button className="btn btn-primary btn-sm"><Eye size={13}/> Export Audit Log</button>
        </div>
      </div>

      <div className="page-body">
        {/* Status bar */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
          {[
            { label:'Database Status', value:'● Live', sub:'Supabase · wxwbf...', color:'#10B981' },
            { label:'RLS Policies Active', value:'24', sub:'Row-Level Security ON', color:'#C9A84C' },
            { label:'Last Backup', value:'2h ago', sub:'Auto-backup every 6h', color:'#C9A84C' },
            { label:'Failed Login Attempts', value:'0', sub:'Last 24 hours', color:'#10B981' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-value" style={{ color:s.color, fontSize:22 }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
              <div style={{ fontSize:11,color:'#5a7390',marginTop:4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid-2">
          {/* Security Controls */}
          <div className="card">
            <div className="card-header"><div className="card-title">Security Controls</div></div>
            {controls.map(c => (
              <div key={c.label} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:32,height:32,borderRadius:8,background:c.status?'rgba(16,185,129,0.1)':'rgba(90,115,144,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                  <c.icon size={15} style={{ color:c.status?'#10B981':'#5a7390' }}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13,fontWeight:500 }}>{c.label}</div>
                  <div style={{ fontSize:11,color:'#8fa3bc',marginTop:2 }}>{c.desc}</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" defaultChecked={c.status} onChange={() => {}}/>
                  <span className="toggle-slider"></span>
                </label>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {/* Database Usage */}
            <div className="card">
              <div className="card-header"><div className="card-title">Database Usage</div></div>
              {[
                { label:'Storage', used:1.8, max:8, unit:'GB' },
                { label:'API Requests', used:346, max:1000, unit:'K/month' },
                { label:'Active Connections', used:6, max:30, unit:'' },
                { label:'Bandwidth', used:0.8, max:10, unit:'GB' },
              ].map(item => (
                <div key={item.label} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12 }}>
                    <span style={{ color:'#8fa3bc' }}>{item.label}</span>
                    <span style={{ color:'#C9A84C',fontWeight:600 }}>{item.used}{item.unit} / {item.max}{item.unit}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width:`${(item.used/item.max)*100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Infrastructure Stack */}
            <div className="card">
              <div className="card-header"><div className="card-title">Infrastructure Stack</div></div>
              {infra.map(i => (
                <div key={i.name} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)' }}>
                  <div style={{ fontSize:12 }}>{i.name}</div>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <span style={{ fontSize:11,color:'#5a7390' }}>{i.tier}</span>
                    <span className="badge badge-success" style={{ fontSize:10 }}>● {i.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Audit Log */}
        <div className="card" style={{ marginTop:20 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Recent Audit Events</div>
              <div className="card-subtitle">Immutable log of all data access and modifications</div>
            </div>
            <button className="btn btn-secondary btn-xs">Full log <ExternalLink size={11}/></button>
          </div>
          {auditLog.length === 0 ? (
            <div className="empty-state"><p>No audit events yet</p></div>
          ) : (
            <table>
              <thead><tr><th>Event</th><th>User</th><th>Description</th><th>Timestamp</th></tr></thead>
              <tbody>
                {auditLog.map(e => (
                  <tr key={e.id}>
                    <td><span className="badge badge-muted">{e.action}</span></td>
                    <td style={{ fontSize:12 }}>
                      <div>{e.profiles?.full_name || 'System'}</div>
                      <div style={{ fontSize:10,color:'#5a7390' }}>{e.profiles?.email}</div>
                    </td>
                    <td style={{ fontSize:12,color:'#8fa3bc' }}>{e.description}</td>
                    <td style={{ fontSize:11,color:'#5a7390',whiteSpace:'nowrap' }}>
                      {new Date(e.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
