import { getAuth } from 'firebase-admin/auth'
import '@/lib/firebase/admin'

function getAllowedUsers(): string[] {
  const raw = process.env.ALLOWED_USERS || ''
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

export async function POST(request: Request) {
  const { idToken } = await request.json()

  if (!idToken) {
    return Response.json({ error: 'Missing token' }, { status: 400 })
  }

  try {
    const decoded = await getAuth().verifyIdToken(idToken)
    const allowedUsers = getAllowedUsers()

    if (allowedUsers.length > 0 && !allowedUsers.includes(decoded.email?.toLowerCase() ?? '')) {
      return Response.json({ allowed: false }, { status: 403 })
    }

    return Response.json({ allowed: true })
  } catch {
    return Response.json({ error: 'Invalid token' }, { status: 401 })
  }
}
