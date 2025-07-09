import { type NextRequest, NextResponse } from "next/server"
import { put, del } from "@vercel/blob"

export async function POST(request: NextRequest) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!token) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN is not configured" }, { status: 500 })
    }

    const formData = await request.formData()
    const chunk = formData.get("chunk") as File
    const chunkIndex = Number.parseInt(formData.get("chunkIndex") as string)
    const totalChunks = Number.parseInt(formData.get("totalChunks") as string)
    const fileId = formData.get("fileId") as string
    const fileName = formData.get("fileName") as string
    const originalSize = Number.parseInt(formData.get("originalSize") as string)
    const compressed = formData.get("compressed") === "true"
    const compressionRatio = Number.parseFloat(formData.get("compressionRatio") as string) || 0

    if (!chunk || !fileId || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks} for file: ${fileName} (${chunk.size} bytes)`)

    try {
      // Store chunk temporarily in Vercel Blob with retry logic
      const chunkPath = `temp/${fileId}/chunk_${chunkIndex.toString().padStart(4, "0")}`

      let chunkBlob
      let retryCount = 0
      const maxRetries = 3

      while (retryCount < maxRetries) {
        try {
          chunkBlob = await put(chunkPath, chunk, {
            access: "public",
            token: token,
            addRandomSuffix: false,
            multipart: true,
          })
          break
        } catch (putError) {
          retryCount++
          console.error(`Chunk upload attempt ${retryCount} failed:`, putError)

          if (retryCount >= maxRetries) {
            throw new Error(
              `Failed to upload chunk after ${maxRetries} attempts: ${putError instanceof Error ? putError.message : "Unknown error"}`,
            )
          }

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
        }
      }

      if (!chunkBlob) {
        throw new Error("Failed to upload chunk")
      }

      console.log(`Chunk ${chunkIndex + 1} uploaded successfully:`, chunkBlob.url)

      // If this is the last chunk, combine all chunks
      if (chunkIndex === totalChunks - 1) {
        console.log("Last chunk received, starting file combination...")

        try {
          // Get base URL from the uploaded chunk
          const baseUrl = chunkBlob.url.split(`/temp/${fileId}`)[0]
          const chunks: Uint8Array[] = []

          // Fetch all chunks with enhanced retry logic
          for (let i = 0; i < totalChunks; i++) {
            const padded = i.toString().padStart(4, "0")
            const tempChunkUrl = `${baseUrl}/temp/${fileId}/chunk_${padded}`

            let chunkData: ArrayBuffer | null = null
            let fetchRetries = 0
            const maxFetchRetries = 5

            while (fetchRetries < maxFetchRetries && !chunkData) {
              try {
                const res = await fetch(tempChunkUrl)
                if (res.ok) {
                  chunkData = await res.arrayBuffer()
                } else {
                  throw new Error(`HTTP ${res.status}: ${res.statusText}`)
                }
              } catch (fetchError) {
                fetchRetries++
                console.error(`Fetch chunk ${i} attempt ${fetchRetries} failed:`, fetchError)

                if (fetchRetries >= maxFetchRetries) {
                  throw new Error(`Failed to fetch chunk ${i} after ${maxFetchRetries} attempts`)
                }

                // Exponential backoff
                await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, fetchRetries - 1)))
              }
            }

            if (chunkData) {
              chunks.push(new Uint8Array(chunkData))
              console.log(`Successfully fetched chunk ${i} (${chunkData.byteLength} bytes)`)
            } else {
              throw new Error(`Failed to fetch chunk ${i}`)
            }
          }

          // Combine all chunks
          const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
          const combinedBuffer = new Uint8Array(totalSize)
          let offset = 0

          for (const chunk of chunks) {
            combinedBuffer.set(chunk, offset)
            offset += chunk.length
          }

          console.log(`Combined ${chunks.length} chunks into ${totalSize} bytes`)

          // Upload final file to Vercel Blob
          const finalFileName = `files/${fileId}_${compressed ? fileName + ".gz" : fileName}`
          const finalBlob = await put(finalFileName, combinedBuffer, {
            access: "public",
            token,
            addRandomSuffix: false,
            multipart: true,
            contentType: compressed ? "application/gzip" : "application/octet-stream",
          })

          // Save metadata
          const metadata = {
            id: fileId,
            originalName: fileName,
            size: combinedBuffer.length,
            originalSize,
            compressed,
            compressionRatio,
            uploadedAt: new Date().toISOString(),
            blobUrl: finalBlob.url,
          }

          const metadataBlob = await put(`metadata_${fileId}.json`, JSON.stringify(metadata), {
            access: "public",
            token: token,
            addRandomSuffix: false,
          })

          // Clean up temporary chunks
          console.log("Cleaning up temporary chunks...")
          const cleanupPromises = []
          for (let i = 0; i < totalChunks; i++) {
            const tempChunkPath = `temp/${fileId}/chunk_${i.toString().padStart(4, "0")}`
            const tempChunkUrl = `${baseUrl}/temp/${fileId}/chunk_${i.toString().padStart(4, "0")}`
            cleanupPromises.push(
              del(tempChunkUrl, { token }).catch((error) => {
                console.log(`Could not delete temp chunk ${i}:`, error)
              }),
            )
          }

          // Wait for cleanup to complete (but don't fail if it doesn't work)
          await Promise.allSettled(cleanupPromises)

          console.log("File upload completed successfully:", finalBlob.url)

          return NextResponse.json({
            success: true,
            completed: true,
            fileId,
            blobUrl: finalBlob.url,
            downloadUrl: `/api/download-blob?url=${encodeURIComponent(finalBlob.url)}&name=${encodeURIComponent(fileName)}&compressed=${compressed}`,
            shareUrl: `${request.nextUrl.origin}/download/${fileId}`,
            metadata: metadataBlob.url,
          })
        } catch (combineError) {
          console.error("Error combining chunks:", combineError)
          return NextResponse.json(
            {
              error: `Failed to combine file chunks: ${combineError instanceof Error ? combineError.message : "Unknown error"}`,
            },
            { status: 500 },
          )
        }
      }

      return NextResponse.json({
        success: true,
        completed: false,
        chunkIndex,
        totalChunks,
      })
    } catch (uploadError) {
      console.error("Chunk upload error:", uploadError)
      return NextResponse.json(
        {
          error: `Chunk upload failed: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}`,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("Upload chunk error:", error)
    return NextResponse.json(
      {
        error: `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    )
  }
}
