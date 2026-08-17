import { useState } from 'react'
import { supabase } from '../supabase.js'
import { Eye, EyeOff, Lock, CheckCircle, X } from 'lucide-react'

export const MIN_PASSWORD_LENGTH = 8

/* Self-service password change, for any signed-in user (staff or client).
 *
 * Distinct from SetPasswordModal, which is the first-login "choose your
 * password" step and has no existing password to check. Here the account
 * already has a password, so we re-authenticate with it before changing
 * anything: supabase.auth.updateUser() will happily change the password of
 * whoever holds the session without asking for the old one, which means an
 * unattended logged-in browser would otherwise be enough to lock the real
 * owner out of their account. */
export default function ChangePasswordModal({ email, onClose }) {
  const [current, setCurrent] = useState('')
  const [pw, setPw]           = useState('')
  const [pw2, setPw2]         = useState('')
  const [show, setShow]       = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const [done, setDone]       = useState(false)

  const longEnough = pw.length >= MIN_PASSWORD_LENGTH
  const match      = pw === pw2
  const changed    = pw !== current

  async function save() {
    if (!current)     { setError('Enter your current password'); return }
    if (!longEnough)  { setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`); return }
    if (!match)       { setError('New passwords do not match'); return }
    if (!changed)     { setError('New password must be different from your current one'); return }

    setSaving(true); setError(null)

    // Re-authenticate to prove the person at the keyboard knows the current
    // password. On success this also refreshes the session we then update.
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current })
    if (authErr) {
      setError('Current password is incorrect')
      setSaving(false)
      return
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: pw })
    if (updErr) { setError(updErr.message); setSaving(false); return }

    setDone(true)
    setTimeout(() => onClose(), 1800)
  }

  const field = (extra = {}) => ({
    width:'100%', padding:'9px 36px 9px 12px', borderRadius:6,
    border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)',
    color:'#e2e8f0', fontSize:13, boxSizing:'border-box', ...extra,
  })

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'#0f1623',border:'1px solid rgba(201,162,39,0.3)',borderRadius:14,padding:32,maxWidth:420,width:'100%',position:'relative' }}>
        {!done && (
          <button onClick={onClose} aria-label="Close"
            style={{ position:'absolute',top:14,right:14,background:'none',border:'none',cursor:'pointer',color:'#8fa3bc' }}>
            <X size={16}/>
          </button>
        )}

        {done ? (
          <div style={{ textAlign:'center',padding:'12px 0' }}>
            <CheckCircle size={36} style={{ color:'#10B981',margin:'0 auto 12px' }} />
            <div style={{ color:'#e2e8f0',fontWeight:700,fontSize:16 }}>Password Changed</div>
            <div style={{ color:'#8fa3bc',fontSize:13,marginTop:6 }}>Use your new password next time you sign in.</div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:20 }}>
              <Lock size={20} style={{ color:'#c9a227' }} />
              <div>
                <div style={{ fontWeight:700,color:'#e2e8f0',fontSize:16 }}>Change Password</div>
                <div style={{ color:'#8fa3bc',fontSize:12,marginTop:2 }}>{email}</div>
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:4 }}>Current Password</label>
              <input type={show?'text':'password'} value={current} onChange={e=>setCurrent(e.target.value)}
                autoComplete="current-password" placeholder="Your existing password" style={field()} />
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:4 }}>New Password</label>
              <div style={{ position:'relative' }}>
                <input type={show?'text':'password'} value={pw} onChange={e=>setPw(e.target.value)}
                  autoComplete="new-password" placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`} style={field()} />
                <button onClick={()=>setShow(s=>!s)} type="button"
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
              <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:4 }}>Confirm New Password</label>
              <input type={show?'text':'password'} value={pw2} onChange={e=>setPw2(e.target.value)}
                autoComplete="new-password" placeholder="Repeat new password"
                style={field({ border:`1px solid ${pw2&&!match?'#ef4444':'rgba(255,255,255,0.1)'}` })} />
              {pw2 && !match && <div style={{ fontSize:11,marginTop:4,color:'#ef4444' }}>Passwords do not match</div>}
            </div>

            {error && <div style={{ color:'#ef4444',fontSize:13,marginBottom:10 }}>{error}</div>}

            <button onClick={save} disabled={saving}
              style={{ width:'100%',padding:'10px',borderRadius:8,border:'none',cursor:saving?'not-allowed':'pointer',background:'#c9a227',color:'#0a0f1e',fontWeight:700,fontSize:14,opacity:saving?0.7:1 }}>
              {saving ? 'Saving…' : 'Change Password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
