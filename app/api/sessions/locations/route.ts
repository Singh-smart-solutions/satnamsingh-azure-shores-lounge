export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = getSupabaseServerClient()

  const { data: locations, error } = await supabase
    .from('locations')
    .select(`
      *,
      active_session:sessions!sessions_location_id_fkey(id, guest_name, guest_type)
    `)
    .order('zone').order('type').order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten: add is_occupied and guest_name at top level
  const result = locations.map((loc: Record<string, unknown>) => {
    const sessions = Array.isArray(loc.active_session) ? loc.active_session : []
    const activeSession = sessions.find(
      (s: Record<string, unknown>) => true // we'll filter via status in the query
    )
    return {
      ...loc,
      active_session: undefined,
      is_occupied: loc.status === 'occupied',
      guest_name: activeSession?.guest_name ?? null,
    }
  })

  return NextResponse.json(result)
}
