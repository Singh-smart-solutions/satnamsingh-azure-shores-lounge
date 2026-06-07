export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = getSupabaseServerClient()

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').eq('in_stock', true).order('sort_order'),
  ])

  const menu = (categories ?? []).map(cat => ({
    ...cat,
    items: (items ?? []).filter(i => i.category_id === cat.id),
  })).filter(cat => cat.items.length > 0)

  return NextResponse.json(menu)
}
