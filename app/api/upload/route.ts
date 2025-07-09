import { type NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const chunk = formData.get("chunk") as File
    const chunkIndex = Number.parseInt(formData.get("chunkIndex") as string)
    const totalChunks = Number.parseInt(formData.get("totalChunks") as string)
    const fileId = formData.get("fileId") as string
    const fileName = formData.get("fileName") as string

    if (!chunk || !fileId || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads")
    const tempDir = path.join(uploadsDir, "temp", fileId)

    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true })
    }

    // Save chunk
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer())
    const chunkPath = path.join(tempDir, `chunk_${chunkIndex}`)
    await writeFile(chunkPath, chunkBuffer)

    return NextResponse.json({
      success: true,
      chunkIndex,
      totalChunks,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
