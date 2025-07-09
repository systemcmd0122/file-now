import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const blobUrl = searchParams.get("url")
    const fileName = searchParams.get("name")
    const compressed = searchParams.get("compressed") === "true"

    if (!blobUrl || !fileName) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    // Fetch file from Vercel Blob
    const response = await fetch(blobUrl)
    if (!response.ok) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    let fileBuffer = Buffer.from(await response.arrayBuffer())

    // Decompress if necessary
    if (compressed) {
      try {
        const pako = await import("pako")
        const decompressed = pako.ungzip(fileBuffer)
        fileBuffer = Buffer.from(decompressed)
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

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json({ error: "Download failed" }, { status: 500 })
  }
}
