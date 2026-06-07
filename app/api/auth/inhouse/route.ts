import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient()
  const { name, roomNumber, locationId } = await req.json()

  if (!name || !roomNumber || !locationId) {
    return NextResponse.json({ error: 'Name, room number and location are required.' }, { status: 400 })
  }

  const { data: location } = await supabase.from('locations').select('*').eq('id', locationId).single()
  if (!location) return NextResponse.json({ error: 'Location not found.' }, { status: 404 })

  const { data: existing } = await supabase
    .from('sessions')
    .select('id')
    .eq('location_id', locationId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      error: 'location_occupied',
      message: 'This location is currently active. Please inform a pool attendant if you have recently moved here.',
    }, { status: 409 })
  }

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({ guest_name: name.trim(), guest_type: 'inhouse', room_number: roomNumber.trim(), location_id: locationId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('locations').update({ status: 'occupied' }).eq('id', locationId)

  return NextResponse.json({ session, location })
}
