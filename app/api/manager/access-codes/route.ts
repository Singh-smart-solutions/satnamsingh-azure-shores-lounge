import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = getSupabaseServerClient()
  const { data } = await supabase.from('access_codes').select('*').order('created_at', { ascending: false })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient()
  const { code, label } = await req.json()
  if (!code) return NextResponse.json({ error: 'code is required.' }, { status: 400 })

  const { data: existing } = await supabase.from('access_codes').select('id').ilike('code', code).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Code already exists.' }, { status: 409 })

  const { data, error } = await supabase
    .from('access_codes')
    .insert({ code: code.toUpperCase(), label: label ?? null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
