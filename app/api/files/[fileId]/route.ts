import { type NextRequest, NextResponse } from "next/server"
import { unlink } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

export async function DELETE(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const { fileId } = params

    if (!fileId) {
      return NextResponse.json({ error: "File ID is required" }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), "uploads", "files")
    const metadataPath = path.join(uploadsDir, `${fileId}.json`)

    console.log("Deleting file:", fileId)
    console.log("Metadata path:", metadataPath)

    if (!existsSync(metadataPath)) {
      console.log("Metadata file not found")
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Read metadata to get file path
    const { readFile } = await import("fs/promises")
    const metadataBuffer = await readFile(metadataPath)
    const metadata = JSON.parse(metadataBuffer.toString())

    console.log("Found metadata:", metadata)

    // Delete actual file
    if (existsSync(metadata.path)) {
      await unlink(metadata.path)
      console.log("Deleted actual file:", metadata.path)
    }

    // Delete metadata file
    await unlink(metadataPath)
    console.log("Deleted metadata file:", metadataPath)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete error:", error)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
