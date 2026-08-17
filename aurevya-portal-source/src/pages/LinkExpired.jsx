import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'

const EMAILJS_URL  = 'https://api.emailjs.com/api/v1.0/email/send'
const SERVICE_ID   = 'service_cj5jbwp'
const TEMPLATE_ID  = 'template_generic'
const PUBLIC_KEY   = 'KvpkKpBBnGSjjVq3e'
const PORTAL_URL   = 'https://aurevya-portal.netlify.app'
const SUPABASE_URL = 'https://wxwbfkhvkrwtmsgwdkjy.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d2Jma2h2a3J3dG1zZ3dka2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM5NDAsImV4cCI6MjA5NTg4OTk0MH0.RVFvV3Tu6vgIs3KvPsjOrfdsLaevncysHrirLjAATXM'

async function sendNewLink(email) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-portal-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ email }),
  })
  const { link } = await res.json()
  if (!link) throw new Error('Could not generate link')

  const body = `Dear Client,\n\nYour previous portal access link has expired. Here is your new secure access link:\n\n${link}\n\nThis link is valid for 24 hours. If you need further assistance, please contact your Aurevya advisor.\n\nKind regards,\nAurevya Wealth Management`
  await fetch(EMAILJS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID, template_id: TEMPLATE_ID, user_id: PUBLIC_KEY,
      template_params: { to_email: email, to_name: 'Client', subject: 'New Portal Access Link — Aurevya Wealth', message: body }
    })
  })
}

export default function LinkExpired() {
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const [email, setEmail] = useState('')
  const [inputEmail, setInputEmail] = useState('')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const em = params.get('email')
    if (em) {
      setEmail(em)
      setState('auto')
      setTimeout(() => autoSend(em), 1200)
    }
  }, [])

  async function autoSend(em) {
    setState('sending')
    try {
      await sendNewLink(em)
      setState('sent')
    } catch (e) {
      setErrMsg(e.message)
      setState('error')
    }
  }

  async function manualSend() {
    const em = inputEmail.trim()
    if (!em) return
    setState('sending')
    try {
      await sendNewLink(em)
      setEmail(em)
      setState('sent')
    } catch (e) {
      setErrMsg(e.message)
      setState('error')
    }
  }

  return (
    <div style={{ minHeight:'100vh',background:'#080d18',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ maxWidth:440,width:'100%',textAlign:'center' }}>
        <div style={{ width:56,height:56,borderRadius:'50%',background:'rgba(245,158,11,0.15)',border:'1px solid rgba(245,158,11,0.3)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontSize:24 }}>⏱</div>

        {state === 'idle' && (
          <>
            <h2 style={{ color:'#e2e8f0',fontWeight:700,fontSize:20,marginBottom:8 }}>Access Link Expired</h2>
            <p style={{ color:'#8fa3bc',fontSize:14,lineHeight:1.6,marginBottom:24 }}>
              Your portal access link has expired. Enter your email and we'll send you a new one right away.
            </p>
            <input value={inputEmail} onChange={e=>setInputEmail(e.target.value)}
              placeholder="your@email.com" type="email"
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#e2e8f0',fontSize:14,marginBottom:12 }} />
            <button onClick={manualSend}
              style={{ width:'100%',padding:'11px',borderRadius:8,border:'none',background:'#c9a227',color:'#0a0f1e',fontWeight:700,fontSize:14,cursor:'pointer' }}>
              Send New Link
            </button>
          </>
        )}

        {(state === 'auto' || state === 'sending') && (
          <>
            <h2 style={{ color:'#e2e8f0',fontWeight:700,fontSize:20,marginBottom:8 }}>Sending New Link…</h2>
            <p style={{ color:'#8fa3bc',fontSize:14 }}>We're generating a fresh access link for {email || 'your account'} — this takes just a moment.</p>
            <div className="spinner" style={{ width:32,height:32,margin:'20px auto 0' }}></div>
          </>
        )}

        {state === 'sent' && (
          <>
            <h2 style={{ color:'#10B981',fontWeight:700,fontSize:20,marginBottom:8 }}>New Link Sent ✓</h2>
            <p style={{ color:'#8fa3bc',fontSize:14,lineHeight:1.6 }}>
              A fresh access link has been sent to <strong style={{ color:'#e2e8f0' }}>{email}</strong>. Please check your inbox (and spam folder).
              The link is valid for 24 hours.
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <h2 style={{ color:'#ef4444',fontWeight:700,fontSize:20,marginBottom:8 }}>Something went wrong</h2>
            <p style={{ color:'#8fa3bc',fontSize:14,marginBottom:16 }}>{errMsg || 'Could not send a new link. Please try again or contact your advisor.'}</p>
            <button onClick={() => { setState('idle'); setErrMsg('') }}
              style={{ padding:'9px 24px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8fa3bc',cursor:'pointer',fontSize:13 }}>
              Try Again
            </button>
          </>
        )}

        <div style={{ marginTop:32,color:'#8fa3bc',fontSize:12 }}>
          Need help? Contact your Aurevya advisor.
        </div>
      </div>
    </div>
  )
}
