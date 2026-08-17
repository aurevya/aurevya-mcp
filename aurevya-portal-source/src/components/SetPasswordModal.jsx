import { useState } from 'react'
import { supabase } from '../supabase.js'
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react'

export default function SetPasswordModal({ onClose }) {
  const [pw, setPw]       = useState('')
  const [pw2, setPw2]     = useState('')
  const [show, setShow]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [done, setDone]     = useState(false)

  const strong = pw.length >= 8
  const match  = pw === pw2

  async function save() {
    if (!strong) { setError('Password must be at least 8 characters'); return }
    if (!match)  { setError('Passwords do not match'); return }
    setSaving(true); setError(null)
    const { error: err } = await supabase.auth.updateUser({
      password: pw,
      data: { first_login: false },
    })
    if (err) { setError(err.message); setSaving(false); return }
    setDone(true)
    setTimeout(() => onClose(), 2200)
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'#0f1623',border:'1px solid rgba(201,162,39,0.3)',borderRadius:14,padding:32,maxWidth:400,width:'100%' }}>
        {done ? (
          <div style={{ textAlign:'center',padding:'12px 0' }}>
            <CheckCircle size={36} style={{ color:'#10B981',margin:'0 auto 12px' }} />
            <div style={{ color:'#e2e8f0',fontWeight:700,fontSize:16 }}>Password Set!</div>
            <div style={{ color:'#8fa3bc',fontSize:13,marginTop:6 }}>Welcome to Aurevya Wealth. Redirecting…</div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:20 }}>
              <Lock size={20} style={{ color:'#c9a227' }} />
              <div>
                <div style={{ fontWeight:700,color:'#e2e8f0',fontSize:16 }}>Set Your Password</div>
                <div style={{ color:'#8fa3bc',fontSize:12,marginTop:2 }}>Create a secure password for your portal access</div>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:4 }}>New Password</label>
              <div style={{ position:'relative' }}>
                <input type={show?'text':'password'} value={pw} onChange={e=>setPw(e.target.value)}
                  placeholder="Minimum 8 characters"
                  style={{ width:'100%',padding:'9px 36px 9px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#e2e8f0',fontSize:13 }} />
                <button onClick={()=>setShow(s=>!s)} style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#8fa3bc' }}>
                  {show ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              {pw && <div style={{ fontSize:11,marginTop:4,color: strong ? '#10B981' : '#F59E0B' }}>{strong ? '✓ Strong enough' : 'Too short'}</div>}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block',fontSize:12,color:'#8fa3bc',marginBottom:4 }}>Confirm Password</label>
              <input type={show?'text':'password'} value={pw2} onChange={e=>setPw2(e.target.value)}
                placeholder="Repeat password"
                style={{ width:'100%',padding:'9px 12px',borderRadius:6,border:`1px solid ${pw2&&!match?'#ef4444':'rgba(255,255,255,0.1)'}`,background:'rgba(255,255,255,0.05)',color:'#e2e8f0',fontSize:13 }} />
              {pw2 && !match && <div style={{ fontSize:11,marginTop:4,color:'#ef4444' }}>Passwords do not match</div>}
            </div>
            {error && <div style={{ color:'#ef4444',fontSize:13,marginBottom:10 }}>{error}</div>}
            <button onClick={save} disabled={saving}
              style={{ width:'100%',padding:'10px',borderRadius:8,border:'none',cursor:saving?'not-allowed':'pointer',background:'#c9a227',color:'#0a0f1e',fontWeight:700,fontSize:14,opacity:saving?0.7:1 }}>
              {saving ? 'Saving…' : 'Set Password & Continue'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
