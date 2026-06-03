import { cookies } from 'next/headers'
import { getAuth } from 'firebase-admin/auth'
import '@/lib/firebase/admin'

const SESSION_EXPIRY = 60 * 60 * 24 * 5 * 1000 // 5 days

export async function POST(request: Request) {
  const { idToken } = await request.json()

  if (!idToken) {
    return Response.json({ error: 'Missing token' }, { status: 400 })
  }

  try {
    const sessionCookie = await getAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY,
    })

    const cookieStore = await cookies()
    cookieStore.set('__session', sessionCookie, {
      maxAge: SESSION_EXPIRY / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    })

    return Response.json({ status: 'success' })
  } catch {
    return Response.json({ error: 'Invalid token' }, { status: 401 })
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('__session')
  return Response.json({ status: 'success' })
}
