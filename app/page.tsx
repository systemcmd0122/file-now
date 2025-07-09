"use client"

import type React from "react"
import { useState, useCallback, useRef } from "react"
import {
  Upload,
  Download,
  Share2,
  Trash2,
  FileIcon,
  Loader2,
  Archive,
  Cloud,
  Settings,
  Clock,
  Info,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { ShareModal } from "@/components/share-modal"
import { DetailedProgress } from "@/components/detailed-progress"
import { DownloadProgress } from "@/components/download-progress"

interface FileItem {
  id: string
  name: string
  size: number
  originalSize: number
  compressed: boolean
  compressionRatio: number
  uploadedAt: string
  downloadUrl: string
  blobUrl: string
  shareUrl: string
}

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

interface UploadProgress {
  fileName: string
  progress: number
  status: "uploading" | "compressing" | "completed" | "error"
  compressionRatio?: number
  error?: string
  chunks: ChunkProgress[]
  totalChunks: number
  uploadedChunks: number
  currentChunk: number
  uploadSpeed: number
  estimatedTimeRemaining: number
  totalBytes: number
  uploadedBytes: number
  showDetails: boolean
}

export default function FileTransferSite() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [compressionEnabled, setCompressionEnabled] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [selectedFileForShare, setSelectedFileForShare] = useState<FileItem | null>(null)
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set())
  const [downloadingFile, setDownloadingFile] = useState<FileItem | null>(null)

  // 圧縮済みファイル形式の判定
  const isAlreadyCompressed = (fileName: string, mimeType?: string): boolean => {
    const compressedExtensions = [
      ".zip",
      ".rar",
      ".7z",
      ".tar.gz",
      ".tgz",
      ".tar.bz2",
      ".tbz2",
      ".tar.xz",
      ".txz",
      ".gz",
      ".bz2",
      ".xz",
      ".lz",
      ".lzma",
      ".z",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".avif",
      ".heic",
      ".heif",
      ".mp4",
      ".avi",
      ".mkv",
      ".mov",
      ".wmv",
      ".flv",
      ".webm",
      ".m4v",
      ".3gp",
      ".mp3",
      ".aac",
      ".ogg",
      ".wma",
      ".m4a",
      ".opus",
      ".flac",
      ".pdf",
      ".docx",
      ".xlsx",
      ".pptx",
      ".odt",
      ".ods",
      ".odp",
      ".apk",
      ".ipa",
      ".deb",
      ".rpm",
      ".dmg",
      ".iso",
    ]

    const lowerFileName = fileName.toLowerCase()
    const isCompressedByExtension = compressedExtensions.some((ext) => lowerFileName.endsWith(ext))

    const compressedMimeTypes = [
      "application/zip",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
      "application/gzip",
      "application/x-bzip2",
      "application/x-xz",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/avi",
      "video/quicktime",
      "video/x-msvideo",
      "audio/mpeg",
      "audio/aac",
      "audio/ogg",
      "audio/x-ms-wma",
      "application/pdf",
    ]

    const isCompressedByMime = mimeType ? compressedMimeTypes.some((type) => mimeType.includes(type)) : false
    return isCompressedByExtension || isCompressedByMime
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const compressFile = async (file: File): Promise<{ compressedFile: File; compressionRatio: number }> => {
    return new Promise((resolve, reject) => {
      try {
        import("pako")
          .then((pako) => {
            const reader = new FileReader()
            reader.onload = (e) => {
              try {
                const arrayBuffer = e.target?.result as ArrayBuffer
                const uint8Array = new Uint8Array(arrayBuffer)
                const compressed = pako.gzip(uint8Array, { level: 6 })
                const compressionRatio = (1 - compressed.length / uint8Array.length) * 100

                if (compressionRatio < 5) {
                  resolve({ compressedFile: file, compressionRatio: 0 })
                  return
                }

                const compressedBlob = new Blob([compressed], { type: "application/gzip" })
                const compressedFile = new File([compressedBlob], `${file.name}.gz`, {
                  type: "application/gzip",
                  lastModified: file.lastModified,
                })

                resolve({ compressedFile, compressionRatio })
              } catch (error) {
                reject(error)
              }
            }
            reader.onerror = reject
            reader.readAsArrayBuffer(file)
          })
          .catch(reject)
      } catch (error) {
        reject(error)
      }
    })
  }

  const uploadFileInChunks = async (file: File) => {
    const chunkSize = 1024 * 1024 * 1.5
    const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    const originalSize = file.size
    let finalFile = file
    let compressed = false
    let compressionRatio = 0

    const totalChunks = Math.ceil(finalFile.size / chunkSize)
    const startTime = Date.now()
    let uploadedBytesLocal = 0
    const totalBytesLocal = file.size

    const chunks: ChunkProgress[] = Array.from({ length: totalChunks }, (_, index) => ({
      index,
      status: "pending",
      progress: 0,
      size: index === totalChunks - 1 ? finalFile.size - index * chunkSize : chunkSize,
      uploadedBytes: 0,
      retryCount: 0,
    }))

    setUploadProgress((prev) => [
      ...prev,
      {
        fileName: file.name,
        progress: 0,
        status: "uploading",
        chunks,
        totalChunks,
        uploadedChunks: 0,
        currentChunk: 0,
        uploadSpeed: 0,
        estimatedTimeRemaining: 0,
        totalBytes: finalFile.size,
        uploadedBytes: 0,
        showDetails: false,
      },
    ])

    try {
      const shouldCompress = compressionEnabled && file.size > 1024 * 100 && !isAlreadyCompressed(file.name, file.type)

      if (shouldCompress) {
        setUploadProgress((prev) => prev.map((p) => (p.fileName === file.name ? { ...p, status: "compressing" } : p)))

        try {
          const compressionResult = await compressFile(file)
          if (compressionResult.compressionRatio > 0) {
            finalFile = compressionResult.compressedFile
            compressionRatio = compressionResult.compressionRatio
            compressed = true
            toast({
              title: "圧縮完了",
              description: `${file.name} を ${compressionRatio.toFixed(1)}% 圧縮しました`,
            })
          } else {
            toast({
              title: "圧縮をスキップ",
              description: `${file.name} は既に最適化されているため、圧縮をスキップしました`,
            })
          }
        } catch (compressionError) {
          toast({
            title: "圧縮失敗",
            description: `${file.name} の圧縮に失敗しました。元のファイルをアップロードします`,
            variant: "destructive",
          })
        }

        setUploadProgress((prev) =>
          prev.map((p) => (p.fileName === file.name ? { ...p, status: "uploading", compressionRatio } : p)),
        )
      } else if (isAlreadyCompressed(file.name, file.type)) {
        toast({
          title: "圧縮をスキップ",
          description: `${file.name} は既に圧縮されているため、そのままアップロードします`,
        })
      }

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize
        const end = Math.min(start + chunkSize, finalFile.size)
        const chunk = finalFile.slice(start, end)

        const formData = new FormData()
        formData.append("chunk", chunk)
        formData.append("chunkIndex", chunkIndex.toString())
        formData.append("totalChunks", totalChunks.toString())
        formData.append("fileId", fileId)
        formData.append("fileName", file.name)
        formData.append("originalSize", originalSize.toString())
        formData.append("compressed", compressed.toString())
        formData.append("compressionRatio", compressionRatio.toString())

        setUploadProgress((prev) =>
          prev.map((p) =>
            p.fileName === file.name
              ? {
                  ...p,
                  currentChunk: chunkIndex,
                  chunks: p.chunks.map((c, i) =>
                    i === chunkIndex ? { ...c, status: "uploading", startTime: Date.now() } : c,
                  ),
                }
              : p,
          ),
        )

        let retryCount = 0
        const maxRetries = 3
        let success = false

        while (retryCount < maxRetries && !success) {
          try {
            const response = await fetch("/api/upload-chunk", {
              method: "POST",
              body: formData,
            })

            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.error || `HTTP ${response.status}`)
            }

            const result = await response.json()
            success = true

            uploadedBytesLocal += chunk.size
            const elapsedSec = (Date.now() - startTime) / 1000
            const uploadSpeed = elapsedSec > 0 ? uploadedBytesLocal / elapsedSec : 0
            const remainingBytes = totalBytesLocal - uploadedBytesLocal
            const estimatedSec = uploadSpeed > 0 ? remainingBytes / uploadSpeed : 0

            setUploadProgress((prev) =>
              prev.map((p) =>
                p.fileName === file.name
                  ? {
                      ...p,
                      progress: ((chunkIndex + 1) / totalChunks) * 100,
                      uploadedChunks: chunkIndex + 1,
                      uploadedBytes: uploadedBytesLocal,
                      uploadSpeed,
                      estimatedTimeRemaining: estimatedSec,
                      chunks: p.chunks.map((c, i) =>
                        i === chunkIndex
                          ? {
                              ...c,
                              status: "completed",
                              progress: 100,
                              uploadedBytes: c.size,
                              endTime: Date.now(),
                            }
                          : c,
                      ),
                    }
                  : p,
              ),
            )

            if (result.completed) {
              setUploadProgress((prev) =>
                prev.map((p) => (p.fileName === file.name ? { ...p, status: "completed" } : p)),
              )

              setFiles((prev) => [
                ...prev,
                {
                  id: fileId,
                  name: file.name,
                  size: finalFile.size,
                  originalSize,
                  compressed,
                  compressionRatio,
                  uploadedAt: new Date().toISOString(),
                  downloadUrl: result.downloadUrl,
                  blobUrl: result.blobUrl,
                  shareUrl: result.shareUrl,
                },
              ])

              toast({
                title: "アップロード完了",
                description: compressed
                  ? `${file.name} を圧縮してクラウドにアップロードしました (${compressionRatio.toFixed(1)}% 削減)`
                  : `${file.name} をクラウドにアップロードしました`,
              })

              setTimeout(() => {
                setUploadProgress((prev) => prev.filter((p) => p.fileName !== file.name))
              }, 3000)

              return
            }
          } catch (error) {
            retryCount++

            setUploadProgress((prev) =>
              prev.map((p) =>
                p.fileName === file.name
                  ? {
                      ...p,
                      chunks: p.chunks.map((c, i) =>
                        i === chunkIndex
                          ? {
                              ...c,
                              status: "retrying",
                              retryCount: retryCount,
                              error: error instanceof Error ? error.message : "Unknown error",
                            }
                          : c,
                      ),
                    }
                  : p,
              ),
            )

            if (retryCount >= maxRetries) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error"
              setUploadProgress((prev) =>
                prev.map((p) =>
                  p.fileName === file.name
                    ? {
                        ...p,
                        chunks: p.chunks.map((c, i) =>
                          i === chunkIndex ? { ...c, status: "error", error: errorMessage } : c,
                        ),
                      }
                    : p,
                ),
              )
              throw new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts`)
            }

            await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      setUploadProgress((prev) =>
        prev.map((p) => (p.fileName === file.name ? { ...p, status: "error", error: errorMessage } : p)),
      )
      toast({
        title: "アップロードエラー",
        description: `${file.name} のアップロードに失敗しました: ${errorMessage}`,
        variant: "destructive",
      })
    }
  }

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || isUploading) return
    setIsUploading(true)
    const fileArray = Array.from(selectedFiles)
    try {
      for (const file of fileArray) {
        await uploadFileInChunks(file)
      }
    } finally {
      setIsUploading(false)
    }
  }

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!isUploading) setIsDragging(true)
    },
    [isUploading],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (!isUploading) handleFileSelect(e.dataTransfer.files)
    },
    [isUploading],
  )

  const openShareModal = (file: FileItem) => {
    setSelectedFileForShare(file)
    setShareModalOpen(true)
  }

  const deleteFile = async (fileId: string) => {
    setDeletingFiles((prev) => new Set(prev).add(fileId))
    try {
      const file = files.find((f) => f.id === fileId)
      if (!file) return

      const response = await fetch("/api/delete-blob", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: file.blobUrl }),
      })

      if (response.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId))
        toast({
          title: "ファイルを削除しました",
          description: "クラウドからファイルが正常に削除されました。",
        })
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Delete failed")
      }
    } catch (error) {
      toast({
        title: "削除エラー",
        description: `ファイルの削除に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      })
    } finally {
      setDeletingFiles((prev) => {
        const newSet = new Set(prev)
        newSet.delete(fileId)
        return newSet
      })
    }
  }

  const downloadFile = (file: FileItem) => {
    setDownloadingFile(file)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">クラウドファイル転送</h1>
          <p className="text-base md:text-lg text-gray-600">
            Vercel Blob + スマート圧縮 + ストリーミングダウンロードで高速・安全にファイル転送
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-blue-600">
              <Cloud className="h-4 w-4" />
              <span>Powered by Vercel Blob Storage</span>
            </div>
            <div className="flex items-center gap-2 text-green-600">
              <Zap className="h-4 w-4" />
              <span>ストリーミング対応</span>
            </div>
            <div className="flex items-center gap-2 text-orange-600">
              <Clock className="h-4 w-4" />
              <span>24時間自動削除</span>
            </div>
          </div>
        </div>

        {/* Admin Link */}
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = "/admin")}
            className="text-gray-600 hover:text-gray-900"
          >
            <Settings className="h-4 w-4 mr-2" />
            管理ダッシュボード
          </Button>
        </div>

        {/* Upload Area */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" />
              ファイルアップロード
            </CardTitle>
            <CardDescription>
              ファイルをドラッグ&ドロップするか、クリックして選択してください。クラウドストレージに安全に保存されます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Archive className="h-4 w-4 text-blue-600" />
                <Label htmlFor="compression-toggle" className="text-sm font-medium">
                  スマート圧縮を有効にする
                </Label>
              </div>
              <Switch
                id="compression-toggle"
                checked={compressionEnabled}
                onCheckedChange={setCompressionEnabled}
                disabled={isUploading}
              />
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                スマート圧縮は、既に圧縮されているファイル（ZIP、画像、動画など）を自動検出し、
                圧縮効果が期待できるファイルのみを圧縮します。
              </AlertDescription>
            </Alert>

            <div
              className={`border-2 border-dashed rounded-lg p-6 md:p-8 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-blue-500 bg-blue-50"
                  : isUploading
                    ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                    : "border-gray-300 hover:border-gray-400"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="h-12 w-12 mx-auto text-gray-400 mb-4 animate-spin" />
              ) : (
                <div className="flex flex-col items-center">
                  <Cloud className="h-12 w-12 mx-auto text-blue-500 mb-2" />
                  <Upload className="h-8 w-8 mx-auto text-gray-400 mb-4" />
                </div>
              )}
              <p className="text-lg font-medium text-gray-700 mb-2">
                {isUploading ? "クラウドに保存中..." : "ファイルをクラウドにアップロード"}
              </p>
              <p className="text-sm text-gray-500 mb-4">または</p>
              <Button variant="outline" disabled={isUploading}>
                {isUploading ? "処理中..." : "ファイルを選択"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                disabled={isUploading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Upload Progress */}
        {uploadProgress.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">詳細処理進行状況</CardTitle>
              <CardDescription>チャンク単位の詳細進捗とリアルタイム統計</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {uploadProgress.map((progress, index) => (
                <DetailedProgress
                  key={index}
                  fileName={progress.fileName}
                  progress={progress.progress}
                  status={progress.status}
                  chunks={progress.chunks || []}
                  totalChunks={progress.totalChunks || 0}
                  uploadedChunks={progress.uploadedChunks || 0}
                  currentChunk={progress.currentChunk || 0}
                  uploadSpeed={progress.uploadSpeed || 0}
                  estimatedTimeRemaining={progress.estimatedTimeRemaining || 0}
                  totalBytes={progress.totalBytes || 0}
                  uploadedBytes={progress.uploadedBytes || 0}
                  showDetails={progress.showDetails || false}
                  compressionRatio={progress.compressionRatio}
                  onToggleDetails={() => {
                    setUploadProgress((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, showDetails: !p.showDetails } : p)),
                    )
                  }}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Download Progress Modal */}
        {downloadingFile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <DownloadProgress
              fileId={downloadingFile.id}
              fileName={downloadingFile.name}
              fileSize={downloadingFile.compressed ? downloadingFile.originalSize : downloadingFile.size}
              downloadUrl={`/api/download-stream/${downloadingFile.id}`}
              onClose={() => setDownloadingFile(null)}
            />
          </div>
        )}

        {/* Files List */}
        {files.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileIcon className="h-5 w-5" />
                クラウド保存済みファイル ({files.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-white"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="relative">
                        <FileIcon className="h-6 w-6 md:h-8 md:w-8 text-blue-500 flex-shrink-0" />
                        <Cloud className="h-3 w-3 text-blue-500 absolute -top-1 -right-1 bg-white rounded-full" />
                        {file.compressed && (
                          <Archive className="h-3 w-3 text-green-500 absolute -bottom-1 -right-1 bg-white rounded-full" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm md:text-base truncate">{file.name}</p>
                        <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500">
                          <span>{formatFileSize(file.compressed ? file.originalSize : file.size)}</span>
                          {file.compressed && (
                            <>
                              <span>•</span>
                              <span className="text-green-600">{file.compressionRatio.toFixed(1)}% 圧縮済み</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="text-blue-600">クラウド保存</span>
                          <span>•</span>
                          <span className="text-green-600">ストリーミング対応</span>
                          <span>•</span>
                          <span className="text-orange-600">24h後削除</span>
                          <span>•</span>
                          <span className="hidden sm:inline">{new Date(file.uploadedAt).toLocaleString("ja-JP")}</span>
                          <span className="sm:hidden">{new Date(file.uploadedAt).toLocaleDateString("ja-JP")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => downloadFile(file)} className="hidden sm:flex">
                        <Download className="h-4 w-4 mr-1" />
                        高速DL
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => downloadFile(file)} className="sm:hidden p-2">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openShareModal(file)}
                        className="hidden sm:flex"
                      >
                        <Share2 className="h-4 w-4 mr-1" />
                        共有
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openShareModal(file)}
                        className="sm:hidden p-2"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteFile(file.id)}
                        disabled={deletingFiles.has(file.id)}
                        className="hidden sm:flex"
                      >
                        {deletingFiles.has(file.id) ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        削除
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteFile(file.id)}
                        disabled={deletingFiles.has(file.id)}
                        className="sm:hidden p-2"
                      >
                        {deletingFiles.has(file.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertDescription className="text-sm">
            ファイルはVercel Blobクラウドストレージに安全に保存され、24時間後に自動的に削除されます。
            高速ストリーミングダウンロード、レジューム機能、スマート圧縮により最高のファイル転送体験を提供します。
            大容量ファイルも効率的に処理し、ダウンロード時は自動的に展開されます。
          </AlertDescription>
        </Alert>

        {/* Share Modal */}
        {selectedFileForShare && (
          <ShareModal
            file={selectedFileForShare}
            isOpen={shareModalOpen}
            onClose={() => {
              setShareModalOpen(false)
              setSelectedFileForShare(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
