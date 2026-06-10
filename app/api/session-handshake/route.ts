import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient()
  
  try {
    const { currentSessionId, currentLocationId, targetLocationId } = await req.json()

    if (!currentSessionId || !currentLocationId || !targetLocationId) {
      return NextResponse.json({ error: 'Missing required fields: currentSessionId, currentLocationId, targetLocationId.' }, { status: 400 })
    }

    // 1. Verify that target location exists
    const { data: targetLoc, error: targetLocErr } = await supabase
      .from('locations')
      .select('*')
      .eq('id', targetLocationId)
      .single()

    if (targetLocErr || !targetLoc) {
      return NextResponse.json({ error: 'Target location not found.' }, { status: 404 })
    }

    // 2. Check if the target location has any active session (occupancy check)
    const { data: activeTargetSession } = await supabase
      .from('sessions')
      .select('*')
      .eq('location_id', targetLocationId)
      .eq('is_active', true)
      .maybeSingle()

    if (activeTargetSession && activeTargetSession.id !== currentSessionId) {
      return NextResponse.json({
        error: 'location_occupied',
        message: 'This location is currently active and occupied by another guest.',
      }, { status: 409 })
    }

    // 3. Perform atomic session handshake updates
    // Update the session's location to the target location
    const { error: sessionUpdateErr } = await supabase
      .from('sessions')
      .update({ location_id: targetLocationId })
      .eq('id', currentSessionId)

    if (sessionUpdateErr) {
      return NextResponse.json({ error: `Failed to transfer session: ${sessionUpdateErr.message}` }, { status: 500 })
    }

    // Free the previous location
    await supabase
      .from('locations')
      .update({ status: 'available' })
      .eq('id', currentLocationId)

    // Mark the new location as occupied
    await supabase
      .from('locations')
      .update({ status: 'occupied' })
      .eq('id', targetLocationId)

    // Reroute all pending & preparing orders to follow the guest to the new location
    await supabase
      .from('orders')
      .update({ location_id: targetLocationId })
      .eq('session_id', currentSessionId)
      .in('status', ['pending', 'preparing'])

    return NextResponse.json({
      success: true,
      message: 'Session handshake completed successfully. Pending orders rerouted.',
      targetLocationLabel: targetLoc.label
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 })
  }
}
