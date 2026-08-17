import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import {
  Users, Plus, Trash2, Send, Lock, Edit2,
  CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  ClipboardList, ArrowRight, X, Eye, EyeOff
} from 'lucide-react'

const ROLES = ['Director', 'Shareholder', 'UBO', 'Authorised Signatory', 'Secretary', 'Protector', 'Trustee']
const ROLE_COLORS = {
  Director:             { bg: 'rgba(59,130,246,0.15)',  color: '#3B82F6' },
  Shareholder:          { bg: 'rgba(16,185,129,0.15)',  color: '#10B981' },
  UBO:                  { bg: 'rgba(139,92,246,0.15)',  color: '#8B5CF6' },
  'Authorised Signatory':{ bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  Secretary:            { bg: 'rgba(236,72,153,0.15)',  color: '#EC4899' },
  Protector:            { bg: 'rgba(20,184,166,0.15)',  color: '#14B8A6' },
  Trustee:              { bg: 'rgba(249,115,22,0.15)',  color: '#F97316' },
}

function RoleTag({ role }) {
  const s = ROLE_COLORS[role] || { bg: 'rgba(143,163,188,0.15)', color: '#8fa3bc' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, whiteSpace: 'nowrap'
    }}>{role}</span>
  )
}

async function logActivity(clientId, actorId, actorRole, action, label, metadata = {}) {
  await supabase.from('client_activity_logs').insert({
    client_id: clientId,
    actor_id: actorId,
    actor_role: actorRole,
    action,
    label,
    metadata,
  })
}

export default function StructureDeclaration() {
  const { user } = useAuth()

  // onboarding record
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // parties
  const [parties, setParties] = useState([])

  // add form
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ full_name: '', email: '', roles: [], party_type: 'individual' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

  // delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // confirm
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(null)

  // edit mode
  const [editMode, setEditMode] = useState(false)
  const [editRequesting, setEditRequesting] = useState(false)

  // KYC docs for locked view
  const [partyDocs, setPartyDocs] = useState({})
  const [expandedParties, setExpandedParties] = useState({})

  // ── Load onboarding record ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    loadRecord()
  }, [user])

  async function loadRecord() {
    setLoading(true)
    setError(null)
    // Try by user_id first
    let { data, error: err } = await supabase
      .from('client_onboardings')
      .select('id, full_name, structure_confirmed, structure_confirmed_at, status, email')
      .eq('user_id', user.id)
      .maybeSingle()

    // Fallback: by email
    if (!data && user.email) {
      const { data: d2 } = await supabase
        .from('client_onboardings')
        .select('id, full_name, structure_confirmed, structure_confirmed_at, status, email')
        .eq('email', user.email)
        .maybeSingle()
      if (d2) {
        data = d2
        // Link user_id
        await supabase.from('client_onboardings').update({ user_id: user.id }).eq('id', d2.id)
      }
    }

    if (!data) {
      setError('No onboarding record found. Please contact your advisor.')
      setLoading(false)
      return
    }

    setClient(data)
    await loadParties(data.id)
    setLoading(false)
  }

  async function loadParties(clientId) {
    const { data } = await supabase
      .from('structure_parties')
      .select('*')
      .eq('onboarding_id', clientId)
      .order('created_at', { ascending: true })
    setParties(data || [])
    // Load KYC docs per party
    if (data && data.length > 0) {
      const ids = data.map(p => p.id)
      const { data: docs } = await supabase
        .from('kyc_documents')
        .select('*')
        .in('party_id', ids)
      const grouped = {}
      ;(docs || []).forEach(d => {
        if (!grouped[d.party_id]) grouped[d.party_id] = []
        grouped[d.party_id].push(d)
      })
      setPartyDocs(grouped)
    }
  }

  // ── Add party ────────────────────────────────────────────────────────────────
  async function addParty() {
    if (!formData.full_name.trim()) { setAddError('Name is required'); return }
    if (!formData.email.trim()) { setAddError('Email is required'); return }
    if (formData.roles.length === 0) { setAddError('Select at least one role'); return }
    setAdding(true)
    setAddError(null)

    // Check duplicate
    const existing = parties.find(p => p.email?.toLowerCase() === formData.email.toLowerCase())
    if (existing) { setAddError('A party with this email already exists'); setAdding(false); return }

    const token = crypto.randomUUID()
    const { data: newParty, error: insertErr } = await supabase
      .from('structure_parties')
      .insert({
        onboarding_id: client.id,
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        roles: formData.roles,
        party_type: formData.party_type,
        kyc_upload_token: token,
        kyc_status: 'pending',
      })
      .select()
      .single()

    if (insertErr) { setAddError(insertErr.message); setAdding(false); return }

    await logActivity(client.id, user.id, 'client', 'party_added',
      `Added ${formData.full_name.trim()} (${formData.roles.join(', ')})`,
      { party_id: newParty.id, party_name: formData.full_name.trim(), roles: formData.roles })

    setParties(prev => [...prev, newParty])
    setFormData({ full_name: '', email: '', roles: [], party_type: 'individual' })
    setShowForm(false)
    setAdding(false)
  }

  // ── Delete party ─────────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (deleteCode !== 'delete') { setDeleteError('Type "delete" to confirm'); return }
    setDeleting(true)
    setDeleteError(null)

    // Delete KYC docs first
    await supabase.from('kyc_documents').delete().eq('party_id', deleteTarget.id)
    const { error: delErr } = await supabase.from('structure_parties').delete().eq('id', deleteTarget.id)
    if (delErr) { setDeleteError(delErr.message); setDeleting(false); return }

    await logActivity(client.id, user.id, 'client', 'party_deleted',
      `Removed ${deleteTarget.full_name} (${(deleteTarget.roles || []).join(', ')})`,
      { party_name: deleteTarget.full_name, roles: deleteTarget.roles })

    setParties(prev => prev.filter(p => p.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleteCode('')
    setDeleting(false)
  }

  // ── Confirm structure ────────────────────────────────────────────────────────
  async function confirmStructure() {
    if (parties.length === 0) { setConfirmError('Add at least one party before confirming.'); return }
    setConfirming(true)
    setConfirmError(null)

    // Send KYC link email to each party
    const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send'
    const SERVICE_ID = 'service_cj5jbwp'
    const TEMPLATE_ID = 'template_generic'
    const PUBLIC_KEY = 'KvpkKpBBnGSjjVq3e'
    const PORTAL_URL = 'https://aurevya-portal.netlify.app'

    for (const party of parties) {
      const kycLink = `${PORTAL_URL}/kyc-upload-party/${party.kyc_upload_token}`
      const emailBody = `Dear ${party.full_name},\n\nAs part of the onboarding process for ${client.full_name}, you have been identified as a ${(party.roles || []).join(' / ')}.\n\nPlease complete your KYC (Know Your Customer) verification by uploading the required documents through your secure personal link below:\n\n${kycLink}\n\nThis link is unique to you and does not require a login. If you have any questions, please contact your Aurevya advisor.\n\nKind regards,\nAurevya Wealth Management`
      try {
        await fetch(EMAILJS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: SERVICE_ID,
            template_id: TEMPLATE_ID,
            user_id: PUBLIC_KEY,
            template_params: {
              to_email: party.email,
              to_name: party.full_name,
              subject: `KYC Document Upload — ${client.full_name}`,
              message: emailBody,
            }
          })
        })
      } catch (_) {}
    }

    // Update DB
    await supabase.from('client_onboardings').update({
      structure_confirmed: true,
      structure_confirmed_at: new Date().toISOString(),
    }).eq('id', client.id)

    await logActivity(client.id, user.id, 'client', 'structure_confirmed',
      `Structure confirmed — KYC links sent to ${parties.length} ${parties.length === 1 ? 'party' : 'parties'}`,
      { party_count: parties.length })

    setClient(prev => ({ ...prev, structure_confirmed: true, structure_confirmed_at: new Date().toISOString() }))
    setEditMode(false)
    setConfirming(false)
  }

  // ── Request edit ─────────────────────────────────────────────────────────────
  async function requestEdit() {
    setEditRequesting(true)
    await logActivity(client.id, user.id, 'client', 'structure_edit_requested',
      'Client requested to edit structure declaration',
      {})
    setEditMode(true)
    setEditRequesting(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#8fa3bc' }}>
      <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }}></div>
      Loading…
    </div>
  )

  if (error) return (
    <div style={{ padding: 40 }}>
      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '16px 20px', color: '#ef4444' }}>
        {error}
      </div>
    </div>
  )

  const isLocked = client.structure_confirmed && !editMode

  return (
    <div style={{ padding: '32px 40px', maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Structure Declaration</h1>
        <p style={{ color: '#8fa3bc', marginTop: 6, fontSize: 14 }}>
          Declare the directors, shareholders and beneficial owners of your structure
        </p>
      </div>

      {/* ── Questionnaire guidance banner ─────────────────────────────────────── */}
      <div style={{
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: 10, padding: '14px 20px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-start'
      }}>
        <ClipboardList size={20} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontWeight: 600, color: '#F59E0B', fontSize: 13, marginBottom: 4 }}>
            Complete your Questionnaire first
          </div>
          <div style={{ color: '#c6a84b', fontSize: 13, lineHeight: 1.5 }}>
            Before declaring your structure, make sure you have submitted the <strong>Pre-Onboarding Questionnaire</strong> (Step 1 in your onboarding journey). The questionnaire captures your company details, source of funds, and background — this page is Step 2, where you declare who is involved in the structure.
          </div>
          <a href="/portal/questionnaire" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
            color: '#F59E0B', fontSize: 12, fontWeight: 600, textDecoration: 'none'
          }}>
            Go to Questionnaire <ArrowRight size={12} />
          </a>
        </div>
      </div>

      {/* ── Who needs to be declared ──────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
        borderRadius: 10, padding: '14px 20px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-start'
      }}>
        <Users size={20} style={{ color: '#8B5CF6', flexShrink: 0, marginTop: 1 }} />
        <div style={{ color: '#b8b0e0', fontSize: 13, lineHeight: 1.6 }}>
          Add every <strong style={{ color: '#e2e8f0' }}>Director</strong>, <strong style={{ color: '#e2e8f0' }}>Shareholder</strong>, and <strong style={{ color: '#e2e8f0' }}>Ultimate Beneficial Owner (UBO)</strong> of your structure. Each person will receive their own secure KYC upload link by email — they do not need to log in. Once you confirm, the links are sent automatically.
        </div>
      </div>

      {/* ── Locked banner ─────────────────────────────────────────────────────── */}
      {client.structure_confirmed && (
        <div style={{
          background: editMode ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
          border: `1px solid ${editMode ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}`,
          borderRadius: 10, padding: '12px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {editMode
              ? <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
              : <CheckCircle size={16} style={{ color: '#10B981' }} />}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: editMode ? '#F59E0B' : '#10B981' }}>
                {editMode ? 'Edit Mode — Changes will re-send KYC links' : 'Structure confirmed'}
              </div>
              <div style={{ fontSize: 12, color: '#8fa3bc', marginTop: 2 }}>
                {editMode
                  ? 'You are currently editing. Confirm again to re-send KYC links to all parties.'
                  : `Confirmed on ${new Date(client.structure_confirmed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · KYC links sent to ${parties.length} ${parties.length === 1 ? 'party' : 'parties'}`}
              </div>
            </div>
          </div>
          {!editMode && (
            <button
              onClick={requestEdit}
              disabled={editRequesting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
                border: '1px solid rgba(245,158,11,0.3)'
              }}>
              <Edit2 size={12} /> {editRequesting ? 'Opening…' : 'Edit Structure'}
            </button>
          )}
        </div>
      )}

      {/* ── Parties list ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 16 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 15 }}>
            Parties Added ({parties.length})
          </span>
          {isLocked && <Lock size={14} style={{ color: '#8fa3bc' }} />}
        </div>

        {parties.length === 0 ? (
          <div style={{ padding: '28px 20px', textAlign: 'center', color: '#8fa3bc', fontSize: 13 }}>
            No parties added yet. Click below to add a director, shareholder, or UBO.
          </div>
        ) : (
          <div>
            {parties.map((party, i) => {
              const docs = partyDocs[party.id] || []
              const approved = docs.filter(d => d.status === 'approved').length
              const expanded = expandedParties[party.id]
              return (
                <div key={party.id} style={{ borderBottom: i < parties.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#8B5CF6', fontWeight: 700, fontSize: 13
                    }}>
                      {party.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{party.full_name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {(party.roles || []).map(r => <RoleTag key={r} role={r} />)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isLocked && (
                        <button
                          onClick={() => setExpandedParties(prev => ({ ...prev, [party.id]: !prev[party.id] }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8fa3bc', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                          KYC {docs.length > 0 ? `${approved}/${docs.length}` : ''}
                        </button>
                      )}
                      {!isLocked && (
                        <button
                          onClick={() => { setDeleteTarget(party); setDeleteCode(''); setDeleteError(null) }}
                          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <Trash2 size={12}/> Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* KYC doc tracker (locked view) */}
                  {isLocked && expanded && (
                    <div style={{ paddingLeft: 68, paddingRight: 20, paddingBottom: 14 }}>
                      {docs.length === 0 ? (
                        <div style={{ color: '#8fa3bc', fontSize: 12 }}>No documents uploaded yet. KYC link has been sent to {party.email}.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {docs.map(doc => (
                            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                              <span style={{
                                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                background: doc.status === 'approved' ? '#10B981' : doc.status === 'rejected' ? '#ef4444' : '#F59E0B'
                              }}></span>
                              <span style={{ color: '#c8d8e8' }}>{doc.document_type || doc.file_name}</span>
                              <span style={{ color: '#8fa3bc', marginLeft: 'auto', textTransform: 'capitalize' }}>{doc.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Add party button / form ──────────────────────────────────────────── */}
      {!isLocked && (
        <>
          {!showForm ? (
            <button
              onClick={() => { setShowForm(true); setAddError(null) }}
              style={{
                width: '100%', padding: '12px', borderRadius: 8, marginBottom: 20,
                border: '1px dashed rgba(255,255,255,0.15)', background: 'transparent',
                color: '#8fa3bc', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
              }}>
              <Plus size={16}/> Add Director / Shareholder / UBO
            </button>
          ) : (
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: 20, marginBottom: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>Add New Party</span>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8fa3bc' }}><X size={16}/></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#8fa3bc', marginBottom: 4 }}>Full Name *</label>
                  <input
                    value={formData.full_name}
                    onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Jean Pierre Dupont"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#8fa3bc', marginBottom: 4 }}>Email Address *</label>
                  <input
                    value={formData.email}
                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                    placeholder="jean@example.com"
                    type="email"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13 }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#8fa3bc', marginBottom: 6 }}>Roles * (select all that apply)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ROLES.map(r => {
                    const selected = formData.roles.includes(r)
                    const s = ROLE_COLORS[r] || { bg: 'rgba(143,163,188,0.15)', color: '#8fa3bc' }
                    return (
                      <button
                        key={r}
                        onClick={() => setFormData(p => ({
                          ...p,
                          roles: selected ? p.roles.filter(x => x !== r) : [...p.roles, r]
                        }))}
                        style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          background: selected ? s.bg : 'transparent',
                          color: selected ? s.color : '#8fa3bc',
                          border: `1px solid ${selected ? s.color : 'rgba(255,255,255,0.1)'}`,
                        }}>
                        {r}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#8fa3bc', marginBottom: 4 }}>Party Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['individual', 'corporate'].map(t => (
                    <button
                      key={t}
                      onClick={() => setFormData(p => ({ ...p, party_type: t }))}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
                        background: formData.party_type === t ? 'rgba(139,92,246,0.15)' : 'transparent',
                        color: formData.party_type === t ? '#8B5CF6' : '#8fa3bc',
                        border: `1px solid ${formData.party_type === t ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      }}>{t}</button>
                  ))}
                </div>
              </div>
              {addError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{addError}</div>}
              <button
                onClick={addParty}
                disabled={adding}
                style={{
                  padding: '8px 20px', borderRadius: 6, border: 'none', cursor: adding ? 'not-allowed' : 'pointer',
                  background: 'rgba(139,92,246,0.8)', color: '#fff', fontSize: 13, fontWeight: 600
                }}>
                {adding ? 'Adding…' : 'Add Party'}
              </button>
            </div>
          )}

          {/* Confirm button */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 24
          }}>
            <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>
              {client.structure_confirmed ? 'Re-confirm structure?' : 'Ready to confirm?'}
            </div>
            <p style={{ fontSize: 13, color: '#8fa3bc', margin: '0 0 16px' }}>
              Once you click <strong style={{ color: '#e2e8f0' }}>Confirm &amp; Send KYC Links</strong>, each party above will immediately receive a personalised email with their secure KYC upload link. The list will be locked — contact your advisor if changes are needed after this point.
            </p>
            {confirmError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{confirmError}</div>}
            <button
              onClick={confirmStructure}
              disabled={confirming || parties.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 24px', borderRadius: 8, border: 'none',
                cursor: confirming || parties.length === 0 ? 'not-allowed' : 'pointer',
                background: parties.length === 0 ? 'rgba(255,255,255,0.05)' : '#c9a227',
                color: parties.length === 0 ? '#8fa3bc' : '#0a0f1e',
                fontWeight: 700, fontSize: 14,
                opacity: confirming ? 0.7 : 1,
              }}>
              <Send size={15}/>
              {confirming ? 'Sending…' : `Confirm Structure & Send KYC Links (${parties.length} ${parties.length === 1 ? 'party' : 'parties'})`}
            </button>
            <div style={{ fontSize: 11, color: '#8fa3bc', marginTop: 8 }}>
              Each party receives their own link — they upload independently, no login required.
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirmation modal ────────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: '#0f1623', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 14, padding: 28, maxWidth: 420, width: '100%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <AlertTriangle size={20} style={{ color: '#ef4444' }} />
              <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 16 }}>Remove Party</span>
            </div>
            <p style={{ color: '#8fa3bc', fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
              You are about to remove <strong style={{ color: '#e2e8f0' }}>{deleteTarget.full_name}</strong> from the structure.
              This will also delete any uploaded KYC documents for this person. This action cannot be undone.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#8fa3bc', marginBottom: 6 }}>
                Type <strong style={{ color: '#ef4444' }}>delete</strong> to confirm
              </label>
              <input
                value={deleteCode}
                onChange={e => { setDeleteCode(e.target.value); setDeleteError(null) }}
                placeholder="delete"
                autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${deleteError ? '#ef4444' : 'rgba(255,255,255,0.1)'}`, background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13 }}
              />
              {deleteError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{deleteError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteCode(''); setDeleteError(null) }}
                style={{ flex: 1, padding: '9px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8fa3bc', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting || deleteCode !== 'delete'}
                style={{
                  flex: 1, padding: '9px', borderRadius: 7, border: 'none',
                  background: deleteCode === 'delete' ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.2)',
                  color: deleteCode === 'delete' ? '#fff' : '#8fa3bc',
                  cursor: deleteCode === 'delete' ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600
                }}>
                {deleting ? 'Removing…' : 'Remove Party'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
