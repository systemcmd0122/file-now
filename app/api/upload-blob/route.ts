import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const fileName = formData.get("fileName") as string
    const originalSize = formData.get("originalSize") as string
    const compressed = formData.get("compressed") === "true"
    const compressionRatio = Number.parseFloat(formData.get("compressionRatio") as string) || 0

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substr(2, 9)
    const blobFileName = `${timestamp}_${randomId}_${compressed ? fileName + ".gz" : fileName}`

    // Upload to Vercel Blob
    const blob = await put(blobFileName, file, {
      access: "public",
      addRandomSuffix: false,
    })

    // Store metadata in a separate blob
    const metadata = {
      id: `${timestamp}_${randomId}`,
      originalName: fileName,
      size: file.size,
      originalSize: Number.parseInt(originalSize),
      compressed,
      compressionRatio,
      uploadedAt: new Date().toISOString(),
      blobUrl: blob.url,
    }

    const metadataBlob = await put(`metadata_${timestamp}_${randomId}.json`, JSON.stringify(metadata), {
      access: "public",
      addRandomSuffix: false,
    })

    return NextResponse.json({
      success: true,
      blobUrl: blob.url,
      downloadUrl: `/api/download-blob?url=${encodeURIComponent(blob.url)}&name=${encodeURIComponent(fileName)}&compressed=${compressed}`,
      metadata: metadataBlob.url,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
