import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { Lock, Mail, Eye, EyeOff, Shield } from 'lucide-react'

export default function Login() {
  const { signIn, profile } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login') // login | forgot

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data, error: err } = await signIn(email, password)
    setLoading(false)
    if (err) { setError(err.message); return }
    // redirect based on role (handled by App router after profile loads)
    setTimeout(() => navigate('/'), 300)
  }

  return (
    <div className="login-page">
      <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'2px',background:'linear-gradient(90deg,transparent,#C9A84C,transparent)' }}></div>

      <div className="login-card">
        <div className="login-logo">
          <div className="logo-icon" style={{ margin:'0 auto 12px' }}>A</div>
          <div className="brand-name">Aurevya Wealth</div>
          <div className="brand-sub" style={{ fontFamily:'Inter',fontSize:10,color:'#C9A84C',letterSpacing:'0.2em',marginTop:4 }}>CLIENT PORTAL</div>
        </div>

        <div className="login-title">{mode === 'login' ? 'Welcome back' : 'Reset password'}</div>
        <div className="login-sub" style={{ marginBottom:20 }}>
          {mode === 'login' ? 'Sign in to access your structures, documents and invoices' : 'Enter your email to receive a reset link'}
        </div>

        {error && <div className="error-msg">{error}</div>}

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <div style={{ position:'relative' }}>
                <Mail size={15} style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#5a7390' }} />
                <input
                  type="email" className="form-input" placeholder="you@aurevya.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  required style={{ paddingLeft:32 }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position:'relative' }}>
                <Lock size={15} style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#5a7390' }} />
                <input
                  type={showPw ? 'text' : 'password'} className="form-input"
                  placeholder="••••••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  required style={{ paddingLeft:32,paddingRight:36 }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'#5a7390',cursor:'pointer',padding:2 }}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width:'100%',justifyContent:'center',padding:'11px 20px',fontSize:14 }} disabled={loading}>
              {loading ? <span className="spinner" style={{ width:18,height:18 }}></span> : <><Lock size={14}/> Sign in securely</>}
            </button>

            <div style={{ textAlign:'center',marginTop:16 }}>
              <button type="button" onClick={() => setMode('forgot')}
                style={{ background:'none',border:'none',color:'#C9A84C',fontSize:13,cursor:'pointer',padding:0 }}>
                Forgot your password?
              </button>
            </div>
          </form>
        ) : (
          <ForgotPassword onBack={() => setMode('login')} />
        )}

        <hr className="divider" />
        <div style={{ display:'flex',alignItems:'center',gap:6,justifyContent:'center',color:'#5a7390',fontSize:12 }}>
          <Shield size={13}/> 256-bit SSL encryption · Session auto-expires
        </div>

        <div style={{ marginTop:16,textAlign:'center',fontSize:11,color:'#5a7390' }}>
          Regulated by the Financial Services Commission of Mauritius · MC12000144
        </div>
      </div>
    </div>
  )
}

function ForgotPassword({ onBack }) {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await resetPassword(email)
    setLoading(false)
    setSent(true)
  }

  if (sent) return (
    <div>
      <div className="success-msg">Reset link sent. Check your inbox.</div>
      <button className="btn btn-secondary" onClick={onBack} style={{ width:'100%',justifyContent:'center' }}>Back to sign in</button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Email address</label>
        <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@aurevya.com"/>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width:'100%',justifyContent:'center' }} disabled={loading}>
        {loading ? 'Sending...' : 'Send reset link'}
      </button>
      <button type="button" onClick={onBack} className="btn btn-ghost" style={{ width:'100%',justifyContent:'center',marginTop:8 }}>
        Back to sign in
      </button>
    </form>
  )
}
