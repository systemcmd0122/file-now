import { type NextRequest, NextResponse } from "next/server"
import { del } from "@vercel/blob"

export async function DELETE(request: NextRequest) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!token) {
      return NextResponse.json(
        {
          error: "BLOB_READ_WRITE_TOKEN is not configured",
        },
        { status: 500 },
      )
    }

    const { blobUrl } = await request.json()

    if (!blobUrl) {
      return NextResponse.json({ error: "No blob URL provided" }, { status: 400 })
    }

    console.log("Deleting blob:", blobUrl)

    // Delete the file from Vercel Blob
    await del(blobUrl, { token: token })

    // Try to delete metadata file as well
    try {
      const urlParts = blobUrl.split("/")
      const fileName = urlParts[urlParts.length - 1]
      const fileId = fileName.split("_").slice(0, 2).join("_")
      const metadataUrl = blobUrl.replace(fileName, `metadata_${fileId}.json`)

      console.log("Deleting metadata:", metadataUrl)
      await del(metadataUrl, { token: token })
    } catch (metadataError) {
      console.log("Could not delete metadata:", metadataError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete error:", error)
    return NextResponse.json(
      {
        error: `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    )
  }
}
