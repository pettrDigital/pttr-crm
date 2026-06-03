import { getAuth } from 'firebase-admin/auth'
import '@/lib/firebase/admin' // ensure Firebase Admin is initialized
import type { DecodedIdToken } from 'firebase-admin/auth'

export async function verifyAuth(request: Request): Promise<DecodedIdToken> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.slice(7)
  try {
    return await getAuth().verifyIdToken(token)
  } catch {
    throw new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
