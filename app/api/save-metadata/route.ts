import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"

/**
 *  クライアントから送られて来たメタデータ(JSON)を
 *  別ファイルとして Blob に保存するだけなので 413 の心配がない
 */
export async function POST(req: NextRequest) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not set" }, { status: 500 })
    }

    const meta = await req.json()
    const blob = await put(`metadata_${meta.id}.json`, JSON.stringify(meta), {
      access: "public",
      token,
      addRandomSuffix: false,
    })

    return NextResponse.json({ success: true, metadataUrl: blob.url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 })
  }
}
