export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient()
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const dayStart = `${date}T00:00:00Z`
  const dayEnd = `${date}T23:59:59Z`

  const [
    { data: deliveredOrders },
    { data: orderItemsData },
    { data: sessionsData },
  ] = await Promise.all([
    supabase.from('orders')
      .select('total, location:locations!orders_original_location_id_fkey(name), created_at')
      .eq('status', 'delivered')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),
    supabase.from('order_items')
      .select('item_name, quantity, subtotal, order:orders!order_items_order_id_fkey(status, created_at)')
      .gte('order.created_at', dayStart)
      .lte('order.created_at', dayEnd),
    supabase.from('sessions')
      .select('id')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),
  ])

  const orders = deliveredOrders ?? []
  const totalRevenue = orders.reduce((s: number, o: Record<string, unknown>) => s + Number(o.total), 0)

  // Top items
  const itemMap: Record<string, { item_name: string; qty_sold: number; revenue: number }> = {}
  ;(orderItemsData ?? []).forEach((oi: Record<string, unknown>) => {
    const o = oi.order as Record<string, unknown>
    if (!o || o.status !== 'delivered') return
    const name = oi.item_name as string
    if (!itemMap[name]) itemMap[name] = { item_name: name, qty_sold: 0, revenue: 0 }
    itemMap[name].qty_sold += Number(oi.quantity)
    itemMap[name].revenue += Number(oi.subtotal)
  })
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // Hourly breakdown
  const hourMap: Record<string, { hour: string; orders: number; revenue: number }> = {}
  orders.forEach((o: Record<string, unknown>) => {
    const h = new Date(o.created_at as string).getUTCHours().toString().padStart(2, '0')
    if (!hourMap[h]) hourMap[h] = { hour: h, orders: 0, revenue: 0 }
    hourMap[h].orders++
    hourMap[h].revenue += Number(o.total)
  })
  const hourlyBreakdown = Object.values(hourMap).sort((a, b) => a.hour.localeCompare(b.hour))

  // Location breakdown
  const locMap: Record<string, { location: string; orders: number; revenue: number }> = {}
  orders.forEach((o: Record<string, unknown>) => {
    const loc = (o.location as Record<string, unknown>)?.name as string ?? 'Unknown'
    if (!locMap[loc]) locMap[loc] = { location: loc, orders: 0, revenue: 0 }
    locMap[loc].orders++
    locMap[loc].revenue += Number(o.total)
  })
  const locationBreakdown = Object.values(locMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  return NextResponse.json({
    reportDate: date,
    revenue: { total_revenue: totalRevenue, total_orders: orders.length },
    topItems,
    hourlyBreakdown,
    locationBreakdown,
    guestSessions: { sessions: sessionsData?.length ?? 0 },
  })
}
