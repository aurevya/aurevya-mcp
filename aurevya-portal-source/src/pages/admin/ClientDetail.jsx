import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase.js'
import {
  ArrowLeft, Send, Shield, AlertTriangle, CheckCircle,
  FileText, Download, Eye, EyeOff, ChevronDown, ChevronUp,
  ClipboardList, User, Building2, RefreshCw, Clock,
  Users, Trash2, Edit2, MapPin
} from 'lucide-react'

const ACTION_ICONS = {
  party_added:             { icon: Users,       color: '#8B5CF6' },
  party_deleted:           { icon: Trash2,      color: '#ef4444' },
  structure_confirmed:     { icon: CheckCircle, color: '#10B981' },
  structure_edit_requested:{ icon: Edit2,       color: '#F59E0B' },
  kyc_uploaded:            { icon: Shield,      color: '#3B82F6' },
  portal_invite_sent:      { icon: Send,        color: '#14B8A6' },
  welcome_email_sent:      { icon: Send,        color: '#EC4899' },
}
function ActivityIcon({ action }) {
  const cfg = ACTION_ICONS[action] || { icon: Clock, color: '#8fa3bc' }
  const Icon = cfg.icon
  return (
    <div style={{ width:30,height:30,borderRadius:'50%',flexShrink:0,background:cfg.color+'22',border:`1px solid ${cfg.color}55`,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <Icon size={13} style={{ color:cfg.color }}/>
    </div>
  )
}

const COMPLIANCE_LABELS = {
  name_change: 'Name change history',
  multiple_passports: 'Multiple passports',
  foreign_financial_services: 'Foreign financial services licence',
  precluded_from_services: 'Precluded from financial services',
  criminal_convictions: 'Criminal convictions',
  regulatory_sanctions: 'Regulatory sanctions',
  regulatory_investigations: 'Under regulatory investigation',
  bankruptcy: 'Bankruptcy / insolvency',
  litigation: 'Pending litigation',
  civil_proceedings: 'Civil proceedings (fraud/dishonesty)',
  refused_onboarding: 'Refused onboarding by institution',
  sanctions_watchlist: 'On sanctions/watchlist',
  high_risk_jurisdictions: 'High-risk jurisdiction ties',
}

const ENTITY_TYPE_LABELS = {
  authorised_company: 'Authorised Company',
  global_business_company: 'Global Business Company (GBC)',
  trust: 'Trust',
  foundation: 'Foundation',
  domestic: 'Domestic Company',
  other: 'Other',
}

function RiskBadge({ score }) {
  if (!score) return <span className="badge badge-muted">Not assessed</span>
  const cfg = {
    Low:    { cls: 'badge-success', color: '#10B981' },
    Medium: { cls: 'badge-warning', color: '#F59E0B' },
    High:   { cls: 'badge-danger',  color: '#EF4444' },
  }[score] || { cls: 'badge-muted', color: '#8fa3bc' }
  return (
    <span className={`badge ${cfg.cls}`} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
      <Shield size={11} /> {score}
    </span>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending:     { cls: 'badge-muted',    label: 'Not Started' },
    in_progress: { cls: 'badge-warning',  label: 'In Progress' },
    submitted:   { cls: 'badge-success',  label: 'Submitted' },
  }
  const cfg = map[status] || map.pending
  return <span className={`badge ${cfg.cls} badge-dot`}>{cfg.label}</span>
}

function PersonPanel({ person, index }) {
  const [open, setOpen] = useState(false)
  const flags = Object.entries(person.compliance || {}).filter(([, v]) => v === true)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <div
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', cursor:'pointer', background:'var(--bg-secondary)' }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(201,168,76,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#C9A84C' }}>
            {person.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2) || '?'}
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:600 }}>{person.full_name || `Person ${index+1}`}</div>
            <div style={{ fontSize:11, color:'#5a7390' }}>{(person.roles||[]).join(', ')} · {person.nationality}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {flags.length > 0 && (
            <span className="badge badge-danger" style={{ fontSize:10 }}>
              <AlertTriangle size={10}/> {flags.length} flag{flags.length > 1 ? 's' : ''}
            </span>
          )}
          {open ? <ChevronUp size={14} style={{ color:'#5a7390' }}/> : <ChevronDown size={14} style={{ color:'#5a7390' }}/>}
        </div>
      </div>

      {open && (
        <div style={{ padding:'14px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px 16px', marginBottom:14 }}>
            {[
              ['Date of birth', person.dob],
              ['Place of birth', person.pob],
              ['Occupation', person.occupation],
              ['Tax country', person.tax_country],
              ['TIN', person.tin],
              ['Email', person.email],
              ['Mobile', person.mobile],
              ['Spouse', person.spouse_name],
              ['Father', person.father_name],
              ['Mother', person.mother_name],
            ].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em' }}>{l}</div>
                <div style={{ fontSize:12, fontWeight:500, marginTop:2 }}>{v || '—'}</div>
              </div>
            ))}
          </div>

          {person.residential_address && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2 }}>Residential address</div>
              <div style={{ fontSize:12 }}>{person.residential_address}</div>
            </div>
          )}

          {person.corporate_shareholder && (
            <div style={{ background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:6, padding:'8px 10px', fontSize:12, color:'#C9A84C', marginBottom:12 }}>
              ⚠ Corporate shareholder — additional KYC documents required
            </div>
          )}

          {/* Compliance flags */}
          <div style={{ fontSize:11, fontWeight:600, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Compliance Declarations</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
            {Object.entries(COMPLIANCE_LABELS).map(([key, label]) => {
              const val = person.compliance?.[key]
              return (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, padding:'4px 0' }}>
                  {val
                    ? <AlertTriangle size={11} style={{ color:'#EF4444', flexShrink:0 }}/>
                    : <CheckCircle size={11} style={{ color:'#10B981', flexShrink:0 }}/>
                  }
                  <span style={{ color: val ? '#EF4444' : '#8fa3bc' }}>{label}: <strong>{val ? 'YES' : 'No'}</strong></span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [qs, setQs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [activityLogs, setActivityLogs] = useState([])
  const [onboardingId, setOnboardingId] = useState(null)

  useEffect(() => { if (id) load() }, [id])

  async function load() {
    const [profileRes, qsRes] = await Promise.all([
      supabase.from('profiles')
        .select('*, entities(id,name,type,status), kyc_checks(status,risk_score,checked_at)')
        .eq('id', id)
        .single(),
      supabase.from('questionnaire_submissions')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    setClient(profileRes.data)
    setQs(qsRes.data)

    // Load activity logs via client_onboardings
    const { data: ob } = await supabase
      .from('client_onboardings')
      .select('id')
      .eq('email', profileRes.data?.email)
      .maybeSingle()
    if (ob) {
      setOnboardingId(ob.id)
      const { data: logs } = await supabase
        .from('client_activity_logs')
        .select('*')
        .eq('client_id', ob.id)
        .order('created_at', { ascending: false })
      setActivityLogs(logs || [])
    }
    setLoading(false)
  }

  async function sendQuestionnaire() {
    if (!window.confirm(`Send questionnaire to ${client?.full_name}? They will see it in their portal on next login.`)) return
    setSending(true)
    // Create or update questionnaire record with 'pending' status and sent_at
    if (qs) {
      await supabase.from('questionnaire_submissions')
        .update({ sent_at: new Date().toISOString(), status: qs.status === 'submitted' ? qs.status : 'pending' })
        .eq('id', qs.id)
    } else {
      const { data: newQs } = await supabase.from('questionnaire_submissions')
        .insert({ client_id: id, status: 'pending', sent_at: new Date().toISOString() })
        .select('*')
        .single()
      setQs(newQs)
    }
    await load()
    setSending(false)
    alert('Questionnaire sent. The client will see it when they next log in.')
  }

  async function resendQuestionnaire() {
    if (!window.confirm('This will reset the questionnaire and ask the client to complete it again.')) return
    setSending(true)
    await supabase.from('questionnaire_submissions')
      .update({ status: 'pending', sent_at: new Date().toISOString(), submitted_at: null, risk_score: null, risk_flags: [], pdf_url: null })
      .eq('id', qs.id)
    await load()
    setSending(false)
  }

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>
  if (!client) return <div className="page-body"><div className="empty-state">Client not found</div></div>

  const latestKyc = client.kyc_checks?.[client.kyc_checks.length - 1]
  const riskColor = (s) => s === 'High' ? '#EF4444' : s === 'Medium' ? '#F59E0B' : '#10B981'

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <button className="btn btn-ghost btn-xs" onClick={() => navigate('/admin/clients')} style={{ marginBottom:8 }}>
            <ArrowLeft size={13}/> All Clients
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:'50%', background:'linear-gradient(135deg,#C9A84C80,#C9A84C)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#0a0f1e' }}>
              {client.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2) || '?'}
            </div>
            <div>
              <div className="page-title" style={{ marginBottom:0 }}>{client.full_name}</div>
              <div className="page-title-sub">{client.email} · {client.company || 'No company'}</div>
            </div>
          </div>
        </div>
        <div className="header-actions">
          {qs?.status === 'submitted' ? (
            <button className="btn btn-secondary btn-sm" onClick={resendQuestionnaire} disabled={sending}>
              <RefreshCw size={13}/> Re-send Questionnaire
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={sendQuestionnaire} disabled={sending}>
              {sending ? <div className="spinner" style={{ width:12, height:12 }}/> : <Send size={13}/>}
              {qs ? 'Resend Questionnaire' : 'Send Questionnaire'}
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Top stats row */}
        <div className="stats-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginBottom:20 }}>
          <div className="stat-card">
            <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Portal Status</div>
            <div>
              {client.portal_active
                ? <span className="badge badge-success badge-dot">Active</span>
                : client.portal_invited
                ? <span className="badge badge-warning badge-dot">Invited</span>
                : <span className="badge badge-muted">Not invited</span>}
            </div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Questionnaire</div>
            <StatusBadge status={qs?.status} />
          </div>
          <div className="stat-card">
            <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Risk Score</div>
            <RiskBadge score={qs?.risk_score || latestKyc?.risk_score} />
          </div>
          <div className="stat-card">
            <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Entities</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#C9A84C' }}>{client.entities?.length || 0}</div>
          </div>
        </div>

        <div className="tabs" style={{ marginBottom:20 }}>
          {[
            ['overview', 'Overview'],
            ['questionnaire', 'Questionnaire Responses'],
            ['kyc', 'KYC & Risk'],
            ['entities', 'Entities'],
            ['activity', `Activity Log${activityLogs.length ? ` (${activityLogs.length})` : ''}`],
          ].map(([k, l]) => (
            <div key={k} className={`tab${activeTab===k?' active':''}`} onClick={() => setActiveTab(k)}>{l}</div>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div className="card-title">Client Profile</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 20px' }}>
                {[
                  ['Full name', client.full_name],
                  ['Email', client.email],
                  ['Company', client.company],
                  ['Phone', client.phone],
                  ['Member since', client.created_at ? new Date(client.created_at).toLocaleDateString('en-GB') : '—'],
                  ['Last active', client.last_active ? new Date(client.last_active).toLocaleDateString('en-GB') : '—'],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em' }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{v || '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Questionnaire Summary</div>
              </div>
              {!qs ? (
                <div className="empty-state">
                  <ClipboardList size={32}/>
                  <p style={{ marginTop:8, fontSize:13 }}>No questionnaire sent yet</p>
                  <button className="btn btn-primary btn-sm" style={{ marginTop:12 }} onClick={sendQuestionnaire}>
                    <Send size={13}/> Send Now
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 16px', marginBottom:16 }}>
                    {[
                      ['Status', <StatusBadge status={qs.status}/>],
                      ['Risk Score', <RiskBadge score={qs.risk_score}/>],
                      ['Sent', qs.sent_at ? new Date(qs.sent_at).toLocaleDateString('en-GB') : '—'],
                      ['Submitted', qs.submitted_at ? new Date(qs.submitted_at).toLocaleDateString('en-GB') : '—'],
                      ['Persons', (qs.persons||[]).length],
                      ['Entity type', ENTITY_TYPE_LABELS[qs.entity_type] || qs.entity_type || '—'],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em' }}>{l}</div>
                        <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {qs.pdf_url && (
                    <a href={qs.pdf_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ textDecoration:'none', display:'inline-flex', gap:6 }}>
                      <Download size={12}/> Download PDF
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── QUESTIONNAIRE RESPONSES TAB ───────────────────────────────────── */}
        {activeTab === 'questionnaire' && (
          !qs || qs.status === 'pending' ? (
            <div className="card">
              <div className="empty-state">
                <ClipboardList size={40}/>
                <p style={{ marginTop:12 }}>
                  {!qs ? 'No questionnaire has been sent to this client yet.' : 'The client has not yet started the questionnaire.'}
                </p>
                {!qs && (
                  <button className="btn btn-primary btn-sm" style={{ marginTop:16 }} onClick={sendQuestionnaire}>
                    <Send size={13}/> Send Questionnaire
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display:'grid', gap:20 }}>
              {/* Company details */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><Building2 size={14} style={{ display:'inline', marginRight:6 }}/>Company Details</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px 20px' }}>
                  {[
                    ['Preferred name', qs.entity_name],
                    ['Alternative 1', qs.entity_name_alt1],
                    ['Alternative 2', qs.entity_name_alt2],
                    ['Entity type', ENTITY_TYPE_LABELS[qs.entity_type] || qs.entity_type],
                    ['DTA required', qs.has_dta == null ? '—' : qs.has_dta ? 'Yes' : 'No'],
                    ['Nominee arrangement', qs.nominee_arrangement == null ? '—' : qs.nominee_arrangement ? 'Yes' : 'No'],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em' }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{v || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Persons */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><User size={14} style={{ display:'inline', marginRight:6 }}/>Persons — Annexure 1 ({(qs.persons||[]).length})</div>
                </div>
                {(qs.persons||[]).length === 0
                  ? <div style={{ fontSize:12, color:'#5a7390' }}>No persons recorded</div>
                  : (qs.persons||[]).map((p, i) => <PersonPanel key={i} person={p} index={i}/>)
                }
              </div>

              {/* Source of funds */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Annexure 2 — Source of Funds</div>
                  {qs.ann2_signed_at && <span className="badge badge-success" style={{ fontSize:10 }}><CheckCircle size={10}/> Signed</span>}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px', marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em' }}>Sources</div>
                    <div style={{ marginTop:4 }}>
                      {(qs.source_of_funds||[]).length === 0
                        ? <span style={{ fontSize:12, color:'#5a7390' }}>None recorded</span>
                        : (qs.source_of_funds||[]).map(s => (
                            <div key={s} style={{ fontSize:12, padding:'2px 0' }}>• {s}</div>
                          ))
                      }
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em' }}>Country of origin</div>
                    <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{qs.funds_country || '—'}</div>
                    <div style={{ marginTop:10, fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em' }}>AML declaration</div>
                    <div style={{ marginTop:2 }}>
                      {qs.aml_declaration
                        ? <span className="badge badge-success"><CheckCircle size={10}/> Confirmed</span>
                        : <span className="badge badge-warning">Not confirmed</span>}
                    </div>
                  </div>
                </div>
                {qs.ann2_signature_data && (
                  <div>
                    <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Signature — {qs.ann2_signer_name}</div>
                    <img src={qs.ann2_signature_data} alt="Signature" style={{ height:50, border:'1px solid var(--border)', borderRadius:4 }}/>
                  </div>
                )}
              </div>

              {/* PEP */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Annexure 3 — PEP Declaration</div>
                  {qs.ann3_signed_at && <span className="badge badge-success" style={{ fontSize:10 }}><CheckCircle size={10}/> Signed</span>}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                  {[
                    ['Currently/previously prominent public function', qs.is_pep],
                    ['Currently serving as PEP', qs.was_pep],
                    ['Immediate family of PEP', qs.family_of_pep],
                    ['Close associate of PEP', qs.associate_of_pep],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
                      {v ? <AlertTriangle size={12} style={{ color:'#EF4444' }}/> : <CheckCircle size={12} style={{ color:'#10B981' }}/>}
                      <span style={{ fontSize:12, color: v ? '#EF4444' : '#8fa3bc' }}>{l}: <strong>{v ? 'YES' : 'No'}</strong></span>
                    </div>
                  ))}
                </div>
                {(qs.is_pep || qs.was_pep || qs.family_of_pep || qs.associate_of_pep) && qs.pep_details && (
                  <div style={{ background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:8, padding:12, marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#F59E0B', marginBottom:8 }}>PEP Details</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px' }}>
                      {Object.entries(qs.pep_details || {}).map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em' }}>{k.replace('pep_','')}</div>
                          <div style={{ fontSize:12, fontWeight:500, marginTop:1 }}>{v || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {qs.ann3_signature_data && (
                  <div>
                    <div style={{ fontSize:10, color:'#5a7390', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Signature — {qs.ann3_signer_name}</div>
                    <img src={qs.ann3_signature_data} alt="Signature" style={{ height:50, border:'1px solid var(--border)', borderRadius:4 }}/>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* ── KYC & RISK TAB ────────────────────────────────────────────────── */}
        {activeTab === 'kyc' && (
          <div style={{ display:'grid', gap:20 }}>
            {/* Risk summary */}
            {qs?.risk_score && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Risk Assessment</div>
                  <RiskBadge score={qs.risk_score} />
                </div>
                {(qs.risk_flags||[]).length === 0 ? (
                  <div style={{ display:'flex', alignItems:'center', gap:8, color:'#10B981', fontSize:13 }}>
                    <CheckCircle size={16}/> No compliance flags identified. Standard onboarding pathway.
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:12, color:'#8fa3bc', marginBottom:10 }}>The following flags require review:</div>
                    {(qs.risk_flags||[]).map((f, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12, color: qs.risk_score === 'High' ? '#EF4444' : '#F59E0B' }}>
                        <AlertTriangle size={12}/> {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* KYC Checklist */}
            {qs?.kyc_checklist?.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><FileText size={14} style={{ display:'inline', marginRight:6 }}/>KYC Document Checklist</div>
                  <span style={{ fontSize:11, color:'#5a7390' }}>{qs.kyc_checklist.length} documents required</span>
                </div>
                {(qs.kyc_checklist||[]).map((item, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:18, height:18, borderRadius:4, border:'1px solid var(--border)', background:'var(--bg-secondary)', flexShrink:0, marginTop:1 }}/>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500 }}>{item.doc}</div>
                      <div style={{ fontSize:11, color:'#5a7390' }}>{item.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* World-check screenings */}
            {client.kyc_checks?.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">World-Check Screenings</div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th><th>PEP</th><th>Sanctions</th><th>Adverse Media</th><th>Risk</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {client.kyc_checks.map((k, i) => (
                        <tr key={i}>
                          <td style={{ fontSize:12 }}>{k.checked_at ? new Date(k.checked_at).toLocaleDateString('en-GB') : '—'}</td>
                          <td><span className={`badge ${k.pep_status==='CLEAR'?'badge-success':k.pep_status==='REVIEW'?'badge-warning':'badge-danger'}`}>{k.pep_status||'—'}</span></td>
                          <td><span className={`badge ${k.sanctions_status==='CLEAR'?'badge-success':k.sanctions_status==='MATCH'?'badge-danger':'badge-warning'}`}>{k.sanctions_status||'—'}</span></td>
                          <td><span className={`badge ${k.adverse_media==='CLEAR'?'badge-success':k.adverse_media==='REVIEW'?'badge-warning':'badge-danger'}`}>{k.adverse_media||'—'}</span></td>
                          <td><span style={{ fontWeight:700, color:riskColor(k.risk_score) }}>{k.risk_score||'—'}</span></td>
                          <td><span className="badge badge-muted">{k.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!qs?.risk_score && !client.kyc_checks?.length && (
              <div className="card">
                <div className="empty-state"><Shield size={40}/><p style={{ marginTop:12 }}>No KYC or risk data yet</p></div>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY LOG TAB ──────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title"><MapPin size={14} style={{ display:'inline',marginRight:6 }}/>Client Activity Log</div>
              <span style={{ fontSize:11,color:'#5a7390' }}>{activityLogs.length} entries</span>
            </div>
            {activityLogs.length === 0 ? (
              <div className="empty-state"><Clock size={36}/><p style={{ marginTop:10,fontSize:13 }}>No activity recorded yet</p></div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
                {activityLogs.map((log, i) => (
                  <div key={log.id} style={{ display:'flex',gap:12,alignItems:'flex-start',padding:'12px 0',borderBottom: i < activityLogs.length-1 ? '1px solid var(--border)' : 'none' }}>
                    <ActivityIcon action={log.action} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8 }}>
                        <span style={{ fontSize:13,color:'var(--text-primary)',fontWeight:500 }}>
                          {log.label || log.action}
                        </span>
                        <span style={{ fontSize:11,color:'#5a7390',whiteSpace:'nowrap',flexShrink:0 }}>
                          {new Date(log.created_at).toLocaleString('en-GB',{ day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' })}
                        </span>
                      </div>
                      <div style={{ display:'flex',gap:6,marginTop:4,alignItems:'center' }}>
                        <span style={{
                          padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:600,
                          background: log.actor_role==='staff' ? 'rgba(245,158,11,0.12)' : log.actor_role==='system' ? 'rgba(143,163,188,0.1)' : 'rgba(139,92,246,0.12)',
                          color: log.actor_role==='staff' ? '#F59E0B' : log.actor_role==='system' ? '#8fa3bc' : '#8B5CF6',
                          textTransform:'capitalize'
                        }}>{log.actor_role || 'system'}</span>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <span style={{ fontSize:11,color:'#5a7390' }}>
                            {log.metadata.party_name && `· ${log.metadata.party_name}`}
                            {log.metadata.party_count && `· ${log.metadata.party_count} parties`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ENTITIES TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'entities' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Entities & Structures ({client.entities?.length || 0})</div>
            </div>
            {!client.entities?.length ? (
              <div className="empty-state"><Building2 size={40}/><p style={{ marginTop:12 }}>No entities on file</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Type</th><th>Status</th></tr></thead>
                  <tbody>
                    {client.entities.map(e => (
                      <tr key={e.id}>
                        <td style={{ fontSize:13, fontWeight:500 }}>{e.name}</td>
                        <td style={{ fontSize:12, color:'#8fa3bc' }}>{e.type}</td>
                        <td><span className={`badge ${e.status==='active'?'badge-success':e.status==='in_progress'?'badge-warning':'badge-muted'} badge-dot`}>{e.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
