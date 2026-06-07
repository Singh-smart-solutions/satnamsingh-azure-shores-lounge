import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient()
  const { data: item } = await supabase.from('menu_items').select('in_stock').eq('id', params.id).single()
  if (!item) return NextResponse.json({ error: 'Item not found.' }, { status: 404 })

  const newStock = !item.in_stock
  await supabase.from('menu_items').update({ in_stock: newStock }).eq('id', params.id)
  return NextResponse.json({ id: params.id, in_stock: newStock })
}
