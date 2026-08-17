import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import {
  Plus, X, Send, Shield, CheckCircle, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Trash2, Edit2, RefreshCw,
  Users, Key, Upload, FileText, ToggleLeft, ToggleRight, MapPin
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'proposal',     label: 'Proposal',     step: 1 },
  { key: 'intake',       label: 'Intake',       step: 2 },
  { key: 'welcome_sent', label: 'Welcome Sent', step: 3 },
  { key: 'invited',      label: 'Welcome Sent', step: 3 },
  { key: 'kyc_pending',  label: 'KYC Pending',  step: 4 },
  { key: 'kyc_approved', label: 'KYC Approved', step: 5 },
  { key: 'engagement',   label: 'Engagement',   step: 6 },
  { key: 'engaged',      label: 'Engaged',      step: 7 },
  { key: 'active',       label: 'Active Client',step: 8 },
]

const STAGE_TABS = [
  { key: 'all',          label: 'All' },
  { key: 'proposal',     label: 'Proposal' },
  { key: 'intake',       label: 'Intake' },
  { key: 'welcome_sent', label: 'Welcome Sent' },
  { key: 'invited',      label: 'Welcome Sent' },
  { key: 'kyc_pending',  label: 'KYC Pending' },
  { key: 'kyc_approved', label: 'KYC Approved' },
  { key: 'engagement',   label: 'Engagement' },
  { key: 'engaged',      label: 'Engaged' },
  { key: 'active',       label: 'Active Client' },
]

const UNIQUE_TABS = [
  { key: 'all',          label: 'All' },
  { key: 'proposal',     label: 'Proposal' },
  { key: 'intake',       label: 'Intake' },
  { key: 'welcome_sent', label: 'Welcome Sent' },
  { key: 'kyc_pending',  label: 'KYC Pending' },
  { key: 'kyc_approved', label: 'KYC Approved' },
  { key: 'engagement',   label: 'Engagement' },
  { key: 'engaged',      label: 'Engaged' },
  { key: 'active',       label: 'Active Client' },
]

const STEP_LABELS = ['Proposal','Intake','Welcome Sent','KYC Pending','KYC Approved','Engagement','Engaged','Active Client']

const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send'
const SERVICE_ID  = 'service_cj5jbwp'
const TEMPLATE_ID = 'template_generic'
const PUBLIC_KEY  = 'KvpkKpBBnGSjjVq3e'
const PORTAL_URL  = 'https://aurevya-portal.netlify.app'
const SUPABASE_URL = 'https://wxwbfkhvkrwtmsgwdkjy.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d2Jma2h2a3J3dG1zZ3dka2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM5NDAsImV4cCI6MjA5NTg4OTk0MH0.RVFvV3Tu6vgIs3KvPsjOrfdsLaevncysHrirLjAATXM'

const ROLE_COLORS = {
  Director:              { bg:'rgba(59,130,246,0.15)',  color:'#3B82F6' },
  Shareholder:           { bg:'rgba(16,185,129,0.15)',  color:'#10B981' },
  UBO:                   { bg:'rgba(139,92,246,0.15)',  color:'#8B5CF6' },
  'Authorised Signatory':{ bg:'rgba(245,158,11,0.15)', color:'#F59E0B' },
  Secretary:             { bg:'rgba(236,72,153,0.15)',  color:'#EC4899' },
  Protector:             { bg:'rgba(20,184,166,0.15)',  color:'#14B8A6' },
  Trustee:               { bg:'rgba(249,115,22,0.15)',  color:'#F97316' },
}

function stageStep(key) {
  return STAGES.find(s => s.key === key)?.step || 1
}

function stageLabel(key) {
  return STAGES.find(s => s.key === key)?.label || key
}

function RoleTag({ role }) {
  const s = ROLE_COLORS[role] || { bg:'rgba(143,163,188,0.15)', color:'#8fa3bc' }
  return <span style={{ padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:600,background:s.bg,color:s.color,whiteSpace:'nowrap' }}>{role}</span>
}

async function sendEmail(to_email, to_name, subject, message) {
  await fetch(EMAILJS_URL, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ service_id:SERVICE_ID, template_id:TEMPLATE_ID, user_id:PUBLIC_KEY,
      template_params:{ to_email, to_name, subject, message } })
  })
}

// ─── New Client Modal ─────────────────────────────────────────────────────────

function NewClientModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ full_name:'', email:'', company:'', risk_category:'Standard' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  async function create() {
    if (!form.full_name.trim() || !form.email.trim()) { setErr('Name and email are required'); return }
    setSaving(true); setErr(null)
    const { data, error } = await supabase.from('client_onboardings').insert({
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || null,
      risk_category: form.risk_category,
      status: 'proposal',
    }).select().single()
    if (error) { setErr(error.message); setSaving(false); return }
    onCreated(data)
  }

  const inp = (field, placeholder, type='text') => (
    <div style={{ marginBottom:12 }}>
      <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:4 }}>{placeholder}</label>
      <input type={type} value={form[field]} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))} placeholder={placeholder}
        style={{ width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#e2e8f0',fontSize:13 }}/>
    </div>
  )

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'#0f1623',border:'1px solid rgba(255,255,255,0.1)',borderRadius:14,padding:28,maxWidth:420,width:'100%' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <span style={{ fontWeight:700,color:'#e2e8f0',fontSize:16 }}>New Client Intake</span>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'#8fa3bc' }}><X size={16}/></button>
        </div>
        {inp('full_name','Client Name')}
        {inp('email','Email Address','email')}
        {inp('company','Company / Structure Name')}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:4 }}>Risk Category</label>
          <select value={form.risk_category} onChange={e=>setForm(p=>({...p,risk_category:e.target.value}))}
            style={{ width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'#0f1623',color:'#e2e8f0',fontSize:13 }}>
            <option>Standard</option><option>Enhanced</option><option>High Risk</option>
          </select>
        </div>
        {err && <div style={{ color:'#ef4444',fontSize:13,marginBottom:10 }}>{err}</div>}
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={onClose} style={{ flex:1,padding:'9px',borderRadius:7,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',cursor:'pointer',fontSize:13 }}>Cancel</button>
          <button onClick={create} disabled={saving} style={{ flex:2,padding:'9px',borderRadius:7,border:'none',background:'#c9a227',color:'#0a0f1e',fontWeight:700,fontSize:13,cursor:saving?'not-allowed':'pointer',opacity:saving?0.7:1 }}>
            {saving ? 'Creating…' : 'Create Client'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Portal Invite Block ──────────────────────────────────────────────────────

function PortalInviteBlock({ client }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)

  async function sendInvite() {
    setSending(true); setErr(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-portal-invite`, {
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':ANON_KEY,'Authorization':`Bearer ${ANON_KEY}`},
        body: JSON.stringify({ email: client.email }),
      })
      const { link, error: fnErr } = await res.json()
      if (fnErr || !link) throw new Error(fnErr || 'No link returned')

      await sendEmail(
        client.email, client.full_name,
        'Your Aurevya Client Portal Access',
        `Dear ${client.full_name},\n\nYour secure Aurevya client portal is ready. Please click the link below to set your password and access your onboarding portal:\n\n${link}\n\nThis link is valid for 24 hours. If it expires, you can request a new one directly from the login page.\n\nKind regards,\nAurevya Wealth Management`
      )
      setSent(true)
    } catch(e) { setErr(e.message) }
    setSending(false)
  }

  return (
    <div style={{ background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:10,padding:'16px 20px',marginBottom:16 }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:8 }}>
        <span style={{ fontSize:16 }}>🔑</span>
        <div>
          <div style={{ fontWeight:600,color:'#e2e8f0',fontSize:14 }}>Portal Access Invitation</div>
          <div style={{ fontSize:12,color:'#8fa3bc',marginTop:2 }}>Send the client a branded email with a secure link to set their password and log in</div>
        </div>
      </div>
      {sent ? (
        <div style={{ display:'flex',alignItems:'center',gap:8,color:'#10B981',fontSize:13,padding:'8px 0' }}>
          <CheckCircle size={14}/> Invitation sent to {client.email}
        </div>
      ) : (
        <>
          <button onClick={sendInvite} disabled={sending}
            style={{ width:'100%',padding:'10px',borderRadius:8,border:'1px solid rgba(139,92,246,0.4)',background:'rgba(139,92,246,0.15)',color:'#a78bfa',fontWeight:600,fontSize:13,cursor:sending?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:sending?0.7:1 }}>
            <Send size={14}/> {sending ? 'Sending…' : `Send Portal Invitation to ${client.email}`}
          </button>
          <div style={{ fontSize:11,color:'#8fa3bc',marginTop:6,textAlign:'center' }}>
            Generates a secure set-password link · Sent from Aurevya via your email provider · No Supabase branding shown
          </div>
        </>
      )}
      {err && <div style={{ color:'#ef4444',fontSize:12,marginTop:8 }}>{err}</div>}
    </div>
  )
}

// ─── Party Register ───────────────────────────────────────────────────────────

function PartyRegister({ client, onKycReadyChange }) {
  const [parties, setParties]       = useState([])
  const [partyDocs, setPartyDocs]   = useState({})
  const [loadingP, setLoadingP]     = useState(true)
  const [secretaryMode, setSecretaryMode] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm]       = useState({ full_name:'', email:'', roles:[], party_type:'individual' })
  const [adding, setAdding]         = useState(false)
  const [addErr, setAddErr]         = useState(null)
  const [sendingLinks, setSendingLinks] = useState(false)
  const [linksSent, setLinksSent]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting]   = useState(false)

  // delete
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteCode, setDeleteCode]     = useState('')
  const [deleteErr, setDeleteErr]       = useState(null)
  const [deleting, setDeleting]         = useState(false)

  const PARTY_ROLES = ['Director','Shareholder','UBO','Authorised Signatory','Secretary','Protector','Trustee']

  useEffect(() => { if (client?.id) loadParties() }, [client?.id])

  async function loadParties() {
    const { data: ps } = await supabase.from('structure_parties').select('*').eq('onboarding_id', client.id).order('created_at',{ascending:true})
    setParties(ps || [])
    if (ps?.length) {
      const { data: docs } = await supabase.from('kyc_documents').select('*').in('party_id', ps.map(p=>p.id))
      const grouped = {}
      ;(docs||[]).forEach(d => { if(!grouped[d.party_id]) grouped[d.party_id]=[]; grouped[d.party_id].push(d) })
      setPartyDocs(grouped)
      const allDone = ps.every(p => {
        const d = grouped[p.id] || []
        return d.length > 0 && d.every(x => x.status === 'approved')
      })
      onKycReadyChange?.(allDone && ps.length > 0)
    } else {
      onKycReadyChange?.(false)
    }
    setLoadingP(false)
  }

  async function addParty() {
    if (!addForm.full_name.trim()) { setAddErr('Name required'); return }
    if (!addForm.email.trim())     { setAddErr('Email required'); return }
    if (!addForm.roles.length)     { setAddErr('Select at least one role'); return }
    if (parties.find(p=>p.email?.toLowerCase()===addForm.email.toLowerCase())) { setAddErr('Email already exists'); return }
    setAdding(true); setAddErr(null)
    const token = crypto.randomUUID()
    const { data: np } = await supabase.from('structure_parties').insert({
      onboarding_id: client.id, full_name: addForm.full_name.trim(), email: addForm.email.trim(),
      roles: addForm.roles, party_type: addForm.party_type, kyc_upload_token: token, kyc_status:'pending'
    }).select().single()
    if (np) {
      setParties(prev=>[...prev,np])
      setAddForm({ full_name:'',email:'',roles:[],party_type:'individual' })
      setShowAddForm(false)
    }
    setAdding(false)
  }

  async function confirmDelete() {
    if (deleteCode !== 'delete') { setDeleteErr('Type "delete" to confirm'); return }
    setDeleting(true)
    await supabase.from('kyc_documents').delete().eq('party_id',deleteTarget.id)
    await supabase.from('structure_parties').delete().eq('id',deleteTarget.id)
    setParties(prev=>prev.filter(p=>p.id!==deleteTarget.id))
    setDeleteTarget(null); setDeleteCode(''); setDeleting(false)
  }

  async function sendUploadLinks() {
    setSendingLinks(true)
    const toSend = secretaryMode && parties.length > 0 ? [parties[0]] : parties
    for (const party of toSend) {
      const link = `${PORTAL_URL}/kyc-upload-party/${party.kyc_upload_token}`
      let msg
      if (secretaryMode) {
        const partyLines = parties.map(p => {
          const isSh = (p.roles||[]).includes('Shareholder')
          let line = `${p.full_name} (${(p.roles||[]).join(', ')}):\nDocument Upload: ${PORTAL_URL}/kyc-upload-party/${p.kyc_upload_token}`
          if (isSh) line += `\nUBO Declaration Form: ${PORTAL_URL}/ubo-declaration/${p.kyc_upload_token}`
          return line
        }).join('\n\n')
        msg = `Dear ${party.full_name},\n\nPlease find below the KYC upload links for all parties in ${client.full_name}:\n\n${partyLines}\n\nKind regards,\nAurevya Wealth Management`
      } else {
        const isShareholder = (party.roles||[]).includes('Shareholder')
        msg = `Dear ${party.full_name},\n\nPlease upload your KYC documents via the secure link below:\n\n${link}\n\nNo login required.`
        if (isShareholder) {
          msg += `\n\nAs a Shareholder, you are also required to complete the UBO (Ultimate Beneficial Owner) Declaration Form online:\n\n${PORTAL_URL}/ubo-declaration/${party.kyc_upload_token}\n\nThis form must be completed and digitally signed.`
        }
        msg += `\n\nKind regards,\nAurevya Wealth Management`
      }
      await sendEmail(party.email, party.full_name, `KYC Document Upload — ${client.full_name}`, msg)
    }
    setLinksSent(true)
    setSendingLinks(false)
  }

  async function importFromQuestionnaire() {
    setImporting(true)
    const { data: qs } = await supabase.from('questionnaire_submissions').select('persons').eq('client_id',client.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
    if (!qs?.persons?.length) { setImportResult({ added:0, skipped:0, msg:'No persons found in questionnaire' }); setImporting(false); return }
    let added=0, skipped=0
    for (const p of qs.persons) {
      if (!p.email) { skipped++; continue }
      if (parties.find(x=>x.email?.toLowerCase()===p.email.toLowerCase())) { skipped++; continue }
      const token = crypto.randomUUID()
      const { data: np } = await supabase.from('structure_parties').insert({
        onboarding_id: client.id, full_name: p.full_name||'', email: p.email,
        roles: p.roles||[], party_type:'individual', kyc_upload_token:token, kyc_status:'pending'
      }).select().single()
      if (np) { setParties(prev=>[...prev,np]); added++ }
      else skipped++
    }
    setImportResult({ added, skipped })
    setImporting(false)
  }

  const approved = Object.values(partyDocs).reduce((acc,docs)=>acc+(docs.filter(d=>d.status==='approved').length),0)
  const total    = Object.values(partyDocs).reduce((acc,docs)=>acc+docs.length,0)
  const allDone  = parties.length > 0 && parties.every(p=>{const d=partyDocs[p.id]||[]; return d.length>0&&d.every(x=>x.status==='approved')})
  const pending  = parties.filter(p=>!(partyDocs[p.id]||[]).every(d=>d.status==='approved')).length

  return (
    <div style={{ background:'rgba(201,162,39,0.06)',border:'1px solid rgba(201,162,39,0.2)',borderRadius:10,padding:'16px 20px',marginBottom:16 }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <span style={{ fontSize:14 }}>📋</span>
          <span style={{ fontWeight:600,color:'#c9a227',fontSize:14 }}>Structure Parties &amp; KYC Links</span>
        </div>
        <button onClick={loadParties} style={{ background:'none',border:'none',cursor:'pointer',color:'#8fa3bc',padding:4 }} title="Refresh">
          <RefreshCw size={13}/>
        </button>
      </div>

      {/* KYC counter */}
      {parties.length > 0 && (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',background: allDone?'rgba(16,185,129,0.08)':'rgba(245,158,11,0.08)',border:`1px solid ${allDone?'rgba(16,185,129,0.25)':'rgba(245,158,11,0.25)'}`,borderRadius:7,padding:'7px 12px',marginBottom:12 }}>
          <div style={{ display:'flex',alignItems:'center',gap:6 }}>
            {allDone ? <CheckCircle size={13} style={{color:'#10B981'}}/> : <Clock size={13} style={{color:'#F59E0B'}}/>}
            <span style={{ fontSize:12,fontWeight:600,color:allDone?'#10B981':'#F59E0B' }}>
              KYC: {approved} of {parties.length} parties complete
            </span>
          </div>
          {pending > 0 && <span style={{ fontSize:11,color:'#F59E0B' }}>{pending} pending</span>}
        </div>
      )}

      {/* Secretary mode */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:10 }}>
        <div>
          <div style={{ fontSize:13,fontWeight:500,color:'#e2e8f0' }}>Secretary Mode</div>
          <div style={{ fontSize:11,color:'#8fa3bc' }}>Send all KYC upload links in one email to a secretary</div>
        </div>
        <button onClick={()=>setSecretaryMode(p=>!p)} style={{ background:'none',border:'none',cursor:'pointer',color: secretaryMode?'#c9a227':'#8fa3bc' }}>
          {secretaryMode ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}
        </button>
      </div>

      {/* Import result */}
      {importResult && (
        <div style={{ background:'rgba(139,92,246,0.08)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:6,padding:'7px 12px',marginBottom:10,fontSize:12,color:'#a78bfa',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span>{importResult.msg || `Imported ${importResult.added} parties${importResult.skipped?' · '+importResult.skipped+' skipped':''}`}</span>
          <button onClick={()=>setImportResult(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'#8fa3bc' }}><X size={12}/></button>
        </div>
      )}

      {/* Party list */}
      {loadingP ? (
        <div style={{ textAlign:'center',padding:'20px 0',color:'#8fa3bc',fontSize:13 }}>Loading…</div>
      ) : parties.length === 0 ? (
        <div style={{ textAlign:'center',padding:'16px 0',color:'#8fa3bc',fontSize:13 }}>
          No parties added yet. Add directors, shareholders and UBOs below.
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:8,marginBottom:10 }}>
          {parties.map(party => {
            const docs = partyDocs[party.id] || []
            const approvd = docs.filter(d=>d.status==='approved').length
            const pct = docs.length ? Math.round((approvd/docs.length)*100) : 0
            return (
              <div key={party.id} style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'10px 14px' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                  <div style={{ width:32,height:32,borderRadius:'50%',background:'rgba(201,162,39,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#C9A84C',flexShrink:0 }}>
                    {party.full_name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:'#e2e8f0' }}>{party.full_name}</div>
                    <div style={{ fontSize:11,color:'#8fa3bc',marginTop:1 }}>{party.email} · {(party.roles||[]).join(', ')}</div>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:8,flexShrink:0 }}>
                    <span style={{ fontSize:11,color:'#F59E0B',display:'flex',alignItems:'center',gap:3 }}>
                      <Clock size={11}/> {party.kyc_status||'pending'}
                    </span>
                    <button onClick={()=>{setDeleteTarget(party);setDeleteCode('');setDeleteErr(null)}}
                      style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(239,68,68,0.6)',padding:2 }}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>
                {/* Progress */}
                <div style={{ marginTop:8 }}>
                  <div style={{ height:3,borderRadius:2,background:'rgba(255,255,255,0.08)',overflow:'hidden' }}>
                    <div style={{ height:'100%',width:`${pct}%`,background: pct===100?'#10B981':'#c9a227',borderRadius:2,transition:'width 0.3s' }}/>
                  </div>
                  <div style={{ fontSize:10,color:'#8fa3bc',marginTop:3 }}>{docs.length===0?'No documents uploaded yet':`${approvd} / ${docs.length} docs approved`}</div>
                </div>
                <div style={{ marginTop:4,fontSize:11,color:'#10B981' }}>✓ Upload link sent</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add party form */}
      {showAddForm && (
        <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:14,marginBottom:10 }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
            <span style={{ fontWeight:600,color:'#e2e8f0',fontSize:13 }}>Add New Party</span>
            <button onClick={()=>setShowAddForm(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'#8fa3bc' }}><X size={14}/></button>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
            {[['full_name','Full Name'],['email','Email']].map(([f,l])=>(
              <div key={f}>
                <label style={{ display:'block',fontSize:11,color:'#8fa3bc',marginBottom:3 }}>{l}</label>
                <input value={addForm[f]} onChange={e=>setAddForm(p=>({...p,[f]:e.target.value}))} placeholder={l}
                  style={{ width:'100%',padding:'7px 10px',borderRadius:5,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#e2e8f0',fontSize:12 }}/>
              </div>
            ))}
          </div>
          <div style={{ marginBottom:10 }}>
            <label style={{ display:'block',fontSize:11,color:'#8fa3bc',marginBottom:4 }}>Roles</label>
            <div style={{ display:'flex',flexWrap:'wrap',gap:5 }}>
              {PARTY_ROLES.map(r=>{
                const sel = addForm.roles.includes(r)
                const s = ROLE_COLORS[r]||{bg:'rgba(143,163,188,0.15)',color:'#8fa3bc'}
                return (
                  <button key={r} onClick={()=>setAddForm(p=>({...p,roles:sel?p.roles.filter(x=>x!==r):[...p.roles,r]}))}
                    style={{ padding:'3px 9px',borderRadius:4,fontSize:11,fontWeight:600,cursor:'pointer',background:sel?s.bg:'transparent',color:sel?s.color:'#8fa3bc',border:`1px solid ${sel?s.color:'rgba(255,255,255,0.1)'}`}}>
                    {r}
                  </button>
                )
              })}
            </div>
          </div>
          {addErr && <div style={{ color:'#ef4444',fontSize:11,marginBottom:8 }}>{addErr}</div>}
          <button onClick={addParty} disabled={adding} style={{ padding:'7px 18px',borderRadius:6,border:'none',background:'rgba(139,92,246,0.8)',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',opacity:adding?0.7:1 }}>
            {adding?'Adding…':'Add Party'}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' }}>
        <button onClick={()=>setShowAddForm(p=>!p)}
          style={{ padding:'7px 14px',borderRadius:7,border:'1px solid rgba(255,255,255,0.15)',background:'transparent',color:'#e2e8f0',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:5 }}>
          <Plus size={13}/> Add Party
        </button>
        <button onClick={importFromQuestionnaire} disabled={importing}
          style={{ padding:'7px 14px',borderRadius:7,border:'1px solid rgba(139,92,246,0.3)',background:'rgba(139,92,246,0.08)',color:'#8B5CF6',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:5,opacity:importing?0.7:1 }}>
          <Upload size={13}/> {importing?'Importing…':'Import from Questionnaire'}
        </button>
      </div>

      <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
        {parties.length > 0 && !client.structure_confirmed && (
          <button onClick={sendUploadLinks} disabled={sendingLinks||linksSent}
            style={{ flex:1,padding:'9px 14px',borderRadius:7,border:'none',background:linksSent?'rgba(16,185,129,0.2)':sendingLinks?'rgba(201,162,39,0.5)':'#c9a227',color:linksSent?'#10B981':'#0a0f1e',fontSize:12,fontWeight:700,cursor:(sendingLinks||linksSent)?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
            <Send size={13}/>
            {linksSent ? 'Links Sent ✓' : sendingLinks ? 'Sending…' : `Send Individual Upload Links (${parties.length} ${parties.length===1?'party':'parties'})`}
          </button>
        )}
        {client.structure_confirmed && parties.length > 0 && (
          <div style={{ fontSize:12,color:'#10B981',padding:'8px 12px',background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:7,display:'flex',alignItems:'center',gap:6 }}>
            ✓ Client declared structure via portal — KYC links already sent by client
          </div>
        )}
      </div>

      {/* Delete modal */}
      {deleteTarget && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div style={{ background:'#0f1623',border:'1px solid rgba(239,68,68,0.3)',borderRadius:12,padding:24,maxWidth:380,width:'100%' }}>
            <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14 }}>
              <AlertTriangle size={18} style={{color:'#ef4444'}}/><span style={{ fontWeight:700,color:'#e2e8f0' }}>Remove Party</span>
            </div>
            <p style={{ color:'#8fa3bc',fontSize:13,margin:'0 0 14px',lineHeight:1.6 }}>
              Remove <strong style={{color:'#e2e8f0'}}>{deleteTarget.full_name}</strong> and all their KYC documents? This cannot be undone.
            </p>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:5 }}>Type <strong style={{color:'#ef4444'}}>delete</strong> to confirm</label>
              <input value={deleteCode} onChange={e=>{setDeleteCode(e.target.value);setDeleteErr(null)}} placeholder="delete" autoFocus
                style={{ width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#e2e8f0',fontSize:13 }}/>
              {deleteErr && <div style={{ color:'#ef4444',fontSize:12,marginTop:4 }}>{deleteErr}</div>}
            </div>
            <div style={{ display:'flex',gap:8 }}>
              <button onClick={()=>{setDeleteTarget(null);setDeleteCode('')}} style={{ flex:1,padding:'8px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',cursor:'pointer',fontSize:13 }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting||deleteCode!=='delete'}
                style={{ flex:1,padding:'8px',borderRadius:6,border:'none',background:deleteCode==='delete'?'rgba(239,68,68,0.85)':'rgba(239,68,68,0.2)',color:deleteCode==='delete'?'#fff':'#8fa3bc',cursor:deleteCode==='delete'?'pointer':'not-allowed',fontSize:13,fontWeight:600 }}>
                {deleting?'Removing…':'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientOnboarding() {
  const [clients, setClients]           = useState([])
  const [loading, setLoading]           = useState(true)  // only true on initial load
  const [stageFilter, setStageFilter]   = useState('all')
  const [selected, setSelected]         = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [kycReady, setKycReady]         = useState(false)
  const [movingStage, setMovingStage]   = useState(false)
  const [sendingDay3, setSendingDay3]   = useState(false)
  const [day3Sent, setDay3Sent]         = useState(false)

  // delete client
  const [showDelete, setShowDelete]     = useState(false)
  const [deleteCode, setDeleteCode]     = useState('')
  const [deleteErr, setDeleteErr]       = useState(null)
  const [deletingC, setDeletingC]       = useState(false)

  // Load once — NO setInterval
  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    const { data } = await supabase
      .from('client_onboardings')
      .select('*')
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  // Refresh selected client data without touching loading state
  async function refreshSelected(id) {
    const { data } = await supabase.from('client_onboardings').select('*').eq('id', id).single()
    if (data) {
      setSelected(data)
      setClients(prev => prev.map(c => c.id === id ? data : c))
    }
  }

  function selectClient(c) {
    setSelected(c)
    setKycReady(false)
    setDay3Sent(false)
  }

  const stageCounts = UNIQUE_TABS.slice(1).reduce((acc, t) => {
    acc[t.key] = clients.filter(c => c.status === t.key || (t.key === 'welcome_sent' && c.status === 'invited')).length
    return acc
  }, {})

  const filtered = stageFilter === 'all'
    ? clients
    : clients.filter(c => c.status === stageFilter || (stageFilter === 'welcome_sent' && c.status === 'invited'))

  const currentStep = stageStep(selected?.status)

  const NEXT_STAGE = {
    proposal: 'intake', intake: 'welcome_sent', welcome_sent: 'invited',
    invited: 'kyc_pending', kyc_pending: 'kyc_approved', kyc_approved: 'engagement',
    engagement: 'engaged', engaged: 'active'
  }

  const NEXT_LABEL = {
    proposal: 'Move to Intake', intake: 'Move to Welcome Sent',
    welcome_sent: 'Move to KYC Pending', invited: 'Move to KYC Pending',
    kyc_pending: 'Approve KYC', kyc_approved: 'Move to Engagement',
    engagement: 'Mark as Engaged', engaged: 'Mark as Active Client'
  }

  const STATUS_HINTS = {
    proposal:     'New proposal. Complete intake and send the welcome email to proceed.',
    intake:       'Intake in progress. Send welcome email when ready.',
    welcome_sent: 'Welcome sent. Send the portal invitation so the client can log in and declare their structure.',
    invited:      'Welcome sent. Send the portal invitation so the client can log in and declare their structure.',
    kyc_pending:  'KYC documents are being collected. Review and approve once all parties have submitted.',
    kyc_approved: 'KYC approved. Prepare the engagement letter.',
    engagement:   'Engagement letter stage. Send and await client signature.',
    engaged:      'Client is engaged. Complete onboarding to mark as active.',
    active:       'Client is fully onboarded and active.',
  }

  async function sendKycApprovalNotification(client) {
    const name    = client.full_name || client.company || 'Valued Client'
    const company = client.company ? ` — ${client.company}` : ''
    await sendEmail(
      client.email, name,
      `KYC Approved — Engagement Letter Coming${company}`,
      `Dear ${name},\n\nWe are pleased to inform you that your KYC documentation has been reviewed and approved by our compliance team.\n\nAs the next step in your onboarding, we will be preparing your personalised Engagement Letter and will send it to you shortly for review and digital signature.\n\nIf you have any questions in the meantime, please do not hesitate to reach out to your dedicated advisor.\n\nWarm regards,\nAurevya Wealth Management`
    )
  }

  async function moveToNextStage() {
    const next = NEXT_STAGE[selected.status]
    if (!next) return
    if (selected.status === 'kyc_pending' && !kycReady) {
      if (!window.confirm('Not all KYC documents are approved. Approve KYC anyway?')) return
    }
    setMovingStage(true)
    await supabase.from('client_onboardings').update({ status: next }).eq('id', selected.id)
    // Auto-send KYC Approval Notification when approving KYC
    if (selected.status === 'kyc_pending' && next === 'kyc_approved' && selected.email) {
      await sendKycApprovalNotification(selected)
    }
    await refreshSelected(selected.id)
    setMovingStage(false)
  }

  async function sendDay3Email() {
    setSendingDay3(true)
    await sendEmail(
      selected.email, selected.full_name,
      `KYC Document Request — ${selected.full_name || selected.company}`,
      `Dear ${selected.full_name},\n\nAs part of your onboarding with Aurevya Wealth Management, we kindly request that you arrange for the following KYC documents to be submitted:\n\n• Certified copy of passport\n• Proof of residential address (utility bill or bank statement, dated within 3 months)\n• Source of funds documentation\n• Any additional documents as requested by your advisor\n\nYour dedicated advisor will follow up shortly with a personalised document checklist.\n\nKind regards,\nAurevya Wealth Management`
    )
    setDay3Sent(true)
    setSendingDay3(false)
  }

  async function deleteClient() {
    if (deleteCode !== 'delete') { setDeleteErr('Type "delete" to confirm'); return }
    setDeletingC(true)
    // Cascade delete
    const { data: parties } = await supabase.from('structure_parties').select('id').eq('onboarding_id', selected.id)
    for (const p of (parties||[])) await supabase.from('kyc_documents').delete().eq('party_id', p.id)
    await supabase.from('kyc_documents').delete().eq('client_id', selected.id)
    await supabase.from('structure_parties').delete().eq('onboarding_id', selected.id)
    await supabase.from('questionnaire_submissions').delete().eq('client_id', selected.id)
    await supabase.from('engagement_letters').delete().eq('client_id', selected.id)
    await supabase.from('client_activity_logs').delete().eq('client_id', selected.id)
    await supabase.from('client_onboardings').delete().eq('id', selected.id)
    setClients(prev => prev.filter(c => c.id !== selected.id))
    setSelected(null)
    setShowDelete(false)
    setDeletingC(false)
  }

  const initials = (name) => (name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#8fa3bc' }}>
      <div className="spinner" style={{ width:32,height:32 }}></div>
    </div>
  )

  return (
    <div style={{ display:'flex',height:'100vh',overflow:'hidden',fontFamily:'inherit' }}>

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
      <div style={{ width:280,borderRight:'1px solid rgba(255,255,255,0.07)',display:'flex',flexDirection:'column',flexShrink:0 }}>
        {/* Header */}
        <div style={{ padding:'16px 16px 10px',borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
            <span style={{ fontWeight:700,color:'#e2e8f0',fontSize:15 }}>Client Onboarding</span>
            <button onClick={() => setShowNewModal(true)}
              style={{ padding:'5px 10px',borderRadius:6,border:'none',background:'#c9a227',color:'#0a0f1e',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={11}/> New Client Intake
            </button>
          </div>
          {/* Stage filter tabs */}
          <div style={{ display:'flex',flexWrap:'wrap',gap:4 }}>
            {UNIQUE_TABS.map(t => (
              <button key={t.key} onClick={()=>setStageFilter(t.key)}
                style={{ padding:'3px 8px',borderRadius:12,fontSize:10,fontWeight:600,cursor:'pointer',border:'1px solid',
                  borderColor: stageFilter===t.key ? '#c9a227' : 'rgba(255,255,255,0.1)',
                  background: stageFilter===t.key ? 'rgba(201,162,39,0.15)' : 'transparent',
                  color: stageFilter===t.key ? '#c9a227' : '#8fa3bc'
                }}>
                {t.label}{t.key!=='all'&&stageCounts[t.key]>0?` (${stageCounts[t.key]})`:''}
              </button>
            ))}
          </div>
        </div>

        {/* Client list */}
        <div style={{ flex:1,overflowY:'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding:24,textAlign:'center',color:'#8fa3bc',fontSize:13 }}>No clients in this stage</div>
          ) : (
            filtered.map(c => (
              <div key={c.id} onClick={()=>selectClient(c)}
                style={{ padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.05)',
                  background: selected?.id===c.id ? 'rgba(201,162,39,0.08)' : 'transparent',
                  borderLeft: selected?.id===c.id ? '2px solid #c9a227' : '2px solid transparent'
                }}>
                <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                  <div style={{ width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,rgba(201,162,39,0.5),#c9a227)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#0a0f1e',flexShrink:0 }}>
                    {initials(c.full_name)}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{c.full_name}</div>
                    <div style={{ fontSize:11,color:'#8fa3bc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{c.company||c.email}</div>
                  </div>
                  <span style={{ fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:10,background:'rgba(201,162,39,0.15)',color:'#c9a227',whiteSpace:'nowrap',flexShrink:0 }}>
                    {stageLabel(c.status)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      {!selected ? (
        <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#8fa3bc',flexDirection:'column',gap:12 }}>
          <Users size={40} style={{ opacity:0.3 }}/>
          <div style={{ fontSize:14 }}>Select a client to view their onboarding</div>
          <button onClick={()=>setShowNewModal(true)}
            style={{ marginTop:8,padding:'8px 20px',borderRadius:8,border:'none',background:'#c9a227',color:'#0a0f1e',fontWeight:700,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:6 }}>
            <Plus size={14}/> New Client Intake
          </button>
        </div>
      ) : (
        <div style={{ flex:1,overflowY:'auto',display:'flex',flexDirection:'column' }}>
          {/* Client header */}
          <div style={{ padding:'14px 24px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,background:'#0a0f1e',zIndex:10 }}>
            <div style={{ width:42,height:42,borderRadius:'50%',background:'linear-gradient(135deg,rgba(201,162,39,0.5),#c9a227)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#0a0f1e',flexShrink:0 }}>
              {initials(selected.full_name)}
            </div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:16,fontWeight:700,color:'#e2e8f0' }}>{selected.full_name}</div>
              <div style={{ fontSize:12,color:'#8fa3bc' }}>{selected.email} · {selected.company||'—'}</div>
            </div>
            {/* Nav buttons */}
            <div style={{ display:'flex',gap:6,alignItems:'center' }}>
              <a href={`/admin/clients/${selected.id}`}
                style={{ padding:'5px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',fontSize:11,cursor:'pointer',textDecoration:'none',display:'flex',alignItems:'center',gap:4 }}>
                →Journey
              </a>
              <button style={{ padding:'5px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',fontSize:11,cursor:'pointer' }}>KYC</button>
              <button style={{ padding:'5px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',fontSize:11,cursor:'pointer' }}>Questionnaire</button>
              <button style={{ padding:'5px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',fontSize:11,cursor:'pointer' }}>Compliance</button>
              <button onClick={()=>{setShowDelete(true);setDeleteCode('');setDeleteErr(null)}}
                style={{ padding:'5px 10px',borderRadius:6,border:'1px solid rgba(239,68,68,0.3)',background:'transparent',color:'#ef4444',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
                <Trash2 size={11}/> Delete
              </button>
              <button onClick={()=>setSelected(null)}
                style={{ width:26,height:26,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <X size={13}/>
              </button>
            </div>
          </div>

          {/* Stage progress */}
          <div style={{ padding:'16px 24px 0' }}>
            <div style={{ display:'flex',alignItems:'center',gap:0,marginBottom:16 }}>
              {STEP_LABELS.map((label,i) => {
                const step = i+1
                const done = step < currentStep
                const active = step === currentStep
                return (
                  <div key={i} style={{ display:'flex',alignItems:'center',flex: i<STEP_LABELS.length-1?1:'auto' }}>
                    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:4 }}>
                      <div style={{ width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,
                        background: done?'#c9a227':active?'rgba(201,162,39,0.3)':'rgba(255,255,255,0.06)',
                        color: done?'#0a0f1e':active?'#c9a227':'#8fa3bc',
                        border: active?'2px solid #c9a227':'2px solid transparent'
                      }}>
                        {done ? <CheckCircle size={14} style={{color:'#0a0f1e'}}/> : step}
                      </div>
                      <span style={{ fontSize:9,color:active?'#c9a227':done?'#8fa3bc':'#5a7390',whiteSpace:'nowrap',fontWeight:active?600:400 }}>{label}</span>
                    </div>
                    {i < STEP_LABELS.length-1 && (
                      <div style={{ flex:1,height:2,background:done?'#c9a227':'rgba(255,255,255,0.06)',margin:'0 4px',marginBottom:16 }}/>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Status hint */}
            {STATUS_HINTS[selected.status] && (
              <div style={{ background:'rgba(59,130,246,0.08)',border:'1px solid rgba(59,130,246,0.2)',borderRadius:8,padding:'10px 16px',marginBottom:16,fontSize:13,color:'#93c5fd' }}>
                {STATUS_HINTS[selected.status]}
              </div>
            )}
          </div>

          {/* Action blocks */}
          <div style={{ padding:'0 24px',flex:1 }}>
            {/* Portal Invite */}
            {(selected.status === 'welcome_sent' || selected.status === 'invited') && (
              <PortalInviteBlock client={selected} />
            )}

            {/* Party Register */}
            {(selected.status === 'welcome_sent' || selected.status === 'invited' ||
              selected.status === 'kyc_pending' || selected.status === 'kyc_approved') && (
              <PartyRegister client={selected} onKycReadyChange={setKycReady} />
            )}

            {/* Day 3 KYC email */}
            <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'14px 18px',marginBottom:16 }}>
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
                <span style={{ fontSize:14 }}>📄</span>
                <div>
                  <div style={{ fontWeight:600,color:'#e2e8f0',fontSize:13 }}>Day 3 — KYC Document Request (General Email)</div>
                  <div style={{ fontSize:11,color:'#8fa3bc',marginTop:2 }}>Optional: send a general KYC reminder to the main contact</div>
                </div>
              </div>
              <button onClick={sendDay3Email} disabled={sendingDay3||day3Sent}
                style={{ width:'100%',padding:'10px',borderRadius:8,border:'none',background:day3Sent?'rgba(16,185,129,0.15)':'#c9a227',color:day3Sent?'#10B981':'#0a0f1e',fontWeight:700,fontSize:13,cursor:(sendingDay3||day3Sent)?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
                {day3Sent ? '✓ Email Sent' : sendingDay3 ? 'Sending…' : '✨ Generate with Aurevya AI'}
              </button>
            </div>

            {/* Move stage button */}
            {selected.status !== 'active' && NEXT_LABEL[selected.status] && (
              <div style={{ marginBottom:24 }}>
                <button onClick={moveToNextStage} disabled={movingStage}
                  style={{ width:'100%',padding:'12px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#e2e8f0',fontWeight:600,fontSize:13,cursor:movingStage?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,opacity:movingStage?0.7:1 }}>
                  → {movingStage?'Moving…':NEXT_LABEL[selected.status]}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {showNewModal && (
        <NewClientModal onClose={()=>setShowNewModal(false)} onCreated={c=>{
          setClients(prev=>[c,...prev]); setSelected(c); setShowNewModal(false)
        }}/>
      )}

      {showDelete && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div style={{ background:'#0f1623',border:'1px solid rgba(239,68,68,0.3)',borderRadius:14,padding:28,maxWidth:420,width:'100%' }}>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
              <AlertTriangle size={20} style={{color:'#ef4444'}}/><span style={{ fontWeight:700,color:'#e2e8f0',fontSize:16 }}>Delete Client</span>
            </div>
            <p style={{ color:'#8fa3bc',fontSize:13,margin:'0 0 16px',lineHeight:1.6 }}>
              Permanently delete <strong style={{color:'#e2e8f0'}}>{selected?.full_name}</strong> and all associated data including parties, KYC documents, questionnaire responses, and engagement letters. This cannot be undone.
            </p>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:6 }}>Type <strong style={{color:'#ef4444'}}>delete</strong> to confirm</label>
              <input value={deleteCode} onChange={e=>{setDeleteCode(e.target.value);setDeleteErr(null)}} placeholder="delete" autoFocus
                style={{ width:'100%',padding:'9px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#e2e8f0',fontSize:13 }}/>
              {deleteErr && <div style={{ color:'#ef4444',fontSize:12,marginTop:4 }}>{deleteErr}</div>}
            </div>
            <div style={{ display:'flex',gap:10 }}>
              <button onClick={()=>setShowDelete(false)} style={{ flex:1,padding:'9px',borderRadius:7,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',cursor:'pointer',fontSize:13 }}>Cancel</button>
              <button onClick={deleteClient} disabled={deletingC||deleteCode!=='delete'}
                style={{ flex:1,padding:'9px',borderRadius:7,border:'none',background:deleteCode==='delete'?'rgba(239,68,68,0.85)':'rgba(239,68,68,0.2)',color:deleteCode==='delete'?'#fff':'#8fa3bc',cursor:deleteCode==='delete'?'pointer':'not-allowed',fontSize:13,fontWeight:600 }}>
                {deletingC?'Deleting...':'Delete Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
