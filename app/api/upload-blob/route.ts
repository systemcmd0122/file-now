import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"

export async function POST(request: NextRequest) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!token) {
      return NextResponse.json(
        {
          error: "BLOB_READ_WRITE_TOKEN is not configured. Please set up Vercel Blob storage.",
        },
        { status: 500 },
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    const fileName = formData.get("fileName") as string
    const originalSize = formData.get("originalSize") as string
    const compressed = formData.get("compressed") === "true"
    const compressionRatio = Number.parseFloat(formData.get("compressionRatio") as string) || 0

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    console.log("Uploading file:", fileName, "Size:", file.size, "Compressed:", compressed)

    // Generate unique filename
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substr(2, 9)
    const fileId = `${timestamp}_${randomId}`
    const blobFileName = `${fileId}_${compressed ? fileName + ".gz" : fileName}`

    // Upload to Vercel Blob with explicit token
    const blob = await put(blobFileName, file, {
      access: "public",
      addRandomSuffix: false,
      token: token,
      multipart: true, // ← ★ 追加：必ずマルチパートで送信
    })

    console.log("File uploaded to blob:", blob.url)

    // Store metadata in a separate blob
    const metadata = {
      id: fileId,
      originalName: fileName,
      size: file.size,
      originalSize: Number.parseInt(originalSize),
      compressed,
      compressionRatio,
      uploadedAt: new Date().toISOString(),
      blobUrl: blob.url,
    }

    const metadataBlob = await put(`metadata_${fileId}.json`, JSON.stringify(metadata), {
      access: "public",
      addRandomSuffix: false,
      token: token,
    })

    console.log("Metadata uploaded:", metadataBlob.url)

    return NextResponse.json({
      success: true,
      fileId: fileId,
      blobUrl: blob.url,
      downloadUrl: `/api/download-blob?url=${encodeURIComponent(blob.url)}&name=${encodeURIComponent(fileName)}&compressed=${compressed}`,
      shareUrl: `${request.nextUrl.origin}/download/${fileId}`,
      metadata: metadataBlob.url,
    })
  } catch (error) {
    // Blob SDK が想定外の応答を受けた場合も文字列としてログに残す
    if (error instanceof SyntaxError && "text" in error) {
      console.error("Blob API raw response:", (error as any).text)
    }
    console.error("Upload error:", error)
    return NextResponse.json(
      {
        error: `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    )
  }
}
