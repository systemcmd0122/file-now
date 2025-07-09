import { type NextRequest, NextResponse } from "next/server"
import { list } from "@vercel/blob"

export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const { fileId } = params
    const token = process.env.BLOB_READ_WRITE_TOKEN

    console.log("=== GET METADATA API START ===")
    console.log("File ID:", fileId)
    console.log("Token available:", !!token)

    if (!fileId) {
      console.error("File ID is missing")
      return NextResponse.json({ error: "File ID is required" }, { status: 400 })
    }

    if (!token) {
      console.error("BLOB_READ_WRITE_TOKEN is not configured")
      return NextResponse.json(
        {
          error: "Storage service not configured. Please check server configuration.",
        },
        { status: 500 },
      )
    }

    console.log("Searching for metadata file:", `metadata_${fileId}.json`)

    try {
      // Enhanced blob listing with error handling
      let blobs
      let retryCount = 0
      const maxRetries = 3

      while (retryCount < maxRetries) {
        try {
          const listResult = await list({
            token,
            limit: 1000, // Increase limit to ensure we find the file
          })
          blobs = listResult.blobs
          break
        } catch (listError) {
          retryCount++
          console.error(`List attempt ${retryCount} failed:`, listError)

          if (retryCount >= maxRetries) {
            throw new Error("Failed to access blob storage after multiple attempts")
          }

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
        }
      }

      console.log("Total blobs found:", blobs.length)
      console.log("Looking for:", `metadata_${fileId}.json`)

      // Find metadata blob with enhanced search
      const metadataBlob = blobs.find((blob) => {
        const matches = blob.pathname === `metadata_${fileId}.json`
        if (matches) {
          console.log("Found matching blob:", blob.pathname, blob.url)
        }
        return matches
      })

      if (!metadataBlob) {
        console.log("Metadata file not found for fileId:", fileId)
        console.log(
          "Available metadata files:",
          blobs.filter((b) => b.pathname.startsWith("metadata_")).map((b) => b.pathname),
        )
        return NextResponse.json(
          {
            error: "File not found or expired. The file may have been deleted or the link may be incorrect.",
          },
          { status: 404 },
        )
      }

      console.log("Found metadata blob:", metadataBlob.url)

      // Fetch metadata content with retry logic
      let metadataResponse: Response
      retryCount = 0

      while (retryCount < maxRetries) {
        try {
          metadataResponse = await fetch(metadataBlob.url, {
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          })

          if (metadataResponse.ok) {
            break
          } else {
            throw new Error(`HTTP ${metadataResponse.status}: ${metadataResponse.statusText}`)
          }
        } catch (fetchError) {
          retryCount++
          console.error(`Metadata fetch attempt ${retryCount} failed:`, fetchError)

          if (retryCount >= maxRetries) {
            throw new Error("Failed to fetch metadata after multiple attempts")
          }

          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
        }
      }

      if (!metadataResponse!.ok) {
        console.log("Failed to fetch metadata content:", metadataResponse!.status)
        return NextResponse.json(
          {
            error: "Failed to load file information. Please try again.",
          },
          { status: 500 },
        )
      }

      let metadata
      try {
        const metadataText = await metadataResponse!.text()
        console.log("Raw metadata:", metadataText.substring(0, 200) + "...")
        metadata = JSON.parse(metadataText)
      } catch (parseError) {
        console.error("Failed to parse metadata JSON:", parseError)
        return NextResponse.json(
          {
            error: "File metadata is corrupted. Please re-upload the file.",
          },
          { status: 500 },
        )
      }

      console.log("Loaded metadata:", {
        id: metadata.id,
        originalName: metadata.originalName,
        size: metadata.size,
        uploadedAt: metadata.uploadedAt,
      })

      // Validate metadata structure
      if (!metadata.id || !metadata.originalName || !metadata.blobUrl) {
        console.error("Invalid metadata structure:", metadata)
        return NextResponse.json(
          {
            error: "File metadata is incomplete. Please re-upload the file.",
          },
          { status: 500 },
        )
      }

      // Check if file is expired (24 hours)
      const uploadTime = new Date(metadata.uploadedAt).getTime()
      const now = Date.now()
      const twentyFourHours = 24 * 60 * 60 * 1000

      console.log("Upload time:", new Date(uploadTime).toISOString())
      console.log("Current time:", new Date(now).toISOString())
      console.log("Time difference (hours):", (now - uploadTime) / (1000 * 60 * 60))

      if (now - uploadTime > twentyFourHours) {
        console.log("File expired, should be deleted")

        // Don't auto-delete here, just return expired status
        // Let the cleanup job handle deletion
        return NextResponse.json(
          {
            error: "File has expired and will be deleted automatically. Files are only available for 24 hours.",
          },
          { status: 410 },
        )
      }

      // Calculate expiration time
      const expiresAt = new Date(uploadTime + twentyFourHours).toISOString()
      const remainingTime = Math.max(0, Math.round((uploadTime + twentyFourHours - now) / (1000 * 60 * 60)))

      // Verify the actual file still exists
      try {
        const fileCheckResponse = await fetch(metadata.blobUrl, { method: "HEAD" })
        if (!fileCheckResponse.ok) {
          console.log("Actual file not accessible:", metadata.blobUrl)
          return NextResponse.json(
            {
              error: "File is no longer accessible. It may have been deleted.",
            },
            { status: 404 },
          )
        }
      } catch (fileCheckError) {
        console.error("Error checking file existence:", fileCheckError)
        // Don't fail here, the file might still be downloadable
      }

      const result = {
        ...metadata,
        downloadUrl: `/api/download-stream/${fileId}`,
        shareUrl: `${request.nextUrl.origin}/download/${fileId}`,
        expiresAt,
        remainingHours: remainingTime,
      }

      console.log("Returning metadata result:", {
        id: result.id,
        originalName: result.originalName,
        expiresAt: result.expiresAt,
        remainingHours: result.remainingHours,
      })
      console.log("=== GET METADATA API SUCCESS ===")

      return NextResponse.json(result)
    } catch (listError) {
      console.error("Error accessing blob storage:", listError)
      return NextResponse.json(
        {
          error: "Failed to access storage service. Please try again later.",
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("=== GET METADATA API ERROR ===")
    console.error("Get metadata error:", error)

    return NextResponse.json(
      {
        error: `Failed to get file info: ${error instanceof Error ? error.message : "Unknown server error"}`,
      },
      { status: 500 },
    )
  }
}
