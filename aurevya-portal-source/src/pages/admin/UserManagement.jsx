import { useState, useEffect } from 'react'
import { supabase } from '../../supabase.js'
import { adminApiStatus } from '../../adminApi.js'
import CreateUserModal from '../../components/CreateUserModal.jsx'
import { UserCog, Plus, Edit2, ShieldOff, KeyRound, AlertTriangle } from 'lucide-react'

export default function UserManagement() {
  const [staff, setStaff] = useState([])
  const [clients, setClients] = useState([])
  const [tab, setTab] = useState('staff')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  // user object when resetting someone's password, null otherwise
  const [pwTarget, setPwTarget] = useState(null)
  const [apiReady, setApiReady] = useState(null) // null = still checking

  useEffect(() => { load(); adminApiStatus().then(s => setApiReady(!!s.configured)) }, [])

  async function load() {
    const [sRes, cRes] = await Promise.all([
      supabase.from('profiles').select('*').in('role',['admin','staff']).order('created_at'),
      supabase.from('profiles').select('*,entities(id),kyc_checks(status)').eq('role','client').order('created_at',{ascending:false})
    ])
    setStaff(sRes.data || [])
    setClients(cRes.data || [])
    setLoading(false)
  }

  const RoleBadge = ({ role }) => {
    if (role === 'admin') return <span className="badge badge-danger">Admin</span>
    if (role === 'staff') return <span className="badge badge-info">Staff</span>
    return <span className="badge badge-muted">Client</span>
  }

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">User Management</div>
          <div className="page-title-sub">{staff.length} staff · {clients.length} clients</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={13}/> Create User
        </button>
      </div>

      <div className="page-body">
        {/* Creating a user needs the service-role key on the API server; say
            so up front rather than letting the first attempt fail. */}
        {apiReady === false && (
          <div style={{ display:'flex',gap:10,alignItems:'flex-start',padding:'12px 14px',marginBottom:16,
            borderRadius:8,background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.3)' }}>
            <AlertTriangle size={16} style={{ color:'#F59E0B',flexShrink:0,marginTop:1 }}/>
            <div style={{ fontSize:12.5,color:'#d9c48a',lineHeight:1.5 }}>
              User creation is unavailable: the administration service is unreachable or is missing its
              <code style={{ margin:'0 4px' }}>SUPABASE_SERVICE_ROLE_KEY</code>. Existing users are still listed below.
            </div>
          </div>
        )}

        <div className="tabs">
          <div className={`tab${tab==='staff'?' active':''}`} onClick={() => setTab('staff')}>Staff Accounts ({staff.length})</div>
          <div className={`tab${tab==='clients'?' active':''}`} onClick={() => setTab('clients')}>Client Portal Accounts ({clients.length})</div>
        </div>

        {tab === 'staff' ? (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Last Active</th>
                  <th>2FA</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1e3a5f,#2563eb)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0 }}>
                          {s.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2) || '?'}
                        </div>
                        <div>
                          <div style={{ fontSize:13,fontWeight:500 }}>{s.full_name}</div>
                          <div style={{ fontSize:11,color:'#5a7390' }}>{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><RoleBadge role={s.role}/></td>
                    <td style={{ fontSize:12,color:'#8fa3bc' }}>{s.department || '—'}</td>
                    <td style={{ fontSize:12,color:'#8fa3bc' }}>{s.last_active ? new Date(s.last_active).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : 'Never'}</td>
                    <td>
                      {s.two_factor_enabled
                        ? <span className="badge badge-success">ON</span>
                        : <span className="badge badge-warning">OFF</span>
                      }
                    </td>
                    <td><span className={`badge ${s.is_active===false?'badge-danger':'badge-success'} badge-dot`}>{s.is_active===false?'Inactive':'Active'}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-xs" title="Set password"
                          onClick={() => setPwTarget(s)}>
                          <KeyRound size={11}/>
                        </button>
                        <button className="btn btn-ghost btn-xs"><Edit2 size={11}/></button>
                        <button className="btn btn-ghost btn-xs" style={{ color:'#EF4444' }}><ShieldOff size={11}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card">
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
              <span style={{ fontSize:13,color:'#8fa3bc' }}>Client portal access and activity</span>
              <button className="btn btn-secondary btn-sm"><Download size={13}/> Export</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Email</th>
                  <th>Entities</th>
                  <th>Last Login</th>
                  <th>Portal Status</th>
                  <th>KYC</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                        <div style={{ width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#C9A84C60,#C9A84C)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#0a0f1e',flexShrink:0 }}>
                          {c.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2) || '?'}
                        </div>
                        <span style={{ fontSize:13,fontWeight:500 }}>{c.full_name}</span>
                      </div>
                    </td>
                    <td style={{ fontSize:12,color:'#8fa3bc' }}>{c.email}</td>
                    <td style={{ fontSize:13,fontWeight:600 }}>{c.entities?.length || 0}</td>
                    <td style={{ fontSize:12,color:'#8fa3bc' }}>{c.last_active ? new Date(c.last_active).toLocaleDateString('en-GB') : 'Never'}</td>
                    <td>
                      {c.portal_active ? <span className="badge badge-success badge-dot">Active</span>
                       : c.portal_invited ? <span className="badge badge-warning badge-dot">Invited</span>
                       : <span className="badge badge-muted">Not invited</span>}
                    </td>
                    <td>
                      {(() => {
                        const k = c.kyc_checks?.[c.kyc_checks.length-1]
                        if (!k) return <span className="badge badge-muted">Pending</span>
                        if (k.status==='approved') return <span className="badge badge-success">Approved</span>
                        if (k.status==='review') return <span className="badge badge-warning">Review</span>
                        return <span className="badge badge-danger">Escalated</span>
                      })()}
                    </td>
                    <td>
                      <div style={{ display:'flex',gap:6 }}>
                        <button className="btn btn-ghost btn-xs" title="Set password"
                          onClick={() => setPwTarget(c)}>
                          <KeyRound size={11}/> Password
                        </button>
                        <button className="btn btn-ghost btn-xs">View</button>
                        {c.portal_active && <button className="btn btn-ghost btn-xs" style={{ color:'#EF4444' }}>Hold</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}
      {pwTarget && (
        <CreateUserModal
          existingUser={pwTarget}
          onClose={() => setPwTarget(null)}
        />
      )}
    </div>
  )
}

function Download({ size }) { return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
