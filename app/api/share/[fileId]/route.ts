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

    console.log("Share API - Looking for metadata at:", metadataPath)

    if (!existsSync(metadataPath)) {
      console.log("Share API - Metadata file not found:", metadataPath)
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Read metadata
    const metadataBuffer = await readFile(metadataPath)
    const metadata = JSON.parse(metadataBuffer.toString())

    console.log("Share API - Found metadata:", metadata)

    // Check if file still exists
    if (!existsSync(metadata.path)) {
      console.log("Share API - Actual file not found:", metadata.path)
      return NextResponse.json({ error: "File no longer available" }, { status: 404 })
    }

    // Check if file is expired (24 hours)
    const uploadTime = new Date(metadata.uploadedAt).getTime()
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000

    if (now - uploadTime > twentyFourHours) {
      console.log("Share API - File expired")
      return NextResponse.json({ error: "File has expired" }, { status: 410 })
    }

    // Return share information
    return NextResponse.json({
      id: metadata.id,
      name: metadata.name,
      size: metadata.size,
      uploadedAt: metadata.uploadedAt,
      downloadUrl: `/api/download/${fileId}`,
      shareUrl: `${request.nextUrl.origin}/download/${fileId}`,
      expiresAt: new Date(uploadTime + twentyFourHours).toISOString(),
    })
  } catch (error) {
    console.error("Share info error:", error)
    return NextResponse.json({ error: "Failed to get share info" }, { status: 500 })
  }
}
