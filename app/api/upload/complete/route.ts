import { type NextRequest, NextResponse } from "next/server"
import { writeFile, readFile, unlink, rmdir, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

export async function POST(request: NextRequest) {
  try {
    const { fileId, fileName, fileSize, originalSize, compressed, compressionRatio } = await request.json()

    if (!fileId || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), "uploads")
    const tempDir = path.join(uploadsDir, "temp", fileId)
    const finalDir = path.join(uploadsDir, "files")

    console.log("Completing upload for:", fileId, fileName)
    console.log("Compressed:", compressed, "Compression ratio:", compressionRatio)

    if (!existsSync(finalDir)) {
      await mkdir(finalDir, { recursive: true })
    }

    // Read all chunks and combine them
    const chunks: Buffer[] = []
    let chunkIndex = 0

    while (true) {
      const chunkPath = path.join(tempDir, `chunk_${chunkIndex}`)
      if (!existsSync(chunkPath)) {
        break
      }

      const chunkBuffer = await readFile(chunkPath)
      chunks.push(chunkBuffer)
      chunkIndex++
    }

    console.log("Found", chunkIndex, "chunks")

    if (chunkIndex === 0) {
      return NextResponse.json({ error: "No chunks found" }, { status: 400 })
    }

    // Combine all chunks
    const finalBuffer = Buffer.concat(chunks)
    const finalPath = path.join(finalDir, `${fileId}_${fileName}${compressed ? ".gz" : ""}`)
    await writeFile(finalPath, finalBuffer)

    console.log("File written to:", finalPath)
    console.log("File size:", finalBuffer.length)

    // Clean up temp files
    for (let i = 0; i < chunkIndex; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i}`)
      if (existsSync(chunkPath)) {
        await unlink(chunkPath)
      }
    }

    // Remove temp directory
    try {
      await rmdir(tempDir)
    } catch (error) {
      console.log("Could not remove temp directory:", error)
    }

    // Save file metadata
    const metadata = {
      id: fileId,
      name: fileName,
      size: fileSize,
      originalSize: originalSize || fileSize,
      compressed: compressed || false,
      compressionRatio: compressionRatio || 0,
      uploadedAt: new Date().toISOString(),
      path: finalPath,
    }

    const metadataPath = path.join(finalDir, `${fileId}.json`)
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2))

    console.log("Metadata saved to:", metadataPath)

    return NextResponse.json({
      success: true,
      fileId,
      downloadUrl: `/api/download/${fileId}`,
      shareUrl: `${request.nextUrl.origin}/download/${fileId}`,
    })
  } catch (error) {
    console.error("Complete upload error:", error)
    return NextResponse.json({ error: "Failed to complete upload" }, { status: 500 })
  }
}
