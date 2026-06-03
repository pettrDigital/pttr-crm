import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'

const ALLOWED_HOST = 'app.whatconverts.com'

export async function GET(request: NextRequest) {
  try { await verifyAuth(request) } catch (e) { return e as Response }

  const wcUrl = request.nextUrl.searchParams.get('url')

  if (!wcUrl) {
    return Response.json({ error: 'Missing url param' }, { status: 400 })
  }

  // Validate the URL is a WhatConverts recording URL
  try {
    const parsed = new URL(wcUrl)
    if (parsed.hostname !== ALLOWED_HOST || !parsed.pathname.startsWith('/recording/')) {
      return Response.json({ error: 'Invalid recording URL' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // Fetch the recording using WC API credentials
  // WC recording download URLs work with basic auth (same as leads API)
  const wcToken = process.env.WC_API_TOKEN
  const wcSecret = process.env.WC_API_SECRET

  if (!wcToken || !wcSecret) {
    return Response.json({ error: 'WC credentials not configured' }, { status: 500 })
  }

  try {
    const authHeader = 'Basic ' + Buffer.from(`${wcToken}:${wcSecret}`).toString('base64')
    const res = await fetch(wcUrl, {
      headers: { 'Authorization': authHeader },
      redirect: 'follow',
    })

    if (!res.ok) {
      return Response.json({ error: 'Failed to fetch recording' }, { status: res.status })
    }

    // Check if we got audio back or a redirect URL
    const contentType = res.headers.get('content-type') || ''

    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      // Stream the audio directly
      return new Response(res.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=900',
        },
      })
    }

    // If WC returned a redirect to a direct audio URL, pass it back
    return Response.json({ url: res.url })
  } catch (error) {
    console.error('WC recording proxy error:', error)
    return Response.json({ error: 'Failed to proxy recording' }, { status: 500 })
  }
}
