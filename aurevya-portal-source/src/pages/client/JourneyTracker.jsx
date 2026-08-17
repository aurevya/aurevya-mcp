import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../supabase.js'
import { MapPin, CheckCircle, Clock, User, Users, Send, Edit2, Trash2, Shield } from 'lucide-react'

const ACTION_ICONS = {
  party_added:             { icon: Users,        color: '#8B5CF6' },
  party_deleted:           { icon: Trash2,       color: '#ef4444' },
  structure_confirmed:     { icon: CheckCircle,  color: '#10B981' },
  structure_edit_requested:{ icon: Edit2,        color: '#F59E0B' },
  kyc_uploaded:            { icon: Shield,       color: '#3B82F6' },
  portal_invite_sent:      { icon: Send,         color: '#14B8A6' },
  welcome_email_sent:      { icon: Send,         color: '#EC4899' },
}

function ActionIcon({ action }) {
  const cfg = ACTION_ICONS[action] || { icon: Clock, color: '#8fa3bc' }
  const Icon = cfg.icon
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: cfg.color + '22', border: `1px solid ${cfg.color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <Icon size={15} style={{ color: cfg.color }} />
    </div>
  )
}

export default function JourneyTracker() {
  const { user } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState(null)

  useEffect(() => {
    if (!user) return
    loadLogs()
  }, [user])

  async function loadLogs() {
    setLoading(true)
    // Get client_id
    let { data: rec } = await supabase
      .from('client_onboardings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!rec && user.email) {
      const { data: r2 } = await supabase
        .from('client_onboardings')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()
      rec = r2
    }
    if (!rec) { setLoading(false); return }
    setClientId(rec.id)

    const { data } = await supabase
      .from('client_activity_logs')
      .select('*')
      .eq('client_id', rec.id)
      .order('created_at', { ascending: false })
    setLogs(data || [])
    setLoading(false)
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <MapPin size={22} style={{ color: '#c9a227' }} /> Journey Tracker
        </h1>
        <p style={{ color: '#8fa3bc', marginTop: 6, fontSize: 14 }}>
          A full record of activity on your onboarding journey
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#8fa3bc', padding: 40 }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 10px' }}></div>
          Loading…
        </div>
      ) : logs.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: '#8fa3bc', fontSize: 13
        }}>
          No activity recorded yet. Actions you take in your onboarding journey will appear here.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Timeline line */}
          <div style={{
            position: 'absolute', left: 16, top: 17, bottom: 17,
            width: 2, background: 'rgba(255,255,255,0.06)', zIndex: 0
          }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {logs.map((log, i) => (
              <div key={log.id} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', paddingBottom: i < logs.length - 1 ? 24 : 0, position: 'relative', zIndex: 1 }}>
                <ActionIcon action={log.action} />
                <div style={{
                  flex: 1, background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}>
                      {log.label || log.action}
                    </div>
                    <div style={{ color: '#8fa3bc', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {formatDate(log.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: log.actor_role === 'staff' ? 'rgba(245,158,11,0.15)' : log.actor_role === 'system' ? 'rgba(143,163,188,0.15)' : 'rgba(139,92,246,0.15)',
                      color: log.actor_role === 'staff' ? '#F59E0B' : log.actor_role === 'system' ? '#8fa3bc' : '#8B5CF6',
                      textTransform: 'capitalize'
                    }}>
                      {log.actor_role || 'system'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
