export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = getSupabaseServerClient()

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      *,
      location:locations!orders_location_id_fkey(name, zone),
      original_location:locations!orders_original_location_id_fkey(name),
      items:order_items(*)
    `)
    .in('status', ['pending', 'preparing'])
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (orders ?? []).map(o => ({
    ...o,
    location_name: o.location?.name,
    location_zone: o.location?.zone,
    original_location_name: o.original_location?.name,
    moved: o.location_id !== o.original_location_id,
  }))

  return NextResponse.json(result)
}
