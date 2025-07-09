import { type NextRequest, NextResponse } from "next/server"
import { list } from "@vercel/blob"

export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const { fileId } = params
    const token = process.env.BLOB_READ_WRITE_TOKEN

    console.log("=== DOWNLOAD STREAM API START ===")
    console.log("File ID:", fileId)
    console.log("Token available:", !!token)

    if (!fileId) {
      console.error("File ID is missing")
      return NextResponse.json({ error: "File ID is required" }, { status: 400 })
    }

    if (!token) {
      console.error("BLOB_READ_WRITE_TOKEN is not configured")
      return NextResponse.json({ error: "Storage service not configured" }, { status: 500 })
    }

    // Get Range header for resumable downloads
    const range = request.headers.get("range")
    const userAgent = request.headers.get("user-agent") || ""

    console.log("Range header:", range)
    console.log("User agent:", userAgent.substring(0, 50))

    try {
      // List all blobs to find the metadata file with retry logic
      let blobs
      let retryCount = 0
      const maxRetries = 3

      while (retryCount < maxRetries) {
        try {
          const listResult = await list({ token })
          blobs = listResult.blobs
          break
        } catch (listError) {
          retryCount++
          console.error(`List attempt ${retryCount} failed:`, listError)

          if (retryCount >= maxRetries) {
            throw new Error("Failed to access blob storage")
          }

          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
        }
      }

      const metadataBlob = blobs.find((blob) => blob.pathname === `metadata_${fileId}.json`)

      if (!metadataBlob) {
        console.log("Metadata file not found for fileId:", fileId)
        return NextResponse.json({ error: "File not found or expired" }, { status: 404 })
      }

      console.log("Found metadata blob:", metadataBlob.url)

      // Fetch metadata content with retry logic
      let metadataResponse: Response
      retryCount = 0

      while (retryCount < maxRetries) {
        try {
          metadataResponse = await fetch(metadataBlob.url)
          if (metadataResponse.ok) break
          throw new Error(`HTTP ${metadataResponse.status}`)
        } catch (fetchError) {
          retryCount++
          console.error(`Metadata fetch attempt ${retryCount} failed:`, fetchError)

          if (retryCount >= maxRetries) {
            throw new Error("Failed to fetch metadata")
          }

          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
        }
      }

      if (!metadataResponse!.ok) {
        console.log("Failed to fetch metadata content:", metadataResponse!.status)
        return NextResponse.json({ error: "Failed to load file information" }, { status: 500 })
      }

      let metadata
      try {
        metadata = await metadataResponse!.json()
      } catch (parseError) {
        console.error("Failed to parse metadata:", parseError)
        return NextResponse.json({ error: "File metadata is corrupted" }, { status: 500 })
      }

      console.log("Loaded metadata:", {
        id: metadata.id,
        originalName: metadata.originalName,
        size: metadata.size,
        compressed: metadata.compressed,
      })

      // Check if file is expired (24 hours)
      const uploadTime = new Date(metadata.uploadedAt).getTime()
      const now = Date.now()
      const twentyFourHours = 24 * 60 * 60 * 1000

      if (now - uploadTime > twentyFourHours) {
        console.log("File expired during download")
        return NextResponse.json({ error: "File has expired and has been deleted" }, { status: 410 })
      }

      // Fetch the file with range support and retry logic
      const fetchHeaders: HeadersInit = {}
      if (range) {
        fetchHeaders.Range = range
      }

      let fileResponse: Response
      retryCount = 0

      while (retryCount < maxRetries) {
        try {
          fileResponse = await fetch(metadata.blobUrl, {
            headers: fetchHeaders,
          })

          if (fileResponse.ok || fileResponse.status === 206) {
            break
          }

          throw new Error(`HTTP ${fileResponse.status}: ${fileResponse.statusText}`)
        } catch (fetchError) {
          retryCount++
          console.error(`File fetch attempt ${retryCount} failed:`, fetchError)

          if (retryCount >= maxRetries) {
            throw new Error("Failed to fetch file from storage")
          }

          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
        }
      }

      if (!fileResponse!.ok && fileResponse!.status !== 206) {
        console.log("Failed to fetch file from blob:", fileResponse!.status)
        return NextResponse.json({ error: "File not accessible" }, { status: 404 })
      }

      // Get file content
      let fileBuffer: ArrayBuffer
      const isPartialContent = fileResponse!.status === 206

      try {
        fileBuffer = await fileResponse!.arrayBuffer()
      } catch (bufferError) {
        console.error("Failed to read file buffer:", bufferError)
        return NextResponse.json({ error: "Failed to read file content" }, { status: 500 })
      }

      // Decompress if necessary
      if (metadata.compressed) {
        try {
          const pako = await import("pako")
          const decompressed = pako.ungzip(new Uint8Array(fileBuffer))
          fileBuffer = decompressed.buffer
          console.log("File decompressed successfully")
        } catch (error) {
          console.error("Decompression error:", error)
          return NextResponse.json({ error: "Failed to decompress file" }, { status: 500 })
        }
      }

      // Prepare response headers
      const headers = new Headers()

      // Enhanced MIME type detection
      const fileName = metadata.originalName
      const fileExtension = fileName.split(".").pop()?.toLowerCase()
      let contentType = "application/octet-stream"

      const mimeTypes: Record<string, string> = {
        // Images
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        ico: "image/x-icon",
        // Videos
        mp4: "video/mp4",
        avi: "video/x-msvideo",
        mov: "video/quicktime",
        wmv: "video/x-ms-wmv",
        flv: "video/x-flv",
        webm: "video/webm",
        // Audio
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        aac: "audio/aac",
        // Documents
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        // Text
        txt: "text/plain",
        html: "text/html",
        css: "text/css",
        js: "text/javascript",
        json: "application/json",
        xml: "text/xml",
        // Archives
        zip: "application/zip",
        rar: "application/x-rar-compressed",
        "7z": "application/x-7z-compressed",
        tar: "application/x-tar",
        gz: "application/gzip",
      }

      if (fileExtension && mimeTypes[fileExtension]) {
        contentType = mimeTypes[fileExtension]
      }

      headers.set("Content-Type", contentType)
      headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`)
      headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate")
      headers.set("Pragma", "no-cache")
      headers.set("Expires", "0")

      // Security headers
      headers.set("X-Content-Type-Options", "nosniff")
      headers.set("X-Frame-Options", "DENY")
      headers.set("X-XSS-Protection", "1; mode=block")

      // Range support headers
      if (range && isPartialContent) {
        const contentRange = fileResponse!.headers.get("content-range")
        if (contentRange) {
          headers.set("Content-Range", contentRange)
          headers.set("Accept-Ranges", "bytes")
        }
      } else {
        headers.set("Content-Length", fileBuffer.byteLength.toString())
        headers.set("Accept-Ranges", "bytes")
      }

      // Additional metadata headers
      if (metadata.compressed) {
        headers.set("X-Original-Size", metadata.originalSize.toString())
        headers.set("X-Compressed-Size", metadata.size.toString())
        headers.set("X-Compression-Ratio", metadata.compressionRatio.toString())
        headers.set("X-Decompressed", "true")
      }

      headers.set("X-File-ID", fileId)
      headers.set("X-Upload-Date", metadata.uploadedAt)

      console.log("Serving file:", fileName, "Size:", fileBuffer.byteLength, "Type:", contentType)
      console.log("=== DOWNLOAD STREAM API SUCCESS ===")

      // Return streaming response
      return new NextResponse(fileBuffer, {
        status: isPartialContent ? 206 : 200,
        headers,
      })
    } catch (listError) {
      console.error("Error accessing blob storage:", listError)
      return NextResponse.json({ error: "Failed to access storage" }, { status: 500 })
    }
  } catch (error) {
    console.error("=== DOWNLOAD STREAM API ERROR ===")
    console.error("Download stream error:", error)

    return NextResponse.json(
      {
        error: `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    )
  }
}

// Support HEAD requests for file info
export async function HEAD(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const { fileId } = params
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!token) {
      return new NextResponse(null, { status: 500 })
    }

    const { blobs } = await list({ token })
    const metadataBlob = blobs.find((blob) => blob.pathname === `metadata_${fileId}.json`)

    if (!metadataBlob) {
      return new NextResponse(null, { status: 404 })
    }

    const metadataResponse = await fetch(metadataBlob.url)
    if (!metadataResponse.ok) {
      return new NextResponse(null, { status: 500 })
    }

    const metadata = await metadataResponse.json()

    // Check expiration
    const uploadTime = new Date(metadata.uploadedAt).getTime()
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000

    if (now - uploadTime > twentyFourHours) {
      return new NextResponse(null, { status: 410 })
    }

    const headers = new Headers()
    headers.set("Content-Length", (metadata.compressed ? metadata.originalSize : metadata.size).toString())
    headers.set("Accept-Ranges", "bytes")
    headers.set("Content-Type", "application/octet-stream")

    return new NextResponse(null, {
      status: 200,
      headers,
    })
  } catch (error) {
    return new NextResponse(null, { status: 500 })
  }
}
