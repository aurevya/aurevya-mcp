import { useState, useEffect } from 'react'
import { supabase } from '../../supabase.js'
import { Receipt, Plus, Download } from 'lucide-react'

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState([])
  const [tab, setTab] = useState('outstanding')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('invoices')
      .select('*,profiles(full_name,email),entities(name)')
      .order('issued_date', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  const displayed = tab === 'all' ? invoices : invoices.filter(i => i.status === tab)
  const totalOutstanding = invoices.filter(i=>i.status==='outstanding').reduce((s,i)=>s+i.amount,0)
  const totalPaid = invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+i.amount,0)

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Invoices</div>
          <div className="page-title-sub">All client invoices and payment status</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm"><Download size={13}/> Export</button>
          <button className="btn btn-primary btn-sm"><Plus size={13}/> New Invoice</button>
        </div>
      </div>

      <div className="page-body">
        <div className="stats-grid" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color:'#EF4444' }}>${totalOutstanding.toLocaleString()}</div>
            <div className="stat-label">Outstanding</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color:'#10B981' }}>${totalPaid.toLocaleString()}</div>
            <div className="stat-label">Collected (Lifetime)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{invoices.length}</div>
            <div className="stat-label">Total Invoices</div>
          </div>
        </div>

        <div className="card">
          <div className="tabs">
            {[['outstanding','Outstanding'],['paid','Paid'],['overdue','Overdue'],['all','All']].map(([k,l]) => (
              <div key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</div>
            ))}
          </div>

          {displayed.length === 0 ? (
            <div className="empty-state"><Receipt size={40}/><p style={{marginTop:12}}>No invoices</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily:'monospace',fontSize:12 }}>{inv.invoice_number || `AWL-${inv.id.slice(0,6).toUpperCase()}`}</td>
                    <td>
                      <div style={{ fontSize:13,fontWeight:500 }}>{inv.profiles?.full_name}</div>
                      <div style={{ fontSize:11,color:'#5a7390' }}>{inv.profiles?.email}</div>
                    </td>
                    <td style={{ fontSize:12,color:'#8fa3bc' }}>{inv.entities?.name || '—'}</td>
                    <td style={{ fontSize:12,color:'#8fa3bc',maxWidth:180 }}>{inv.description || 'Professional services'}</td>
                    <td style={{ fontSize:12,color:'#8fa3bc' }}>{inv.issued_date ? new Date(inv.issued_date).toLocaleDateString('en-GB') : '—'}</td>
                    <td style={{ fontSize:12, color: inv.status==='outstanding' && new Date(inv.due_date)<new Date() ? '#EF4444' : '#8fa3bc' }}>
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td style={{ fontWeight:600 }}>{inv.currency||'USD'} {inv.amount?.toLocaleString()}</td>
                    <td><span className={`badge ${inv.status==='paid'?'badge-success':inv.status==='overdue'?'badge-danger':'badge-warning'} badge-dot`}>{inv.status}</span></td>
                    <td>
                      <div style={{ display:'flex',gap:6 }}>
                        <button className="btn btn-ghost btn-xs"><Download size={11}/></button>
                        {inv.status==='outstanding' && <button className="btn btn-primary btn-xs">Mark Paid</button>}
                      </div>
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
