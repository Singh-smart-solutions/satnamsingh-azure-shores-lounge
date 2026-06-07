'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

async function api(url: string, method = 'GET', body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return res.json()
}

interface LocEntry { id: string; name: string; zone: string; type: string; status: string; is_occupied: boolean; session_id?: string; guest_name?: string; guest_type?: string; session_started?: string }
interface MenuCat { id: string; name: string; items: MenuItem[] }
interface MenuItem { id: string; name: string; description: string; price: number; image_url: string; in_stock: boolean; featured: boolean; category_id: string; modifiers?: unknown[] }
interface Code { id: string; code: string; label?: string; used: boolean }
interface Report {
  reportDate: string
  revenue: { total_revenue: number; total_orders: number }
  topItems: { item_name: string; qty_sold: number; revenue: number }[]
  hourlyBreakdown: { hour: string; orders: number; revenue: number }[]
  locationBreakdown: { location: string; orders: number; revenue: number }[]
  guestSessions: { sessions: number }
}

export default function ManagerPage() {
  const [tab, setTab]           = useState<'occupancy'|'qr'|'menu'|'report'>('occupancy')
  const [occupancy, setOccupancy] = useState<LocEntry[]>([])
  const [menu, setMenu]         = useState<MenuCat[]>([])
  const [codes, setCodes]       = useState<Code[]>([])
  const [report, setReport]     = useState<Report|null>(null)
  const [qrResult, setQrResult] = useState<{ qr: string; url: string; locationName: string }|null>(null)
  const [qrLoc, setQrLoc]       = useState('')
  const [qrBase, setQrBase]     = useState('')
  const [allLocs, setAllLocs]   = useState<{id:string;name:string}[]>([])
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [toast, setToast]       = useState('')
  const [time, setTime]         = useState('')
  const [live, setLive]         = useState(true)
  const [editItem, setEditItem] = useState<MenuItem|null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isNewItem, setIsNewItem] = useState(false)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const toastRef = useRef<ReturnType<typeof setTimeout>>()

  function showToast(msg: string) { setToast(msg); clearTimeout(toastRef.current); toastRef.current = setTimeout(()=>setToast(''),3000) }

  // Clock
  useEffect(() => {
    const t = setInterval(()=>setTime(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})),1000)
    setQrBase(window.location.origin)
    return () => clearInterval(t)
  }, [])

  const loadOccupancy = useCallback(async () => {
    const data = await api('/api/manager/occupancy')
    setOccupancy(data)
  }, [])

  const loadMenu = useCallback(async () => {
    const data = await api('/api/manager/menu')
    setMenu(data)
  }, [])

  const loadCodes = useCallback(async () => {
    const data = await api('/api/manager/access-codes')
    setCodes(data)
  }, [])

  // Tab-based loading
  useEffect(() => {
    if (tab === 'occupancy') loadOccupancy()
    if (tab === 'qr') {
      api('/api/sessions/locations').then((d: { id: string; name: string }[]) => setAllLocs(d))
      loadCodes()
    }
    if (tab === 'menu') loadMenu()
  }, [tab, loadOccupancy, loadMenu, loadCodes])

  // Supabase Realtime for occupancy
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel('manager-occupancy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => loadOccupancy())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => loadOccupancy())
      .subscribe(s => setLive(s === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(channel) }
  }, [loadOccupancy])

  setInterval(loadOccupancy, 30000)

  // ── Occupancy ──
  async function forceClear(sessionId: string, locName: string) {
    if (!confirm(`Force clear session at ${locName}?`)) return
    await api(`/api/manager/sessions/${sessionId}/force-clear`, 'POST')
    showToast(`Session cleared at ${locName}`)
    loadOccupancy()
  }

  // ── QR ──
  async function generateQR() {
    if (!qrLoc) { showToast('Select a location'); return }
    const data = await api('/api/manager/qr', 'POST', { locationName: qrLoc, baseUrl: qrBase })
    setQrResult(data)
  }

  // ── Menu ──
  async function toggleStock(itemId: string) {
    await api(`/api/manager/menu/items/${itemId}/stock`, 'PATCH')
    loadMenu()
  }

  async function saveItem(item: Partial<MenuItem> & { categoryId?: string }) {
    if (editItem?.id && !isNewItem) {
      await api(`/api/manager/menu/items/${editItem.id}`, 'PUT', {
        name: item.name, description: item.description, price: item.price,
        featured: item.featured, imageUrl: item.image_url, modifiers: item.modifiers ?? [],
      })
    } else {
      await api('/api/manager/menu', 'POST', {
        categoryId: item.category_id, name: item.name, description: item.description,
        price: item.price, imageUrl: item.image_url, featured: item.featured, modifiers: [],
      })
    }
    setShowEditModal(false); setEditItem(null); loadMenu()
    showToast(isNewItem ? 'Item added' : 'Item updated')
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return
    await api(`/api/manager/menu/items/${id}`, 'DELETE')
    loadMenu()
  }

  // ── Codes ──
  async function addCode(code: string, label: string) {
    const res = await api('/api/manager/access-codes', 'POST', { code: code.toUpperCase(), label })
    if (res.error) { showToast(res.error); return }
    setShowCodeModal(false); loadCodes(); showToast('Code created')
  }

  async function deleteCode(id: string) {
    if (!confirm('Delete this code?')) return
    await api(`/api/manager/access-codes/${id}`, 'DELETE'); loadCodes()
  }

  // ── Report ──
  async function loadReport() {
    const data = await api(`/api/manager/report/eod?date=${reportDate}`)
    setReport(data)
  }

  function exportCSV() {
    if (!report) { showToast('Load a report first'); return }
    const rows = [
      ['Azure Shores EOD Report', report.reportDate],
      [],['SUMMARY'],
      ['Revenue', report.revenue.total_revenue.toFixed(2)],
      ['Orders', report.revenue.total_orders],
      ['Sessions', report.guestSessions.sessions],
      [],['TOP ITEMS','Qty','Revenue'],
      ...report.topItems.map(i=>[i.item_name, i.qty_sold, i.revenue.toFixed(2)]),
      [],['HOURLY','Orders','Revenue'],
      ...report.hourlyBreakdown.map(h=>[h.hour+':00', h.orders, h.revenue.toFixed(2)]),
    ]
    const csv = rows.map(r=>r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download = `Azure_Shores_${report.reportDate}.csv`; a.click()
  }

  // ── Derived stats ──
  const occupied = occupancy.filter(l=>l.is_occupied).length
  const zones = [...new Set(occupancy.map(l=>l.zone))]
  const maxHourly = Math.max(...(report?.hourlyBreakdown.map(h=>h.revenue)||[1]),1)

  return (
    <div style={{minHeight:'100vh',background:'#0b0c10',color:'#f0ece4',fontFamily:"-apple-system,'Helvetica Neue',Arial,sans-serif"}}>
      <style>{mgrCSS}</style>

      {/* Topbar */}
      <div className="m-topbar">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span className="m-brand">Azure Shores</span>
          <span style={{color:'#4a4640'}}>|</span>
          <span style={{fontSize:13,color:'#8a8478'}}>Manager Console</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#8a8478'}}>
            <div className={`m-dot${live?'':' warn'}`} /> Live
          </div>
          <div className="m-clock">{time}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="m-tabs">
        {(['occupancy','qr','menu','report'] as const).map(t=>(
          <button key={t} className={`m-tab${tab===t?' active':''}`} onClick={()=>setTab(t)}>
            {t==='occupancy'?'🗺 Occupancy Map':t==='qr'?'📱 QR Codes':t==='menu'?'🍹 Menu & Stock':'📊 EOD Report'}
          </button>
        ))}
      </div>

      <div className="m-main">

        {/* ── TAB 1: OCCUPANCY ── */}
        {tab==='occupancy' && (
          <div>
            <div className="m-stats">
              {[
                {label:'Total Locations',value:occupancy.length,cls:''},
                {label:'Occupied',value:occupied,cls:'gold',sub:`${occupancy.length?Math.round(occupied/occupancy.length*100):0}% occupancy`},
                {label:'Available',value:occupancy.length-occupied,cls:'green'},
              ].map(s=>(
                <div key={s.label} className="m-stat">
                  <div className="m-stat-label">{s.label}</div>
                  <div className={`m-stat-value ${s.cls}`}>{s.value}</div>
                  {s.sub && <div className="m-stat-sub">{s.sub}</div>}
                </div>
              ))}
            </div>
            <div className="m-legend">
              <div className="m-legend-item"><div className="m-legend-dot" style={{background:'#4caf87'}} />Available</div>
              <div className="m-legend-item"><div className="m-legend-dot" style={{background:'#c9a96e'}} />Occupied</div>
            </div>
            {zones.map(zone=>(
              <div key={zone} className="m-zone">
                <div className="m-zone-header">
                  {zone} — {occupancy.filter(l=>l.zone===zone&&l.is_occupied).length}/{occupancy.filter(l=>l.zone===zone).length} occupied
                </div>
                <div className="m-bed-grid">
                  {occupancy.filter(l=>l.zone===zone).map(loc=>(
                    <div key={loc.id} className={`m-bed${loc.is_occupied?' occupied':' available'}`}>
                      <div className="m-bed-name"><span className="m-bed-dot" />{loc.name}</div>
                      {loc.is_occupied ? (
                        <>
                          <div className="m-bed-guest">{loc.guest_name}</div>
                          <div className="m-bed-type">{loc.guest_type==='inhouse'?'🏨 In-House':'☀️ Day Visitor'}</div>
                          {loc.session_started && (
                            <div className="m-bed-since">
                              {(()=>{const d=Math.floor((Date.now()-new Date(loc.session_started).getTime())/1000);const h=Math.floor(d/3600),m=Math.floor((d%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`})()}
                            </div>
                          )}
                          {loc.session_id && (
                            <button className="m-btn-clear" onClick={()=>forceClear(loc.session_id!,loc.name)}>Force Clear</button>
                          )}
                        </>
                      ) : (
                        <div className="m-bed-guest" style={{color:'#4caf87'}}>Available</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB 2: QR ── */}
        {tab==='qr' && (
          <div>
            <div className="m-section-title">QR Code Generator</div>
            <div className="m-section-sub">Generate a scannable QR code for any location.</div>
            <div className="m-qr-panel">
              <div className="m-card" style={{padding:24}}>
                <div className="m-form-group">
                  <label className="m-form-label">Select Location</label>
                  <select className="m-select" value={qrLoc} onChange={e=>setQrLoc(e.target.value)}>
                    <option value="">Select location…</option>
                    {allLocs.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
                  </select>
                </div>
                <div className="m-form-group">
                  <label className="m-form-label">Base URL</label>
                  <input className="m-input" value={qrBase} onChange={e=>setQrBase(e.target.value)} placeholder="https://yourapp.vercel.app" />
                </div>
                <button className="m-btn-primary" onClick={generateQR}>Generate QR Code</button>
              </div>
              <div className="m-card" style={{padding:24,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:300}}>
                {qrResult ? (
                  <>
                    <div style={{width:220,height:220,borderRadius:12,overflow:'hidden',background:'#1a1d27'}}><img src={qrResult.qr} alt="QR" style={{width:'100%',height:'100%'}} /></div>
                    <div style={{fontSize:16,fontWeight:600,margin:'14px 0 6px',color:'#e8d5b7'}}>{qrResult.locationName}</div>
                    <div style={{fontSize:11,color:'#8a8478',wordBreak:'break-all',textAlign:'center',marginBottom:14}}>{qrResult.url}</div>
                    <button className="m-btn-primary" style={{width:'auto',padding:'10px 24px',marginBottom:8}} onClick={()=>{const a=document.createElement('a');a.href=qrResult.qr;a.download=`QR_${qrResult.locationName}.png`;a.click()}}>⬇ Download PNG</button>
                    <button className="m-btn-secondary" style={{width:'auto',padding:'8px 20px'}} onClick={()=>navigator.clipboard.writeText(qrResult.url).then(()=>showToast('URL copied'))}>Copy URL</button>
                  </>
                ) : <div style={{fontSize:13,color:'#4a4640'}}>Select a location to generate a QR code</div>}
              </div>
            </div>

            {/* Access Codes */}
            <div style={{marginTop:32,maxWidth:800}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
                <div>
                  <div className="m-section-title" style={{fontSize:18}}>Daycation Access Codes</div>
                  <div className="m-section-sub" style={{marginBottom:0}}>Codes issued to day visitors</div>
                </div>
                <button className="m-btn-add" onClick={()=>setShowCodeModal(true)}>+ New Code</button>
              </div>
              <table className="m-table">
                <thead><tr><th>Code</th><th>Label</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {codes.map(c=>(
                    <tr key={c.id}>
                      <td><span className="m-code">{c.code}</span></td>
                      <td style={{color:'#8a8478'}}>{c.label||'–'}</td>
                      <td><span style={{color:c.used?'#4a4640':'#4caf87'}}>{c.used?'Used':'Active'}</span></td>
                      <td><button className="m-btn-del" onClick={()=>deleteCode(c.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: MENU ── */}
        {tab==='menu' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:10}}>
              <div>
                <div className="m-section-title">Menu &amp; Stock Control</div>
                <div className="m-section-sub" style={{marginBottom:0}}>Toggle availability instantly. Changes reflect immediately on guest view.</div>
              </div>
              <button className="m-btn-add" onClick={()=>{setEditItem({id:'',name:'',description:'',price:0,image_url:'',in_stock:true,featured:false,category_id:menu[0]?.id||'',modifiers:[]});setIsNewItem(true);setShowEditModal(true)}}>+ Add Item</button>
            </div>
            {menu.map(cat=>(
              <div key={cat.id} style={{marginBottom:28}}>
                <div className="m-cat-header">{cat.name}</div>
                {cat.items.map(item=>(
                  <div key={item.id} className="m-item-row">
                    <img className="m-item-thumb" src={item.image_url||''} alt={item.name} onError={e=>{(e.target as HTMLImageElement).src='https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=100&q=50'}} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500}}>
                        {item.name}
                        {!item.in_stock&&<span style={{fontSize:10,color:'#e05555',letterSpacing:'.08em',textTransform:'uppercase',marginLeft:8}}>Out of Stock</span>}
                      </div>
                      <div style={{fontSize:12,color:'#8a8478',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.description||'–'}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:600,color:'#e8d5b7',flexShrink:0}}>${item.price.toFixed(2)}</div>
                    <div style={{display:'flex',gap:8,flexShrink:0}}>
                      <button className={`m-stock-btn${item.in_stock?' in':' out'}`} onClick={()=>toggleStock(item.id)}>
                        {item.in_stock?'● In Stock':'○ Out of Stock'}
                      </button>
                      <button className="m-edit-btn" onClick={()=>{setEditItem(item);setIsNewItem(false);setShowEditModal(true)}}>Edit</button>
                      <button className="m-del-btn" onClick={()=>deleteItem(item.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── TAB 4: REPORT ── */}
        {tab==='report' && (
          <div>
            <div className="m-section-title">End-of-Day Report</div>
            <div className="m-section-sub">Revenue summary, top items, peak service hours.</div>
            <div className="m-report-controls">
              <input type="date" className="m-date-input" value={reportDate} onChange={e=>setReportDate(e.target.value)} />
              <button className="m-btn-primary" style={{width:'auto',padding:'10px 22px'}} onClick={loadReport}>Load Report</button>
              <button className="m-btn-secondary" style={{width:'auto',padding:'10px 18px'}} onClick={exportCSV}>⬇ Export CSV</button>
            </div>
            {report ? (
              <>
                <div className="m-stats">
                  {[
                    {label:'Total Revenue',value:'$'+report.revenue.total_revenue.toFixed(2),cls:'gold'},
                    {label:'Orders Delivered',value:report.revenue.total_orders,cls:''},
                    {label:'Guest Sessions',value:report.guestSessions.sessions,cls:'green'},
                    {label:'Avg. Order',value:'$'+(report.revenue.total_orders?(report.revenue.total_revenue/report.revenue.total_orders).toFixed(2):'0.00'),cls:'amber'},
                  ].map(s=>(
                    <div key={s.label} className="m-stat">
                      <div className="m-stat-label">{s.label}</div>
                      <div className={`m-stat-value ${s.cls}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div className="m-report-grid">
                  <div className="m-card" style={{padding:22}}>
                    <div className="m-card-title">Top Performing Items</div>
                    {report.topItems.length ? report.topItems.map((item,i)=>(
                      <div key={i} className="m-top-row">
                        <div><span style={{color:'#8a8478',fontSize:12,marginRight:8}}>{i+1}</span>{item.item_name}</div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:14,fontWeight:600,color:'#e8d5b7'}}>${item.revenue.toFixed(2)}</div>
                          <div style={{fontSize:11,color:'#8a8478'}}>{item.qty_sold} sold</div>
                        </div>
                      </div>
                    )) : <div style={{color:'#4a4640',fontSize:13,padding:'16px 0'}}>No sales recorded</div>}
                  </div>
                  <div className="m-card" style={{padding:22}}>
                    <div className="m-card-title">Peak Ordering Hours</div>
                    {report.hourlyBreakdown.length ? report.hourlyBreakdown.map(h=>(
                      <div key={h.hour} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                        <span style={{fontSize:12,color:'#8a8478',width:42,flexShrink:0}}>{h.hour}:00</span>
                        <div style={{flex:1,height:8,background:'#13151c',borderRadius:4,overflow:'hidden'}}>
                          <div style={{height:'100%',background:'linear-gradient(90deg,#a07840,#c9a96e)',borderRadius:4,width:`${Math.round(h.revenue/maxHourly*100)}%`,transition:'width .6s'}} />
                        </div>
                        <span style={{fontSize:12,color:'#8a8478',width:50,textAlign:'right',flexShrink:0}}>${h.revenue.toFixed(0)}</span>
                      </div>
                    )) : <div style={{color:'#4a4640',fontSize:13,padding:'16px 0'}}>No data</div>}
                  </div>
                  <div className="m-card" style={{padding:22}}>
                    <div className="m-card-title">Top Locations by Revenue</div>
                    {report.locationBreakdown.map((loc,i)=>(
                      <div key={i} className="m-top-row">
                        <div><span style={{color:'#8a8478',fontSize:12,marginRight:8}}>{i+1}</span>{loc.location}</div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:14,fontWeight:600,color:'#e8d5b7'}}>${loc.revenue.toFixed(2)}</div>
                          <div style={{fontSize:11,color:'#8a8478'}}>{loc.orders} orders</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="m-card" style={{padding:22}}>
                    <div className="m-card-title">Summary</div>
                    {[['Report Date',report.reportDate],['Revenue','$'+report.revenue.total_revenue.toFixed(2)],['Orders',report.revenue.total_orders],['Sessions',report.guestSessions.sessions],['Top Item',report.topItems[0]?.item_name||'–']].map(([k,v])=>(
                      <div key={String(k)} className="m-top-row">
                        <span style={{fontSize:14}}>{k}</span><span style={{fontSize:14,color:'#e8d5b7'}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : <div style={{color:'#4a4640',fontSize:14,padding:'40px 0',textAlign:'center'}}>Select a date and load the report.</div>}
          </div>
        )}
      </div>

      {/* Edit Item Modal */}
      {showEditModal && editItem && (
        <ItemEditModal
          item={editItem}
          categories={menu.map(c=>({id:c.id,name:c.name}))}
          isNew={isNewItem}
          onSave={saveItem}
          onClose={()=>{setShowEditModal(false);setEditItem(null)}}
        />
      )}

      {/* Add Code Modal */}
      {showCodeModal && (
        <div className="m-modal-backdrop open">
          <div className="m-modal-box">
            <div className="m-modal-title">New Access Code</div>
            <CodeForm onAdd={addCode} onClose={()=>setShowCodeModal(false)} />
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`m-toast${toast?' show':''}`}>{toast}</div>
    </div>
  )
}

function ItemEditModal({item,categories,isNew,onSave,onClose}:{item:MenuItem;categories:{id:string;name:string}[];isNew:boolean;onSave:(i:Partial<MenuItem>)=>void;onClose:()=>void}) {
  const [form, setForm] = useState({...item})
  return (
    <div className="m-modal-backdrop open">
      <div className="m-modal-box">
        <div className="m-modal-title">{isNew?'Add New Item':'Edit Item'}</div>
        <div className="m-form-group"><label className="m-form-label">Name</label><input className="m-input" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} /></div>
        <div className="m-form-group"><label className="m-form-label">Description</label><input className="m-input" value={form.description||''} onChange={e=>setForm(p=>({...p,description:e.target.value}))} /></div>
        <div className="m-form-group"><label className="m-form-label">Price ($)</label><input className="m-input" type="number" step="0.01" value={form.price} onChange={e=>setForm(p=>({...p,price:parseFloat(e.target.value)}))} /></div>
        <div className="m-form-group"><label className="m-form-label">Category</label>
          <select className="m-select" value={form.category_id} onChange={e=>setForm(p=>({...p,category_id:e.target.value}))}>
            {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="m-form-group"><label className="m-form-label">Image URL</label><input className="m-input" value={form.image_url||''} onChange={e=>setForm(p=>({...p,image_url:e.target.value}))} /></div>
        <div style={{display:'flex',gap:10,marginTop:20}}>
          <button className="m-btn-secondary" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="m-btn-primary" style={{flex:2}} onClick={()=>onSave(form)}>Save Item</button>
        </div>
      </div>
    </div>
  )
}

function CodeForm({onAdd,onClose}:{onAdd:(code:string,label:string)=>void;onClose:()=>void}) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  return (
    <>
      <div className="m-form-group"><label className="m-form-label">Code</label><input className="m-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. SUMMER2025" /></div>
      <div className="m-form-group"><label className="m-form-label">Label</label><input className="m-input" value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Event Guest" /></div>
      <div style={{display:'flex',gap:10,marginTop:20}}>
        <button className="m-btn-secondary" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="m-btn-primary" style={{flex:2}} onClick={()=>onAdd(code,label)}>Create Code</button>
      </div>
    </>
  )
}

const mgrCSS = `
  :root{--bg:#0b0c10;--bg2:#13151c;--bg3:#1a1d27;--surface:#212434;--gold:#c9a96e;--gold2:#e8d5b7;--gold3:#a07840;--text:#f0ece4;--text2:#8a8478;--text3:#4a4640;--success:#4caf87;--warn:#e8a020;--err:#e05555;--border:rgba(201,169,110,0.13);--radius:14px}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--bg2)}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}

  .m-topbar{background:var(--bg2);border-bottom:1px solid var(--border);padding:0 28px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
  .m-brand{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
  .m-dot{width:8px;height:8px;border-radius:50%;background:var(--success);animation:pulse 2s infinite}
  .m-dot.warn{background:var(--warn)}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .m-clock{font-size:14px;color:var(--text2);font-variant-numeric:tabular-nums}

  .m-tabs{background:var(--bg2);border-bottom:1px solid var(--border);padding:0 28px;display:flex;overflow-x:auto;scrollbar-width:none}
  .m-tabs::-webkit-scrollbar{display:none}
  .m-tab{padding:0 22px;height:52px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);font-size:13px;letter-spacing:.06em;cursor:pointer;white-space:nowrap;transition:all .2s}
  .m-tab.active{color:var(--gold2);border-bottom-color:var(--gold)}

  .m-main{padding:28px;max-width:1400px;margin:0 auto}
  .m-section-title{font-family:Georgia,serif;font-size:22px;font-weight:400;margin-bottom:6px}
  .m-section-sub{font-size:13px;color:var(--text2);margin-bottom:28px}

  .m-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:28px}
  .m-stat{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px}
  .m-stat-label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--text2);margin-bottom:8px}
  .m-stat-value{font-size:28px;font-weight:600;font-variant-numeric:tabular-nums}
  .m-stat-value.gold{color:var(--gold2)}
  .m-stat-value.green{color:var(--success)}
  .m-stat-value.amber{color:var(--warn)}
  .m-stat-sub{font-size:12px;color:var(--text2);margin-top:4px}

  .m-legend{display:flex;gap:20px;margin-bottom:24px}
  .m-legend-item{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text2)}
  .m-legend-dot{width:10px;height:10px;border-radius:50%}

  .m-zone{margin-bottom:32px}
  .m-zone-header{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--text2);margin-bottom:14px;display:flex;align-items:center;gap:12px}
  .m-zone-header::after{content:'';flex:1;height:1px;background:var(--border)}
  .m-bed-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px}
  .m-bed{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px;transition:border-color .2s}
  .m-bed.available{border-color:rgba(76,175,135,.3)}
  .m-bed.occupied{border-color:rgba(201,169,110,.35);background:rgba(201,169,110,.05)}
  .m-bed-name{font-size:13px;font-weight:600;margin-bottom:6px;display:flex;align-items:center}
  .m-bed-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
  .m-bed.available .m-bed-dot{background:var(--success)}
  .m-bed.occupied .m-bed-dot{background:var(--gold)}
  .m-bed-guest{font-size:11px;color:var(--gold2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m-bed-type{font-size:10px;color:var(--text3);margin-top:2px}
  .m-bed-since{font-size:10px;color:var(--text3);margin-top:4px}
  .m-btn-clear{margin-top:10px;width:100%;padding:7px;background:rgba(224,85,85,.1);border:1px solid rgba(224,85,85,.25);border-radius:8px;color:#ff8080;font-size:11px;cursor:pointer}

  .m-qr-panel{display:grid;grid-template-columns:1fr 1fr;gap:28px;max-width:800px;margin-bottom:0}
  @media(max-width:640px){.m-qr-panel{grid-template-columns:1fr}}
  .m-card{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius)}
  .m-card-title{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--text2);margin-bottom:16px}
  .m-form-group{margin-bottom:18px}
  .m-form-label{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text2);margin-bottom:8px}
  .m-select,.m-input{width:100%;padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;outline:none;-webkit-appearance:none}
  .m-select:focus,.m-input:focus{border-color:rgba(201,169,110,.4)}
  .m-btn-primary{width:100%;padding:13px;background:linear-gradient(135deg,#c9a96e,#a07840);border:none;border-radius:10px;color:#1a1000;font-size:14px;font-weight:600;cursor:pointer;letter-spacing:.04em}
  .m-btn-secondary{width:100%;padding:11px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:13px;cursor:pointer}
  .m-btn-add{padding:10px 20px;background:linear-gradient(135deg,#c9a96e,#a07840);border:none;border-radius:10px;color:#1a1000;font-size:13px;font-weight:600;cursor:pointer}

  .m-table{width:100%;border-collapse:collapse}
  .m-table th,.m-table td{padding:10px 14px;text-align:left;font-size:13px;border-bottom:1px solid var(--border)}
  .m-table th{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text2)}
  .m-code{font-family:monospace;font-size:14px;color:var(--gold2);letter-spacing:.06em}
  .m-btn-del{padding:5px 10px;background:none;border:1px solid rgba(224,85,85,.2);border-radius:6px;color:#ff8080;font-size:12px;cursor:pointer}

  .m-cat-header{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--text2);margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)}
  .m-item-row{display:flex;align-items:center;gap:14px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;flex-wrap:wrap}
  .m-item-thumb{width:52px;height:52px;border-radius:8px;object-fit:cover;background:var(--bg2);flex-shrink:0}
  .m-stock-btn{padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid}
  .m-stock-btn.in{background:rgba(76,175,135,.1);border-color:rgba(76,175,135,.3);color:var(--success)}
  .m-stock-btn.out{background:rgba(224,85,85,.1);border-color:rgba(224,85,85,.3);color:#ff8080}
  .m-edit-btn{padding:7px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text2);font-size:12px;cursor:pointer}
  .m-del-btn{padding:7px 10px;background:none;border:1px solid transparent;border-radius:8px;color:var(--text3);font-size:14px;cursor:pointer}
  .m-del-btn:hover{color:var(--err)}

  .m-report-controls{display:flex;align-items:center;gap:14px;margin-bottom:28px;flex-wrap:wrap}
  .m-date-input{padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;outline:none}
  .m-report-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  @media(max-width:860px){.m-report-grid{grid-template-columns:1fr}}
  .m-top-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);font-size:14px}
  .m-top-row:last-child{border-bottom:none}

  .m-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:none;align-items:center;justify-content:center;padding:24px}
  .m-modal-backdrop.open{display:flex}
  .m-modal-box{background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:28px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto}
  .m-modal-title{font-family:Georgia,serif;font-size:20px;margin-bottom:20px}

  .m-toast{position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 18px;font-size:13px;opacity:0;transform:translateY(8px);transition:all .3s;pointer-events:none;z-index:999;max-width:300px}
  .m-toast.show{opacity:1;transform:none}
`
