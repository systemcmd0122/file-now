"use client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  HardDrive,
  Wifi,
  CheckCircle,
  AlertCircle,
  Loader2,
  RotateCcw,
} from "lucide-react"

interface ChunkProgress {
  index: number
  status: "pending" | "uploading" | "completed" | "error" | "retrying"
  progress: number
  size: number
  uploadedBytes: number
  retryCount: number
  error?: string
  startTime?: number
  endTime?: number
}

interface DetailedProgressProps {
  fileName: string
  progress: number
  status: string
  chunks: ChunkProgress[]
  totalChunks: number
  uploadedChunks: number
  currentChunk: number
  uploadSpeed: number
  estimatedTimeRemaining: number
  totalBytes: number
  uploadedBytes: number
  showDetails: boolean
  onToggleDetails: () => void
  compressionRatio?: number
}

export function DetailedProgress({
  fileName,
  progress,
  status,
  chunks,
  totalChunks,
  uploadedChunks,
  currentChunk,
  uploadSpeed,
  estimatedTimeRemaining,
  totalBytes,
  uploadedBytes,
  showDetails,
  onToggleDetails,
  compressionRatio,
}: DetailedProgressProps) {
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

  const getChunkStatusIcon = (chunkStatus: string) => {
    switch (chunkStatus) {
      case "completed":
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case "uploading":
        return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
      case "error":
        return <AlertCircle className="h-3 w-3 text-red-500" />
      case "retrying":
        return <RotateCcw className="h-3 w-3 text-yellow-500 animate-spin" />
      default:
        return <div className="h-3 w-3 rounded-full bg-gray-300" />
    }
  }

  const getChunkStatusColor = (chunkStatus: string) => {
    switch (chunkStatus) {
      case "completed":
        return "bg-green-500"
      case "uploading":
        return "bg-blue-500"
      case "error":
        return "bg-red-500"
      case "retrying":
        return "bg-yellow-500"
      default:
        return "bg-gray-300"
    }
  }

  const errorChunks = chunks.filter((c) => c.status === "error").length
  const retryingChunks = chunks.filter((c) => c.status === "retrying").length

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium truncate flex-1 mr-2">{fileName}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={status === "completed" ? "default" : status === "error" ? "destructive" : "secondary"}>
              {Math.round(progress)}%
            </Badge>
            <Button variant="ghost" size="sm" onClick={onToggleDetails} className="h-8 w-8 p-0">
              {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Progress value={progress} className="h-2" />

          {/* Basic Stats */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {uploadedChunks}/{totalChunks} チャンク完了
            </span>
            <span>
              {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}
            </span>
          </div>

          {/* Speed and Time */}
          {uploadSpeed > 0 && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-blue-600">
                <Zap className="h-3 w-3" />
                <span>{formatSpeed(uploadSpeed)}</span>
              </div>
              {estimatedTimeRemaining > 0 && (
                <div className="flex items-center gap-1 text-orange-600">
                  <Clock className="h-3 w-3" />
                  <span>残り {formatTime(estimatedTimeRemaining)}</span>
                </div>
              )}
            </div>
          )}

          {/* Compression Info */}
          {compressionRatio && compressionRatio > 0 && (
            <div className="text-xs text-green-600">圧縮率: {compressionRatio.toFixed(1)}%</div>
          )}
        </div>
      </CardHeader>

      {showDetails && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Detailed Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-gray-500" />
                <div>
                  <div className="font-medium">現在のチャンク</div>
                  <div className="text-gray-500">
                    {currentChunk + 1} / {totalChunks}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="font-medium">転送速度</div>
                  <div className="text-blue-600">{formatSpeed(uploadSpeed)}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div>
                  <div className="font-medium">完了チャンク</div>
                  <div className="text-green-600">{uploadedChunks}</div>
                </div>
              </div>

              {(errorChunks > 0 || retryingChunks > 0) && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <div>
                    <div className="font-medium">エラー/再試行</div>
                    <div className="text-red-600">
                      {errorChunks} / {retryingChunks}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chunk Grid Visualization */}
            <div>
              <div className="text-sm font-medium mb-2">チャンク進捗</div>
              <div className="grid grid-cols-10 md:grid-cols-20 gap-1">
                {chunks.map((chunk) => (
                  <div
                    key={chunk.index}
                    className={`h-3 w-3 rounded-sm ${getChunkStatusColor(chunk.status)} relative group cursor-help`}
                    title={`チャンク ${chunk.index + 1}: ${chunk.status} ${chunk.retryCount > 0 ? `(${chunk.retryCount}回再試行)` : ""}`}
                  >
                    {chunk.status === "uploading" && (
                      <div className="absolute inset-0 bg-white bg-opacity-30 animate-pulse rounded-sm" />
                    )}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 bg-green-500 rounded-sm" />
                  <span>完了</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 bg-blue-500 rounded-sm" />
                  <span>アップロード中</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 bg-yellow-500 rounded-sm" />
                  <span>再試行中</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 bg-red-500 rounded-sm" />
                  <span>エラー</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 bg-gray-300 rounded-sm" />
                  <span>待機中</span>
                </div>
              </div>
            </div>

            {/* Error Details */}
            {errorChunks > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-sm font-medium text-red-800 mb-2">エラーが発生したチャンク ({errorChunks}個)</div>
                <div className="space-y-1 text-xs text-red-700">
                  {chunks
                    .filter((c) => c.status === "error")
                    .slice(0, 3)
                    .map((chunk) => (
                      <div key={chunk.index}>
                        チャンク {chunk.index + 1}: {chunk.error || "不明なエラー"}
                        {chunk.retryCount > 0 && ` (${chunk.retryCount}回再試行済み)`}
                      </div>
                    ))}
                  {errorChunks > 3 && <div className="text-red-600">...他 {errorChunks - 3} 個のエラー</div>}
                </div>
              </div>
            )}

            {/* Performance Metrics */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm font-medium text-blue-800 mb-2">パフォーマンス統計</div>
              <div className="grid grid-cols-2 gap-4 text-xs text-blue-700">
                <div>
                  <div>平均チャンクサイズ</div>
                  <div className="font-medium">{formatFileSize(totalBytes / totalChunks)}</div>
                </div>
                <div>
                  <div>完了率</div>
                  <div className="font-medium">{((uploadedChunks / totalChunks) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div>エラー率</div>
                  <div className="font-medium">{((errorChunks / totalChunks) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div>再試行率</div>
                  <div className="font-medium">
                    {((chunks.reduce((sum, c) => sum + c.retryCount, 0) / totalChunks) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
