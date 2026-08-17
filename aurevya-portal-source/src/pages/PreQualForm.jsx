import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

const SUPABASE_URL = 'https://wxwbfkhvkrwtmsgwdkjy.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d2Jma2h2a3J3dG1zZ3dka2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM5NDAsImV4cCI6MjA5NTg4OTk0MH0.RVFvV3Tu6vgIs3KvPsjOrfdsLaevncysHrirLjAATXM'

function apiHeaders(extra = {}) {
  return {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extra,
  }
}

async function restGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: apiHeaders() })
  return res.json()
}

// Upsert via INSERT with merge-duplicates — works under anon INSERT policy
async function restUpsert(table, body, conflictCol) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCol}`,
    {
      method: 'POST',
      headers: apiHeaders({ 'Prefer': 'return=representation,resolution=merge-duplicates' }),
      body: JSON.stringify(body),
    }
  )
  const text = await res.text()
  try { return JSON.parse(text) } catch { return null }
}

const S = {
  page: {
    minHeight: '100vh',
    background: '#0a0f1e',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px 56px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: 580,
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    color: '#c9a227',
    letterSpacing: '0.08em',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 11,
    color: '#8fa3bc',
    letterSpacing: '0.06em',
    marginBottom: 28,
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 13,
    color: '#8fa3bc',
    marginBottom: 28,
    lineHeight: 1.7,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#c9a227',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 14,
    marginTop: 28,
    paddingBottom: 8,
    borderBottom: '1px solid rgba(201,162,39,0.2)',
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#8fa3bc',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  optionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 8,
  },
  optionCard: (selected) => ({
    padding: '10px 14px',
    borderRadius: 8,
    border: selected
      ? '1px solid rgba(201,162,39,0.6)'
      : '1px solid rgba(255,255,255,0.08)',
    background: selected
      ? 'rgba(201,162,39,0.1)'
      : 'rgba(255,255,255,0.03)',
    color: selected ? '#e2e8f0' : '#94a3b8',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.15s',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  }),
  dot: (selected) => ({
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: selected ? '4px solid #c9a227' : '1px solid rgba(255,255,255,0.2)',
    flexShrink: 0,
    background: 'transparent',
    transition: 'all 0.15s',
  }),
  textarea: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#e2e8f0',
    fontSize: 13,
    outline: 'none',
    resize: 'vertical',
    minHeight: 90,
    boxSizing: 'border-box',
    lineHeight: 1.6,
  },
  consentBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 24,
    marginBottom: 24,
    padding: '14px 16px',
    background: 'rgba(201,162,39,0.05)',
    border: '1px solid rgba(201,162,39,0.15)',
    borderRadius: 8,
  },
  submitBtn: (canSubmit) => ({
    width: '100%',
    padding: '14px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 700,
    cursor: canSubmit ? 'pointer' : 'not-allowed',
    background: canSubmit ? '#c9a227' : 'rgba(201,162,39,0.2)',
    color: canSubmit ? '#0a0f1e' : '#8fa3bc',
    letterSpacing: '0.02em',
    transition: 'all 0.2s',
  }),
  successCard: {
    textAlign: 'center',
    padding: '48px 28px',
    background: 'rgba(16,185,129,0.05)',
    border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: 12,
  },
  errorCard: {
    textAlign: 'center',
    padding: '48px 28px',
    background: 'rgba(239,68,68,0.05)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 12,
  },
}

const QUESTIONS = [
  {
    key: 'services',
    label: 'What services are you interested in?',
    multi: true,
    options: [
      'Offshore Company / GBC',
      'Trust',
      'Foundation',
      'Holding Structure',
      'Private Wealth Management',
      'Family Office',
      'Estate Planning',
      'Other',
    ],
  },
  {
    key: 'jurisdiction',
    label: 'Preferred jurisdiction of interest',
    multi: false,
    options: [
      'Mauritius',
      'UAE / Dubai',
      'British Virgin Islands',
      'Cayman Islands',
      'Seychelles',
      'Singapore',
      'No preference',
    ],
  },
  {
    key: 'objective',
    label: 'Primary objective',
    multi: false,
    options: [
      'Asset Protection',
      'Wealth Structuring',
      'Tax Efficiency',
      'Business Expansion',
      'Investment Holding',
      'Succession / Estate',
    ],
  },
  {
    key: 'asset_value',
    label: 'Approximate assets / investment value',
    multi: false,
    options: [
      'Under $500K',
      '$500K – $1M',
      '$1M – $5M',
      '$5M – $10M',
      'Over $10M',
      'Prefer not to say',
    ],
  },
  {
    key: 'timeline',
    label: 'Timeline to proceed',
    multi: false,
    options: [
      'Immediately',
      'Within 3 months',
      '3 – 6 months',
      '6 – 12 months',
      'Just exploring',
    ],
  },
  {
    key: 'existing_advisor',
    label: 'Are you currently working with another wealth manager or advisor?',
    multi: false,
    options: ['Yes', 'No'],
  },
]

export default function PreQualForm() {
  const { token } = useParams()

  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState(null)
  const [error, setError] = useState(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [consent, setConsent] = useState(false)

  // answers keyed by question key
  const [answers, setAnswers] = useState({
    services: [],
    jurisdiction: null,
    objective: null,
    asset_value: null,
    timeline: null,
    existing_advisor: null,
    notes: '',
  })

  useEffect(() => {
    async function load() {
      try {
        const rows = await restGet(
          `pre_qual_responses?token=eq.${encodeURIComponent(token)}&select=*`
        )
        if (!Array.isArray(rows) || rows.length === 0) {
          setError('This link is invalid or has expired. Please contact your Aurevya advisor.')
          setLoading(false)
          return
        }
        const row = rows[0]
        setRecord(row)
        if (row.submitted_at) {
          setAlreadySubmitted(true)
        }
      } catch {
        setError('Unable to load the form. Please try again later.')
      }
      setLoading(false)
    }
    load()
  }, [token])

  function toggleOption(key, option, multi) {
    if (multi) {
      setAnswers(prev => {
        const current = prev[key] || []
        return {
          ...prev,
          [key]: current.includes(option)
            ? current.filter(o => o !== option)
            : [...current, option],
        }
      })
    } else {
      setAnswers(prev => ({ ...prev, [key]: option }))
    }
  }

  function isAnswered(q) {
    const val = answers[q.key]
    if (q.multi) return Array.isArray(val) && val.length > 0
    return val !== null && val !== undefined
  }

  const allAnswered = QUESTIONS.every(isAnswered)
  const canSubmit = allAnswered && consent && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)

    const responses = {
      services: answers.services,
      jurisdiction: answers.jurisdiction,
      objective: answers.objective,
      asset_value: answers.asset_value,
      timeline: answers.timeline,
      existing_advisor: answers.existing_advisor,
      notes: answers.notes,
    }

    try {
      await restUpsert(
        'pre_qual_responses',
        {
          token,
          lead_id: record.lead_id,
          lead_type: record.lead_type,
          name: record.name,
          email: record.email,
          whatsapp: record.whatsapp,
          responses,
          submitted_at: new Date().toISOString(),
        },
        'token'
      )
      setSubmitted(true)
    } catch {
      setError('Submission failed. Please try again or contact byappointment@aurevya.com.')
    }
    setSubmitting(false)
  }

  // ── LOADING ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, textAlign: 'center', paddingTop: 80 }}>
          <div style={{ color: '#8fa3bc', fontSize: 14 }}>Loading your form…</div>
        </div>
      </div>
    )
  }

  // ── ERROR ────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.logo}>AUREVYA</div>
          <div style={S.errorCard}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444', marginBottom: 10 }}>
              Link Not Found
            </div>
            <div style={{ fontSize: 13, color: '#8fa3bc', lineHeight: 1.7 }}>{error}</div>
          </div>
        </div>
      </div>
    )
  }

  // ── ALREADY SUBMITTED ────────────────────────────────────────
  if (alreadySubmitted) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.logo}>AUREVYA</div>
          <div style={S.successCard}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10B981', marginBottom: 10 }}>
              Already Submitted
            </div>
            <div style={{ fontSize: 13, color: '#8fa3bc', lineHeight: 1.7 }}>
              Your pre-qualification form has already been submitted. Our team will be in touch shortly.
              <br /><br />
              Questions? Contact us at{' '}
              <a href="mailto:byappointment@aurevya.com" style={{ color: '#c9a227' }}>
                byappointment@aurevya.com
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SUCCESS ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.logo}>AUREVYA</div>
          <div style={S.successCard}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10B981', marginBottom: 10 }}>
              Thank You, {record?.name?.split(' ')[0] || 'there'}
            </div>
            <div style={{ fontSize: 13, color: '#8fa3bc', lineHeight: 1.8 }}>
              Your responses have been received. Our team will review your pre-qualification and reach out ahead of your consultation to confirm the details.
            </div>
            <div style={{ marginTop: 20, fontSize: 12, color: 'rgba(143,163,188,0.5)' }}>
              You may now close this tab.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── FORM ─────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>AUREVYA</div>
        <div style={S.tagline}>Wealth Management · By Appointment</div>

        <div style={S.heading}>Pre-Qualification Form</div>
        <div style={S.subheading}>
          {record?.name ? `Hello ${record.name.split(' ')[0]}, ` : ''}
          Please take two minutes to complete this short questionnaire. Your responses help us prepare
          your advisor and ensure the most relevant guidance for your consultation.
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          {QUESTIONS.map((q, qi) => (
            <div key={q.key}>
              {qi === 0 && <div style={S.sectionTitle}>Your Interests</div>}
              {qi === 2 && <div style={S.sectionTitle}>Your Situation</div>}
              {qi === 4 && <div style={S.sectionTitle}>Timing</div>}
              {qi === 5 && <div style={S.sectionTitle}>Additional Info</div>}

              <div style={S.fieldGroup}>
                <label style={S.label}>
                  {q.label}
                  {q.multi && (
                    <span style={{ color: '#c9a227', marginLeft: 4, fontWeight: 400, fontSize: 11 }}>
                      (select all that apply)
                    </span>
                  )}
                </label>
                <div style={S.optionGrid}>
                  {q.options.map(opt => {
                    const selected = q.multi
                      ? (answers[q.key] || []).includes(opt)
                      : answers[q.key] === opt
                    return (
                      <div
                        key={opt}
                        style={S.optionCard(selected)}
                        onClick={() => toggleOption(q.key, opt, q.multi)}
                      >
                        <div style={S.dot(selected)} />
                        {opt}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Notes */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Anything else you'd like us to know? <span style={{ color: '#8fa3bc', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              style={S.textarea}
              value={answers.notes}
              onChange={e => setAnswers(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Specific questions, existing structures, concerns, or context for your advisor…"
            />
          </div>

          {/* Consent */}
          <div style={S.consentBox}>
            <input
              type="checkbox"
              id="consent"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#c9a227', flexShrink: 0, cursor: 'pointer' }}
            />
            <label htmlFor="consent" style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, cursor: 'pointer' }}>
              I agree that Aurevya Wealth Management may use my responses to prepare for my consultation.
              My information will be handled in accordance with applicable data protection regulations.
            </label>
          </div>

          {!allAnswered && (
            <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 12 }}>
              Please answer all questions before submitting.
            </div>
          )}

          <button type="submit" disabled={!canSubmit} style={S.submitBtn(canSubmit)}>
            {submitting ? 'Submitting…' : 'Submit Pre-Qualification →'}
          </button>
        </form>

        <div style={{ marginTop: 28, fontSize: 11, color: 'rgba(143,163,188,0.4)', textAlign: 'center', lineHeight: 1.6 }}>
          Aurevya Wealth Management Limited · Secure & Confidential · <a href="https://www.aurevya.com" style={{ color: 'rgba(201,162,39,0.5)', textDecoration: 'none' }}>www.aurevya.com</a>
        </div>
      </div>
    </div>
  )
}
