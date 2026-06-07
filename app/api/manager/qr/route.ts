import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { locationName, baseUrl } = await req.json()
  if (!locationName) return NextResponse.json({ error: 'locationName is required.' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  const { data: location } = await supabase.from('locations').select('*').eq('name', locationName).single()
  if (!location) return NextResponse.json({ error: 'Location not found.' }, { status: 404 })

  const appUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = `${appUrl}/guest?loc=${encodeURIComponent(location.id)}`

  const qr = await QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: '#1a1f2e', light: '#f5f0e8' },
  })

  return NextResponse.json({ qr, url, locationName: location.name })
}
