import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient()

  const { data: session } = await supabase
    .from('sessions').select('*').eq('id', params.id).eq('status', 'active').single()
  if (!session) return NextResponse.json({ error: 'Active session not found.' }, { status: 404 })

  await supabase.from('sessions').update({ status: 'force_ended', ended_at: new Date().toISOString() }).eq('id', params.id)
  await supabase.from('locations').update({ status: 'available' }).eq('id', session.location_id)

  return NextResponse.json({ success: true })
}
