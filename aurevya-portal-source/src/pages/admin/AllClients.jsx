import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase.js'
import { Users, Search, Plus, Eye } from 'lucide-react'

export default function AllClients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('profiles')
      .select('*, entities(id), kyc_checks(status,risk_score)')
      .eq('role', 'client')
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  const filtered = clients.filter(c =>
    !search ||
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
  )

  const kycBadge = (checks) => {
    if (!checks?.length) return <span className="badge badge-muted">Not screened</span>
    const latest = checks[checks.length - 1]
    if (latest.status === 'approved') return <span className="badge badge-success badge-dot">Approved</span>
    if (latest.status === 'review') return <span className="badge badge-warning badge-dot">Under Review</span>
    if (latest.status === 'escalated') return <span className="badge badge-danger badge-dot">Escalated</span>
    return <span className="badge badge-muted">{latest.status}</span>
  }

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">All Clients</div>
          <div className="page-title-sub">{clients.length} clients under management</div>
        </div>
        <div className="header-actions">
          <div className="search-wrap">
            <Search size={14}/>
            <input className="form-input" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} style={{ width:220 }}/>
          </div>
          <button className="btn btn-primary btn-sm"><Plus size={13}/> Add Client</button>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          {filtered.length === 0 ? (
            <div className="empty-state"><Users size={40}/><p style={{marginTop:12}}>No clients found</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Company</th>
                    <th>Entities</th>
                    <th>KYC Status</th>
                    <th>Portal</th>
                    <th>Onboarded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#C9A84C80,#C9A84C)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#0a0f1e', flexShrink:0 }}>
                            {c.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2) || '?'}
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:500 }}>{c.full_name}</div>
                            <div style={{ fontSize:11, color:'#5a7390' }}>{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize:12, color:'#8fa3bc' }}>{c.company || '—'}</td>
                      <td style={{ fontSize:13, fontWeight:600 }}>{c.entities?.length || 0}</td>
                      <td>{kycBadge(c.kyc_checks)}</td>
                      <td>
                        {c.portal_active
                          ? <span className="badge badge-success badge-dot">Active</span>
                          : c.portal_invited
                          ? <span className="badge badge-warning badge-dot">Invited</span>
                          : <span className="badge badge-muted">Not invited</span>
                        }
                      </td>
                      <td style={{ fontSize:12, color:'#8fa3bc' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '—'}</td>
                      <td>
                        <button className="btn btn-ghost btn-xs" onClick={() => navigate(`/admin/clients/${c.id}`)}><Eye size={12}/> View</button>
                      </td>
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
