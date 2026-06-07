import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = getSupabaseServerClient()
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').order('sort_order'),
  ])
  return NextResponse.json((categories ?? []).map(cat => ({
    ...cat,
    items: (items ?? []).filter(i => i.category_id === cat.id),
  })))
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient()
  const { categoryId, name, description, price, imageUrl, featured, modifiers } = await req.json()
  if (!categoryId || !name || price == null) {
    return NextResponse.json({ error: 'categoryId, name and price are required.' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('menu_items')
    .insert({ category_id: categoryId, name, description, price, image_url: imageUrl ?? null, featured: !!featured, modifiers: modifiers ?? [] })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
