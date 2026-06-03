import { auth } from '@/lib/firebase/client'
import { onAuthStateChanged, type User } from 'firebase/auth'

/** Wait for Firebase Auth to resolve the current user (happens async on page load) */
function waitForUser(): Promise<User | null> {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser)
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

/** Fetch wrapper that attaches the current Firebase user's ID token as a Bearer header */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const user = await waitForUser()
  const headers = new Headers(init?.headers)

  if (user) {
    const token = await user.getIdToken()
    headers.set('Authorization', `Bearer ${token}`)
  } else {
    console.warn('[authFetch] No Firebase user — request will be unauthenticated:', url)
  }

  const res = await fetch(url, { ...init, headers })
  if (res.status === 401 || res.status === 403) {
    console.error(`[authFetch] ${res.status} on ${url}`)
  }
  return res
}
