'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

interface OrderItem { item_name: string; quantity: number; subtotal: number; modifiers?: Array<{label?:string;value?:string}> }
interface Order {
  id: string; guest_name: string; status: string; total: number;
  special_notes?: string; created_at: string; delivered_at?: string;
  location_id: string; original_location_id: string;
  location_name: string; location_zone: string; original_location_name: string;
  moved: boolean; items?: OrderItem[]
}

async function api(url: string, method = 'GET') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } })
  return res.json()
}

function elapsed(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${s.toString().padStart(2,'0')}`
}

export default function StaffPage() {
  const [orders, setOrders]   = useState<Order[]>([])
  const [filter, setFilter]   = useState<'all'|'pending'|'preparing'|'moved'>('all')
  const [toast, setToast]     = useState('')
  const [newAlert, setAlert]  = useState('')
  const [time, setTime]       = useState('')
  const [live, setLive]       = useState(true)
  const toastRef = useRef<ReturnType<typeof setTimeout>>()

  function showToast(msg: string) { setToast(msg); clearTimeout(toastRef.current); toastRef.current = setTimeout(()=>setToast(''),3000) }

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})),1000)
    return () => clearInterval(t)
  }, [])

  // Load initial orders
  const loadOrders = useCallback(async () => {
    const data = await api('/api/staff/orders')
    setOrders(data)
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])
  useEffect(() => { const t = setInterval(loadOrders, 30000); return () => clearInterval(t) }, [loadOrders])

  // Supabase Realtime
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel('staff-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async payload => {
        const { eventType, new: newRow, old: oldRow } = payload as { eventType: string; new: Record<string,unknown>; old: Record<string,unknown> }

        if (eventType === 'INSERT' || (eventType === 'UPDATE' && ['pending','preparing'].includes(String((newRow as Record<string,unknown>).status)))) {
          // Re-fetch full order with joins
          await loadOrders()
          if (eventType === 'INSERT') {
            const guestName = String(newRow.guest_name ?? '')
            setAlert(`✦ New order received — ${guestName}`)
            setTimeout(() => setAlert(''), 3500)
            showToast(`New order: ${guestName}`)
          }
        } else if (eventType === 'UPDATE' && !['pending','preparing'].includes(String((newRow as Record<string,unknown>).status))) {
          setOrders(prev => prev.filter(o => o.id !== newRow.id))
        }
      })
      .subscribe(status => setLive(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [loadOrders])

  const filtered = filter === 'all' ? orders
    : filter === 'moved' ? orders.filter(o => o.moved)
    : orders.filter(o => o.status === filter)

  async function markPreparing(id: string) {
    await api(`/api/staff/orders/${id}/prepare`, 'POST')
    setOrders(prev => prev.map(o => o.id === id ? {...o, status:'preparing'} : o))
  }

  async function markDelivered(id: string) {
    await api(`/api/staff/orders/${id}/deliver`, 'POST')
    setOrders(prev => prev.filter(o => o.id !== id))
    showToast('Order delivered ✓')
  }

  return (
    <div style={{minHeight:'100vh',background:'#0b0c10',color:'#f0ece4',fontFamily:"-apple-system,'Helvetica Neue',Arial,sans-serif"}}>
      <style>{staffCSS}</style>

      {/* Topbar */}
      <div className="s-topbar">
        <div className="s-brand">
          <div className={`s-dot${live?'':' warn'}`} />
          <span className="s-brand-text">Azure Shores — Staff Orders</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div className={`s-live-badge${live?'':' warn'}`}>{live?'● LIVE':'● RECONNECTING'}</div>
          <div className="s-clock">{time}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="s-filters">
        {(['all','pending','preparing','moved'] as const).map(f => (
          <button key={f} className={`s-filter${filter===f?' active':''} ${f==='moved'?'moved-f':''}`} onClick={()=>setFilter(f)}>
            {f==='all'?'All Active':f==='pending'?'⏳ Pending':f==='preparing'?'🍹 Preparing':'⚠️ Relocated'}
          </button>
        ))}
        <span className="s-count" style={{marginLeft:'auto'}}>{orders.length} active order{orders.length!==1?'s':''}</span>
      </div>

      {/* Grid */}
      <div className="s-grid">
        {!filtered.length ? (
          <div className="s-empty">
            <div style={{fontSize:64,marginBottom:20,opacity:.5}}>{filter==='moved'?'🔄':'🍹'}</div>
            <div className="s-empty-title">{filter==='moved'?'No Relocated Orders':'All Clear'}</div>
            <div className="s-empty-sub">{filter==='moved'?'No guests have changed location':'New orders will appear here instantly'}</div>
          </div>
        ) : filtered.map(order => <Ticket key={order.id} order={order} onPrepare={markPreparing} onDeliver={markDelivered} />)}
      </div>

      {/* Alert */}
      <div className={`s-alert${newAlert?' show':''}`}>{newAlert}</div>
      {/* Toast */}
      <div className={`s-toast${toast?' show':''}`}>{toast}</div>
    </div>
  )
}

function Ticket({ order, onPrepare, onDeliver }: { order: Order; onPrepare:(id:string)=>void; onDeliver:(id:string)=>void }) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const update = () => {
      const secs = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000)
      const m = Math.floor(secs/60), s = secs%60
      setElapsed(`${m}:${s.toString().padStart(2,'0')}`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [order.created_at])

  const secs = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000)
  const elapsedClass = secs > 600 ? 'urgent' : secs > 300 ? 'warn' : ''
  const locClass = order.location_zone === 'Beach' ? 'loc-beach' : order.location_zone === 'Pool' ? 'loc-pool' : 'loc-terrace'

  return (
    <div className={`s-ticket${order.moved?' moved':''}${order.status==='preparing'?' preparing':''}`}>
      {order.moved && (
        <div className="s-moved-badge">
          <span>⚠️</span>
          GUEST RELOCATED TO {order.location_name?.toUpperCase()}
          <span style={{opacity:.6,fontWeight:400,marginLeft:6}}>(from {order.original_location_name})</span>
        </div>
      )}
      <div className="s-ticket-header">
        <div>
          <div className={`s-location ${locClass}`}>{order.location_name?.toUpperCase()}</div>
          <div className="s-guest">
            {order.guest_name}
            <span className={`s-status-badge ${order.status==='pending'?'pending':'preparing'}`}>
              {order.status==='pending'?'⏳ PENDING':'🍹 PREPARING'}
            </span>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="s-order-id">#{order.id.slice(-6).toUpperCase()}</div>
          <div className={`s-elapsed ${elapsedClass}`}>{elapsed}</div>
        </div>
      </div>
      <div className="s-ticket-body">
        {(order.items||[]).map((item,i) => (
          <div key={i} className="s-item-row">
            <div>
              <span className="s-item-qty">{item.quantity}×</span>
              <span>{item.item_name}</span>
              {(item.modifiers||[]).filter(m=>m.label).length > 0 && (
                <div className="s-item-mods">{(item.modifiers||[]).filter(m=>m.label).map(m=>m.label+(m.value?': '+m.value:'')).join(', ')}</div>
              )}
            </div>
            <span style={{color:'var(--text2)',fontSize:13}}>${item.subtotal.toFixed(2)}</span>
          </div>
        ))}
        <div className="s-divider" />
        {order.special_notes && <div className="s-notes">"{order.special_notes}"</div>}
        <div className="s-total">Total: ${order.total.toFixed(2)}</div>
      </div>
      <div className="s-ticket-footer">
        {order.status === 'pending' && (
          <button className="s-btn-prepare" onClick={()=>onPrepare(order.id)}>Mark Preparing</button>
        )}
        <button className="s-btn-deliver" onClick={()=>onDeliver(order.id)}>✓ Mark Delivered</button>
      </div>
    </div>
  )
}

const staffCSS = `
  :root{--bg:#0b0c10;--bg2:#13151c;--bg3:#1a1d27;--surface:#212434;--gold:#c9a96e;--gold2:#e8d5b7;--text:#f0ece4;--text2:#8a8478;--text3:#4a4640;--success:#4caf87;--warn:#e8a020;--err:#e05555;--border:rgba(201,169,110,0.13)}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:var(--bg2)}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}

  .s-topbar{background:var(--bg2);border-bottom:1px solid var(--border);padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
  .s-brand{display:flex;align-items:center;gap:12px}
  .s-dot{width:10px;height:10px;background:var(--success);border-radius:50%;animation:pulse 2s infinite}
  .s-dot.warn{background:var(--warn)}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
  .s-brand-text{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}
  .s-live-badge{display:flex;align-items:center;gap:6px;background:rgba(76,175,135,.12);border:1px solid rgba(76,175,135,.25);border-radius:50px;padding:5px 12px;font-size:11px;color:var(--success);letter-spacing:.08em}
  .s-live-badge.warn{background:rgba(232,160,32,.12);border-color:rgba(232,160,32,.25);color:var(--warn)}
  .s-clock{font-size:14px;color:var(--text2);font-variant-numeric:tabular-nums}

  .s-filters{padding:16px 24px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--bg2);position:sticky;top:64px;z-index:40}
  .s-filter{padding:6px 16px;border-radius:50px;border:1px solid var(--border);background:none;color:var(--text2);font-size:12px;letter-spacing:.06em;cursor:pointer}
  .s-filter.active{background:rgba(201,169,110,.12);border-color:rgba(201,169,110,.35);color:var(--gold2)}
  .s-filter.moved-f.active{background:rgba(224,85,85,.12);border-color:rgba(224,85,85,.35);color:#ff9090}
  .s-count{font-size:12px;color:var(--text2)}

  .s-grid{padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;align-content:start}
  .s-empty{grid-column:1/-1;text-align:center;padding:80px 24px;color:var(--text2)}
  .s-empty-title{font-family:Georgia,serif;font-size:22px;font-weight:400;margin-bottom:8px;color:var(--text)}
  .s-empty-sub{font-size:14px;color:var(--text2)}

  .s-ticket{background:var(--bg3);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:border-color .3s,box-shadow .3s}
  .s-ticket.moved{border-color:rgba(224,85,85,.45);animation:pulseBorder 2s ease infinite}
  .s-ticket.preparing{border-color:rgba(76,175,135,.3)}
  @keyframes pulseBorder{0%,100%{box-shadow:0 0 0 1px rgba(224,85,85,.2)}50%{box-shadow:0 0 0 2px rgba(224,85,85,.35)}}

  .s-moved-badge{background:rgba(224,85,85,.15);border-bottom:1px solid rgba(224,85,85,.25);padding:8px 20px;font-size:12px;font-weight:600;color:#ff9090;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .s-ticket-header{padding:16px 20px 12px;display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid var(--border)}
  .s-location{font-size:22px;font-weight:700;letter-spacing:.01em;line-height:1}
  .loc-beach{color:var(--gold2)}
  .loc-pool{color:#7ec8c8}
  .loc-terrace{color:#c89a7e}
  .s-guest{font-size:12px;color:var(--text2);margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .s-status-badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:50px;font-size:10px;font-weight:600;letter-spacing:.07em}
  .s-status-badge.pending{background:rgba(232,160,32,.12);color:var(--warn);border:1px solid rgba(232,160,32,.25)}
  .s-status-badge.preparing{background:rgba(76,175,135,.12);color:var(--success);border:1px solid rgba(76,175,135,.25)}
  .s-order-id{font-size:10px;letter-spacing:.12em;color:var(--text3);margin-bottom:4px}
  .s-elapsed{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--text2)}
  .s-elapsed.warn{color:var(--warn)}
  .s-elapsed.urgent{color:var(--err)}

  .s-ticket-body{padding:16px 20px}
  .s-item-row{display:flex;justify-content:space-between;align-items:flex-start;padding:5px 0;font-size:14px}
  .s-item-qty{font-weight:600;color:var(--gold2);margin-right:8px}
  .s-item-mods{font-size:11px;color:var(--text2);margin-top:2px}
  .s-divider{height:1px;background:var(--border);margin:10px 0}
  .s-notes{font-size:12px;color:var(--text2);font-style:italic;background:rgba(255,255,255,.03);border-radius:8px;padding:8px 12px;margin-bottom:10px}
  .s-total{font-size:14px;color:var(--gold);text-align:right}

  .s-ticket-footer{padding:12px 20px 16px;display:flex;gap:8px}
  .s-btn-prepare{flex:1;padding:11px;background:rgba(76,175,135,.12);border:1px solid rgba(76,175,135,.25);border-radius:10px;color:var(--success);font-size:13px;font-weight:600;cursor:pointer}
  .s-btn-deliver{flex:2;padding:11px;background:linear-gradient(135deg,#c9a96e,#a07840);border:none;border-radius:10px;color:#1a1000;font-size:13px;font-weight:700;letter-spacing:.06em;cursor:pointer}
  .s-btn-deliver:only-child{flex:1}

  .s-alert{position:fixed;top:80px;left:50%;transform:translateX(-50%) translateY(-20px);background:rgba(201,169,110,.15);border:1px solid rgba(201,169,110,.4);border-radius:50px;padding:10px 20px;font-size:13px;color:var(--gold2);opacity:0;transition:all .3s;pointer-events:none;z-index:99;white-space:nowrap}
  .s-alert.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .s-toast{position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 18px;font-size:13px;opacity:0;transform:translateY(8px);transition:all .3s;pointer-events:none;z-index:999;max-width:280px}
  .s-toast.show{opacity:1;transform:none}
`
