import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import { Receipt, Download, CreditCard, Building, Bitcoin } from 'lucide-react'

export default function ClientInvoices() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [tab, setTab] = useState('outstanding')
  const [loading, setLoading] = useState(true)
  const [payModal, setPayModal] = useState(null)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    const { data } = await supabase.from('invoices')
      .select('*, entities(name)')
      .eq('client_id', user.id)
      .order('issued_date', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  const displayed = invoices.filter(i => tab === 'all' ? true : i.status === tab)
  const totalOutstanding = invoices.filter(i => i.status === 'outstanding').reduce((s, i) => s + i.amount, 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Invoices & Payments</div>
          <div className="page-title-sub">Your complete financial history with Aurevya</div>
        </div>
      </div>

      <div className="page-body">
        <div className="stats-grid" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color:'#EF4444' }}>${totalOutstanding.toLocaleString()}</div>
            <div className="stat-label">Outstanding Balance</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color:'#10B981' }}>${totalPaid.toLocaleString()}</div>
            <div className="stat-label">Total Paid (Lifetime)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{invoices.filter(i=>i.status==='outstanding').length}</div>
            <div className="stat-label">Invoices Awaiting Payment</div>
          </div>
        </div>

        <div className="card">
          <div className="tabs">
            {[['outstanding','Outstanding'],['paid','Paid'],['all','All Invoices']].map(([key,label]) => (
              <div key={key} className={`tab${tab===key?' active':''}`} onClick={() => setTab(key)}>{label}</div>
            ))}
          </div>

          {displayed.length === 0 ? (
            <div className="empty-state"><Receipt size={40}/><p style={{marginTop:12}}>No invoices</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Description</th>
                    <th>Entity</th>
                    <th>Issued</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily:'monospace', fontSize:12 }}>{inv.invoice_number || `AWL-${inv.id.slice(0,6).toUpperCase()}`}</td>
                      <td style={{ fontSize:13 }}>{inv.description || 'Professional services'}</td>
                      <td style={{ fontSize:12, color:'#8fa3bc' }}>{inv.entities?.name || '—'}</td>
                      <td style={{ fontSize:12, color:'#8fa3bc' }}>{inv.issued_date ? new Date(inv.issued_date).toLocaleDateString('en-GB') : '—'}</td>
                      <td style={{ fontSize:12, color: inv.status==='outstanding' && new Date(inv.due_date) < new Date() ? '#EF4444' : '#8fa3bc' }}>
                        {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td style={{ fontWeight:600 }}>{inv.currency || 'USD'} {inv.amount?.toLocaleString()}</td>
                      <td>
                        <span className={`badge ${inv.status==='paid' ? 'badge-success' : inv.status==='overdue' ? 'badge-danger' : 'badge-warning'} badge-dot`}>
                          {inv.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:6 }}>
                          {inv.status === 'outstanding' && (
                            <button className="btn btn-primary btn-xs" onClick={() => setPayModal(inv)}>
                              <CreditCard size={11}/> Pay
                            </button>
                          )}
                          <button className="btn btn-secondary btn-xs"><Download size={11}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Pay Invoice</div>
            <div className="modal-sub">Invoice #{payModal.invoice_number || payModal.id.slice(0,8)} · {payModal.currency} {payModal.amount?.toLocaleString()}</div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#8fa3bc', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.08em' }}>Select payment method</div>
              {[
                { icon: Building, label:'Bank Transfer', desc:'Wire transfer / SWIFT' },
                { icon: CreditCard, label:'Credit / Debit Card', desc:'Visa, Mastercard, Amex' },
                { icon: Bitcoin, label:'Cryptocurrency', desc:'USDT, BTC, ETH accepted' },
              ].map(m => (
                <div key={m.label} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg-hover)', border:'1px solid var(--border)', borderRadius:8, marginBottom:8, cursor:'pointer' }}
                  onMouseOver={e => e.currentTarget.style.borderColor='#C9A84C'}
                  onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}
                >
                  <m.icon size={20} style={{ color:'#C9A84C' }}/>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{m.label}</div>
                    <div style={{ fontSize:11, color:'#8fa3bc' }}>{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="alert alert-info" style={{ fontSize:12 }}>
              Your advisor will be notified immediately upon payment. A receipt will be emailed to you within 24 hours.
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPayModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { alert('Payment processing — your advisor has been notified.'); setPayModal(null) }}>
                <CreditCard size={14}/> Proceed to Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
