import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient()
  await supabase.from('access_codes').delete().eq('id', params.id)
  return NextResponse.json({ success: true })
}
