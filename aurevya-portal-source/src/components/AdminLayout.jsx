import { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../supabase.js'
import {
  LayoutDashboard, Users, Building2, Shield,
  Receipt, MessageSquare, UserCog, Database, LogOut, X, KeyRound
} from 'lucide-react'
import ChangePasswordModal from './ChangePasswordModal.jsx'

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [notifications, setNotifications] = useState([]) // [{id, senderName, preview, conversationId}]
  const [showChangePw, setShowChangePw] = useState(false)

  const isOnMessages = location.pathname.includes('/admin/messages')

  // Load unread messages on mount
  const loadUnread = useCallback(async () => {
    if (isOnMessages) return
    const { data } = await supabase
      .from('messages')
      .select('id, content, sender_id, conversation_id, created_at, profiles(full_name, role)')
      .eq('read_by_admin', false)
      .order('created_at', { ascending: false })
      .limit(5)
    if (!data?.length) return
    // Only show notifications from clients (not staff/admin)
    const clientMsgs = data.filter(m => {
      const role = m.profiles?.role
      return role !== 'admin' && role !== 'staff'
    })
    if (!clientMsgs.length) return
    // Group by conversation, show most recent per conversation
    const seen = new Set()
    const notifs = []
    for (const m of clientMsgs) {
      if (!seen.has(m.conversation_id)) {
        seen.add(m.conversation_id)
        notifs.push({ id: m.id, senderName: m.profiles?.full_name || 'Client', preview: m.content, conversationId: m.conversation_id })
      }
    }
    setNotifications(notifs)
  }, [isOnMessages])

  useEffect(() => {
    loadUnread()
  }, [loadUnread])

  // Clear notifications when navigating to messages
  useEffect(() => {
    if (isOnMessages) setNotifications([])
  }, [isOnMessages])

  // Real-time subscription for new incoming client messages
  useEffect(() => {
    const channel = supabase.channel('admin-msg-notif')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const { data: prof } = await supabase.from('profiles').select('full_name, role').eq('id', payload.new.sender_id).maybeSingle()
        if (!prof || prof.role === 'admin' || prof.role === 'staff') return
        if (isOnMessages) return
        setNotifications(prev => {
          // Don't duplicate same conversation
          if (prev.some(n => n.conversationId === payload.new.conversation_id)) {
            return prev.map(n => n.conversationId === payload.new.conversation_id
              ? { ...n, preview: payload.new.content, id: payload.new.id }
              : n)
          }
          return [{ id: payload.new.id, senderName: prof.full_name || 'Client', preview: payload.new.content, conversationId: payload.new.conversation_id }, ...prev]
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [isOnMessages])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
    : 'A'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">A</div>
          <div className="logo-text">
            <span className="logo-name">Aurevya Wealth</span>
            <span className="logo-sub" style={{ color:'#ef4444' }}>Staff Administration</span>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar" style={{ background:'linear-gradient(135deg,#1e3a5f,#2563eb)' }}>{initials}</div>
          <div className="user-info">
            <div className="user-name">{profile?.full_name || 'Staff'}</div>
            <div className="user-role" style={{ color:'#ef4444',fontSize:10 }}>
              {profile?.role === 'admin' ? '● Admin' : '● Staff'}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <NavLink to="/admin/dashboard" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <LayoutDashboard size={16}/> Dashboard
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-label">Client Management</div>
            <NavLink to="/admin/onboarding" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <Building2 size={16}/> Client Onboarding
            </NavLink>
            <NavLink to="/admin/clients" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <Users size={16}/> All Clients
            </NavLink>
            <NavLink to="/admin/kyc" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <Shield size={16}/> KYC / Worldcheck
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-label">Finance</div>
            <NavLink to="/admin/invoices" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <Receipt size={16}/> Invoices
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-label">Communications</div>
            <NavLink to="/admin/messages" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <MessageSquare size={16}/> Client Messages
              {notifications.length > 0 && !isOnMessages && (
                <span style={{ marginLeft:'auto',background:'#ef4444',color:'#fff',borderRadius:10,fontSize:10,fontWeight:700,padding:'1px 6px',minWidth:16,textAlign:'center' }}>
                  {notifications.length}
                </span>
              )}
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-label">System</div>
            <NavLink to="/admin/users" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <UserCog size={16}/> User Management
            </NavLink>
            <NavLink to="/admin/security" className={({isActive}) => `nav-item${isActive?' active':''}`}>
              <Database size={16}/> Database & Security
            </NavLink>
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item" style={{ width:'100%',border:'none',background:'none',cursor:'pointer' }} onClick={() => setShowChangePw(true)}>
            <KeyRound size={16}/> Change Password
          </button>
          <button className="nav-item" style={{ width:'100%',border:'none',background:'none',cursor:'pointer',color:'#ef4444' }} onClick={handleSignOut}>
            <LogOut size={16}/> Sign Out
          </button>
        </div>
      </aside>

      {showChangePw && (
        <ChangePasswordModal email={profile?.email} onClose={() => setShowChangePw(false)} />
      )}

      <div className="main-content" style={{ display:'flex', flexDirection:'column' }}>
        {/* Notification banners */}
        {notifications.length > 0 && !isOnMessages && (
          <div style={{ flexShrink:0 }}>
            {notifications.map(n => (
              <div key={n.id}
                onClick={() => { navigate('/admin/messages'); setNotifications([]) }}
                style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 20px',background:'linear-gradient(90deg,#1e3a5f,#2563eb)',color:'#fff',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.1)',fontSize:13 }}>
                <MessageSquare size={16} style={{ flexShrink:0 }}/>
                <div style={{ flex:1, overflow:'hidden' }}>
                  <span style={{ fontWeight:700 }}>{n.senderName}</span>
                  <span style={{ color:'rgba(255,255,255,0.75)',marginLeft:6 }}>sent a new message:</span>
                  <span style={{ marginLeft:6,fontStyle:'italic',color:'rgba(255,255,255,0.9)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'inline-block',maxWidth:400,verticalAlign:'bottom' }}>
                    "{n.preview}"
                  </span>
                </div>
                <span style={{ fontSize:11,color:'rgba(255,255,255,0.65)',flexShrink:0,marginRight:8 }}>Click to reply →</span>
                <button onClick={e => { e.stopPropagation(); setNotifications(prev => prev.filter(x => x.id !== n.id)) }}
                  style={{ background:'none',border:'none',color:'rgba(255,255,255,0.6)',cursor:'pointer',padding:2,display:'flex',alignItems:'center',flexShrink:0 }}>
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
