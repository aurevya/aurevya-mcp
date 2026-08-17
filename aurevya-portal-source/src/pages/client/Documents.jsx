import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import { FileText, Download, Search, Filter, FileCheck, File, FilePen } from 'lucide-react'

const DOC_TYPES = ['All', 'Incorporation', 'KYC', 'Board Resolution', 'Agreement', 'Report', 'Invoice', 'Other']

export default function ClientDocuments() {
  const { user } = useAuth()
  const [docs, setDocs] = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) load() }, [user])
  useEffect(() => { filter() }, [docs, search, typeFilter])

  async function load() {
    const { data } = await supabase.from('documents')
      .select('*, entities(name)')
      .eq('client_id', user.id)
      .order('uploaded_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  function filter() {
    let d = docs
    if (search) d = d.filter(x => x.name?.toLowerCase().includes(search.toLowerCase()) || x.entities?.name?.toLowerCase().includes(search.toLowerCase()))
    if (typeFilter !== 'All') d = d.filter(x => x.document_type === typeFilter)
    setFiltered(d)
  }

  const fileIcon = (type) => {
    if (type?.includes('KYC')) return <FileCheck size={16} style={{ color:'#10B981' }}/>
    if (type?.includes('Agreement') || type?.includes('Deed')) return <FilePen size={16} style={{ color:'#C9A84C' }}/>
    return <File size={16} style={{ color:'#8fa3bc' }}/>
  }

  const formatSize = (bytes) => {
    if (!bytes) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Document Vault</div>
          <div className="page-title-sub">{docs.length} documents on file</div>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <div className="search-wrap" style={{ flex:1, minWidth:200 }}>
              <Search size={14}/>
              <input className="form-input" placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {DOC_TYPES.map(t => (
                <button key={t} className={`btn btn-xs ${typeFilter === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTypeFilter(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <FileText size={40}/>
              <p style={{ marginTop:12 }}>{docs.length === 0 ? 'No documents on file yet' : 'No documents match your search'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Entity</th>
                    <th>Type</th>
                    <th>Uploaded</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          {fileIcon(doc.document_type)}
                          <span style={{ fontSize:13, fontWeight:500 }}>{doc.name}</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize:12, color:'#8fa3bc' }}>{doc.entities?.name || '—'}</span></td>
                      <td><span className="badge badge-muted">{doc.document_type || 'Other'}</span></td>
                      <td><span style={{ fontSize:12, color:'#8fa3bc' }}>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}</span></td>
                      <td><span style={{ fontSize:12, color:'#8fa3bc' }}>{formatSize(doc.file_size)}</span></td>
                      <td>
                        {doc.requires_signature
                          ? <span className="badge badge-warning badge-dot">Signature required</span>
                          : <span className="badge badge-success badge-dot">Filed</span>
                        }
                      </td>
                      <td>
                        {doc.file_url && (
                          <a href={doc.file_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs">
                            <Download size={12}/> Download
                          </a>
                        )}
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
