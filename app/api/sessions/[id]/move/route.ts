import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient()
  const { newLocationId } = await req.json()
  const sessionId = params.id

  if (!newLocationId) return NextResponse.json({ error: 'newLocationId is required.' }, { status: 400 })

  const { data: session } = await supabase
    .from('sessions').select('*').eq('id', sessionId).eq('status', 'active').single()
  if (!session) return NextResponse.json({ error: 'Active session not found.' }, { status: 404 })

  if (session.location_id === newLocationId) {
    return NextResponse.json({ error: 'You are already at this location.' }, { status: 400 })
  }

  // Check occupancy on target
  const { data: occupant } = await supabase
    .from('sessions')
    .select('id')
    .eq('location_id', newLocationId)
    .eq('status', 'active')
    .neq('id', sessionId)
    .maybeSingle()

  if (occupant) {
    return NextResponse.json({
      error: 'location_occupied',
      message: 'Location Currently Active. It appears another guest is currently enjoying this location. If you have recently moved here, please inform a pool attendant so we can instantly update your service area.',
    }, { status: 409 })
  }

  const { data: newLocation } = await supabase.from('locations').select('*').eq('id', newLocationId).single()
  if (!newLocation) return NextResponse.json({ error: 'Target location not found.' }, { status: 404 })

  const previousLocationId = session.location_id

  // Atomic move
  await Promise.all([
    supabase.from('sessions').update({ location_id: newLocationId, previous_location_id: previousLocationId }).eq('id', sessionId),
    supabase.from('locations').update({ status: 'available' }).eq('id', previousLocationId),
    supabase.from('locations').update({ status: 'occupied' }).eq('id', newLocationId),
    // Reroute all pending/preparing orders
    supabase.from('orders').update({ location_id: newLocationId }).eq('session_id', sessionId).in('status', ['pending', 'preparing']),
  ])

  const { data: prevLocation } = await supabase.from('locations').select('name').eq('id', previousLocationId).single()
  const { data: updatedSession } = await supabase.from('sessions').select('*').eq('id', sessionId).single()

  return NextResponse.json({ session: updatedSession, previousLocationName: prevLocation?.name })
}
