import { type NextRequest, NextResponse } from "next/server"
import { del, list } from "@vercel/blob"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const blobUrl = searchParams.get("url")
    const fileName = searchParams.get("name")
    const compressed = searchParams.get("compressed") === "true"
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!blobUrl || !fileName) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    if (!token) {
      console.error("BLOB_READ_WRITE_TOKEN is not configured")
      return NextResponse.json({ error: "Storage service not configured" }, { status: 500 })
    }

    // Extract file ID from blob URL to check expiration
    try {
      const urlParts = blobUrl.split("/")
      const blobFileName = urlParts[urlParts.length - 1]
      const fileIdMatch = blobFileName.match(/^(\d+_[a-z0-9]+)_/)

      if (fileIdMatch) {
        const fileId = fileIdMatch[1]

        // Check if file is expired by fetching metadata
        const { blobs } = await list({ token })
        const metadataBlob = blobs.find((blob) => blob.pathname === `metadata_${fileId}.json`)

        if (metadataBlob) {
          const metadataResponse = await fetch(metadataBlob.url)
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json()
            const uploadTime = new Date(metadata.uploadedAt).getTime()
            const now = Date.now()
            const twentyFourHours = 24 * 60 * 60 * 1000

            if (now - uploadTime > twentyFourHours) {
              console.log("File expired during download, deleting...")

              try {
                await del(blobUrl, { token })
                await del(metadataBlob.url, { token })
              } catch (deleteError) {
                console.error("Error deleting expired file:", deleteError)
              }

              return NextResponse.json({ error: "File has expired and has been deleted" }, { status: 410 })
            }
          }
        }
      }
    } catch (metadataError) {
      console.log("Could not check metadata for expiration:", metadataError)
    }

    // Fetch file from Vercel Blob
    const response = await fetch(blobUrl)
    if (!response.ok) {
      console.log("Failed to fetch file from blob:", response.status)
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    let fileBuffer = Buffer.from(await response.arrayBuffer())

    // Decompress if necessary
    if (compressed) {
      try {
        const pako = await import("pako")
        const decompressed = pako.ungzip(fileBuffer)
        fileBuffer = Buffer.from(decompressed)
        console.log("File decompressed successfully")
      } catch (error) {
        console.error("Decompression error:", error)
        return NextResponse.json({ error: "Failed to decompress file" }, { status: 500 })
      }
    }

    // Set appropriate headers
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`)
    headers.set("Content-Type", "application/octet-stream")
    headers.set("Content-Length", fileBuffer.length.toString())
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate")

    if (compressed) {
      headers.set("X-Decompressed", "true")
    }

    console.log("Serving file:", fileName, "Size:", fileBuffer.length)

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json(
      { error: `Download failed: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 },
    )
  }
}
