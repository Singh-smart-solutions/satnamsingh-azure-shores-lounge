import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient()
  const { name, description, price, featured, imageUrl, modifiers } = await req.json()
  const { error } = await supabase
    .from('menu_items')
    .update({ name, description, price, featured: !!featured, image_url: imageUrl, modifiers: modifiers ?? [] })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient()
  await supabase.from('menu_items').delete().eq('id', params.id)
  return NextResponse.json({ success: true })
}
