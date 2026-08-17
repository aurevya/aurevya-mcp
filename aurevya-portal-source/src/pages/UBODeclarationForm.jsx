import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'

const SUPABASE_URL = 'https://wxwbfkhvkrwtmsgwdkjy.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d2Jma2h2a3J3dG1zZ3dka2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM5NDAsImV4cCI6MjA5NTg4OTk0MH0.RVFvV3Tu6vgIs3KvPsjOrfdsLaevncysHrirLjAATXM'

function apiHeaders() {
  return {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }
}

async function restGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: apiHeaders() })
  return res.json()
}

async function restPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  })
  return res.json()
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0a0f1e',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px 48px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: 560,
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    color: '#c9a227',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: '#8fa3bc',
    marginBottom: 28,
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    color: '#8fa3bc',
    marginBottom: 24,
    lineHeight: 1.6,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#8fa3bc',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    resize: 'vertical',
    minHeight: 80,
    boxSizing: 'border-box',
  },
  radioGroup: {
    display: 'flex',
    gap: 16,
    marginTop: 2,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    color: '#e2e8f0',
    cursor: 'pointer',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#c9a227',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 12,
    marginTop: 24,
    paddingBottom: 6,
    borderBottom: '1px solid rgba(201,162,39,0.2)',
  },
  canvasWrap: {
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  clearBtn: {
    padding: '5px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: '#8fa3bc',
    fontSize: 12,
    cursor: 'pointer',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    marginBottom: 20,
    padding: '12px 14px',
    background: 'rgba(201,162,39,0.06)',
    border: '1px solid rgba(201,162,39,0.15)',
    borderRadius: 8,
  },
  checkboxText: {
    fontSize: 13,
    color: '#e2e8f0',
    lineHeight: 1.6,
  },
  submitBtn: {
    width: '100%',
    padding: '13px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  successCard: {
    textAlign: 'center',
    padding: '40px 24px',
    background: 'rgba(16,185,129,0.06)',
    border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: 12,
  },
  errorCard: {
    textAlign: 'center',
    padding: '40px 24px',
    background: 'rgba(239,68,68,0.06)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 12,
  },
}

export default function UBODeclarationForm() {
  const { token } = useParams()

  const [loading, setLoading] = useState(true)
  const [party, setParty] = useState(null)
  const [error, setError] = useState(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    date_of_birth: '',
    nationality: '',
    country_of_residence: '',
    residential_address: '',
    ownership_percentage: '',
    source_of_wealth: '',
    is_pep: null,
  })

  const [declared, setDeclared] = useState(false)
  const [signatureDrawn, setSignatureDrawn] = useState(false)

  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const hasSignatureRef = useRef(false)

  useEffect(() => {
    async function load() {
      try {
        const parties = await restGet(`structure_parties?kyc_upload_token=eq.${token}&select=*`)
        if (!parties || parties.length === 0) {
          setError('This link is invalid or has expired.')
          setLoading(false)
          return
        }
        const p = parties[0]
        setParty(p)
        setForm(f => ({ ...f, full_name: p.full_name || '', }))

        // Check if already submitted
        const decls = await restGet(`ubo_declarations?party_id=eq.${p.id}&select=id`)
        if (decls && decls.length > 0) {
          setAlreadySubmitted(true)
        }
      } catch (e) {
        setError('Failed to load form. Please try again.')
      }
      setLoading(false)
    }
    load()
  }, [token])

  // Canvas drawing setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function getPos(e) {
      const rect = canvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height),
      }
    }

    function startDraw(e) {
      e.preventDefault()
      isDrawingRef.current = true
      const pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    function draw(e) {
      e.preventDefault()
      if (!isDrawingRef.current) return
      const pos = getPos(e)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      if (!hasSignatureRef.current) {
        hasSignatureRef.current = true
        setSignatureDrawn(true)
      }
    }

    function stopDraw() {
      isDrawingRef.current = false
    }

    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDraw)
    canvas.addEventListener('mouseleave', stopDraw)
    canvas.addEventListener('touchstart', startDraw, { passive: false })
    canvas.addEventListener('touchmove', draw, { passive: false })
    canvas.addEventListener('touchend', stopDraw)

    return () => {
      canvas.removeEventListener('mousedown', startDraw)
      canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', stopDraw)
      canvas.removeEventListener('mouseleave', stopDraw)
      canvas.removeEventListener('touchstart', startDraw)
      canvas.removeEventListener('touchmove', draw)
      canvas.removeEventListener('touchend', stopDraw)
    }
  }, [loading, alreadySubmitted])

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasSignatureRef.current = false
    setSignatureDrawn(false)
  }

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!declared || !signatureDrawn) return
    setSubmitting(true)

    const canvas = canvasRef.current
    const signatureData = canvas ? canvas.toDataURL('image/png') : null

    const payload = {
      party_id: party.id,
      onboarding_id: party.onboarding_id,
      full_name: form.full_name,
      date_of_birth: form.date_of_birth || null,
      nationality: form.nationality,
      country_of_residence: form.country_of_residence,
      residential_address: form.residential_address,
      ownership_percentage: form.ownership_percentage !== '' ? parseFloat(form.ownership_percentage) : null,
      source_of_wealth: form.source_of_wealth,
      is_pep: form.is_pep === 'yes',
      declaration_agreed: true,
      signature_data: signatureData,
      status: 'submitted',
    }

    try {
      await restPost('ubo_declarations', payload)
      await restPost('kyc_documents', {
        party_id: party.id,
        onboarding_id: party.onboarding_id,
        document_type: 'ubo_declaration',
        file_name: `UBO Declaration — ${form.full_name}`,
        status: 'pending',
        notes: 'Submitted via online UBO Declaration Form',
      })
      setSubmitted(true)
    } catch (err) {
      setError('Submission failed. Please try again.')
    }
    setSubmitting(false)
  }

  const canSubmit = declared && signatureDrawn && !submitting

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, textAlign: 'center', paddingTop: 80 }}>
          <div style={{ color: '#8fa3bc', fontSize: 14 }}>Loading form…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>AUREVYA</div>
          <div style={styles.errorCard}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Link Not Found</div>
            <div style={{ fontSize: 13, color: '#8fa3bc', lineHeight: 1.6 }}>{error}</div>
          </div>
        </div>
      </div>
    )
  }

  if (alreadySubmitted) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>AUREVYA</div>
          <div style={styles.successCard}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>Already Submitted</div>
            <div style={{ fontSize: 13, color: '#8fa3bc', lineHeight: 1.6 }}>
              Your UBO Declaration has already been submitted. If you believe this is an error, please contact your Aurevya relationship manager.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>AUREVYA</div>
          <div style={styles.successCard}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>Declaration Submitted</div>
            <div style={{ fontSize: 13, color: '#8fa3bc', lineHeight: 1.6 }}>
              Thank you, <strong style={{ color: '#e2e8f0' }}>{form.full_name}</strong>. Your UBO Declaration has been securely submitted to Aurevya Wealth Management for review.
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: '#8fa3bc' }}>You may now close this tab.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>AUREVYA</div>
        <div style={styles.subtitle}>Wealth Management — Secure Form</div>

        <div style={styles.heading}>UBO Declaration Form</div>
        <div style={styles.subheading}>
          As a shareholder, you are required to complete this Ultimate Beneficial Owner (UBO) Declaration. All information is encrypted and handled in strict confidence.
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Personal Details */}
          <div style={styles.sectionTitle}>Personal Details</div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Full Legal Name</label>
            <input style={styles.input} value={form.full_name} onChange={e => handleChange('full_name', e.target.value)} required />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Date of Birth</label>
            <input type="date" style={styles.input} value={form.date_of_birth} onChange={e => handleChange('date_of_birth', e.target.value)} required />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Nationality</label>
            <input style={styles.input} value={form.nationality} onChange={e => handleChange('nationality', e.target.value)} required />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Country of Residence</label>
            <input style={styles.input} value={form.country_of_residence} onChange={e => handleChange('country_of_residence', e.target.value)} required />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Residential Address</label>
            <textarea style={styles.textarea} value={form.residential_address} onChange={e => handleChange('residential_address', e.target.value)} required />
          </div>

          {/* Ownership & Wealth */}
          <div style={styles.sectionTitle}>Ownership & Source of Wealth</div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Percentage of Ownership / Control (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              style={styles.input}
              value={form.ownership_percentage}
              onChange={e => handleChange('ownership_percentage', e.target.value)}
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Source of Wealth</label>
            <textarea
              style={styles.textarea}
              value={form.source_of_wealth}
              onChange={e => handleChange('source_of_wealth', e.target.value)}
              placeholder="Describe how you acquired your wealth (e.g. business income, inheritance, investments…)"
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Are you a Politically Exposed Person (PEP)?</label>
            <div style={styles.radioGroup}>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="is_pep"
                  value="yes"
                  checked={form.is_pep === 'yes'}
                  onChange={() => handleChange('is_pep', 'yes')}
                  required
                />
                Yes
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="is_pep"
                  value="no"
                  checked={form.is_pep === 'no'}
                  onChange={() => handleChange('is_pep', 'no')}
                />
                No
              </label>
            </div>
          </div>

          {/* Signature */}
          <div style={styles.sectionTitle}>Digital Signature</div>
          <div style={{ fontSize: 12, color: '#8fa3bc', marginBottom: 8 }}>
            Please sign in the box below using your mouse or finger.
          </div>
          <div style={styles.canvasWrap}>
            <canvas
              ref={canvasRef}
              width={528}
              height={150}
              style={{ display: 'block', width: '100%', height: 150, touchAction: 'none', cursor: 'crosshair' }}
            />
          </div>
          <button type="button" style={styles.clearBtn} onClick={clearSignature}>Clear Signature</button>
          {!signatureDrawn && (
            <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 6 }}>Signature required to submit.</div>
          )}

          {/* Declaration */}
          <div style={styles.checkboxRow}>
            <input
              type="checkbox"
              id="declaration"
              checked={declared}
              onChange={e => setDeclared(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#c9a227', flexShrink: 0 }}
            />
            <label htmlFor="declaration" style={styles.checkboxText}>
              I declare that the information provided above is true, accurate and complete to the best of my knowledge and belief.
            </label>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...styles.submitBtn,
              background: canSubmit ? '#c9a227' : 'rgba(201,162,39,0.25)',
              color: canSubmit ? '#0a0f1e' : '#8fa3bc',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting…' : 'Submit UBO Declaration'}
          </button>
        </form>

        <div style={{ marginTop: 24, fontSize: 11, color: 'rgba(143,163,188,0.5)', textAlign: 'center', lineHeight: 1.6 }}>
          This form is encrypted and transmitted securely. Aurevya Wealth Management Limited.
        </div>
      </div>
    </div>
  )
}
