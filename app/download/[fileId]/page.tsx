"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  Download,
  FileIcon,
  AlertCircle,
  Archive,
  Cloud,
  Home,
  RefreshCw,
  Zap,
  CheckCircle,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

interface FileMetadata {
  id: string
  originalName: string
  size: number
  originalSize: number
  compressed: boolean
  compressionRatio: number
  uploadedAt: string
  blobUrl: string
  downloadUrl: string
  shareUrl: string
  expiresAt?: string
  remainingHours?: number
}

interface DownloadState {
  status: "idle" | "downloading" | "completed" | "error"
  progress: number
  downloadedBytes: number
  totalBytes: number
  speed: number
  estimatedTimeRemaining: number
  error?: string
}

export default function DownloadPage() {
  const params = useParams()
  const fileId = params.fileId as string
  const [fileInfo, setFileInfo] = useState<FileMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: "idle",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: 0,
    estimatedTimeRemaining: 0,
  })
  const { toast } = useToast()

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const formatSpeed = (bytesPerSecond: number) => {
    return `${formatFileSize(bytesPerSecond)}/s`
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}秒`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}分${remainingSeconds}秒`
  }

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime()
    const expiry = new Date(expiresAt).getTime()
    const remaining = expiry - now

    if (remaining <= 0) return "期限切れ"

    const hours = Math.floor(remaining / (1000 * 60 * 60))
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}時間${minutes}分`
    } else {
      return `${minutes}分`
    }
  }

  const fetchFileInfo = async () => {
    if (!fileId) {
      setError("無効なファイルIDです")
      setLoading(false)
      return
    }

    try {
      console.log("Fetching metadata for file ID:", fileId)

      // Enhanced error handling with multiple fallback attempts
      let response: Response
      let attempts = 0
      const maxAttempts = 3

      while (attempts < maxAttempts) {
        try {
          response = await fetch(`/api/get-metadata/${fileId}`, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          })
          break
        } catch (fetchError) {
          attempts++
          console.error(`Fetch attempt ${attempts} failed:`, fetchError)

          if (attempts >= maxAttempts) {
            throw new Error("ネットワーク接続に問題があります。インターネット接続を確認してください。")
          }

          // Wait before retry with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts))
        }
      }

      console.log("Metadata API response status:", response!.status)

      if (response!.ok) {
        const metadata = await response!.json()
        console.log("Found metadata:", metadata)

        // Validate metadata structure
        if (!metadata.id || !metadata.originalName || !metadata.blobUrl) {
          throw new Error("ファイルメタデータが不完全です")
        }

        setFileInfo(metadata)
        setDownloadState((prev) => ({
          ...prev,
          totalBytes: metadata.compressed ? metadata.originalSize : metadata.size,
        }))
        setError(null)
      } else {
        const errorData = await response!.json().catch(() => ({ error: "Unknown error" }))
        console.log("API error:", errorData)

        // Enhanced error handling with specific messages
        switch (response!.status) {
          case 404:
            setError("ファイルが見つかりません。リンクが正しいか、ファイルが期限切れでないか確認してください。")
            break
          case 410:
            setError("ファイルの期限が切れており、自動的に削除されました。")
            break
          case 500:
            setError("サーバーで一時的な問題が発生しています。しばらく待ってから再試行してください。")
            break
          case 503:
            setError("サービスが一時的に利用できません。しばらく待ってから再試行してください。")
            break
          default:
            setError(errorData.error || `サーバーエラーが発生しました (${response!.status})`)
        }
      }
    } catch (err) {
      console.error("Fetch error:", err)
      const errorMessage = err instanceof Error ? err.message : "不明なエラーが発生しました"
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    setRetryCount((prev) => prev + 1)
    fetchFileInfo()
  }

  const downloadWithProgress = async () => {
    if (!fileInfo) return

    setDownloadState((prev) => ({ ...prev, status: "downloading", error: undefined }))

    try {
      console.log("Starting streaming download for:", fileInfo.id)

      // Use the new streaming download endpoint
      const response = await fetch(`/api/download-stream/${fileInfo.id}`, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
        },
      })

      console.log("Download response status:", response.status)

      if (!response.ok) {
        let errorMessage = "ダウンロードに失敗しました"

        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response is not JSON, use status-based error messages
          switch (response.status) {
            case 404:
              errorMessage = "ファイルが見つかりません"
              break
            case 410:
              errorMessage = "ファイルの期限が切れています"
              break
            case 500:
              errorMessage = "サーバーエラーが発生しました"
              break
            default:
              errorMessage = `HTTP ${response.status}: ${response.statusText}`
          }
        }

        throw new Error(errorMessage)
      }

      const contentLength = response.headers.get("content-length")
      const totalBytes = contentLength ? Number.parseInt(contentLength, 10) : fileInfo.size

      setDownloadState((prev) => ({ ...prev, totalBytes }))

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("レスポンスの読み取りに失敗しました")
      }

      const chunks: Uint8Array[] = []
      let downloadedBytes = 0
      const startTime = Date.now()
      let lastProgressTime = Date.now()
      let lastDownloadedBytes = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        chunks.push(value)
        downloadedBytes += value.length

        // Update progress every 100ms for smooth animation
        const now = Date.now()
        const timeDiff = (now - lastProgressTime) / 1000

        if (timeDiff >= 0.1) {
          const bytesDiff = downloadedBytes - lastDownloadedBytes
          const speed = bytesDiff / timeDiff
          const remainingBytes = totalBytes - downloadedBytes
          const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : 0

          setDownloadState((prev) => ({
            ...prev,
            progress: (downloadedBytes / totalBytes) * 100,
            downloadedBytes,
            speed,
            estimatedTimeRemaining,
          }))

          lastProgressTime = now
          lastDownloadedBytes = downloadedBytes
        }
      }

      // Create and download the file
      const blob = new Blob(chunks)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileInfo.originalName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setDownloadState((prev) => ({
        ...prev,
        status: "completed",
        progress: 100,
        downloadedBytes: totalBytes,
      }))

      toast({
        title: "ダウンロード完了",
        description: fileInfo.compressed
          ? "ファイルは自動的に展開されました。"
          : "ファイルのダウンロードが完了しました。",
      })
    } catch (err) {
      console.error("Download error:", err)
      const errorMessage = err instanceof Error ? err.message : "ダウンロードに失敗しました"

      setDownloadState((prev) => ({
        ...prev,
        status: "error",
        error: errorMessage,
      }))

      toast({
        title: "ダウンロードエラー",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    fetchFileInfo()
  }, [fileId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">ファイル情報を読み込み中...</p>
          {retryCount > 0 && <p className="text-sm text-gray-500 mt-2">再試行中... ({retryCount}回目)</p>}
        </div>
      </div>
    )
  }

  if (error || !fileInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-red-600">
              <AlertCircle className="h-6 w-6" />
              エラーが発生しました
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error || "ファイルが見つかりません"}</AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <Button onClick={handleRetry} variant="outline" className="w-full bg-transparent">
                <RefreshCw className="h-4 w-4 mr-2" />
                再試行
              </Button>
              <Button onClick={() => (window.location.href = "/")} variant="default" className="w-full">
                <Home className="h-4 w-4 mr-2" />
                ホームに戻る
              </Button>
            </div>

            <div className="text-xs text-gray-500 text-center space-y-1">
              <p>• ファイルが24時間以内にアップロードされたか確認してください</p>
              <p>• リンクが正しくコピーされているか確認してください</p>
              <p>• 問題が続く場合は、新しいファイルをアップロードしてください</p>
              {retryCount > 0 && <p>• 再試行回数: {retryCount}回</p>}
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
            高速ストリーミングダウンロード
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
                  <Zap className="h-5 w-5 text-green-500" title="高速ストリーミング" />
                  {fileInfo.compressed && <Archive className="h-5 w-5 text-orange-500" title="圧縮済み" />}
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
                {fileInfo.expiresAt && (
                  <div className="flex justify-between">
                    <span>残り時間:</span>
                    <span className="flex items-center gap-1">
                      <span>{getTimeRemaining(fileInfo.expiresAt)}</span>
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-blue-600">
                  <span>保存場所:</span>
                  <span>Vercel Blob</span>
                </div>
              </div>
            </div>
          </div>

          {/* Download Progress */}
          {downloadState.status === "downloading" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Progress value={downloadState.progress} className="h-3" />
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{Math.round(downloadState.progress)}%</span>
                  <span>
                    {formatFileSize(downloadState.downloadedBytes)} / {formatFileSize(downloadState.totalBytes)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-500" />
                  <div>
                    <div className="font-medium">転送速度</div>
                    <div className="text-blue-600">{formatSpeed(downloadState.speed)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <div>
                    <div className="font-medium">残り時間</div>
                    <div className="text-orange-600">{formatTime(downloadState.estimatedTimeRemaining)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Download Status */}
          {downloadState.status === "completed" && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                ダウンロードが完了しました。
                {fileInfo.compressed && " ファイルは自動的に展開されました。"}
              </AlertDescription>
            </Alert>
          )}

          {downloadState.status === "error" && downloadState.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{downloadState.error}</AlertDescription>
            </Alert>
          )}

          {/* Download Button */}
          <Button
            onClick={downloadWithProgress}
            className="w-full"
            size="lg"
            disabled={downloadState.status === "downloading"}
          >
            {downloadState.status === "downloading" ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ダウンロード中... {Math.round(downloadState.progress)}%
              </>
            ) : downloadState.status === "completed" ? (
              <>
                <Download className="h-5 w-5 mr-2" />
                再ダウンロード
              </>
            ) : (
              <>
                <Download className="h-5 w-5 mr-2" />
                高速ダウンロード開始
                {fileInfo.compressed && " (自動展開)"}
              </>
            )}
          </Button>

          {/* Features */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Badge variant="outline" className="justify-center">
              <Zap className="h-3 w-3 mr-1" />
              ストリーミング
            </Badge>
            <Badge variant="outline" className="justify-center">
              <RefreshCw className="h-3 w-3 mr-1" />
              レジューム対応
            </Badge>
            {fileInfo.compressed && (
              <Badge variant="outline" className="justify-center">
                <Archive className="h-3 w-3 mr-1" />
                自動展開
              </Badge>
            )}
            <Badge variant="outline" className="justify-center">
              <Cloud className="h-3 w-3 mr-1" />
              クラウド保存
            </Badge>
          </div>

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
            <AlertDescription>
              このファイルはVercel Blobクラウドストレージに安全に保存されています。
              高速ストリーミング技術により、大容量ファイルも効率的にダウンロードできます。
            </AlertDescription>
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
