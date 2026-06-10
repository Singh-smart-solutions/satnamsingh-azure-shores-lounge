'use client'

import { useEffect, useState, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

// ── TYPES ────────────────────────────────────────────────────────────────────
interface Location {
  id: string
  label: string
  status: 'available' | 'occupied'
}

interface DrinkItem {
  id: string
  item_name: string
  category: 'Champagne' | 'Cocktails' | 'Juices'
  price: number
  description: string
  image_url: string
  is_available: boolean
}

interface CartItem {
  drink: DrinkItem
  quantity: number
  specialRequest: string
}

interface OrderItem {
  id: string
  item_name: string
  price: number
  quantity: number
  subtotal: number
}

interface Order {
  id: string
  status: 'pending' | 'preparing' | 'delivered'
  total: number
  special_notes: string
  created_at: string
  location_id: string
  order_items?: OrderItem[]
}

export default function GuestPage() {
  const supabase = getSupabaseBrowserClient() as any

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [authType, setAuthType] = useState<'resort' | 'daycation'>('resort')
  const [guestName, setGuestName] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [daycationCode, setDaycationCode] = useState('')
  
  const [locationId, setLocationId] = useState<string | null>(null)
  const [locationLabel, setLocationLabel] = useState<string>('Select Location')
  const [locations, setLocations] = useState<Location[]>([])
  
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'menu' | 'cart' | 'orders'>('menu')
  
  // Menu & Cart
  const [drinks, setDrinks] = useState<DrinkItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<'Champagne' | 'Cocktails' | 'Juices'>('Champagne')
  const [cart, setCart] = useState<CartItem[]>([])
  
  // Modals & Interactivity
  const [selectedDrink, setSelectedDrink] = useState<DrinkItem | null>(null)
  const [drinkQty, setDrinkQty] = useState(1)
  const [drinkNotes, setDrinkNotes] = useState('')
  const [showLocationSwapper, setShowLocationSwapper] = useState(false)
  const [showOccupiedAlert, setShowOccupiedAlert] = useState(false)
  const [showOrderSuccess, setShowOrderSuccess] = useState(false)
  
  // Active Session Orders
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  
  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  // ── INITIAL LOAD & REAL-TIME LISTENERS ─────────────────────────────────────
  
  // 1. Fetch Locations & Menu Items
  useEffect(() => {
    async function loadInitialData() {
      // Load locations
      const { data: locData } = await supabase
        .from('locations')
        .select('*')
        .order('label')
      if (locData) setLocations(locData as Location[])

      // Load drinks menu
      const { data: menuData } = await supabase
        .from('drinks_menu')
        .select('*')
        .eq('is_available', true)
        .order('item_name')
      if (menuData) setDrinks(menuData as DrinkItem[])
    }

    loadInitialData()

    // Subscribe to location changes in real-time
    const locationsChannel = supabase
      .channel('public:locations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, (payload: any) => {
        const updatedLoc = payload.new as Location
        setLocations((prev) =>
          prev.map((l) => (l.id === updatedLoc.id ? updatedLoc : l))
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(locationsChannel)
    }
  }, [supabase])

  // 2. Parse URL Search Parameters for Location id or label
  useEffect(() => {
    if (locations.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const locParam = params.get('loc')
    if (locParam) {
      const matchedLoc = locations.find(
        (l) => l.id.toLowerCase() === locParam.toLowerCase() || l.label.toLowerCase() === decodeURIComponent(locParam).toLowerCase()
      )
      if (matchedLoc) {
        setLocationId(matchedLoc.id)
        setLocationLabel(matchedLoc.label)
      }
    }
  }, [locations])

  // 3. Listen to Active Orders in Real-Time once sessionId exists
  useEffect(() => {
    const activeSessionId = sessionId as string
    if (!activeSessionId) return

    // Fetch initial orders
    async function loadOrders() {
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .eq('session_id', activeSessionId)
        .order('created_at', { ascending: false })
      if (data) setOrders(data as Order[])
    }

    loadOrders()

    // Real-time listener for this session's orders
    const ordersChannel = supabase
      .channel(`session-orders-${activeSessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `session_id=eq.${activeSessionId}` },
        async () => {
          // Re-load orders to pull nested order items easily
          loadOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
    }
  }, [sessionId, supabase])

  // ── HANDLERS ───────────────────────────────────────────────────────────────
  
  // Auth Handler: Create Guest Session
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setLoading(true)

    if (!locationId) {
      setAuthError('Please scan a valid location QR code or select a location.')
      setLoading(false)
      return
    }

    if (!guestName.trim()) {
      setAuthError('Please enter your full name.')
      setLoading(false)
      return
    }

    try {
      // 1. Check if location has an active session (partial index ensures this, but let's check gracefully)
      const { data: activeSession } = await supabase
        .from('sessions')
        .select('*')
        .eq('location_id', locationId)
        .eq('is_active', true)
        .maybeSingle()

      if (activeSession) {
        setAuthError('This location is currently active with another guest session. Please contact the concierge.')
        setLoading(false)
        return
      }

      // 2. Insert new session
      const { data: newSession, error: sessionErr } = await supabase
        .from('sessions')
        .insert({
          location_id: locationId,
          guest_name: guestName.trim(),
          room_number: authType === 'resort' ? roomNumber.trim() : null,
          daycation_code: authType === 'daycation' ? daycationCode.trim().toUpperCase() : null,
          is_active: true
        })
        .select()
        .single()

      if (sessionErr || !newSession) {
        throw new Error(sessionErr?.message || 'Could not initiate session.')
      }

      // 3. Mark location as occupied
      await supabase
        .from('locations')
        .update({ status: 'occupied' })
        .eq('id', locationId)

      // 4. Update Client State
      setSessionId(newSession.id)
      triggerToast(`Welcome to Smart Lounge, ${newSession.guest_name}`)
    } catch (err: any) {
      setAuthError(err.message || 'An error occurred during authentication.')
    } finally {
      setLoading(false)
    }
  }

  // Location Swapper Handler (Instant Session Handshake)
  const handleLocationSwap = async (targetLoc: Location) => {
    if (!sessionId || !locationId) return

    // Constraint check: Sunbed 15 is hardcoded occupied
    if (targetLoc.label === 'Sunbed 15') {
      setShowLocationSwapper(false)
      setShowOccupiedAlert(true)
      return
    }

    // Call Core API Exchange Handler
    try {
      const response = await fetch('/api/session-handshake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentSessionId: sessionId,
          currentLocationId: locationId,
          targetLocationId: targetLoc.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          triggerToast('Error: Target location is currently occupied.')
        } else {
          triggerToast(data.error || 'Failed to update location.')
        }
        return
      }

      // Update client state
      setLocationId(targetLoc.id)
      setLocationLabel(targetLoc.label)
      setShowLocationSwapper(false)
      triggerToast(`Successfully moved to ${targetLoc.label}`)
    } catch (err) {
      triggerToast('Network error, please try again.')
    }
  }

  // Cart Operations
  const addToCart = () => {
    if (!selectedDrink) return
    const newCartItem: CartItem = {
      drink: selectedDrink,
      quantity: drinkQty,
      specialRequest: drinkNotes.trim()
    }
    setCart((prev) => [...prev, newCartItem])
    setSelectedDrink(null)
    setDrinkQty(1)
    setDrinkNotes('')
    triggerToast(`${selectedDrink.item_name} added to order`)
  }

  const removeFromCart = (index: number) => {
    const item = cart[index]
    setCart((prev) => prev.filter((_, i) => i !== index))
    triggerToast(`${item.drink.item_name} removed`)
  }

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + item.drink.price * item.quantity, 0)
  }

  // Submit Order to Supabase
  const submitOrder = async () => {
    if (cart.length === 0 || !sessionId || !locationId) return
    setLoading(true)

    try {
      const total = getCartTotal()
      
      // 1. Insert order
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .insert({
          session_id: sessionId,
          location_id: locationId,
          original_location_id: locationId,
          guest_name: guestName,
          status: 'pending',
          special_notes: cart.map(c => c.specialRequest ? `${c.drink.item_name}: ${c.specialRequest}` : null).filter(Boolean).join(' | '),
          total: total
        })
        .select()
        .single()

      if (orderErr || !orderData) {
        throw new Error(orderErr?.message || 'Could not place order.')
      }

      // 2. Insert order items
      const itemsToInsert = cart.map((item) => ({
        order_id: orderData.id,
        drink_id: item.drink.id,
        item_name: item.drink.item_name,
        price: item.drink.price,
        quantity: item.quantity,
        subtotal: item.drink.price * item.quantity
      }))

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(itemsToInsert)

      if (itemsErr) {
        throw new Error(itemsErr.message || 'Could not save order items.')
      }

      // 3. Success state updates
      setCart([])
      setShowOrderSuccess(true)
      setActiveTab('orders')
    } catch (err: any) {
      triggerToast(`Failed to place order: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ── RENDER AUTH GATE ───────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div className="min-h-screen bg-charcoal-dark flex flex-col justify-between p-6 md:p-12 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gold-dark/5 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="text-center mt-12">
          <p className="text-gold tracking-[0.25em] text-xs font-medium uppercase mb-3">Smart Lounge Concierge</p>
          <h1 className="font-serif text-4xl md:text-5xl text-gold-light tracking-wide font-normal leading-tight">
            Select Your Sanctuary
          </h1>
          {locationLabel !== 'Select Location' && (
            <div className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-charcoal-light/40 border border-gold/10 rounded-full text-gold-light text-sm backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
              {locationLabel}
            </div>
          )}
        </div>

        {/* Main Card */}
        <div className="max-w-md w-full mx-auto bg-charcoal-light/35 border border-gold/15 rounded-2xl p-8 backdrop-blur-md shadow-2xl my-8">
          {/* Toggle Tab */}
          <div className="grid grid-cols-2 p-1 bg-charcoal-dark/70 rounded-lg mb-8 border border-white/5">
            <button
              onClick={() => { setAuthType('resort'); setAuthError(null) }}
              className={`py-3 text-xs font-semibold tracking-wider uppercase rounded-md transition-all duration-300 ${
                authType === 'resort'
                  ? 'bg-gold text-charcoal-dark shadow-md'
                  : 'text-gray-400 hover:text-gold-light'
              }`}
            >
              Resort Guest
            </button>
            <button
              onClick={() => { setAuthType('daycation'); setAuthError(null) }}
              className={`py-3 text-xs font-semibold tracking-wider uppercase rounded-md transition-all duration-300 ${
                authType === 'daycation'
                  ? 'bg-gold text-charcoal-dark shadow-md'
                  : 'text-gray-400 hover:text-gold-light'
              }`}
            >
              Day Visitor
            </button>
          </div>

          {authError && (
            <div className="mb-6 p-4 bg-red-950/40 border border-red-500/20 text-red-300 text-xs rounded-lg leading-relaxed">
              {authError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] tracking-widest uppercase text-gold/75 mb-2 font-medium">
                Sanctuary Location
              </label>
              {locationId ? (
                <div className="w-full px-4 py-3 bg-charcoal-dark/50 border border-gold/20 rounded-lg text-gold-light text-sm font-medium">
                  {locationLabel}
                </div>
              ) : (
                <select
                  onChange={(e) => {
                    const matched = locations.find((l) => l.id === e.target.value)
                    if (matched) {
                      setLocationId(matched.id)
                      setLocationLabel(matched.label)
                    }
                  }}
                  className="w-full px-4 py-3 bg-charcoal-dark/80 border border-gold/20 rounded-lg text-gold-light text-sm outline-none focus:border-gold/60 transition"
                  defaultValue=""
                >
                  <option value="" disabled>Choose Location...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id} disabled={loc.status === 'occupied'}>
                      {loc.label} {loc.status === 'occupied' ? '(Occupied)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-[10px] tracking-widest uppercase text-gold/75 mb-2 font-medium">
                Full Name
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Elizabeth Sterling"
                className="w-full px-4 py-3 bg-charcoal-dark/50 border border-gold/20 rounded-lg text-gold-light placeholder-gray-600 text-sm outline-none focus:border-gold/60 transition"
                required
              />
            </div>

            {authType === 'resort' ? (
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-gold/75 mb-2 font-medium">
                  Room Number
                </label>
                <input
                  type="text"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. 412"
                  className="w-full px-4 py-3 bg-charcoal-dark/50 border border-gold/20 rounded-lg text-gold-light placeholder-gray-600 text-sm outline-none focus:border-gold/60 transition"
                  required
                />
              </div>
            ) : (
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-gold/75 mb-2 font-medium">
                  Daycation Access Code
                </label>
                <input
                  type="text"
                  value={daycationCode}
                  onChange={(e) => setDaycationCode(e.target.value)}
                  placeholder="e.g. RIVIERA10"
                  className="w-full px-4 py-3 bg-charcoal-dark/50 border border-gold/20 rounded-lg text-gold-light placeholder-gray-600 text-sm uppercase outline-none focus:border-gold/60 transition"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-gold via-gold-premium to-gold-dark text-charcoal-black font-semibold text-sm rounded-lg uppercase tracking-widest shadow-lg active:scale-[0.98] transition duration-150 disabled:opacity-50"
            >
              {loading ? 'Initializing Session...' : 'Enter Lounge'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-600 text-[10px] tracking-wider uppercase mb-4">
          Smart Lounge Resort &amp; Spa © 2026
        </div>
      </div>
    )
  }

  // ── RENDER MAIN GUEST CONCIERGE INTERFACE ──────────────────────────────────
  return (
    <div className="min-h-screen bg-charcoal-black flex flex-col justify-between text-[#f0ece4] pb-24 relative">
      
      {/* Pinned Luxury Location Header */}
      <header className="sticky top-0 z-40 bg-charcoal-black/90 backdrop-blur-xl border-bottom border-gold/15 py-4 px-6 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-gold text-lg">📍</span>
          <div>
            <p className="text-[9px] tracking-widest text-gray-500 uppercase">Delivering to</p>
            <p className="text-sm font-semibold text-gold-light">{locationLabel}</p>
          </div>
        </div>
        <button
          onClick={() => setShowLocationSwapper(true)}
          className="text-xs uppercase tracking-widest text-gold hover:text-gold-light border border-gold/25 rounded-full px-4 py-1.5 bg-gold/5 hover:bg-gold/10 transition"
        >
          Change
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-lg w-full mx-auto px-6 py-8">
        
        {/* activeTab == MENU */}
        {activeTab === 'menu' && (
          <div className="space-y-8">
            <div className="text-center py-4">
              <p className="text-[10px] tracking-[0.25em] text-gold uppercase mb-2">Signature Lookbook</p>
              <h2 className="font-serif text-3xl text-gold-light font-normal">Bespoke Refreshments</h2>
            </div>

            {/* Menu categories tabs */}
            <div className="flex justify-center border-b border-gold/10 pb-4 gap-6">
              {(['Champagne', 'Cocktails', 'Juices'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-sm tracking-wider pb-2 relative transition duration-300 ${
                    selectedCategory === cat ? 'text-gold font-medium' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {cat}
                  {selectedCategory === cat && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Lookbook Drinks Grid */}
            <div className="grid grid-cols-1 gap-6">
              {drinks
                .filter((d) => d.category === selectedCategory)
                .map((drink) => (
                  <div
                    key={drink.id}
                    onClick={() => setSelectedDrink(drink)}
                    className="group flex gap-4 bg-charcoal-light/25 border border-gold/10 rounded-xl p-4 cursor-pointer hover:border-gold/30 transition duration-300"
                  >
                    <div className="w-24 h-24 overflow-hidden rounded-lg bg-charcoal-dark flex-shrink-0">
                      <img
                        src={drink.image_url}
                        alt={drink.item_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <h3 className="text-base font-serif text-gold-light tracking-wide truncate">
                          {drink.item_name}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                          {drink.description}
                        </p>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm font-semibold text-gold font-mono">
                          ${drink.price.toFixed(2)}
                        </span>
                        <span className="text-[10px] tracking-widest uppercase text-gold/80 font-medium border border-gold/20 px-2.5 py-1 rounded-full group-hover:bg-gold group-hover:text-charcoal-black transition duration-300">
                          Order
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* activeTab == CART */}
        {activeTab === 'cart' && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-gold-light font-normal mb-6">Your Sanctuary Order</h2>

            {cart.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-gold/15 rounded-xl space-y-4">
                <span className="text-3xl block">🍹</span>
                <p className="text-xs text-gray-500 tracking-wider">Your order lookbook is currently empty.</p>
                <button
                  onClick={() => setActiveTab('menu')}
                  className="text-xs uppercase tracking-widest text-gold border-b border-gold/40 pb-0.5"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {cart.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-start border-b border-gold/10 pb-4"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <h4 className="text-sm font-serif text-gold-light tracking-wide">
                          {item.drink.item_name}
                        </h4>
                        {item.specialRequest && (
                          <p className="text-xs text-gold-dark italic mt-1">
                            &ldquo;{item.specialRequest}&rdquo;
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          Qty: {item.quantity} &times; ${item.drink.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="text-sm font-semibold font-mono text-gold-light">
                          ${(item.drink.price * item.quantity).toFixed(2)}
                        </span>
                        <button
                          onClick={() => removeFromCart(idx)}
                          className="text-gray-600 hover:text-red-400 p-1 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-charcoal-light/10 border border-gold/15 rounded-xl p-6 space-y-3">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Subtotal</span>
                    <span className="font-mono">${getCartTotal().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Poolside Service Charge</span>
                    <span className="text-gold uppercase tracking-wider font-semibold">Complimentary</span>
                  </div>
                  <div className="h-px bg-gold/10 my-2" />
                  <div className="flex justify-between text-base font-serif text-gold-light">
                    <span>Total Due</span>
                    <span className="font-mono">${getCartTotal().toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={submitOrder}
                  disabled={loading}
                  className="w-full py-4 mt-4 bg-gradient-to-r from-gold via-gold-premium to-gold-dark text-charcoal-black font-semibold text-sm rounded-lg uppercase tracking-widest shadow-lg hover:brightness-105 active:scale-[0.99] transition duration-150"
                >
                  {loading ? 'Dispatching Runner...' : 'Confirm Poolside Order'}
                </button>
              </>
            )}
          </div>
        )}

        {/* activeTab == ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-gold-light font-normal mb-6">Active Concierge Dispatches</h2>

            {orders.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-gold/15 rounded-xl space-y-4">
                <span className="text-3xl block">📋</span>
                <p className="text-xs text-gray-500 tracking-wider">No active orders found.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {orders.map((order) => {
                  const statusColors = {
                    pending: 'bg-yellow-950/40 border-yellow-500/20 text-yellow-300',
                    preparing: 'bg-blue-950/40 border-blue-500/20 text-blue-300',
                    delivered: 'bg-emerald-950/40 border-emerald-500/20 text-emerald-300'
                  }
                  
                  return (
                    <div
                      key={order.id}
                      className="bg-charcoal-light/20 border border-gold/15 rounded-xl p-6 space-y-4"
                    >
                      <div className="flex justify-between items-center border-b border-gold/10 pb-3">
                        <div>
                          <p className="text-[9px] tracking-widest text-gray-500 uppercase">
                            Order Reference
                          </p>
                          <p className="text-xs font-mono font-bold text-gold-light">
                            #{order.id.slice(-6).toUpperCase()}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${
                            statusColors[order.status]
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>

                      {/* Items List */}
                      <div className="space-y-2">
                        {order.order_items?.map((item) => (
                          <div key={item.id} className="flex justify-between text-xs">
                            <span className="text-gray-400">
                              {item.quantity} &times; {item.item_name}
                            </span>
                            <span className="font-mono text-gold-light">
                              ${item.subtotal.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {order.special_notes && (
                        <div className="bg-charcoal-dark/40 rounded p-2.5 text-[11px] italic text-gold/80 border border-gold/5">
                          Requests: {order.special_notes}
                        </div>
                      )}

                      <div className="flex justify-between items-center border-t border-gold/10 pt-3 text-xs">
                        <span className="text-gray-500">
                          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-serif text-gold-light font-medium">
                          Total: ${order.total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-charcoal-black/95 backdrop-blur-xl border-t border-gold/15 py-3 shadow-2xl">
        <div className="max-w-md mx-auto grid grid-cols-3">
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'menu' ? 'text-gold' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="text-xl">🍹</span>
            <span className="text-[10px] uppercase tracking-widest font-medium">Menu</span>
          </button>
          
          <button
            onClick={() => setActiveTab('cart')}
            className={`flex flex-col items-center gap-1 relative transition ${
              activeTab === 'cart' ? 'text-gold' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {cart.length > 0 && (
              <span className="absolute -top-1.5 right-6 w-4 h-4 bg-gold text-charcoal-black text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg">
                {cart.length}
              </span>
            )}
            <span className="text-xl">🛒</span>
            <span className="text-[10px] uppercase tracking-widest font-medium">Order</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'orders' ? 'text-gold' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="text-xl">📋</span>
            <span className="text-[10px] uppercase tracking-widest font-medium">Status</span>
          </button>
        </div>
      </nav>

      {/* ── DRINK CUSTOMIZATION DRAWER ────────────────────────────────────────── */}
      {selectedDrink && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-charcoal-light border-t border-gold/20 rounded-t-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-slide-up">
            {/* Header / Close */}
            <div className="relative h-48 bg-charcoal-dark">
              <img
                src={selectedDrink.image_url}
                alt={selectedDrink.item_name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setSelectedDrink(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div>
                <p className="text-[9px] tracking-widest text-gold uppercase font-semibold">
                  {selectedDrink.category}
                </p>
                <h3 className="font-serif text-2xl text-gold-light mt-1 tracking-wide">
                  {selectedDrink.item_name}
                </h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  {selectedDrink.description}
                </p>
              </div>

              {/* Quantity */}
              <div className="flex justify-between items-center bg-charcoal-dark/40 border border-gold/10 rounded-lg p-3">
                <span className="text-xs tracking-wider text-gray-400 uppercase">Quantity</span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setDrinkQty((q) => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-full border border-gold/20 flex items-center justify-center text-gold hover:bg-gold/5 transition"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold font-mono text-gold-light min-w-[12px] text-center">
                    {drinkQty}
                  </span>
                  <button
                    onClick={() => setDrinkQty((q) => q + 1)}
                    className="w-8 h-8 rounded-full border border-gold/20 flex items-center justify-center text-gold hover:bg-gold/5 transition"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Special Request Input */}
              <div className="space-y-2">
                <label className="block text-[10px] tracking-widest uppercase text-gold/75 font-medium">
                  Dietary Preferences / Special Requests
                </label>
                <input
                  type="text"
                  value={drinkNotes}
                  onChange={(e) => setDrinkNotes(e.target.value)}
                  placeholder="e.g. Extra slice of cucumber, no sugar..."
                  className="w-full px-4 py-3 bg-charcoal-dark/50 border border-gold/25 rounded-lg text-gold-light placeholder-gray-600 text-xs outline-none focus:border-gold/60 transition"
                />
              </div>
            </div>

            {/* Footer Add Button */}
            <div className="p-6 border-t border-gold/10 bg-charcoal-dark/50">
              <button
                onClick={addToCart}
                className="w-full py-4 bg-gradient-to-r from-gold via-gold-premium to-gold-dark text-charcoal-black font-semibold text-sm rounded-lg uppercase tracking-widest shadow-lg transition active:scale-[0.99]"
              >
                Add To Order • ${(selectedDrink.price * drinkQty).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATION SWAPPER MODAL ───────────────────────────────────────────── */}
      {showLocationSwapper && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="max-w-md w-full bg-charcoal-light border border-gold/20 rounded-2xl overflow-hidden shadow-2xl p-6 max-h-[80vh] flex flex-col">
            <h3 className="font-serif text-xl text-gold-light font-normal text-center mb-2">
              Relocate Sanctuary
            </h3>
            <p className="text-xs text-gray-500 text-center mb-6">
              Select your target beach lounger or pool sunbed.
            </p>

            <div className="grid grid-cols-3 gap-3 overflow-y-auto pr-1 flex-1 py-1">
              {locations.map((loc) => {
                const isCurrent = loc.id === locationId
                return (
                  <button
                    key={loc.id}
                    onClick={() => handleLocationSwap(loc)}
                    disabled={isCurrent}
                    className={`py-3 px-2 rounded-lg text-xs font-semibold tracking-wider text-center border transition duration-200 ${
                      isCurrent
                        ? 'bg-gold/10 border-gold text-gold cursor-default'
                        : 'bg-charcoal-dark/50 border-gold/15 text-gray-400 hover:border-gold/30 hover:text-gold-light'
                    }`}
                  >
                    {loc.label}
                    {isCurrent && <span className="block text-[8px] text-gold/80 font-normal mt-0.5">Current</span>}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setShowLocationSwapper(false)}
              className="w-full py-3 mt-6 border border-gold/20 text-gold-light hover:bg-gold/5 rounded-lg text-xs font-semibold tracking-widest uppercase transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── HIGH-END CONCIERGE OCCUPIED ALERT ────────────────────────────────── */}
      {showOccupiedAlert && (
        <div className="fixed inset-0 z-55 bg-black/90 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="max-w-sm w-full bg-charcoal-light border border-gold/30 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div className="text-4xl">🏖️</div>
            <h3 className="font-serif text-lg text-gold-light font-normal tracking-wide">
              Lounge Sanctuary Active
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              We regret to inform you that this location is currently occupied by another resident. If you have recently relocated here, please summon a pool steward or contact the front desk so we may update your profile.
            </p>
            <button
              onClick={() => setShowOccupiedAlert(false)}
              className="w-full py-3 bg-gradient-to-r from-gold to-gold-dark text-charcoal-black text-xs font-semibold rounded-lg uppercase tracking-widest transition duration-150 active:scale-[0.98]"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* ── ORDER PLACED SUCCESS OVERLAY ─────────────────────────────────────── */}
      {showOrderSuccess && (
        <div className="fixed inset-0 z-55 bg-black/90 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="max-w-sm w-full bg-charcoal-light border border-gold/30 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div className="text-5xl animate-bounce">✨</div>
            <h3 className="font-serif text-xl text-gold-light font-normal tracking-wide">
              Order Dispatched
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Your refreshments are being crafted by our mixology team. A butler is preparing to deliver them directly to your sanctuary.
            </p>
            <button
              onClick={() => setShowOrderSuccess(false)}
              className="w-full py-3 bg-gradient-to-r from-gold to-gold-dark text-charcoal-black text-xs font-semibold rounded-lg uppercase tracking-widest transition duration-150 active:scale-[0.98]"
            >
              Track Order Status
            </button>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-charcoal-light border border-gold/30 text-gold-light px-5 py-3 rounded-full text-xs font-semibold uppercase tracking-widest shadow-2xl backdrop-blur-md animate-fade-in-up">
          {toastMessage}
        </div>
      )}

    </div>
  )
}
