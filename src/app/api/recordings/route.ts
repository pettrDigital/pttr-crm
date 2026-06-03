import { Storage } from '@google-cloud/storage'
import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'

const ALLOWED_BUCKET = 'pttr-recordings'

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
})

export async function GET(request: NextRequest) {
  try { await verifyAuth(request) } catch (e) { return e as Response }

  const gcsUri = request.nextUrl.searchParams.get('uri')

  if (!gcsUri || !gcsUri.startsWith(`gs://${ALLOWED_BUCKET}/`)) {
    return Response.json({ error: 'Invalid or disallowed GCS URI' }, { status: 400 })
  }

  const filePath = gcsUri.slice(`gs://${ALLOWED_BUCKET}/`.length)
  if (!filePath) {
    return Response.json({ error: 'Missing file path' }, { status: 400 })
  }

  try {
    const [url] = await storage
      .bucket(ALLOWED_BUCKET)
      .file(filePath)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      })

    return Response.json({ url })
  } catch (error) {
    console.error('Signed URL error:', error)
    return Response.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }
}
