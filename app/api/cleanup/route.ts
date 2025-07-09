import { NextResponse } from "next/server"
import { readdir, unlink, readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

export async function POST() {
  try {
    const uploadsDir = path.join(process.cwd(), "uploads", "files")

    if (!existsSync(uploadsDir)) {
      return NextResponse.json({ message: "No files to cleanup" })
    }

    const files = await readdir(uploadsDir)
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000
    let deletedCount = 0

    for (const file of files) {
      if (file.endsWith(".json")) {
        const metadataPath = path.join(uploadsDir, file)

        try {
          const metadataBuffer = await readFile(metadataPath)
          const metadata = JSON.parse(metadataBuffer.toString())
          const uploadTime = new Date(metadata.uploadedAt).getTime()

          // Check if file is older than 24 hours
          if (now - uploadTime > twentyFourHours) {
            // Delete actual file
            if (existsSync(metadata.path)) {
              await unlink(metadata.path)
            }

            // Delete metadata file
            await unlink(metadataPath)
            deletedCount++
          }
        } catch (error) {
          console.error(`Error processing ${file}:`, error)
        }
      }
    }

    return NextResponse.json({
      message: `Cleanup completed. Deleted ${deletedCount} expired files.`,
      deletedCount,
    })
  } catch (error) {
    console.error("Cleanup error:", error)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}
