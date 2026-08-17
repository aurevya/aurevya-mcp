import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import { Send, MessageSquare, Search } from 'lucide-react'

export default function AdminMessages() {
  const { user } = useAuth()
  const [convos, setConvos] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const bottomRef = useRef()

  useEffect(() => { load() }, [])
  useEffect(() => { if (selected) loadMessages(selected.id) }, [selected])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function load() {
    const { data } = await supabase.from('conversations')
      .select('*, profiles!conversations_client_id_fkey(full_name, email)')
      .order('last_message_at', { ascending: false })
    setConvos(data || [])
    if (data?.length > 0) setSelected(data[0])
    setLoading(false)
  }

  async function loadMessages(id) {
    const { data } = await supabase.from('messages')
      .select('*, profiles(full_name, role)')
      .eq('conversation_id', id).order('created_at')
    setMessages(data || [])
  }

  async function send() {
    if (!newMsg.trim() || !selected || !user) return
    await supabase.from('messages').insert({ conversation_id: selected.id, sender_id: user.id, content: newMsg.trim() })
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selected.id)
    setNewMsg('')
    loadMessages(selected.id)
  }

  const filtered = convos.filter(c => !search || c.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="loading-center"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div className="header-title-group">
          <div className="page-title">Client Messages</div>
          <div className="page-title-sub">{convos.length} active conversations</div>
        </div>
      </div>

      <div style={{ display:'flex', height:'calc(100vh - 65px)' }}>
        {/* Sidebar */}
        <div style={{ width:300, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
            <div className="search-wrap">
              <Search size={13}/>
              <input className="form-input" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize:12 }}/>
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {filtered.map(c => (
              <div key={c.id} onClick={() => setSelected(c)}
                style={{ padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid var(--border)', background: selected?.id===c.id ? 'var(--bg-hover)' : 'transparent', borderLeft: selected?.id===c.id ? '2px solid #C9A84C' : '2px solid transparent' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#C9A84C60,#C9A84C)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#0a0f1e',flexShrink:0 }}>
                    {c.profiles?.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2) || '?'}
                  </div>
                  <div style={{ overflow:'hidden' }}>
                    <div style={{ fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{c.profiles?.full_name || 'Client'}</div>
                    <div style={{ fontSize:11,color:'#8fa3bc' }}>{c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : 'New'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        {selected ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#C9A84C60,#C9A84C)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#0a0f1e' }}>
                {selected.profiles?.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
              </div>
              <div>
                <div style={{ fontSize:13,fontWeight:600 }}>{selected.profiles?.full_name}</div>
                <div style={{ fontSize:11,color:'#8fa3bc' }}>{selected.profiles?.email}</div>
              </div>
            </div>

            <div className="msg-area">
              {messages.map(msg => {
                const isStaff = msg.profiles?.role === 'admin' || msg.profiles?.role === 'staff'
                return (
                  <div key={msg.id} style={{ display:'flex',flexDirection:'column',alignItems:isStaff?'flex-end':'flex-start',marginBottom:12 }}>
                    {!isStaff && <div className="msg-sender">{msg.profiles?.full_name}</div>}
                    <div className={`msg-bubble ${isStaff?'sent':'received'}`}>{msg.content}</div>
                    <div className="msg-time">{new Date(msg.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                )
              })}
              <div ref={bottomRef}/>
            </div>

            <div className="msg-input-bar">
              <textarea className="form-input" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()} }}
                placeholder={`Reply to ${selected.profiles?.full_name}...`} rows={1} style={{ flex:1,resize:'none',minHeight:'auto' }}/>
              <button className="btn btn-primary" onClick={send} disabled={!newMsg.trim()}>
                <Send size={14}/>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div className="empty-state"><MessageSquare size={40}/><p>Select a conversation</p></div>
          </div>
        )}
      </div>
    </div>
  )
}
