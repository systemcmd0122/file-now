import { type NextRequest, NextResponse } from "next/server"
import { del } from "@vercel/blob"

export async function DELETE(request: NextRequest) {
  try {
    const { blobUrl } = await request.json()

    if (!blobUrl) {
      return NextResponse.json({ error: "No blob URL provided" }, { status: 400 })
    }

    // Delete the file from Vercel Blob
    await del(blobUrl)

    // Try to delete metadata file as well
    try {
      const urlParts = blobUrl.split("/")
      const fileName = urlParts[urlParts.length - 1]
      const fileId = fileName.split("_").slice(0, 2).join("_")
      const metadataUrl = blobUrl.replace(fileName, `metadata_${fileId}.json`)
      await del(metadataUrl)
    } catch (metadataError) {
      console.log("Could not delete metadata:", metadataError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete error:", error)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
