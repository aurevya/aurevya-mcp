import { useState } from 'react'
import { createUser, setUserPassword } from '../adminApi.js'
import { Eye, EyeOff, UserPlus, KeyRound, CheckCircle, X } from 'lucide-react'

export const MIN_PASSWORD_LENGTH = 8

/* Two closely related admin jobs in one modal, because they share all the
 * password UI: creating a brand-new account with its password already set,
 * and replacing the password on an account that already exists.
 *
 * Pass `existingUser` ({ id, full_name, email }) for the second mode.
 *
 * Deliberately no invite email in either path — the admin sets the password
 * and passes it to the person directly. */
export default function CreateUserModal({ existingUser, onClose, onSaved }) {
  const resetMode = !!existingUser

  const [email, setEmail]       = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole]         = useState('staff')
  const [department, setDept]   = useState('')
  const [pw, setPw]             = useState('')
  const [pw2, setPw2]           = useState('')
  const [show, setShow]         = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)
  const [done, setDone]         = useState(false)

  const longEnough = pw.length >= MIN_PASSWORD_LENGTH
  const match      = pw === pw2

  async function save() {
    if (!resetMode) {
      if (!fullName.trim()) { setError('Full name is required'); return }
      if (!email.trim())    { setError('Email address is required'); return }
    }
    if (!longEnough) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`); return }
    if (!match)      { setError('Passwords do not match'); return }

    setSaving(true); setError(null)
    try {
      if (resetMode) {
        await setUserPassword({ user_id: existingUser.id, password: pw })
      } else {
        await createUser({
          email: email.trim(),
          password: pw,
          full_name: fullName.trim(),
          role,
          department: department.trim() || null,
        })
      }
      setDone(true)
      onSaved?.()
      setTimeout(() => onClose(), 1600)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const inputStyle = (extra = {}) => ({
    width:'100%', padding:'9px 12px', borderRadius:6,
    border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)',
    color:'#e2e8f0', fontSize:13, boxSizing:'border-box', ...extra,
  })
  const labelStyle = { display:'block', fontSize:12, color:'#8fa3bc', marginBottom:4 }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'#0f1623',border:'1px solid rgba(201,162,39,0.3)',borderRadius:14,padding:32,maxWidth:460,width:'100%',maxHeight:'90vh',overflowY:'auto',position:'relative' }}>
        {!done && (
          <button onClick={onClose} aria-label="Close"
            style={{ position:'absolute',top:14,right:14,background:'none',border:'none',cursor:'pointer',color:'#8fa3bc' }}>
            <X size={16}/>
          </button>
        )}

        {done ? (
          <div style={{ textAlign:'center',padding:'12px 0' }}>
            <CheckCircle size={36} style={{ color:'#10B981',margin:'0 auto 12px' }} />
            <div style={{ color:'#e2e8f0',fontWeight:700,fontSize:16 }}>
              {resetMode ? 'Password Updated' : 'User Created'}
            </div>
            <div style={{ color:'#8fa3bc',fontSize:13,marginTop:6 }}>
              {resetMode
                ? 'Pass the new password to them securely.'
                : 'They can sign in straight away with the password you set.'}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:20 }}>
              {resetMode ? <KeyRound size={20} style={{ color:'#c9a227' }}/> : <UserPlus size={20} style={{ color:'#c9a227' }}/>}
              <div>
                <div style={{ fontWeight:700,color:'#e2e8f0',fontSize:16 }}>
                  {resetMode ? 'Set Password' : 'Create User'}
                </div>
                <div style={{ color:'#8fa3bc',fontSize:12,marginTop:2 }}>
                  {resetMode
                    ? `${existingUser.full_name || existingUser.email}`
                    : 'The account is active immediately — no invite email is sent'}
                </div>
              </div>
            </div>

            {!resetMode && (
              <>
                <div style={{ marginBottom:14 }}>
                  <label style={labelStyle}>Full Name</label>
                  <input value={fullName} onChange={e=>setFullName(e.target.value)}
                    placeholder="e.g. Priya Ramgoolam" style={inputStyle()} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                    autoComplete="off" placeholder="name@kundomal.com" style={inputStyle()} />
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14 }}>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select value={role} onChange={e=>setRole(e.target.value)} style={inputStyle()}>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                      <option value="client">Client</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Department <span style={{ opacity:0.6 }}>(optional)</span></label>
                    <input value={department} onChange={e=>setDept(e.target.value)}
                      placeholder="e.g. Compliance" style={inputStyle()} />
                  </div>
                </div>
              </>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>{resetMode ? 'New Password' : 'Password'}</label>
              <div style={{ position:'relative' }}>
                <input type={show?'text':'password'} value={pw} onChange={e=>setPw(e.target.value)}
                  autoComplete="new-password" placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
                  style={inputStyle({ paddingRight:36 })} />
                <button type="button" onClick={()=>setShow(s=>!s)}
                  style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#8fa3bc' }}>
                  {show ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              {pw && (
                <div style={{ fontSize:11,marginTop:4,color: longEnough ? '#10B981' : '#F59E0B' }}>
                  {longEnough ? '✓ Long enough' : `${MIN_PASSWORD_LENGTH - pw.length} more character${MIN_PASSWORD_LENGTH - pw.length === 1 ? '' : 's'} needed`}
                </div>
              )}
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={labelStyle}>Confirm Password</label>
              <input type={show?'text':'password'} value={pw2} onChange={e=>setPw2(e.target.value)}
                autoComplete="new-password" placeholder="Repeat password"
                style={inputStyle({ border:`1px solid ${pw2&&!match?'#ef4444':'rgba(255,255,255,0.1)'}` })} />
              {pw2 && !match && <div style={{ fontSize:11,marginTop:4,color:'#ef4444' }}>Passwords do not match</div>}
            </div>

            {error && <div style={{ color:'#ef4444',fontSize:13,marginBottom:10,lineHeight:1.45 }}>{error}</div>}

            <button onClick={save} disabled={saving}
              style={{ width:'100%',padding:'10px',borderRadius:8,border:'none',cursor:saving?'not-allowed':'pointer',background:'#c9a227',color:'#0a0f1e',fontWeight:700,fontSize:14,opacity:saving?0.7:1 }}>
              {saving ? 'Saving…' : (resetMode ? 'Set Password' : 'Create User')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
