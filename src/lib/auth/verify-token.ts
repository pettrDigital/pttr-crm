import { getAuth } from 'firebase-admin/auth'
import '@/lib/firebase/admin' // ensure Firebase Admin is initialized
import type { DecodedIdToken } from 'firebase-admin/auth'

function getAllowedUsers(): string[] {
  const raw = process.env.ALLOWED_USERS || ''
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

export async function verifyAuth(request: Request): Promise<DecodedIdToken> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.slice(7)
  let decoded: DecodedIdToken
  try {
    decoded = await getAuth().verifyIdToken(token)
  } catch {
    throw new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const allowedUsers = getAllowedUsers()
  if (allowedUsers.length > 0 && !allowedUsers.includes(decoded.email?.toLowerCase() ?? '')) {
    throw new Response(JSON.stringify({ error: 'Access denied — contact administrator' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return decoded
}
