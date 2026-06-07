export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = getSupabaseServerClient()

  const { data: locations, error } = await supabase
    .from('locations')
    .select(`
      *,
      session:sessions!sessions_location_id_fkey(id, guest_name, guest_type, created_at)
    `)
    .order('zone').order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (locations ?? []).map((loc: Record<string, unknown>) => {
    const sessions = Array.isArray(loc.session) ? loc.session : []
    const activeSession = sessions[0] ?? null
    return {
      ...loc,
      session: undefined,
      is_occupied: loc.status === 'occupied',
      session_id: activeSession?.id ?? null,
      guest_name: activeSession?.guest_name ?? null,
      guest_type: activeSession?.guest_type ?? null,
      session_started: activeSession?.created_at ?? null,
    }
  })

  return NextResponse.json(result)
}
