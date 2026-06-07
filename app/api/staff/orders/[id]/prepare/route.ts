import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient()
  await supabase.from('orders').update({ status: 'preparing' }).eq('id', params.id)
  return NextResponse.json({ success: true })
}
