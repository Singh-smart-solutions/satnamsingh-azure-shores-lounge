'use client'

import { useEffect, useState, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

// ── TYPES ────────────────────────────────────────────────────────────────────
interface Location {
  id: string
  label: string
  status: 'available' | 'occupied'
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
  session_id: string
  location_id: string
  original_location_id: string
  guest_name: string
  status: 'pending' | 'preparing' | 'delivered'
  special_notes: string
  total: number
  created_at: string
  order_items?: OrderItem[]
}

export default function StaffTerminal() {
  const supabase = getSupabaseBrowserClient() as any

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<Order[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'preparing' | 'relocated'>('all')
  const [systemClock, setSystemClock] = useState<string>('')
  const [isLive, setIsLive] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  // ── DATA FETCHING & REAL-TIME ──────────────────────────────────────────────
  const fetchActiveData = async () => {
    // 1. Fetch locations
    const { data: locData } = await supabase
      .from('locations')
      .select('*')
    if (locData) setLocations(locData as Location[])

    // 2. Fetch pending/preparing orders
    const { data: orderData } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .in('status', ['pending', 'preparing'])
      .order('created_at', { ascending: true }) // Oldest first
    
    if (orderData) setOrders(orderData as Order[])
  }

  useEffect(() => {
    fetchActiveData()
    setIsLive(true)

    // Subscribe to changes on the orders table
    const ordersChannel = supabase
      .channel('staff-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        // Trigger re-fetch to pull nested order items easily and maintain accuracy
        fetchActiveData()
        
        // Notify staff of new orders
        if (payload.eventType === 'INSERT') {
          const newOrder = payload.new as Order
          triggerToast(`New order received from ${newOrder.guest_name}`)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
        fetchActiveData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
    }
  }, [supabase])

  // ── SYSTEM CLOCK TICKER ────────────────────────────────────────────────────
  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      setSystemClock(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const getLocLabel = (id: string) => {
    return locations.find((l) => l.id === id)?.label || 'Unknown Location'
  }

  const handleUpdateStatus = async (orderId: string, nextStatus: 'preparing' | 'delivered') => {
    try {
      const updates: Partial<Order> & { delivered_at?: string } = { status: nextStatus }
      if (nextStatus === 'delivered') {
        updates.delivered_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)

      if (error) throw error

      triggerToast(`Order marked as ${nextStatus}`)
      fetchActiveData()
    } catch (err: any) {
      triggerToast(`Error updating order: ${err.message}`)
    }
  }

  // Filter orders based on status & movement
  const filteredOrders = orders.filter((order) => {
    const isRelocated = order.location_id !== order.original_location_id
    if (activeTab === 'pending') return order.status === 'pending'
    if (activeTab === 'preparing') return order.status === 'preparing'
    if (activeTab === 'relocated') return isRelocated
    return true
  })

  return (
    <div className="min-h-screen bg-charcoal-black flex flex-col text-[#f0ece4]">
      
      {/* Premium Staff Terminal Header */}
      <header className="sticky top-0 z-40 bg-charcoal-dark border-b border-gold/15 py-4 px-8 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <div>
            <h1 className="font-serif text-lg text-gold tracking-widest uppercase font-semibold">
              Azure Shores Concierge
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium mt-0.5">
              Service Dispatch Terminal
            </p>
          </div>
        </div>
        
        {/* Terminal Info */}
        <div className="flex items-center gap-8">
          <div className="hidden sm:block text-right">
            <p className="text-[9px] tracking-widest text-gray-500 uppercase">Active Dispatches</p>
            <p className="text-sm font-semibold text-gold-light">{orders.length} Queue Total</p>
          </div>
          <div className="h-8 w-px bg-gold/10 hidden sm:block" />
          <div className="text-right">
            <p className="text-[9px] tracking-widest text-gray-500 uppercase">Terminal Time</p>
            <p className="text-sm font-semibold text-gold-light font-mono">{systemClock}</p>
          </div>
        </div>
      </header>

      {/* Tabs Selector Bar */}
      <div className="bg-charcoal-light/10 border-b border-gold/5 py-3 px-8 flex items-center gap-4 flex-wrap">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === 'all'
              ? 'bg-gold/15 text-gold border border-gold/30'
              : 'text-gray-400 border border-transparent hover:text-gray-200'
          }`}
        >
          All Active ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === 'pending'
              ? 'bg-yellow-950/30 text-yellow-300 border border-yellow-500/20'
              : 'text-gray-400 border border-transparent hover:text-gray-200'
          }`}
        >
          Pending ({orders.filter((o) => o.status === 'pending').length})
        </button>
        <button
          onClick={() => setActiveTab('preparing')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === 'preparing'
              ? 'bg-blue-950/30 text-blue-300 border border-blue-500/20'
              : 'text-gray-400 border border-transparent hover:text-gray-200'
          }`}
        >
          Preparing ({orders.filter((o) => o.status === 'preparing').length})
        </button>
        <button
          onClick={() => setActiveTab('relocated')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === 'relocated'
              ? 'bg-red-950/30 text-red-300 border border-red-500/30 animate-pulse'
              : 'text-gray-400 border border-transparent hover:text-gray-200'
          }`}
        >
          Relocated ({orders.filter((o) => o.location_id !== o.original_location_id).length})
        </button>
      </div>

      {/* Queue Ticket Grid */}
      <main className="flex-1 p-8 overflow-y-auto">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 border border-dashed border-gold/10 rounded-2xl">
            <span className="text-4xl">🏝️</span>
            <h3 className="font-serif text-lg text-gold-light mt-4 font-normal">All Sanctuary Clear</h3>
            <p className="text-xs text-gray-500 mt-2">Incoming guest orders will display here in real-time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredOrders.map((order) => (
              <OrderTicket
                key={order.id}
                order={order}
                currentLocationLabel={getLocLabel(order.location_id)}
                originalLocationLabel={getLocLabel(order.original_location_id)}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-8 right-8 z-50 bg-charcoal-light border border-gold/30 text-gold-light px-6 py-4 rounded-xl text-xs font-semibold uppercase tracking-widest shadow-2xl backdrop-blur-md">
          {toastMessage}
        </div>
      )}

    </div>
  )
}

// ── SUBCOMPONENT: TICKET CARD ───────────────────────────────────────────────
interface TicketProps {
  order: Order
  currentLocationLabel: string
  originalLocationLabel: string
  onUpdateStatus: (id: string, status: 'preparing' | 'delivered') => void
}

function OrderTicket({ order, currentLocationLabel, originalLocationLabel, onUpdateStatus }: TicketProps) {
  const [elapsedString, setElapsedString] = useState('')
  const [isCritical, setIsCritical] = useState(false)
  const isRelocated = order.location_id !== order.original_location_id

  useEffect(() => {
    const updateElapsed = () => {
      const createdTime = new Date(order.created_at).getTime()
      const diffMs = Date.now() - createdTime
      const diffMins = Math.floor(diffMs / 60000)
      const diffSecs = Math.floor((diffMs % 60000) / 1000)
      
      setElapsedString(`${diffMins}m ${diffSecs}s`)
      // Flag as critical if order is pending/preparing for more than 7 minutes
      setIsCritical(diffMins >= 7)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [order.created_at])

  return (
    <div
      className={`bg-charcoal-light/30 border rounded-2xl overflow-hidden flex flex-col justify-between shadow-md transition duration-300 ${
        isRelocated
          ? 'border-red-500/50 bg-red-950/5 shadow-red-900/10 animate-border-flash'
          : order.status === 'preparing'
          ? 'border-blue-500/30'
          : 'border-gold/15'
      }`}
    >
      
      {/* Relocated Warning Alert */}
      {isRelocated && (
        <div className="bg-red-950/80 border-b border-red-500/25 px-4 py-2 flex items-center gap-2 text-red-200 text-[10px] font-bold uppercase tracking-wider animate-pulse">
          <span>⚠️</span>
          Guest moved to {currentLocationLabel}
        </div>
      )}

      {/* Ticket Header */}
      <div className="p-5 border-b border-gold/5 space-y-2">
        <div className="flex justify-between items-start">
          <span className="text-[9px] font-mono text-gray-500 uppercase">
            #{order.id.slice(-6).toUpperCase()}
          </span>
          <span
            className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded ${
              isCritical
                ? 'bg-red-950/40 text-red-400 border border-red-500/20'
                : 'text-gray-400'
            }`}
          >
            {elapsedString}
          </span>
        </div>

        {/* Location Typography (Prominent) */}
        <div className="flex justify-between items-baseline">
          <h2 className="text-3xl font-serif text-gold-light tracking-wide font-normal">
            {currentLocationLabel}
          </h2>
          <span className="text-[10px] tracking-widest text-gold uppercase font-medium">
            {order.status}
          </span>
        </div>

        {/* Guest Details */}
        <p className="text-xs text-gray-400 flex items-center gap-2 font-medium">
          {order.guest_name}
          {isRelocated && (
            <span className="text-[9px] text-red-400 normal-case font-normal">
              (Previously: {originalLocationLabel})
            </span>
          )}
        </p>
      </div>

      {/* Order Items Body */}
      <div className="p-5 flex-1 space-y-4">
        <div className="space-y-2.5">
          {order.order_items?.map((item) => (
            <div key={item.id} className="flex justify-between text-xs items-start">
              <span className="text-gray-300 font-medium leading-tight">
                <span className="text-gold font-bold mr-2">{item.quantity}&times;</span>
                {item.item_name}
              </span>
              <span className="font-mono text-gray-500 flex-shrink-0 ml-4">
                ${item.subtotal.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {order.special_notes && (
          <div className="bg-charcoal-dark/50 border border-white/5 rounded-lg p-3 text-[11px] leading-relaxed italic text-gold-light">
            &ldquo;{order.special_notes}&rdquo;
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="p-5 border-t border-gold/5 flex gap-3 bg-charcoal-dark/30">
        {order.status === 'pending' && (
          <button
            onClick={() => onUpdateStatus(order.id, 'preparing')}
            className="flex-1 py-3 border border-blue-500/35 hover:bg-blue-900/10 text-blue-300 text-xs font-semibold rounded-lg uppercase tracking-wider transition"
          >
            Prepare
          </button>
        )}
        <button
          onClick={() => onUpdateStatus(order.id, 'delivered')}
          className="flex-[2] py-3 bg-gradient-to-r from-gold via-gold-premium to-gold-dark text-charcoal-black text-xs font-bold rounded-lg uppercase tracking-widest transition shadow active:scale-[0.98]"
        >
          ✓ Deliver
        </button>
      </div>

    </div>
  )
}
