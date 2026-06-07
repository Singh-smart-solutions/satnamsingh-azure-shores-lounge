'use client'
import { useEffect, useRef, useState } from 'react'

/* ──────────── Types ──────────── */
interface Location { id: string; name: string; zone: string; type: string; is_occupied: boolean; guest_name?: string }
interface MenuItem { id: string; name: string; description: string; price: number; image_url: string; featured: boolean; modifiers: Modifier[] }
interface Modifier { label: string; price?: number; type?: string; value?: string }
interface MenuCategory { id: string; name: string; items: MenuItem[] }
interface CartItem { id: number; menuItemId: string; name: string; image: string; price: number; qty: number; modifiers: Modifier[] }
interface Order { id: string; total: number; status: string; created_at: string; items?: Array<{ item_name: string; quantity: number; subtotal: number }> }

/* ──────────── Helpers ──────────── */
async function api(url: string, method = 'GET', body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) { const e = new Error(data.message || data.error || 'Request failed') as Error & { code?: string }; e.code = data.error; throw e }
  return data
}

function fmt(n: number) { return '$' + n.toFixed(2) }

/* ══════════════════════════════════════════════════════════════════════════════
   GUEST PAGE
══════════════════════════════════════════════════════════════════════════════ */
export default function GuestPage() {
  const [locationId, setLocationId]       = useState('')
  const [locationName, setLocationName]   = useState('')
  const [sessionId, setSessionId]         = useState('')
  const [guestName, setGuestName]         = useState('')
  const [tab, setTab]                     = useState<'inhouse'|'daycation'>('inhouse')
  const [authError, setAuthError]         = useState('')
  const [authLoading, setAuthLoading]     = useState(false)
  const [page, setPage]                   = useState<'menu'|'cart'|'orders'>('menu')
  const [menu, setMenu]                   = useState<MenuCategory[]>([])
  const [cart, setCart]                   = useState<CartItem[]>([])
  const [orders, setOrders]               = useState<Order[]>([])
  const [allLocations, setAllLocations]   = useState<Location[]>([])
  const [locSearch, setLocSearch]         = useState('')
  const [modalItem, setModalItem]         = useState<MenuItem|null>(null)
  const [modalQty, setModalQty]           = useState(1)
  const [selMods, setSelMods]             = useState<Record<string, Modifier>>({})
  const [textMods, setTextMods]           = useState<Record<string, string>>({})
  const [showLocModal, setShowLocModal]   = useState(false)
  const [showOccModal, setShowOccModal]   = useState('')
  const [showConfirm, setShowConfirm]     = useState(false)
  const [toast, setToast]                 = useState('')
  const [specialNotes, setSpecialNotes]   = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  function showToast(msg: string) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2800)
  }

  /* ── Init: read location from URL ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const loc = params.get('loc')
    if (!loc) return
    api('/api/sessions/locations').then((locs: Location[]) => {
      const found = locs.find(l => l.id === loc || l.name.toLowerCase() === decodeURIComponent(loc).toLowerCase())
      if (found) { setLocationId(found.id); setLocationName(found.name) }
    })
  }, [])

  /* ── Auth ── */
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true); setAuthError('')
    const form = e.target as HTMLFormElement
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim()
    try {
      let res
      if (tab === 'inhouse') {
        const room = (form.elements.namedItem('room') as HTMLInputElement).value.trim()
        res = await api('/api/auth/inhouse', 'POST', { name, roomNumber: room, locationId })
      } else {
        const code = (form.elements.namedItem('code') as HTMLInputElement).value.trim().toUpperCase()
        res = await api('/api/auth/daycation', 'POST', { name, accessCode: code, locationId })
      }
      setSessionId(res.session.id)
      setGuestName(res.session.guest_name)
      setLocationName(res.location.name)
      setLocationId(res.location.id)
      const menuData = await api('/api/orders/menu')
      setMenu(menuData)
    } catch (err: unknown) {
      const e = err as Error & { code?: string }
      setAuthError(e.message)
    } finally { setAuthLoading(false) }
  }

  /* ── Cart helpers ── */
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)

  function openItem(item: MenuItem) { setModalItem(item); setModalQty(1); setSelMods({}); setTextMods({}) }
  function closeItem() { setModalItem(null) }
  function toggleMod(mod: Modifier) {
    setSelMods(prev => {
      const next = { ...prev }
      if (next[mod.label]) delete next[mod.label]; else next[mod.label] = mod
      return next
    })
  }
  function modalPrice() {
    if (!modalItem) return 0
    let p = modalItem.price
    Object.values(selMods).forEach(m => { if (m.price) p += m.price })
    return p * modalQty
  }

  function addToCart() {
    if (!modalItem) return
    const mods = [
      ...Object.values(selMods),
      ...Object.entries(textMods).filter(([,v]) => v).map(([label, value]) => ({ label, value } as Modifier)),
    ]
    let price = modalItem.price
    Object.values(selMods).forEach(m => { if (m.price) price += m.price })
    setCart(prev => [...prev, {
      id: Date.now() + Math.random(),
      menuItemId: modalItem.id,
      name: modalItem.name,
      image: modalItem.image_url,
      price, qty: modalQty, modifiers: mods,
    }])
    closeItem()
    showToast(`${modalItem.name} added`)
  }

  function changeCartQty(id: number, delta: number) {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
  }
  function removeCartItem(id: number) { setCart(prev => prev.filter(i => i.id !== id)) }

  async function placeOrder() {
    if (!cart.length) return
    try {
      const order = await api('/api/orders', 'POST', {
        sessionId,
        items: cart.map(i => ({ menuItemId: i.menuItemId, quantity: i.qty, modifiers: i.modifiers })),
        specialNotes,
      })
      setOrders(prev => [order, ...prev])
      setCart([])
      setSpecialNotes('')
      setShowConfirm(true)
    } catch { showToast('Order failed. Please try again.') }
  }

  /* ── Location change ── */
  async function openLocModal() {
    const locs = await api('/api/sessions/locations')
    setAllLocations(locs)
    setShowLocModal(true)
  }

  async function selectLocation(loc: Location) {
    if (loc.id === locationId) { setShowLocModal(false); return }
    try {
      const res = await api(`/api/sessions/${sessionId}/move`, 'POST', { newLocationId: loc.id })
      setLocationId(loc.id); setLocationName(loc.name)
      setShowLocModal(false)
      showToast(`Moved to ${loc.name}`)
    } catch (err: unknown) {
      const e = err as Error & { code?: string }
      if (e.code === 'location_occupied') { setShowLocModal(false); setShowOccModal(e.message) }
      else showToast(e.message)
    }
  }

  const filteredLocs = locSearch
    ? allLocations.filter(l => l.name.toLowerCase().includes(locSearch.toLowerCase()))
    : allLocations

  const zones = [...new Set(filteredLocs.map(l => l.zone))]

  /* ═══ RENDER (Auth Screen) ═══ */
  if (!sessionId) {
    return (
      <div className="auth-root">
        <div className="auth-hero">
          <div className="auth-hero-text">
            <div className="hero-sub">Beach &amp; Pool Lounge</div>
            <h1>Welcome to<br />Azure Shores</h1>
          </div>
        </div>
        <div className="auth-body">
          {locationName && (
            <div className="location-chip">
              <span className="chip-dot" />
              <span>{locationName}</span>
            </div>
          )}
          <div className="auth-tabs">
            <button className={`auth-tab${tab==='inhouse'?' active':''}`} onClick={() => {setTab('inhouse');setAuthError('')}}>In-House Guest</button>
            <button className={`auth-tab${tab==='daycation'?' active':''}`} onClick={() => {setTab('daycation');setAuthError('')}}>Day Visitor</button>
          </div>
          {authError && <div className="error-msg">{authError}</div>}
          <form onSubmit={handleAuth}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input name="name" className="form-input" placeholder="e.g. James Morrison" required autoComplete="name" />
            </div>
            {tab === 'inhouse' ? (
              <div className="form-group">
                <label className="form-label">Room Number</label>
                <input name="room" className="form-input" placeholder="e.g. 214" required autoComplete="off" />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Access Code</label>
                <input name="code" className="form-input" placeholder="e.g. AZURE2024" required autoComplete="off" style={{textTransform:'uppercase'}} />
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={authLoading || !locationId}>
              {authLoading ? 'Connecting…' : 'Begin Session'}
            </button>
          </form>
        </div>
        <style>{guestCSS}</style>
      </div>
    )
  }

  /* ═══ RENDER (App Shell) ═══ */
  return (
    <div className="app-root">
      <style>{guestCSS}</style>

      {/* Location Bar */}
      <div className="location-bar">
        <div className="loc-bar-left">
          <span>📍</span>
          <div>
            <div className="delivering-to">Delivering to</div>
            <div className="loc-name">{locationName}</div>
          </div>
        </div>
        <button className="btn-change" onClick={openLocModal}>Change</button>
      </div>

      {/* Pages */}
      <div className="page-content">
        {/* MENU */}
        {page === 'menu' && (
          <div>
            <div className="menu-hero">
              <div>
                <p className="menu-hero-sub">Curated Selection</p>
                <h2>Drinks &amp; Light Bites</h2>
              </div>
            </div>
            <div className="cat-strip">
              {menu.map(cat => (
                <button key={cat.id} className="cat-pill" onClick={() => document.getElementById('cat-'+cat.id)?.scrollIntoView({behavior:'smooth',block:'start'})}>
                  {cat.name}
                </button>
              ))}
            </div>
            {menu.map(cat => (
              <div key={cat.id} id={'cat-'+cat.id} className="menu-section">
                <div className="section-title">{cat.name}</div>
                {cat.items.map(item => (
                  <div key={item.id} className={`item-card${item.featured?' featured':''}`} onClick={() => openItem(item)}>
                    <img className="item-thumb" src={item.image_url||''} alt={item.name} loading="lazy" onError={e=>{(e.target as HTMLImageElement).src='https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=200&q=60'}} />
                    <div className="item-info">
                      {item.featured && <div className="item-tag">✦ Featured</div>}
                      <div className="item-name">{item.name}</div>
                      <div className="item-desc">{item.description}</div>
                      <div className="item-footer">
                        <div className="item-price"><span className="currency">$</span>{item.price.toFixed(2)}</div>
                        <button className="btn-add" onClick={e=>{e.stopPropagation();openItem(item)}}>+</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* CART */}
        {page === 'cart' && (
          <div className="page-pad">
            <h2 className="page-header">Your Order</h2>
            {!cart.length ? (
              <div className="empty-state"><div style={{fontSize:48,marginBottom:16}}>🍹</div><div>Your order is empty.<br/>Browse the menu to add items.</div></div>
            ) : (
              <>
                {cart.map(item => (
                  <div key={item.id} className="cart-item">
                    <img className="cart-img" src={item.image||''} alt={item.name} onError={e=>{(e.target as HTMLImageElement).src='https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=100&q=60'}} />
                    <div className="cart-info">
                      <div className="cart-item-name">{item.name}</div>
                      <div className="cart-item-mods">{item.modifiers.map(m=>m.label+(m.value?': '+m.value:'')).join(' · ')||'No customisation'}</div>
                      <div className="cart-item-footer">
                        <div className="cart-qty">
                          <button className="qty-sm" onClick={()=>changeCartQty(item.id,-1)}>−</button>
                          <span>{item.qty}</span>
                          <button className="qty-sm" onClick={()=>changeCartQty(item.id,1)}>+</button>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span className="cart-price">{fmt(item.price*item.qty)}</span>
                          <button className="cart-remove" onClick={()=>removeCartItem(item.id)}>✕</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="cart-summary">
                  <div className="summary-row"><span>Subtotal</span><span>{fmt(cartTotal)}</span></div>
                  <div className="summary-row" style={{color:'var(--text2)'}}><span>Service included</span><span>✓</span></div>
                  <div className="summary-row total"><span>Total</span><span>{fmt(cartTotal)}</span></div>
                </div>
                <div className="form-label" style={{marginBottom:8}}>Special Requests</div>
                <textarea className="special-notes" rows={3} placeholder="Dietary preferences, allergies…" value={specialNotes} onChange={e=>setSpecialNotes(e.target.value)} />
                <button className="btn-primary" onClick={placeOrder}>Place Order</button>
              </>
            )}
          </div>
        )}

        {/* ORDERS */}
        {page === 'orders' && (
          <div className="page-pad">
            <h2 className="page-header">My Orders</h2>
            {!orders.length ? (
              <div className="empty-state"><div style={{fontSize:48,marginBottom:16}}>📋</div><div>No orders yet.</div></div>
            ) : orders.map(order => {
              const statusLabel: Record<string,string> = {pending:'⏳ Pending',preparing:'🍹 Preparing',delivered:'✓ Delivered',cancelled:'✕ Cancelled'}
              const statusClass: Record<string,string> = {pending:'status-pending',preparing:'status-preparing',delivered:'status-delivered',cancelled:'status-delivered'}
              return (
                <div key={order.id} className="order-card">
                  <div className="order-card-header">
                    <span className="order-num">Order #{order.id.slice(-6).toUpperCase()}</span>
                    <span className={`status-badge ${statusClass[order.status]||''}`}>{statusLabel[order.status]||order.status}</span>
                  </div>
                  {(order.items||[]).map((i,idx) => (
                    <div key={idx} className="order-item-row"><span>{i.quantity}× {i.item_name}</span><span>{fmt(i.subtotal)}</span></div>
                  ))}
                  <div className="order-total">{fmt(order.total)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <button className={`nav-btn${page==='menu'?' active':''}`} onClick={()=>setPage('menu')}>
          <span className="nav-icon">🍹</span>Menu
        </button>
        <button className={`nav-btn${page==='cart'?' active':''}`} style={{position:'relative'}} onClick={()=>setPage('cart')}>
          {cartCount>0 && <span className="nav-badge">{cartCount}</span>}
          <span className="nav-icon">🛒</span>Cart
        </button>
        <button className={`nav-btn${page==='orders'?' active':''}`} onClick={()=>setPage('orders')}>
          <span className="nav-icon">📋</span>Orders
        </button>
      </nav>

      {/* Item Detail Modal */}
      {modalItem && (
        <div className="modal-overlay open" onClick={e=>{if(e.target===e.currentTarget)closeItem()}}>
          <div className="modal-sheet">
            <div style={{position:'relative',flexShrink:0}}>
              <img className="modal-img" src={modalItem.image_url||''} alt={modalItem.name} onError={e=>{(e.target as HTMLImageElement).src='https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=80'}} />
              <button className="btn-close" onClick={closeItem}>✕</button>
            </div>
            <div className="modal-body" style={{overflowY:'auto',flex:1}}>
              <div className="modal-name">{modalItem.name}</div>
              <div className="modal-desc">{modalItem.description}</div>
              <div className="modal-price-row">
                <div className="modal-price">{fmt(modalPrice())}</div>
                <div className="qty-control">
                  <button className="qty-btn" onClick={()=>setModalQty(q=>Math.max(1,q-1))}>−</button>
                  <span className="qty-val">{modalQty}</span>
                  <button className="qty-btn" onClick={()=>setModalQty(q=>q+1)}>+</button>
                </div>
              </div>
              {modalItem.modifiers?.length > 0 && (
                <div className="modifier-group">
                  <div className="mod-title">Customise</div>
                  {modalItem.modifiers.filter(m=>m.type!=='text').map(mod => (
                    <div key={mod.label} className={`mod-option${selMods[mod.label]?' selected':''}`} onClick={()=>toggleMod(mod)}>
                      <span>{mod.label}</span>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {mod.price?<span className="mod-price">+{fmt(mod.price)}</span>:null}
                        <div className={`mod-check${selMods[mod.label]?' checked':''}`} />
                      </div>
                    </div>
                  ))}
                  {modalItem.modifiers.filter(m=>m.type==='text').map(mod => (
                    <div key={mod.label} style={{marginBottom:16}}>
                      <div className="mod-title" style={{marginBottom:8}}>{mod.label}</div>
                      <input className="mod-text" placeholder="Your preferences…" value={textMods[mod.label]||''} onChange={e=>setTextMods(prev=>({...prev,[mod.label]:e.target.value}))} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-add-cart" onClick={addToCart}>Add to Order — {fmt(modalPrice())}</button>
            </div>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocModal && (
        <div className="modal-overlay open" onClick={e=>{if(e.target===e.currentTarget)setShowLocModal(false)}}>
          <div className="modal-sheet">
            <div className="modal-body" style={{overflowY:'auto',flex:1}}>
              <h3 style={{fontFamily:'Georgia,serif',fontSize:20,marginBottom:16}}>Change Location</h3>
              <input className="loc-search" placeholder="Search location…" value={locSearch} onChange={e=>setLocSearch(e.target.value)} />
              {zones.map(zone => (
                <div key={zone}>
                  <div className="zone-label">{zone}</div>
                  <div className="loc-grid">
                    {filteredLocs.filter(l=>l.zone===zone).map(loc => (
                      <button
                        key={loc.id}
                        className={`loc-btn${loc.is_occupied&&loc.id!==locationId?' occupied':''}${loc.id===locationId?' current':''}`}
                        onClick={()=>!loc.is_occupied||loc.id===locationId?selectLocation(loc):setShowOccModal('It appears another guest is currently enjoying this location. If you have recently moved here, please inform a pool attendant so we can instantly update your service area.')}
                      >
                        {loc.name.replace('Sunbed ','#').replace('Pool Lounger ','Pool #').replace('Cabana ','Cab. ').replace('Terrace Table ','Terr. ')}
                        {loc.id===locationId && <><br/><small style={{fontSize:9,color:'var(--gold)'}}>Current</small></>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Occupied Modal */}
      {showOccModal && (
        <div className="modal-overlay open" style={{alignItems:'center',justifyContent:'center',padding:24}} onClick={e=>{if(e.target===e.currentTarget)setShowOccModal('')}}>
          <div className="occ-modal">
            <div style={{fontSize:44,textAlign:'center',marginBottom:16}}>🏖️</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:20,textAlign:'center',marginBottom:10}}>Location Currently Active</div>
            <div style={{fontSize:14,color:'var(--text2)',textAlign:'center',lineHeight:1.6,marginBottom:24}}>{showOccModal}</div>
            <button className="btn-ghost" onClick={()=>setShowOccModal('')}>Understood</button>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="modal-overlay open" style={{alignItems:'center',justifyContent:'center',padding:24}}>
          <div className="occ-modal" style={{textAlign:'center'}}>
            <div style={{fontSize:52,marginBottom:16}}>✨</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:22,marginBottom:8}}>Order Placed</div>
            <div style={{fontSize:14,color:'var(--text2)',lineHeight:1.5,marginBottom:24}}>Your drinks are on the way to <strong>{locationName}</strong>.<br/>Sit back and enjoy.</div>
            <button className="btn-primary" onClick={()=>{setShowConfirm(false);setPage('orders')}}>View My Orders</button>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   CSS
══════════════════════════════════════════════════════════════════════════════ */
const guestCSS = `
  :root{--bg:#0e0f13;--bg2:#161820;--bg3:#1c1f2a;--surface:#252836;--gold:#c9a96e;--gold2:#e8d5b7;--gold3:#a07840;--text:#f0ece4;--text2:#a09888;--text3:#5a5650;--success:#4caf87;--border:rgba(201,169,110,0.15);--radius:16px;--radius-sm:10px;}
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  html,body{background:var(--bg);color:var(--text);font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--bg2)}::-webkit-scrollbar-thumb{background:var(--gold3);border-radius:2px}

  /* Auth */
  .auth-root{min-height:100vh;display:flex;flex-direction:column;background:var(--bg)}
  .auth-hero{position:relative;height:42vh;min-height:240px;background:linear-gradient(180deg,#0e0f13 0%,transparent 30%,#0e0f13 100%),url('https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80') center/cover;display:flex;align-items:flex-end;padding:32px 24px}
  .hero-sub{font-size:13px;color:var(--gold);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
  .auth-hero-text h1{font-family:Georgia,serif;font-size:clamp(28px,7vw,40px);font-weight:400;line-height:1.1}
  .auth-body{flex:1;padding:24px 20px 48px;background:var(--bg)}
  .location-chip{display:inline-flex;align-items:center;gap:8px;background:rgba(201,169,110,.12);border:1px solid var(--border);border-radius:50px;padding:8px 16px;font-size:13px;color:var(--gold2);margin-bottom:28px}
  .chip-dot{width:6px;height:6px;background:var(--gold);border-radius:50%}
  .auth-tabs{display:flex;gap:4px;background:var(--bg3);padding:4px;border-radius:var(--radius-sm);margin-bottom:24px}
  .auth-tab{flex:1;padding:10px;border:none;background:none;color:var(--text2);border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s}
  .auth-tab.active{background:var(--surface);color:var(--text)}
  .form-group{margin-bottom:16px}
  .form-label{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text2);margin-bottom:8px}
  .form-input{width:100%;padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:16px;outline:none;-webkit-appearance:none}
  .form-input:focus{border-color:rgba(201,169,110,.45)}
  .btn-primary{width:100%;padding:16px;background:linear-gradient(135deg,#c9a96e,#a07840);border:none;border-radius:var(--radius-sm);color:#1a1000;font-size:15px;font-weight:600;letter-spacing:.06em;cursor:pointer;transition:opacity .2s,transform .1s}
  .btn-primary:active{transform:scale(.98);opacity:.9}
  .btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none}
  .error-msg{background:rgba(224,85,85,.12);border:1px solid rgba(224,85,85,.3);border-radius:var(--radius-sm);padding:12px 14px;font-size:13px;color:#ff8a8a;margin-bottom:16px;line-height:1.5}

  /* App Shell */
  .app-root{min-height:100vh;display:flex;flex-direction:column;background:var(--bg)}
  .location-bar{position:sticky;top:0;z-index:100;background:rgba(14,15,19,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:0 16px;display:flex;align-items:center;justify-content:space-between;min-height:56px;padding-top:env(safe-area-inset-top)}
  .loc-bar-left{display:flex;align-items:center;gap:10px}
  .delivering-to{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text2)}
  .loc-name{font-size:15px;font-weight:600;color:var(--gold2)}
  .btn-change{padding:7px 14px;background:none;border:1px solid var(--border);border-radius:50px;color:var(--gold);font-size:12px;letter-spacing:.08em;cursor:pointer}
  .page-content{flex:1;overflow-y:auto;padding-bottom:calc(80px + env(safe-area-inset-bottom))}
  .bottom-nav{position:fixed;bottom:0;left:0;right:0;z-index:100;background:rgba(14,15,19,.97);backdrop-filter:blur(20px);border-top:1px solid var(--border);display:flex;padding-bottom:env(safe-area-inset-bottom)}
  .nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;background:none;border:none;color:var(--text3);font-size:10px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:color .2s}
  .nav-btn.active{color:var(--gold)}
  .nav-icon{font-size:22px;line-height:1}
  .nav-badge{position:absolute;top:6px;right:calc(50% - 18px);background:var(--gold);color:#1a1000;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px}

  /* Menu */
  .menu-hero{height:38vh;min-height:200px;background:linear-gradient(180deg,transparent 30%,var(--bg) 100%),url('https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80') center/cover;display:flex;align-items:flex-end;padding:24px 20px}
  .menu-hero h2{font-family:Georgia,serif;font-size:clamp(24px,6vw,32px);font-weight:400}
  .menu-hero-sub{font-size:12px;color:var(--gold);letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
  .cat-strip{overflow-x:auto;scrollbar-width:none;padding:16px 20px 0;display:flex;gap:10px}
  .cat-strip::-webkit-scrollbar{display:none}
  .cat-pill{flex-shrink:0;padding:7px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:50px;font-size:12px;color:var(--text2);cursor:pointer;white-space:nowrap}
  .menu-section{padding:24px 20px 0}
  .section-title{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--text2);margin-bottom:16px;display:flex;align-items:center;gap:12px}
  .section-title::after{content:'';flex:1;height:1px;background:var(--border)}
  .item-card{display:flex;gap:14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px;cursor:pointer;transition:border-color .2s,transform .1s}
  .item-card:active{transform:scale(.99)}
  .item-card.featured{border-color:rgba(201,169,110,.3)}
  .item-thumb{width:88px;height:88px;border-radius:12px;object-fit:cover;background:var(--surface);flex-shrink:0}
  .item-info{flex:1;min-width:0}
  .item-tag{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
  .item-name{font-size:16px;font-weight:500;line-height:1.2;margin-bottom:4px}
  .item-desc{font-size:12px;color:var(--text2);line-height:1.4;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .item-footer{display:flex;align-items:center;justify-content:space-between}
  .item-price{font-size:17px;font-weight:600;color:var(--gold2)}
  .currency{font-size:12px;color:var(--gold);margin-right:1px}
  .btn-add{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#c9a96e,#a07840);border:none;color:#1a1000;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer}

  /* Item Modal */
  .modal-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.7);display:none;align-items:flex-end}
  .modal-overlay.open{display:flex}
  .modal-sheet{width:100%;max-height:92vh;background:var(--bg2);border-radius:24px 24px 0 0;overflow:hidden;display:flex;flex-direction:column;animation:slideUp .3s ease}
  @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  .modal-img{width:100%;height:240px;object-fit:cover;background:var(--bg3)}
  .btn-close{position:absolute;top:16px;right:16px;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.5);border:none;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
  .modal-body{padding:24px 20px 16px}
  .modal-name{font-family:Georgia,serif;font-size:24px;font-weight:400;margin-bottom:6px}
  .modal-desc{font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:20px}
  .modal-price-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
  .modal-price{font-size:22px;font-weight:600;color:var(--gold2)}
  .qty-control{display:flex;align-items:center;gap:14px}
  .qty-btn{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer}
  .qty-val{font-size:18px;font-weight:600;min-width:24px;text-align:center}
  .modifier-group{margin-bottom:20px}
  .mod-title{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text2);margin-bottom:10px}
  .mod-option{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer}
  .mod-option.selected{border-color:rgba(201,169,110,.5);background:rgba(201,169,110,.07)}
  .mod-price{font-size:13px;color:var(--gold)}
  .mod-check{width:20px;height:20px;border-radius:50%;border:2px solid var(--border)}
  .mod-check.checked{background:var(--gold);border-color:var(--gold)}
  .mod-text{width:100%;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;outline:none}
  .modal-footer{padding:16px 20px;border-top:1px solid var(--border);background:var(--bg2)}
  .btn-add-cart{width:100%;padding:16px;background:linear-gradient(135deg,#c9a96e,#a07840);border:none;border-radius:var(--radius-sm);color:#1a1000;font-size:15px;font-weight:600;letter-spacing:.04em;cursor:pointer}

  /* Cart */
  .page-pad{padding:24px 20px}
  .page-header{font-family:Georgia,serif;font-size:26px;font-weight:400;margin-bottom:24px}
  .empty-state{text-align:center;padding:60px 20px;color:var(--text2)}
  .cart-item{display:flex;gap:14px;align-items:flex-start;padding:16px 0;border-bottom:1px solid var(--border)}
  .cart-img{width:64px;height:64px;border-radius:10px;object-fit:cover;background:var(--bg3);flex-shrink:0}
  .cart-info{flex:1;min-width:0}
  .cart-item-name{font-size:15px;font-weight:500;margin-bottom:3px}
  .cart-item-mods{font-size:12px;color:var(--text2);margin-bottom:8px}
  .cart-item-footer{display:flex;align-items:center;justify-content:space-between}
  .cart-price{font-size:15px;font-weight:600;color:var(--gold2)}
  .cart-remove{background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:4px}
  .cart-qty{display:flex;align-items:center;gap:10px}
  .qty-sm{width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
  .cart-summary{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin:24px 0}
  .summary-row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px}
  .summary-row.total{font-size:17px;font-weight:600;color:var(--gold2);border-top:1px solid var(--border);padding-top:14px;margin-top:8px}
  .special-notes{width:100%;padding:14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;resize:none;outline:none;margin-bottom:20px;font-family:inherit}

  /* Orders */
  .order-card{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}
  .order-card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .order-num{font-size:12px;color:var(--text2)}
  .status-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:50px;font-size:11px;font-weight:600;letter-spacing:.06em}
  .status-pending{background:rgba(232,160,32,.15);color:#e8a020}
  .status-preparing{background:rgba(76,175,135,.15);color:#4caf87}
  .status-delivered{background:rgba(100,100,100,.15);color:var(--text2)}
  .order-item-row{display:flex;justify-content:space-between;font-size:14px;padding:4px 0}
  .order-total{font-size:15px;font-weight:600;color:var(--gold2);text-align:right;padding-top:8px;border-top:1px solid var(--border)}

  /* Location Modal */
  .loc-search{width:100%;padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:15px;outline:none;margin-bottom:16px}
  .zone-label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--text2);padding:8px 0 10px}
  .loc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px}
  .loc-btn{padding:12px 6px;text-align:center;background:var(--bg3);border:1px solid var(--border);border-radius:10px;font-size:12px;color:var(--text2);cursor:pointer;line-height:1.3}
  .loc-btn.occupied{opacity:.4;cursor:not-allowed}
  .loc-btn.current{border-color:rgba(201,169,110,.5);color:var(--gold2);background:rgba(201,169,110,.08)}
  .occ-modal{background:var(--bg2);border:1px solid var(--border);border-radius:24px;padding:28px 24px;width:100%;max-width:380px}
  .btn-ghost{width:100%;padding:14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;cursor:pointer}

  /* Toast */
  .toast{position:fixed;bottom:calc(90px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%) translateY(20px);background:var(--surface);border:1px solid var(--border);border-radius:50px;padding:10px 20px;font-size:13px;white-space:nowrap;opacity:0;transition:all .3s;pointer-events:none;z-index:300}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
`
