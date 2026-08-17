import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import { Send, Plus, Phone, MessageSquare } from 'lucide-react'

export default function ClientMessages() {
  const { user, profile } = useAuth()
  const [convos, setConvos] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef()

  useEffect(() => { if (user) loadConvos() }, [user])
  useEffect(() => { if (selected) loadMessages(selected.id) }, [selected])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function loadConvos() {
    const { data } = await supabase.from('conversations')
      .select('*, profiles!conversations_staff_id_fkey(full_name, role)')
      .eq('client_id', user.id)
      .order('last_message_at', { ascending: false })
    setConvos(data || [])
    if (data?.length > 0) setSelected(data[0])
    setLoading(false)
  }

  async function loadMessages(convoId) {
    const { data } = await supabase.from('messages')
      .select('*, profiles(full_name)')
      .eq('conversation_id', convoId)
      .order('created_at')
    setMessages(data || [])
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selected) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      conversation_id: selected.id,
      sender_id: user.id,
      content: newMsg.trim()
    })
    if (!error) {
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selected.id)
      setNewMsg('')
      loadMessages(selected.id)
    }
    setSending(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const isMe = (msg) => msg.sender_id === user.id

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Secure Messages</div>
          <div className="page-title-sub">Encrypted direct communication with your advisor</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => alert('New conversation — your advisor will be assigned shortly.')}>
          <Plus size={14}/> New Conversation
        </button>
      </div>

      <div className="page-body" style={{ padding:0, display:'flex', height:'calc(100vh - 65px)' }}>
        {/* Convo list */}
        <div style={{ width:280, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#8fa3bc', textTransform:'uppercase', letterSpacing:'0.08em' }}>Conversations</div>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {convos.length === 0 ? (
              <div className="empty-state" style={{ padding:24 }}><MessageSquare size={24}/><p style={{fontSize:12,marginTop:8}}>No conversations yet</p></div>
            ) : convos.map(c => (
              <div key={c.id}
                onClick={() => setSelected(c)}
                style={{ padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid var(--border)', background: selected?.id === c.id ? 'var(--bg-hover)' : 'transparent', borderLeft: selected?.id === c.id ? '2px solid #C9A84C' : '2px solid transparent' }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1e3a5f,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, flexShrink:0 }}>
                    {c.profiles?.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2) || 'AW'}
                  </div>
                  <div style={{ overflow:'hidden' }}>
                    <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {c.profiles?.full_name || 'Aurevya Team'}
                    </div>
                    <div style={{ fontSize:11, color:'#8fa3bc' }}>
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : 'New'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Message area */}
        {selected ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
            {/* Chat header */}
            <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#1e3a5f,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600 }}>
                  {selected.profiles?.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2) || 'AW'}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{selected.profiles?.full_name || 'Aurevya Wealth'}</div>
                  <div style={{ fontSize:11, color:'#10B981' }}>● Online · Usually responds within 2 hours</div>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm">
                <Phone size={13}/> Schedule Call
              </button>
            </div>

            {/* Messages */}
            <div className="msg-area">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <MessageSquare size={32}/>
                  <p style={{ marginTop:12, fontSize:13 }}>No messages yet. Say hello!</p>
                </div>
              ) : messages.map(msg => (
                <div key={msg.id} style={{ display:'flex', flexDirection:'column', alignItems: isMe(msg) ? 'flex-end' : 'flex-start', marginBottom:12 }}>
                  {!isMe(msg) && <div className="msg-sender">{msg.profiles?.full_name || 'Aurevya Team'}</div>}
                  <div className={`msg-bubble ${isMe(msg) ? 'sent' : 'received'}`}>
                    {msg.content}
                  </div>
                  <div className="msg-time">{new Date(msg.created_at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>
                </div>
              ))}
              <div ref={bottomRef}/>
            </div>

            {/* Input */}
            <div className="msg-input-bar">
              <textarea
                className="form-input"
                placeholder="Write a secure message..."
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                style={{ flex:1, resize:'none', minHeight:'auto' }}
              />
              <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !newMsg.trim()}>
                <Send size={14}/> {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div className="empty-state"><MessageSquare size={40}/><p>Select a conversation to start messaging</p></div>
          </div>
        )}
      </div>
    </div>
  )
}
