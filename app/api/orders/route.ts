import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient()
  const { sessionId, items, specialNotes } = await req.json()

  if (!sessionId || !items?.length) {
    return NextResponse.json({ error: 'sessionId and items are required.' }, { status: 400 })
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('*, location:locations!sessions_location_id_fkey(id,name)')
    .eq('id', sessionId)
    .eq('status', 'active')
    .single()

  if (!session) return NextResponse.json({ error: 'Active session not found.' }, { status: 404 })

  // Validate all menu items are in stock
  const menuIds = items.map((i: { menuItemId: string }) => i.menuItemId)
  const { data: menuItems } = await supabase
    .from('menu_items').select('*').in('id', menuIds).eq('in_stock', true)

  if (!menuItems || menuItems.length !== menuIds.length) {
    return NextResponse.json({ error: 'One or more items are unavailable.' }, { status: 400 })
  }

  const locationId = session.location_id

  // Calculate total and build order items
  let total = 0
  const orderItems = items.map((item: { menuItemId: string; quantity: number; modifiers?: Array<{ label: string; price?: number }> }) => {
    const menuItem = menuItems.find(m => m.id === item.menuItemId)!
    let itemPrice = Number(menuItem.price)

    const selectedModifiers = item.modifiers ?? []
    selectedModifiers.forEach((mod: { price?: number }) => {
      if (mod.price) itemPrice += mod.price
    })

    const subtotal = itemPrice * item.quantity
    total += subtotal

    return {
      menu_item_id: item.menuItemId,
      item_name: menuItem.name,
      item_price: itemPrice,
      quantity: item.quantity,
      modifiers: selectedModifiers,
      subtotal,
    }
  })

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      session_id: sessionId,
      location_id: locationId,
      original_location_id: locationId,
      guest_name: session.guest_name,
      special_notes: specialNotes ?? null,
      total,
    })
    .select()
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  const itemsWithOrderId = orderItems.map((i: Record<string, unknown>) => ({ ...i, order_id: order.id }))
  await supabase.from('order_items').insert(itemsWithOrderId)

  const { data: fullOrder } = await supabase
    .from('orders')
    .select(`*, location:locations!orders_location_id_fkey(name,zone), original_location:locations!orders_original_location_id_fkey(name), items:order_items(*)`)
    .eq('id', order.id)
    .single()

  return NextResponse.json(fullOrder)
}
