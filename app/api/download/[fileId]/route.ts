import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const { fileId } = params

    if (!fileId) {
      return NextResponse.json({ error: "File ID is required" }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), "uploads", "files")
    const metadataPath = path.join(uploadsDir, `${fileId}.json`)

    console.log("Download API - Looking for metadata at:", metadataPath)

    if (!existsSync(metadataPath)) {
      console.log("Download API - Metadata file not found:", metadataPath)
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Read metadata
    const metadataBuffer = await readFile(metadataPath)
    const metadata = JSON.parse(metadataBuffer.toString())

    console.log("Download API - Found metadata:", metadata)

    const filePath = metadata.path
    if (!existsSync(filePath)) {
      console.log("Download API - Actual file not found:", filePath)
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Check if file is expired (24 hours)
    const uploadTime = new Date(metadata.uploadedAt).getTime()
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000

    if (now - uploadTime > twentyFourHours) {
      console.log("Download API - File expired")
      return NextResponse.json({ error: "File has expired" }, { status: 410 })
    }

    // Read file
    let fileBuffer = await readFile(filePath)

    // Decompress if necessary
    if (metadata.compressed) {
      try {
        // Import pako for decompression
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
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(metadata.name)}"`)
    headers.set("Content-Type", "application/octet-stream")
    headers.set("Content-Length", fileBuffer.length.toString())
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate")

    if (metadata.compressed) {
      headers.set("X-Original-Size", metadata.originalSize.toString())
      headers.set("X-Compressed-Size", metadata.size.toString())
      headers.set("X-Compression-Ratio", metadata.compressionRatio.toString())
    }

    console.log("Download API - Serving file:", metadata.name, "Size:", fileBuffer.length)

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json({ error: "Download failed" }, { status: 500 })
  }
}
