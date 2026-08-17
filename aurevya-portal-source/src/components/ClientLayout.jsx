import { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../supabase.js'
import SetPasswordModal from './SetPasswordModal.jsx'
import ChangePasswordModal from './ChangePasswordModal.jsx'
import {
  LayoutDashboard, Building2, FileText, Receipt,
  MessageSquare, Settings, LogOut, ClipboardList,
  Users, MapPin, X
} from 'lucide-react'

function ExpiredLinkGuard() {
  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('error_code=otp_expired')) {
      const params = new URLSearchParams(hash.slice(1))
      const email = params.get('email') || ''
      window.location.href = `/link-expired${email ? '?email=' + encodeURIComponent(email) : ''}`
    }
  }, [])
  return null
}

export default function ClientLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showSetPassword, setShowSetPassword] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [notifications, setNotifications] = useState([]) // [{id, preview, conversationId}]

  const isOnMessages = location.pathname.includes('/portal/messages')

  // Check first login flag
  useEffect(() => {
    async function checkFirstLogin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.user_metadata?.first_login === true) {
        setShowSetPassword(true)
      }
    }
    checkFirstLogin()
  }, [])

  // Catch expired link errors in URL hash
  useEffect(() => {
    const hash = window.location.hash
    if (hash && (hash.includes('otp_expired') || hash.includes('error_description'))) {
      const params = new URLSearchParams(hash.replace('#', '?'))
      const email = params.get('email') || ''
      window.history.replaceState(null, '', window.location.pathname)
      window.location.href = `/link-expired${email ? '?email=' + encodeURIComponent(email) : ''}`
    }
  }, [])

  // Load unread staff messages on mount
  const loadUnread = useCallback(async () => {
    if (isOnMessages) return
    // Get messages from staff sent after client's last visit to messages page
    const lastSeen = localStorage.getItem('client_messages_last_seen') || '1970-01-01T00:00:00Z'
    const { data } = await supabase
      .from('messages')
      .select('id, content, sender_id, conversation_id, created_at, profiles(full_name, role)')
      .gt('created_at', lastSeen)
      .order('created_at', { ascending: false })
      .limit(10)
    if (!data?.length) return
    const staffMsgs = data.filter(m => m.profiles?.role === 'admin' || m.profiles?.role === 'staff')
    if (!staffMsgs.length) return
    const seen = new Set()
    const notifs = []
    for (const m of staffMsgs) {
      if (!seen.has(m.conversation_id)) {
        seen.add(m.conversation_id)
        notifs.push({ id: m.id, preview: m.content, conversationId: m.conversation_id })
      }
    }
    setNotifications(notifs)
  }, [isOnMessages])

  useEffect(() => {
    loadUnread()
  }, [loadUnread])

  // Clear when navigating to messages and update last seen
  useEffect(() => {
    if (isOnMessages) {
      localStorage.setItem('client_messages_last_seen', new Date().toISOString())
      setNotifications([])
    }
  }, [isOnMessages])

  // Real-time subscription for new staff messages
  useEffect(() => {
    const channel = supabase.channel('client-msg-notif')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const { data: prof } = await supabase.from('profiles').select('full_name, role').eq('id', payload.new.sender_id).maybeSingle()
        if (!prof || (prof.role !== 'admin' && prof.role !== 'staff')) return
        if (isOnMessages) return
        setNotifications(prev => {
          if (prev.some(n => n.conversationId === payload.new.conversation_id)) {
            return prev.map(n => n.conversationId === payload.new.conversation_id
              ? { ...n, preview: payload.new.content, id: payload.new.id }
              : n)
          }
          return [{ id: payload.new.id, preview: payload.new.content, conversationId: payload.new.conversation_id }, ...prev]
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [isOnMessages])

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
    : '?'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      {showSetPassword && <SetPasswordModal onClose={() => setShowSetPassword(false)} />}
      {showChangePassword && (
        <ChangePasswordModal email={profile?.email} onClose={() => setShowChangePassword(false)} />
      )}

      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">A</div>
          <div className="logo-text">
            <span className="logo-name">Aurevya Wealth</span>
            <span className="logo-sub">Client Portal</span>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{profile?.full_name || 'Client'}</div>
            <div className="user-role">Private Client · UHNW</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-label">Overview</div>
            <NavLink to="/portal/dashboard" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <LayoutDashboard size={16}/> Dashboard
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-label">Onboarding</div>
            <NavLink to="/portal/questionnaire" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <ClipboardList size={16}/> Questionnaire
            </NavLink>
            <NavLink to="/portal/structure" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <Users size={16}/> Structure &amp; KYC
            </NavLink>
            <NavLink to="/portal/journey" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <MapPin size={16}/> Journey Tracker
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-label">My Structures</div>
            <NavLink to="/portal/entities" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <Building2 size={16}/> Entities &amp; Structures
            </NavLink>
            <NavLink to="/portal/documents" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <FileText size={16}/> Documents
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-label">Finance</div>
            <NavLink to="/portal/invoices" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <Receipt size={16}/> Invoices &amp; Payments
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-label">Communication</div>
            <NavLink to="/portal/messages" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <MessageSquare size={16}/> Secure Messages
              {notifications.length > 0 && !isOnMessages && (
                <span style={{ marginLeft:'auto',background:'#C9A84C',color:'#0a0f1e',borderRadius:10,fontSize:10,fontWeight:700,padding:'1px 6px',minWidth:16,textAlign:'center' }}>
                  {notifications.length}
                </span>
              )}
            </NavLink>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div style={{ marginBottom:8 }}>
            <button className="nav-item" style={{ width:'100%',border:'none',background:'none',cursor:'pointer' }} onClick={() => setShowChangePassword(true)}>
              <Settings size={16}/> Change Password
            </button>
          </div>
          <button className="nav-item" style={{ width:'100%',border:'none',background:'none',cursor:'pointer',color:'#ef4444' }} onClick={handleSignOut}>
            <LogOut size={16}/> Sign Out
          </button>
        </div>
      </aside>

      <div className="main-content" style={{ display:'flex', flexDirection:'column' }}>
        {/* Notification banners */}
        {notifications.length > 0 && !isOnMessages && (
          <div style={{ flexShrink:0 }}>
            {notifications.map(n => (
              <div key={n.id}
                onClick={() => { navigate('/portal/messages'); setNotifications([]) }}
                style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 20px',background:'linear-gradient(90deg,#8a6c1a,#C9A84C)',color:'#0a0f1e',cursor:'pointer',borderBottom:'1px solid rgba(0,0,0,0.1)',fontSize:13 }}>
                <MessageSquare size={16} style={{ flexShrink:0 }}/>
                <div style={{ flex:1, overflow:'hidden' }}>
                  <span style={{ fontWeight:700 }}>New message from Aurevya Wealth:</span>
                  <span style={{ marginLeft:6,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'inline-block',maxWidth:400,verticalAlign:'bottom' }}>
                    "{n.preview}"
                  </span>
                </div>
                <span style={{ fontSize:11,opacity:0.75,flexShrink:0,marginRight:8 }}>Click to view →</span>
                <button onClick={e => { e.stopPropagation(); setNotifications(prev => prev.filter(x => x.id !== n.id)) }}
                  style={{ background:'none',border:'none',color:'rgba(0,0,0,0.5)',cursor:'pointer',padding:2,display:'flex',alignItems:'center',flexShrink:0 }}>
                  <X size={14}/>
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex:1, overflow:'auto' }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
