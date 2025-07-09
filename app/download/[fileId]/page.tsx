"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Download, FileIcon, AlertCircle, Archive, Cloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"

interface FileMetadata {
  id: string
  originalName: string
  size: number
  originalSize: number
  compressed: boolean
  compressionRatio: number
  uploadedAt: string
  blobUrl: string
}

export default function DownloadPage() {
  const params = useParams()
  const fileId = params.fileId as string
  const [fileInfo, setFileInfo] = useState<FileMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  useEffect(() => {
    const fetchFileInfo = async () => {
      if (!fileId) {
        setError("無効なファイルIDです")
        setLoading(false)
        return
      }

      try {
        // Try to fetch metadata from Vercel Blob
        const metadataUrl = `https://your-blob-store.vercel-storage.com/metadata_${fileId}.json`
        const response = await fetch(metadataUrl)

        if (response.ok) {
          const metadata = await response.json()
          setFileInfo(metadata)
        } else {
          setError("ファイルが見つかりません、または期限が切れています")
        }
      } catch (err) {
        console.error("Fetch error:", err)
        setError("ファイル情報の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchFileInfo()
  }, [fileId])

  const handleDownload = async () => {
    if (!fileInfo) return

    setDownloading(true)
    setDownloadProgress(0)

    try {
      const downloadUrl = `/api/download-blob?url=${encodeURIComponent(fileInfo.blobUrl)}&name=${encodeURIComponent(fileInfo.originalName)}&compressed=${fileInfo.compressed}`

      const response = await fetch(downloadUrl)

      if (!response.ok) {
        throw new Error("ダウンロードに失敗しました")
      }

      const contentLength = response.headers.get("content-length")
      const total = contentLength ? Number.parseInt(contentLength, 10) : 0

      const reader = response.body?.getReader()
      if (!reader) throw new Error("レスポンスの読み取りに失敗しました")

      const chunks: Uint8Array[] = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        chunks.push(value)
        received += value.length

        if (total > 0) {
          setDownloadProgress((received / total) * 100)
        }
      }

      // Create blob and download
      const blob = new Blob(chunks)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileInfo.originalName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      console.log("Download completed successfully")
    } catch (err) {
      console.error("Download error:", err)
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました")
    } finally {
      setDownloading(false)
      setDownloadProgress(0)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">ファイル情報を読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error || !fileInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error || "ファイルが見つかりません"}</AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <Button onClick={() => (window.location.href = "/")} variant="outline">
                ホームに戻る
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <FileIcon className="h-6 w-6" />
            クラウドファイルダウンロード
          </CardTitle>
          <CardDescription>Vercel Blobから安全にダウンロード</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-3">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <h3 className="font-semibold text-lg break-all">{fileInfo.originalName}</h3>
                <div className="flex gap-1">
                  <Cloud className="h-5 w-5 text-blue-500" title="クラウド保存" />
                  {fileInfo.compressed && <Archive className="h-5 w-5 text-green-500" title="圧縮済み" />}
                </div>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <div className="flex justify-between">
                  <span>ファイルサイズ:</span>
                  <span>{formatFileSize(fileInfo.compressed ? fileInfo.originalSize : fileInfo.size)}</span>
                </div>
                {fileInfo.compressed && (
                  <div className="flex justify-between text-green-600">
                    <span>圧縮後サイズ:</span>
                    <span>
                      {formatFileSize(fileInfo.size)} ({fileInfo.compressionRatio.toFixed(1)}% 削減)
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>アップロード:</span>
                  <span>{new Date(fileInfo.uploadedAt).toLocaleDateString("ja-JP")}</span>
                </div>
                <div className="flex justify-between text-blue-600">
                  <span>保存場所:</span>
                  <span>Vercel Blob</span>
                </div>
              </div>
            </div>
          </div>

          {downloading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>ダウンロード中...</span>
                <span>{Math.round(downloadProgress)}%</span>
              </div>
              <Progress value={downloadProgress} className="h-2" />
            </div>
          )}

          <Button onClick={handleDownload} className="w-full" size="lg" disabled={downloading}>
            {downloading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                ダウンロード中...
              </>
            ) : (
              <>
                <Download className="h-5 w-5 mr-2" />
                ダウンロード
                {fileInfo.compressed && " (自動展開)"}
              </>
            )}
          </Button>

          {fileInfo.compressed && (
            <Alert>
              <Archive className="h-4 w-4" />
              <AlertDescription>
                このファイルは圧縮されています。ダウンロード時に自動的に元のファイルに展開されます。
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <Cloud className="h-4 w-4" />
            <AlertDescription>このファイルはVercel Blobクラウドストレージに安全に保存されています。</AlertDescription>
          </Alert>

          <div className="text-center">
            <Button onClick={() => (window.location.href = "/")} variant="outline" size="sm">
              新しいファイルをアップロード
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
