import { NextResponse } from "next/server"
import { list } from "@vercel/blob"

export async function GET() {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!token) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 500 })
    }

    // List all blobs
    const { blobs } = await list({ token })

    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000
    const files: Array<{
      name: string
      uploadedAt: string
      expiresAt: string
      remainingHours: number
      expired: boolean
    }> = []

    // Process metadata files
    for (const blob of blobs) {
      if (blob.pathname.startsWith("metadata_") && blob.pathname.endsWith(".json")) {
        try {
          const metadataResponse = await fetch(blob.url)
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json()
            const uploadTime = new Date(metadata.uploadedAt).getTime()
            const expiresAt = new Date(uploadTime + twentyFourHours)
            const remainingTime = Math.max(0, Math.round((uploadTime + twentyFourHours - now) / (1000 * 60 * 60)))
            const expired = now - uploadTime > twentyFourHours

            files.push({
              name: metadata.originalName,
              uploadedAt: metadata.uploadedAt,
              expiresAt: expiresAt.toISOString(),
              remainingHours: remainingTime,
              expired,
            })
          }
        } catch (error) {
          console.error("Error processing metadata:", blob.pathname, error)
        }
      }
    }

    // Sort by upload time (newest first)
    files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

    const expiredCount = files.filter((f) => f.expired).length
    const activeCount = files.filter((f) => !f.expired).length

    return NextResponse.json({
      totalFiles: files.length,
      activeFiles: activeCount,
      expiredFiles: expiredCount,
      files,
      lastChecked: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Cleanup status error:", error)
    return NextResponse.json(
      {
        error: `Failed to get cleanup status: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    )
  }
}
