import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import {
  ClipboardList, ChevronRight, ChevronLeft, Check,
  Plus, Trash2, AlertTriangle, Shield, FileText, Download
} from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: 'authorised_company', label: 'Authorised Company' },
  { value: 'global_business_company', label: 'Global Business Company (GBC)' },
  { value: 'trust', label: 'Trust' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'domestic', label: 'Domestic Company' },
  { value: 'other', label: 'Other' },
]

const ROLES = ['UBO', 'Shareholder', 'Director', 'Secretary']

const COMPLIANCE_QUESTIONS = [
  { key: 'name_change', label: 'Have you ever changed your name?' },
  { key: 'multiple_passports', label: 'Do you hold or have you held passports from more than one country?' },
  { key: 'foreign_financial_services', label: 'Do you hold or have you held a licence in a foreign financial services jurisdiction?' },
  { key: 'precluded_from_services', label: 'Have you ever been precluded from providing financial or professional services?' },
  { key: 'criminal_convictions', label: 'Have you ever been convicted of a criminal offence?' },
  { key: 'regulatory_sanctions', label: 'Have you ever been the subject of regulatory sanctions?' },
  { key: 'regulatory_investigations', label: 'Are you currently under regulatory investigation?' },
  { key: 'bankruptcy', label: 'Have you ever been declared bankrupt or insolvent?' },
  { key: 'litigation', label: 'Are you currently involved in any pending litigation?' },
  { key: 'civil_proceedings', label: 'Have you ever been subject to civil proceedings related to fraud or dishonesty?' },
  { key: 'refused_onboarding', label: 'Have you ever been refused onboarding by a financial institution?' },
  { key: 'sanctions_watchlist', label: 'Are you on any international sanctions list or watchlist?' },
  { key: 'high_risk_jurisdictions', label: 'Do you have significant ties to high-risk or non-cooperative jurisdictions?' },
]

const SOURCES_OF_FUNDS = [
  'Employment / salary income',
  'Sale of shares / equity',
  'Sale of property',
  'Maturing investments',
  'Company policy proceeds',
  'Sale of a business',
  'Inheritance',
  'Geared loan / borrowing',
  'Gift from a third party',
  'Compensation / legal settlement',
]

const PEP_WEALTH_SOURCES = [
  'Employment income', 'Business ownership', 'Investment returns',
  'Inheritance / gift', 'Property sale', 'Pension / retirement', 'Other (specify)', 'N/A',
]

const PEP_FUND_SOURCES = [
  'Personal savings', 'Business revenue', 'Investment proceeds', 'Loan / credit facility',
]

const EMPTY_PERSON = {
  roles: [],
  full_name: '', residential_address: '', nationality: '',
  dob: '', pob: '', tel: '', mobile: '', email: '', occupation: '',
  tax_country: '', tin: '',
  spouse_name: '', father_name: '', mother_name: '',
  corporate_shareholder: false,
  compliance: Object.fromEntries(COMPLIANCE_QUESTIONS.map(q => [q.key, false])),
}

// ─── Risk Scoring ────────────────────────────────────────────────────────────

function calculateRisk(data) {
  const flags = []
  const highRiskKeys = ['criminal_convictions','regulatory_sanctions','refused_onboarding','sanctions_watchlist']
  const medRiskKeys  = ['regulatory_investigations','bankruptcy','litigation','civil_proceedings','high_risk_jurisdictions']

  for (const p of (data.persons || [])) {
    for (const k of highRiskKeys) {
      if (p.compliance?.[k]) flags.push(`${p.full_name || 'Person'}: ${COMPLIANCE_QUESTIONS.find(q=>q.key===k)?.label}`)
    }
    for (const k of medRiskKeys) {
      if (p.compliance?.[k]) flags.push(`${p.full_name || 'Person'}: ${COMPLIANCE_QUESTIONS.find(q=>q.key===k)?.label}`)
    }
  }
  if (data.is_pep || data.was_pep || data.family_of_pep || data.associate_of_pep) {
    flags.push('PEP or PEP-related person declared')
  }

  const highCount = (data.persons || []).reduce((n, p) =>
    n + highRiskKeys.filter(k => p.compliance?.[k]).length, 0) +
    (data.is_pep || data.was_pep ? 1 : 0)

  const medCount = (data.persons || []).reduce((n, p) =>
    n + medRiskKeys.filter(k => p.compliance?.[k]).length, 0) +
    (data.family_of_pep || data.associate_of_pep ? 1 : 0)

  let score = 'Low'
  if (highCount > 0) score = 'High'
  else if (medCount > 0) score = 'Medium'

  return { score, flags }
}

// ─── KYC Checklist Generator ─────────────────────────────────────────────────

function buildKycChecklist(data) {
  const docs = [
    { doc: 'Certified copy of passport or national ID card', required: true, reason: 'Standard KYC requirement' },
    { doc: 'Proof of residential address (utility bill or bank statement, max 3 months old)', required: true, reason: 'Standard KYC requirement' },
    { doc: 'Bank reference letter (max 3 months old)', required: true, reason: 'Standard KYC requirement' },
    { doc: 'Detailed curriculum vitae (CV)', required: true, reason: 'Standard KYC requirement' },
  ]
  const hasCorporate = (data.persons || []).some(p => p.corporate_shareholder)
  if (hasCorporate) {
    docs.push(
      { doc: 'Certificate of Incorporation (corporate shareholder)', required: true, reason: 'Corporate shareholder declared' },
      { doc: 'Business Licence (corporate shareholder)', required: true, reason: 'Corporate shareholder declared' },
      { doc: 'Memorandum & Articles / Constitution (corporate shareholder)', required: true, reason: 'Corporate shareholder declared' },
      { doc: 'Certificate of Good Standing (max 3 months old)', required: true, reason: 'Corporate shareholder declared' },
      { doc: 'Latest audited Financial Statements', required: true, reason: 'Corporate shareholder declared' },
      { doc: 'Register of Members & Directors', required: true, reason: 'Corporate shareholder declared' },
      { doc: 'Group structure chart', required: true, reason: 'Corporate shareholder declared' },
      { doc: 'KYC documentation on each corporate director / shareholder', required: true, reason: 'Corporate shareholder declared' },
    )
  }
  if (data.is_pep || data.was_pep || data.family_of_pep || data.associate_of_pep) {
    docs.push(
      { doc: 'PEP Enhanced Due Diligence report', required: true, reason: 'PEP declared' },
      { doc: 'Additional source of wealth / funds evidence (PEP)', required: true, reason: 'PEP declared' },
    )
  }
  return docs
}

// ─── Signature Canvas ────────────────────────────────────────────────────────

function SignatureCanvas({ onSave, existingData }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [saved, setSaved] = useState(!!existingData)

  useEffect(() => {
    if (existingData && canvasRef.current) {
      const img = new Image()
      img.onload = () => {
        canvasRef.current.getContext('2d').drawImage(img, 0, 0)
      }
      img.src = existingData
    }
  }, [])

  function getPos(e, canvas) {
    const r = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return [src.clientX - r.left, src.clientY - r.top]
  }

  function startDraw(e) {
    e.preventDefault()
    drawing.current = true
    setSaved(false)
    const ctx = canvasRef.current.getContext('2d')
    const [x, y] = getPos(e, canvasRef.current)
    ctx.beginPath(); ctx.moveTo(x, y)
  }

  function draw(e) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    ctx.strokeStyle = '#C9A84C'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    const [x, y] = getPos(e, canvasRef.current)
    ctx.lineTo(x, y); ctx.stroke()
  }

  function endDraw() { drawing.current = false }

  function clear() {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setSaved(false)
    onSave(null)
  }

  function save() {
    const data = canvasRef.current.toDataURL('image/png')
    onSave(data)
    setSaved(true)
  }

  return (
    <div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#0a0f1e', overflow: 'hidden', marginBottom: 8 }}>
        <canvas
          ref={canvasRef}
          width={500} height={120}
          style={{ display: 'block', cursor: 'crosshair', width: '100%', touchAction: 'none' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-secondary btn-xs" onClick={clear}>Clear</button>
        <button type="button" className="btn btn-xs" style={{ background: saved ? 'rgba(16,185,129,0.2)' : 'rgba(201,168,76,0.15)', color: saved ? '#10B981' : '#C9A84C', border: `1px solid ${saved ? 'rgba(16,185,129,0.3)' : 'rgba(201,168,76,0.3)'}` }} onClick={save}>
          {saved ? <><Check size={12}/> Saved</> : 'Confirm Signature'}
        </button>
      </div>
    </div>
  )
}

// ─── Step components ──────────────────────────────────────────────────────────

function StepCompanyDetails({ data, onChange }) {
  const u = (k, v) => onChange({ ...data, [k]: v })
  return (
    <div>
      <div style={{ fontSize: 13, color: '#8fa3bc', marginBottom: 20 }}>
        Provide the proposed name for your structure and select the entity type. We will conduct a name availability check on your behalf.
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="form-group">
          <label className="form-label">Preferred entity name <span style={{ color: '#EF4444' }}>*</span></label>
          <input className="form-input" value={data.entity_name || ''} onChange={e => u('entity_name', e.target.value)} placeholder="First choice name" />
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Alternative name 1</label>
            <input className="form-input" value={data.entity_name_alt1 || ''} onChange={e => u('entity_name_alt1', e.target.value)} placeholder="Second choice" />
          </div>
          <div className="form-group">
            <label className="form-label">Alternative name 2</label>
            <input className="form-input" value={data.entity_name_alt2 || ''} onChange={e => u('entity_name_alt2', e.target.value)} placeholder="Third choice" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Entity type <span style={{ color: '#EF4444' }}>*</span></label>
          <select className="form-input" value={data.entity_type || ''} onChange={e => u('entity_type', e.target.value)}>
            <option value="">Select entity type…</option>
            {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Double Taxation Avoidance Agreement (DTA)?</label>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {['Yes', 'No'].map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="has_dta" checked={data.has_dta === (opt === 'Yes')} onChange={() => u('has_dta', opt === 'Yes')} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nominee arrangement required?</label>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {['Yes', 'No'].map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="nominee" checked={data.nominee_arrangement === (opt === 'Yes')} onChange={() => u('nominee_arrangement', opt === 'Yes')} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepPersons({ data, onChange }) {
  const persons = data.persons || []

  function addPerson() {
    onChange({ ...data, persons: [...persons, { ...EMPTY_PERSON, compliance: { ...EMPTY_PERSON.compliance } }] })
  }

  function updatePerson(i, updated) {
    const next = persons.map((p, idx) => idx === i ? updated : p)
    onChange({ ...data, persons: next })
  }

  function removePerson(i) {
    onChange({ ...data, persons: persons.filter((_, idx) => idx !== i) })
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#8fa3bc', marginBottom: 16 }}>
        Complete personal information for each UBO, Shareholder, Director, and Secretary. Add one entry per person.
      </div>
      {persons.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 16 }}>
          <ClipboardList size={32} />
          <p style={{ marginTop: 8 }}>No persons added yet</p>
        </div>
      )}
      {persons.map((p, i) => (
        <PersonCard key={i} index={i} person={p} onUpdate={updated => updatePerson(i, updated)} onRemove={() => removePerson(i)} />
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={addPerson} style={{ marginTop: 8 }}>
        <Plus size={13} /> Add Person
      </button>
    </div>
  )
}

function PersonCard({ index, person, onUpdate, onRemove }) {
  const [open, setOpen] = useState(index === 0)
  const u = (k, v) => onUpdate({ ...person, [k]: v })
  const uc = (k, v) => onUpdate({ ...person, compliance: { ...person.compliance, [k]: v } })

  const toggleRole = (role) => {
    const roles = person.roles.includes(role)
      ? person.roles.filter(r => r !== role)
      : [...person.roles, role]
    u('roles', roles)
  }

  return (
    <div className="card" style={{ marginBottom: 12, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{person.full_name || `Person ${index + 1}`}</div>
          <div style={{ fontSize: 11, color: '#5a7390', marginTop: 2 }}>
            {person.roles.length ? person.roles.join(', ') : 'No role selected'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-danger btn-xs" onClick={e => { e.stopPropagation(); onRemove() }}>
            <Trash2 size={11} />
          </button>
          <ChevronRight size={16} style={{ color: '#5a7390', transform: open ? 'rotate(90deg)' : '', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          {/* Roles */}
          <div className="form-group">
            <label className="form-label">Role(s) <span style={{ color: '#EF4444' }}>*</span></label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              {ROLES.map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                  <input type="checkbox" checked={person.roles.includes(r)} onChange={() => toggleRole(r)} />
                  {r}
                </label>
              ))}
            </div>
          </div>

          {/* Personal info */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Full legal name <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" value={person.full_name} onChange={e => u('full_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Nationality <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" value={person.nationality} onChange={e => u('nationality', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Date of birth <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" type="date" value={person.dob} onChange={e => u('dob', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Place of birth <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" value={person.pob} onChange={e => u('pob', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Residential address <span style={{ color: '#EF4444' }}>*</span></label>
            <textarea className="form-input" rows={2} value={person.residential_address} onChange={e => u('residential_address', e.target.value)} />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Telephone</label>
              <input className="form-input" value={person.tel} onChange={e => u('tel', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" value={person.mobile} onChange={e => u('mobile', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email address <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" type="email" value={person.email} onChange={e => u('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Occupation <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" value={person.occupation} onChange={e => u('occupation', e.target.value)} />
            </div>
          </div>

          {/* Tax */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Country of tax residence <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" value={person.tax_country} onChange={e => u('tax_country', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">TIN / Social Security / NIC number <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="form-input" value={person.tin} onChange={e => u('tin', e.target.value)} />
            </div>
          </div>

          {/* Family */}
          <div style={{ fontSize: 12, color: '#8fa3bc', marginBottom: 8, marginTop: 4 }}>Family information</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Spouse / partner full name</label>
              <input className="form-input" value={person.spouse_name} onChange={e => u('spouse_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Father's full name</label>
              <input className="form-input" value={person.father_name} onChange={e => u('father_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Mother's full name</label>
              <input className="form-input" value={person.mother_name} onChange={e => u('mother_name', e.target.value)} />
            </div>
          </div>

          {/* Corporate shareholder */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={person.corporate_shareholder} onChange={e => u('corporate_shareholder', e.target.checked)} />
              This person is / represents a corporate shareholder (additional KYC documents will be required)
            </label>
          </div>

          {/* Compliance questions */}
          <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '14px 16px', marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} /> Compliance Declarations
            </div>
            {COMPLIANCE_QUESTIONS.map(q => (
              <div key={q.key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
                <div style={{ fontSize: 12, color: '#c0cfe0', flex: 1 }}>{q.label}</div>
                <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                  {['Yes', 'No'].map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12 }}>
                      <input type="radio" name={`${index}-${q.key}`}
                        checked={person.compliance[q.key] === (opt === 'Yes')}
                        onChange={() => uc(q.key, opt === 'Yes')} />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StepSourceOfFunds({ data, onChange }) {
  const u = (k, v) => onChange({ ...data, [k]: v })
  const toggleSource = (src) => {
    const current = data.source_of_funds || []
    const next = current.includes(src) ? current.filter(s => s !== src) : [...current, src]
    u('source_of_funds', next)
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#8fa3bc', marginBottom: 20 }}>
        Annexure 2 — Please declare the origin of the funds to be introduced into your structure. Tick all that apply.
      </div>
      <div className="form-group">
        <label className="form-label">Source of funds <span style={{ color: '#EF4444' }}>*</span></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          {SOURCES_OF_FUNDS.map(src => (
            <label key={src} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
              <input type="checkbox" checked={(data.source_of_funds || []).includes(src)} onChange={() => toggleSource(src)} />
              {src}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 16 }}>
        <label className="form-label">Country of origin of funds <span style={{ color: '#EF4444' }}>*</span></label>
        <input className="form-input" value={data.funds_country || ''} onChange={e => u('funds_country', e.target.value)} placeholder="e.g. Mauritius, United Kingdom, South Africa" />
      </div>

      {/* AML Declaration */}
      <div style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: 16, marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#C9A84C', marginBottom: 10 }}>AML / CTF Declaration</div>
        <div style={{ fontSize: 12, color: '#8fa3bc', lineHeight: 1.7, marginBottom: 12 }}>
          I/We hereby declare that the above information is true and correct. I/We confirm that the funds to be deposited are from legitimate sources and are not the proceeds of any criminal activity, money laundering, or terrorist financing.
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12 }}>
          <input type="checkbox" style={{ marginTop: 2 }} checked={data.aml_declaration || false} onChange={e => u('aml_declaration', e.target.checked)} />
          <span>I confirm the above declaration and authorise Aurevya Wealth to proceed on this basis.</span>
        </label>
      </div>

      {/* Signature */}
      <div className="form-group" style={{ marginTop: 20 }}>
        <label className="form-label">Signature — Annexure 2 <span style={{ color: '#EF4444' }}>*</span></label>
        <div style={{ fontSize: 11, color: '#5a7390', marginBottom: 8 }}>Draw your signature in the box below using your mouse or touchscreen</div>
        <input className="form-input" placeholder="Full name (print)" value={data.ann2_signer_name || ''} onChange={e => u('ann2_signer_name', e.target.value)} style={{ marginBottom: 10 }} />
        <SignatureCanvas existingData={data.ann2_signature_data} onSave={d => u('ann2_signature_data', d)} />
      </div>
    </div>
  )
}

function StepPEP({ data, onChange }) {
  const u = (k, v) => onChange({ ...data, [k]: v })
  const isAnyPep = data.is_pep || data.was_pep || data.family_of_pep || data.associate_of_pep

  const toggleWealth = (src) => {
    const current = data.pep_wealth_sources || []
    u('pep_wealth_sources', current.includes(src) ? current.filter(s => s !== src) : [...current, src])
  }
  const toggleFunds = (src) => {
    const current = data.pep_fund_sources || []
    u('pep_fund_sources', current.includes(src) ? current.filter(s => s !== src) : [...current, src])
  }

  const YesNo = ({ label, field }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, flex: 1 }}>{label}</div>
      <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
        {['Yes', 'No'].map(opt => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" name={`pep-${field}`} checked={data[field] === (opt === 'Yes')} onChange={() => u(field, opt === 'Yes')} />
            {opt}
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 13, color: '#8fa3bc', marginBottom: 16 }}>
        Annexure 3 — A Politically Exposed Person (PEP) is an individual who holds or has held a prominent public position. Please answer all questions truthfully.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <YesNo label="Do you currently hold or have you previously held a prominent public function?" field="is_pep" />
        <YesNo label="Are you currently serving as a PEP?" field="was_pep" />
        <YesNo label="Is an immediate family member a PEP?" field="family_of_pep" />
        <YesNo label="Are you a known close associate of a PEP?" field="associate_of_pep" />
      </div>

      {isAnyPep && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={13} /> Please provide details below
          </div>
          <div className="form-grid">
            {[
              { k: 'pep_name', l: 'PEP full name' },
              { k: 'pep_function', l: 'Nature of public function' },
              { k: 'pep_country', l: 'Country' },
              { k: 'pep_period', l: 'Period of service' },
              { k: 'pep_relationship', l: 'Relationship to client' },
            ].map(({ k, l }) => (
              <div key={k} className="form-group">
                <label className="form-label">{l}</label>
                <input className="form-input" value={(data.pep_details || {})[k] || ''} onChange={e => u('pep_details', { ...(data.pep_details || {}), [k]: e.target.value })} />
              </div>
            ))}
          </div>

          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Sources of wealth (tick all that apply)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {PEP_WEALTH_SOURCES.map(src => (
                <label key={src} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}>
                  <input type="checkbox" checked={(data.pep_wealth_sources || []).includes(src)} onChange={() => toggleWealth(src)} />
                  {src}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Sources of funds (tick all that apply)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {PEP_FUND_SOURCES.map(src => (
                <label key={src} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}>
                  <input type="checkbox" checked={(data.pep_fund_sources || []).includes(src)} onChange={() => toggleFunds(src)} />
                  {src}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {/* PEP Declaration */}
      <div style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: 16, marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#C9A84C', marginBottom: 10 }}>PEP Declaration</div>
        <div style={{ fontSize: 12, color: '#8fa3bc', lineHeight: 1.7, marginBottom: 12 }}>
          I/We confirm that the above information is true, accurate and complete. I/We undertake to notify Aurevya Wealth immediately of any changes to my/our PEP status.
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12 }}>
          <input type="checkbox" style={{ marginTop: 2 }} checked={data.ann3_declaration || false} onChange={e => u('ann3_declaration', e.target.checked)} />
          <span>I confirm the above PEP declaration.</span>
        </label>
      </div>

      {/* Signature */}
      <div className="form-group" style={{ marginTop: 20 }}>
        <label className="form-label">Signature — Annexure 3 <span style={{ color: '#EF4444' }}>*</span></label>
        <input className="form-input" placeholder="Full name (print)" value={data.ann3_signer_name || ''} onChange={e => u('ann3_signer_name', e.target.value)} style={{ marginBottom: 10 }} />
        <SignatureCanvas existingData={data.ann3_signature_data} onSave={d => u('ann3_signature_data', d)} />
      </div>
    </div>
  )
}

function StepReview({ data }) {
  const { score, flags } = calculateRisk(data)
  const checklist = buildKycChecklist(data)
  const riskColor = score === 'High' ? '#EF4444' : score === 'Medium' ? '#F59E0B' : '#10B981'

  return (
    <div>
      <div style={{ fontSize: 13, color: '#8fa3bc', marginBottom: 20 }}>
        Review your responses before submitting. Your questionnaire will be securely transmitted to the Aurevya Wealth compliance team.
      </div>

      {/* Risk indicator */}
      <div style={{ background: `rgba(${score==='High'?'239,68,68':score==='Medium'?'245,158,11':'16,185,129'},0.08)`, border: `1px solid rgba(${score==='High'?'239,68,68':score==='Medium'?'245,158,11':'16,185,129'},0.25)`, borderRadius: 10, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <Shield size={28} style={{ color: riskColor, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: riskColor }}>Indicative risk classification: {score}</div>
          <div style={{ fontSize: 12, color: '#8fa3bc', marginTop: 3 }}>
            {score === 'Low' ? 'All compliance declarations clear. Standard onboarding pathway.' :
             score === 'Medium' ? 'Some declarations require additional review. Enhanced due diligence may be requested.' :
             'One or more high-risk declarations identified. MLRO review required before proceeding.'}
          </div>
          {flags.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {flags.map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: riskColor, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <AlertTriangle size={10} /> {f}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#C9A84C', marginBottom: 12 }}>Company Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['Preferred name', data.entity_name],
            ['Entity type', ENTITY_TYPES.find(t=>t.value===data.entity_type)?.label || data.entity_type],
            ['DTA required', data.has_dta == null ? '—' : data.has_dta ? 'Yes' : 'No'],
            ['Nominee arrangement', data.nominee_arrangement == null ? '—' : data.nominee_arrangement ? 'Yes' : 'No'],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: '#5a7390', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{v || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#C9A84C', marginBottom: 12 }}>Persons ({(data.persons||[]).length})</div>
        {(data.persons||[]).map((p, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.full_name || `Person ${i+1}`}</div>
            <div style={{ fontSize: 11, color: '#5a7390' }}>{p.roles.join(', ')} · {p.nationality}</div>
          </div>
        ))}
        {!(data.persons||[]).length && <div style={{ fontSize: 12, color: '#5a7390' }}>No persons added</div>}
      </div>

      {/* KYC Checklist */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#C9A84C', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={13} /> Required KYC Documents ({checklist.length})
        </div>
        {checklist.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{item.doc}</div>
              <div style={{ fontSize: 11, color: '#5a7390' }}>{item.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

async function loadJsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    s.onload = () => resolve(window.jspdf.jsPDF)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

async function generatePDF(data, clientName) {
  const jsPDF = await loadJsPDF()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, margin = 20
  let y = 20

  const addTitle = (t, size = 14) => {
    doc.setFontSize(size); doc.setTextColor(201, 168, 76)
    doc.text(t, margin, y); y += size * 0.5 + 4
  }
  const addBody = (t, size = 10) => {
    doc.setFontSize(size); doc.setTextColor(60, 80, 110)
    const lines = doc.splitTextToSize(t, W - margin * 2)
    doc.text(lines, margin, y); y += lines.length * (size * 0.45) + 3
  }
  const addKV = (label, value) => {
    doc.setFontSize(9); doc.setTextColor(120, 140, 170)
    doc.text(label + ':', margin, y)
    doc.setTextColor(30, 45, 65)
    doc.text(String(value || '—'), margin + 55, y); y += 5
  }
  const addLine = () => {
    doc.setDrawColor(201, 168, 76, 40)
    doc.line(margin, y, W - margin, y); y += 5
  }
  const newPage = () => { doc.addPage(); y = 20 }
  const checkPage = (need = 20) => { if (y + need > 280) newPage() }

  // Header
  doc.setFillColor(10, 15, 30)
  doc.rect(0, 0, W, 35, 'F')
  doc.setFontSize(18); doc.setTextColor(201, 168, 76)
  doc.text('AUREVYA WEALTH', margin, 18)
  doc.setFontSize(9); doc.setTextColor(140, 160, 188)
  doc.text('Pre-Onboarding Questionnaire', margin, 26)
  doc.text(`Submitted: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}`, margin, 31)
  y = 45

  // Company Details
  addTitle('Company Details')
  addLine()
  addKV('Preferred entity name', data.entity_name)
  addKV('Alt name 1', data.entity_name_alt1)
  addKV('Alt name 2', data.entity_name_alt2)
  addKV('Entity type', ENTITY_TYPES.find(t => t.value === data.entity_type)?.label || data.entity_type)
  addKV('DTA required', data.has_dta ? 'Yes' : 'No')
  addKV('Nominee arrangement', data.nominee_arrangement ? 'Yes' : 'No')
  y += 4

  // Persons
  for (const [i, p] of (data.persons || []).entries()) {
    checkPage(60)
    addTitle(`Annexure 1 — Person ${i + 1}: ${p.full_name || 'Unnamed'}`, 12)
    addLine()
    addKV('Roles', p.roles.join(', '))
    addKV('Nationality', p.nationality)
    addKV('Date of birth', p.dob)
    addKV('Place of birth', p.pob)
    addKV('Occupation', p.occupation)
    addKV('Tax country', p.tax_country)
    addKV('TIN', p.tin)
    addKV('Spouse', p.spouse_name)
    addKV('Father', p.father_name)
    addKV('Mother', p.mother_name)
    y += 3
    doc.setFontSize(9); doc.setTextColor(239, 68, 68)
    doc.text('Compliance Declarations', margin, y); y += 5
    COMPLIANCE_QUESTIONS.forEach(q => {
      checkPage(6)
      const ans = p.compliance?.[q.key]
      doc.setFontSize(8)
      doc.setTextColor(ans ? 200 : 80, ans ? 60 : 140, ans ? 60 : 90)
      const lines = doc.splitTextToSize(`• ${q.label}: ${ans ? 'YES' : 'No'}`, W - margin * 2)
      doc.text(lines, margin, y); y += lines.length * 4 + 1
    })
    y += 4
  }

  // Annexure 2
  checkPage(40)
  addTitle('Annexure 2 — Source of Funds')
  addLine()
  addKV('Sources', (data.source_of_funds || []).join('; '))
  addKV('Country of origin', data.funds_country)
  addKV('AML declaration', data.aml_declaration ? 'Confirmed' : 'Not confirmed')
  addKV('Signed by', data.ann2_signer_name)
  if (data.ann2_signature_data) {
    checkPage(25)
    try { doc.addImage(data.ann2_signature_data, 'PNG', margin, y, 60, 15); y += 20 } catch (_) {}
  }
  y += 4

  // Annexure 3
  checkPage(40)
  addTitle('Annexure 3 — PEP Declaration')
  addLine()
  addKV('Holds/held prominent public function', data.is_pep ? 'Yes' : 'No')
  addKV('Was PEP', data.was_pep ? 'Yes' : 'No')
  addKV('Family member of PEP', data.family_of_pep ? 'Yes' : 'No')
  addKV('Close associate of PEP', data.associate_of_pep ? 'Yes' : 'No')
  if (data.is_pep || data.was_pep || data.family_of_pep || data.associate_of_pep) {
    addKV('PEP function', data.pep_details?.pep_function)
    addKV('PEP country', data.pep_details?.pep_country)
    addKV('PEP period', data.pep_details?.pep_period)
    addKV('Wealth sources', (data.pep_wealth_sources || []).join('; '))
    addKV('Fund sources', (data.pep_fund_sources || []).join('; '))
  }
  addKV('Declaration confirmed', data.ann3_declaration ? 'Yes' : 'No')
  addKV('Signed by', data.ann3_signer_name)
  if (data.ann3_signature_data) {
    checkPage(25)
    try { doc.addImage(data.ann3_signature_data, 'PNG', margin, y, 60, 15); y += 20 } catch (_) {}
  }
  y += 4

  // Risk summary
  checkPage(50)
  const { score, flags } = calculateRisk(data)
  const riskRgb = score === 'High' ? [239, 68, 68] : score === 'Medium' ? [245, 158, 11] : [16, 185, 129]
  addTitle('Risk Assessment Summary', 12)
  doc.setFillColor(...riskRgb.map(v => Math.round(v * 0.15)))
  doc.roundedRect(margin, y, W - margin * 2, 16, 3, 3, 'F')
  doc.setFontSize(12); doc.setTextColor(...riskRgb)
  doc.text(`Risk Classification: ${score}`, margin + 5, y + 10); y += 22
  if (flags.length) {
    flags.forEach(f => {
      checkPage(6); addBody(`• ${f}`)
    })
  } else {
    addBody('No compliance flags identified.')
  }
  y += 4

  // KYC Checklist
  checkPage(30)
  addTitle('KYC Document Checklist', 12)
  addLine()
  buildKycChecklist(data).forEach(item => {
    checkPage(8)
    doc.setFontSize(9); doc.setTextColor(30, 45, 65)
    const lines = doc.splitTextToSize(`☐  ${item.doc}`, W - margin * 2)
    doc.text(lines, margin, y); y += lines.length * 4.5 + 1
    doc.setFontSize(8); doc.setTextColor(90, 115, 144)
    doc.text(item.reason, margin + 5, y); y += 4
  })

  return doc.output('arraybuffer')
}

// ─── Main Component ───────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Company Details' },
  { id: 2, label: 'Persons (Ann. 1)' },
  { id: 3, label: 'Source of Funds (Ann. 2)' },
  { id: 4, label: 'PEP (Ann. 3)' },
  { id: 5, label: 'Review & Submit' },
]

export default function ClientQuestionnaire() {
  const { user, profile } = useAuth()
  const [step, setStep] = useState(1)
  const [data, setData] = useState({
    entity_name: '', entity_name_alt1: '', entity_name_alt2: '',
    entity_type: '', has_dta: null, nominee_arrangement: null,
    persons: [],
    source_of_funds: [], funds_country: '', aml_declaration: false,
    ann2_signature_data: null, ann2_signer_name: '',
    is_pep: false, was_pep: false, family_of_pep: false, associate_of_pep: false,
    pep_details: {}, pep_wealth_sources: [], pep_fund_sources: [],
    ann3_declaration: false, ann3_signature_data: null, ann3_signer_name: '',
  })
  const [submissionId, setSubmissionId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadExisting()
  }, [user])

  async function loadExisting() {
    const { data: existing } = await supabase
      .from('questionnaire_submissions')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      setSubmissionId(existing.id)
      if (existing.status === 'submitted') {
        setSubmitted(true)
        setPdfUrl(existing.pdf_url)
      } else {
        setData(d => ({
          ...d,
          entity_name: existing.entity_name || '',
          entity_name_alt1: existing.entity_name_alt1 || '',
          entity_name_alt2: existing.entity_name_alt2 || '',
          entity_type: existing.entity_type || '',
          has_dta: existing.has_dta,
          nominee_arrangement: existing.nominee_arrangement,
          persons: existing.persons || [],
          source_of_funds: existing.source_of_funds || [],
          funds_country: existing.funds_country || '',
          aml_declaration: existing.aml_declaration || false,
          ann2_signature_data: existing.ann2_signature_data,
          ann2_signer_name: existing.ann2_signer_name || '',
          is_pep: existing.is_pep || false,
          was_pep: existing.was_pep || false,
          family_of_pep: existing.family_of_pep || false,
          associate_of_pep: existing.associate_of_pep || false,
          pep_details: existing.pep_details || {},
          pep_wealth_sources: existing.pep_wealth_sources || [],
          pep_fund_sources: existing.pep_fund_sources || [],
          ann3_declaration: existing.ann3_declaration || false,
          ann3_signature_data: existing.ann3_signature_data,
          ann3_signer_name: existing.ann3_signer_name || '',
        }))
      }
    }
    setLoading(false)
  }

  async function saveProgress(newData) {
    const payload = {
      client_id: user.id,
      status: 'in_progress',
      entity_name: newData.entity_name,
      entity_name_alt1: newData.entity_name_alt1,
      entity_name_alt2: newData.entity_name_alt2,
      entity_type: newData.entity_type,
      has_dta: newData.has_dta,
      nominee_arrangement: newData.nominee_arrangement,
      persons: newData.persons,
      source_of_funds: newData.source_of_funds,
      funds_country: newData.funds_country,
      aml_declaration: newData.aml_declaration,
      ann2_signature_data: newData.ann2_signature_data,
      ann2_signer_name: newData.ann2_signer_name,
      is_pep: newData.is_pep,
      was_pep: newData.was_pep,
      family_of_pep: newData.family_of_pep,
      associate_of_pep: newData.associate_of_pep,
      pep_details: newData.pep_details,
      pep_wealth_sources: newData.pep_wealth_sources,
      pep_fund_sources: newData.pep_fund_sources,
      ann3_declaration: newData.ann3_declaration,
      ann3_signature_data: newData.ann3_signature_data,
      ann3_signer_name: newData.ann3_signer_name,
    }
    if (submissionId) {
      await supabase.from('questionnaire_submissions').update(payload).eq('id', submissionId)
    } else {
      const { data: row } = await supabase.from('questionnaire_submissions').insert(payload).select('id').single()
      if (row) setSubmissionId(row.id)
    }
  }

  async function handleNext() {
    await saveProgress(data)
    setStep(s => Math.min(s + 1, 5))
    window.scrollTo(0, 0)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const { score, flags } = calculateRisk(data)
      const checklist = buildKycChecklist(data)

      // Generate PDF
      const pdfBuffer = await generatePDF(data, profile?.full_name)
      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
      const pdfPath = `${user.id}/${Date.now()}-questionnaire.pdf`

      let finalPdfUrl = null
      const { error: uploadErr } = await supabase.storage
        .from('questionnaire-pdfs')
        .upload(pdfPath, pdfBlob)

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('questionnaire-pdfs').getPublicUrl(pdfPath)
        finalPdfUrl = urlData.publicUrl
      }

      const payload = {
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        risk_score: score,
        risk_flags: flags,
        kyc_checklist: checklist,
        pdf_url: finalPdfUrl,
        ann2_signed_at: data.ann2_signature_data ? new Date().toISOString() : null,
        ann3_signed_at: data.ann3_signature_data ? new Date().toISOString() : null,
      }

      if (submissionId) {
        await supabase.from('questionnaire_submissions').update(payload).eq('id', submissionId)
      }

      setPdfUrl(finalPdfUrl)
      setSubmitted(true)
    } catch (err) {
      alert('Submission error: ' + err.message)
    }
    setSubmitting(false)
  }

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  if (submitted) {
    const { score } = calculateRisk(data)
    const riskColor = score === 'High' ? '#EF4444' : score === 'Medium' ? '#F59E0B' : '#10B981'
    return (
      <div>
        <div className="page-header">
          <div className="header-title-group">
            <div className="page-title">Questionnaire Submitted</div>
            <div className="page-title-sub">Thank you — your responses have been received</div>
          </div>
        </div>
        <div className="page-body">
          <div className="card" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: 40 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Check size={28} style={{ color: '#10B981' }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Successfully Submitted</div>
            <div style={{ fontSize: 13, color: '#8fa3bc', marginBottom: 24 }}>
              Your pre-onboarding questionnaire has been submitted to the Aurevya Wealth compliance team. We will review your responses and contact you within 2–3 business days.
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `rgba(${score==='High'?'239,68,68':score==='Medium'?'245,158,11':'16,185,129'},0.1)`, border: `1px solid rgba(${score==='High'?'239,68,68':score==='Medium'?'245,158,11':'16,185,129'},0.3)`, borderRadius: 20, padding: '6px 14px', marginBottom: 24 }}>
              <Shield size={14} style={{ color: riskColor }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: riskColor }}>Risk Classification: {score}</span>
            </div>
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', gap: 6, textDecoration: 'none' }}>
                <Download size={13} /> Download your copy (PDF)
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  const stepProps = { data, onChange: setData }

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Pre-Onboarding Questionnaire</div>
          <div className="page-title-sub">Step {step} of {STEPS.length} — {STEPS[step-1].label}</div>
        </div>
      </div>

      <div className="page-body">
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {STEPS.map(s => (
            <div key={s.id} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 3, borderRadius: 2, background: step >= s.id ? '#C9A84C' : 'var(--border)', marginBottom: 6, transition: 'background 0.3s' }} />
              <div style={{ fontSize: 10, color: step >= s.id ? '#C9A84C' : '#5a7390', fontWeight: step === s.id ? 600 : 400 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card" style={{ maxWidth: 740, margin: '0 auto' }}>
          {step === 1 && <StepCompanyDetails {...stepProps} />}
          {step === 2 && <StepPersons {...stepProps} />}
          {step === 3 && <StepSourceOfFunds {...stepProps} />}
          {step === 4 && <StepPEP {...stepProps} />}
          {step === 5 && <StepReview {...stepProps} />}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(s => Math.max(s - 1, 1))} disabled={step === 1}>
              <ChevronLeft size={14} /> Back
            </button>
            {step < 5 ? (
              <button className="btn btn-primary btn-sm" onClick={handleNext}>
                Save & Continue <ChevronRight size={14} />
              </button>
            ) : (
                  <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Submitting…</> : <><Check size={14} /> Submit Questionnaire</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
