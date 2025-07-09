"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Download, Pause, Play, RotateCcw, CheckCircle, AlertCircle, Zap, Clock, HardDrive, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface DownloadProgressProps {
  fileId: string
  fileName: string
  fileSize: number
  downloadUrl: string
  onClose: () => void
}

interface DownloadState {
  status: "idle" | "downloading" | "paused" | "completed" | "error"
  progress: number
  downloadedBytes: number
  totalBytes: number
  speed: number
  estimatedTimeRemaining: number
  error?: string
}

export function DownloadProgress({ fileId, fileName, fileSize, downloadUrl, onClose }: DownloadProgressProps) {
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: "idle",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: fileSize,
    speed: 0,
    estimatedTimeRemaining: 0,
  })

  const { toast } = useToast()
  const abortControllerRef = useRef<AbortController | null>(null)
  const startTimeRef = useRef<number>(0)
  const lastProgressTimeRef = useRef<number>(0)
  const lastDownloadedBytesRef = useRef<number>(0)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
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

  const downloadWithProgress = async (resumeFrom = 0) => {
    try {
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      setDownloadState((prev) => ({
        ...prev,
        status: "downloading",
        error: undefined,
      }))

      startTimeRef.current = Date.now()
      lastProgressTimeRef.current = Date.now()
      lastDownloadedBytesRef.current = resumeFrom

      const headers: HeadersInit = {}
      if (resumeFrom > 0) {
        headers.Range = `bytes=${resumeFrom}-`
      }

      const response = await fetch(`/api/download-stream/${fileId}`, {
        headers,
        signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentLength = response.headers.get("content-length")
      const totalBytes = contentLength ? Number.parseInt(contentLength, 10) + resumeFrom : fileSize

      setDownloadState((prev) => ({
        ...prev,
        totalBytes,
      }))

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("Response body is not readable")
      }

      const chunks: Uint8Array[] = []
      let downloadedBytes = resumeFrom

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        chunks.push(value)
        downloadedBytes += value.length

        // Calculate speed and ETA
        const now = Date.now()
        const timeDiff = (now - lastProgressTimeRef.current) / 1000

        if (timeDiff >= 0.5) {
          // Update every 500ms
          const bytesDiff = downloadedBytes - lastDownloadedBytesRef.current
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

          lastProgressTimeRef.current = now
          lastDownloadedBytesRef.current = downloadedBytes
        }
      }

      // Create and download the file
      const blob = new Blob(chunks)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
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
        description: `${fileName} のダウンロードが完了しました`,
      })
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setDownloadState((prev) => ({
          ...prev,
          status: "paused",
        }))
      } else {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
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
  }

  const handleStart = () => {
    downloadWithProgress(downloadState.downloadedBytes)
  }

  const handlePause = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const handleResume = () => {
    downloadWithProgress(downloadState.downloadedBytes)
  }

  const handleRestart = () => {
    setDownloadState((prev) => ({
      ...prev,
      progress: 0,
      downloadedBytes: 0,
      speed: 0,
      estimatedTimeRemaining: 0,
      error: undefined,
    }))
    downloadWithProgress(0)
  }

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    onClose()
  }

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium truncate flex-1 mr-2">{fileName}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                downloadState.status === "completed"
                  ? "default"
                  : downloadState.status === "error"
                    ? "destructive"
                    : "secondary"
              }
            >
              {downloadState.status === "completed"
                ? "完了"
                : downloadState.status === "error"
                  ? "エラー"
                  : downloadState.status === "downloading"
                    ? "ダウンロード中"
                    : downloadState.status === "paused"
                      ? "一時停止"
                      : "待機中"}
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={downloadState.progress} className="h-3" />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{Math.round(downloadState.progress)}%</span>
            <span>
              {formatFileSize(downloadState.downloadedBytes)} / {formatFileSize(downloadState.totalBytes)}
            </span>
          </div>
        </div>

        {/* Stats */}
        {downloadState.status === "downloading" && (
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <div>
                <div className="font-medium">転送速度</div>
                <div className="text-blue-600">{formatSpeed(downloadState.speed)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <div>
                <div className="font-medium">残り時間</div>
                <div className="text-orange-600">{formatTime(downloadState.estimatedTimeRemaining)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {downloadState.status === "error" && downloadState.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">エラーが発生しました</span>
            </div>
            <div className="text-xs text-red-700 mt-1">{downloadState.error}</div>
          </div>
        )}

        {/* Success Message */}
        {downloadState.status === "completed" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">ダウンロード完了</span>
            </div>
            <div className="text-xs text-green-700 mt-1">ファイルが正常にダウンロードされました</div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex gap-2">
          {downloadState.status === "idle" && (
            <Button onClick={handleStart} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              ダウンロード開始
            </Button>
          )}

          {downloadState.status === "downloading" && (
            <Button onClick={handlePause} variant="outline" className="flex-1 bg-transparent">
              <Pause className="h-4 w-4 mr-2" />
              一時停止
            </Button>
          )}

          {downloadState.status === "paused" && (
            <>
              <Button onClick={handleResume} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                再開
              </Button>
              <Button onClick={handleRestart} variant="outline">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}

          {downloadState.status === "error" && (
            <>
              <Button onClick={handleResume} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                再試行
              </Button>
              <Button onClick={handleRestart} variant="outline">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}

          {downloadState.status === "completed" && (
            <Button onClick={handleRestart} variant="outline" className="flex-1 bg-transparent">
              <RotateCcw className="h-4 w-4 mr-2" />
              再ダウンロード
            </Button>
          )}
        </div>

        {/* File Info */}
        <div className="bg-gray-50 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-2 text-gray-600">
            <HardDrive className="h-4 w-4" />
            <span>ファイルID: {fileId}</span>
          </div>
          <div className="mt-1 text-gray-500">レジューム対応・高速ストリーミングダウンロード</div>
        </div>
      </CardContent>
    </Card>
  )
}
