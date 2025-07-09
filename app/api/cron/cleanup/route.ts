import { NextResponse } from "next/server"
import { del, list } from "@vercel/blob"

export async function GET() {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!token) {
      console.error("BLOB_READ_WRITE_TOKEN not configured")
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 500 })
    }

    console.log("Starting scheduled cleanup...")

    // List all blobs
    const { blobs } = await list({ token })

    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000
    let deletedCount = 0
    let errorCount = 0
    const deletedFiles: string[] = []

    // Process metadata files to find expired files
    for (const blob of blobs) {
      if (blob.pathname.startsWith("metadata_") && blob.pathname.endsWith(".json")) {
        try {
          console.log("Checking metadata:", blob.pathname)

          // Fetch metadata
          const metadataResponse = await fetch(blob.url)
          if (!metadataResponse.ok) {
            console.log("Could not fetch metadata:", blob.pathname)
            continue
          }

          const metadata = await metadataResponse.json()
          const uploadTime = new Date(metadata.uploadedAt).getTime()

          // Check if file is older than 24 hours
          if (now - uploadTime > twentyFourHours) {
            console.log("File expired:", metadata.originalName, "uploaded at:", metadata.uploadedAt)

            try {
              // Delete the actual file
              if (metadata.blobUrl) {
                await del(metadata.blobUrl, { token })
                console.log("Deleted file:", metadata.blobUrl)
              }

              // Delete the metadata file
              await del(blob.url, { token })
              console.log("Deleted metadata:", blob.url)

              deletedCount++
              deletedFiles.push(metadata.originalName)
            } catch (deleteError) {
              console.error("Error deleting file:", metadata.originalName, deleteError)
              errorCount++
            }
          } else {
            const remainingTime = Math.round((twentyFourHours - (now - uploadTime)) / (1000 * 60 * 60))
            console.log("File still valid:", metadata.originalName, "expires in", remainingTime, "hours")
          }
        } catch (error) {
          console.error("Error processing metadata:", blob.pathname, error)
          errorCount++
        }
      }
    }

    const result = {
      success: true,
      message: `Cleanup completed. Deleted ${deletedCount} expired files.`,
      deletedCount,
      errorCount,
      deletedFiles,
      timestamp: new Date().toISOString(),
    }

    console.log("Cleanup result:", result)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Cleanup error:", error)
    return NextResponse.json(
      {
        error: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}

// Allow manual cleanup via POST
export async function POST() {
  return GET()
}
