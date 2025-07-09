"use client"

import type React from "react"

import { useState, useCallback, useRef } from "react"
import {
  Upload,
  Download,
  Share2,
  Trash2,
  FileIcon,
  CheckCircle,
  AlertCircle,
  Loader2,
  Archive,
  Cloud,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { ShareModal } from "@/components/share-modal"

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
}

interface UploadProgress {
  fileName: string
  progress: number
  status: "uploading" | "compressing" | "completed" | "error"
  compressionRatio?: number
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
        // Import pako for compression
        import("pako")
          .then((pako) => {
            const reader = new FileReader()
            reader.onload = (e) => {
              try {
                const arrayBuffer = e.target?.result as ArrayBuffer
                const uint8Array = new Uint8Array(arrayBuffer)

                // Compress using gzip
                const compressed = pako.gzip(uint8Array, { level: 6 })

                const compressionRatio = (1 - compressed.length / uint8Array.length) * 100

                // Create new file with compressed data
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

  const uploadFileToBlob = async (file: File) => {
    const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    const originalSize = file.size
    let finalFile = file
    let compressed = false
    let compressionRatio = 0

    // Initialize upload progress
    setUploadProgress((prev) => [
      ...prev,
      {
        fileName: file.name,
        progress: 0,
        status: "uploading",
      },
    ])

    try {
      // Compress file if enabled and file is large enough
      if (compressionEnabled && file.size > 1024 * 100) {
        setUploadProgress((prev) => prev.map((p) => (p.fileName === file.name ? { ...p, status: "compressing" } : p)))

        const compressionResult = await compressFile(file)
        finalFile = compressionResult.compressedFile
        compressionRatio = compressionResult.compressionRatio
        compressed = true

        setUploadProgress((prev) =>
          prev.map((p) => (p.fileName === file.name ? { ...p, status: "uploading", compressionRatio } : p)),
        )

        toast({
          title: "圧縮完了",
          description: `${file.name} を ${compressionRatio.toFixed(1)}% 圧縮しました`,
        })
      }

      // Upload to Vercel Blob
      const formData = new FormData()
      formData.append("file", finalFile)
      formData.append("fileName", file.name)
      formData.append("originalSize", originalSize.toString())
      formData.append("compressed", compressed.toString())
      formData.append("compressionRatio", compressionRatio.toString())

      const response = await fetch("/api/upload-blob", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Upload failed")
      }

      const result = await response.json()

      // Update progress to completed
      setUploadProgress((prev) =>
        prev.map((p) => (p.fileName === file.name ? { ...p, status: "completed", progress: 100 } : p)),
      )

      // Add to files list
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
        },
      ])

      toast({
        title: "アップロード完了",
        description: compressed
          ? `${file.name} を圧縮してクラウドにアップロードしました (${compressionRatio.toFixed(1)}% 削減)`
          : `${file.name} をクラウドにアップロードしました`,
      })

      // Remove from progress after 3 seconds
      setTimeout(() => {
        setUploadProgress((prev) => prev.filter((p) => p.fileName !== file.name))
      }, 3000)
    } catch (error) {
      console.error("Upload error:", error)
      setUploadProgress((prev) => prev.map((p) => (p.fileName === file.name ? { ...p, status: "error" } : p)))
      toast({
        title: "アップロードエラー",
        description: `${file.name} のアップロードに失敗しました。`,
        variant: "destructive",
      })
    }
  }

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || isUploading) return

    setIsUploading(true)
    const fileArray = Array.from(selectedFiles)

    try {
      // Upload files sequentially to avoid overwhelming the server
      for (const file of fileArray) {
        await uploadFileToBlob(file)
      }
    } finally {
      setIsUploading(false)
    }
  }

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!isUploading) {
        setIsDragging(true)
      }
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
      if (!isUploading) {
        handleFileSelect(e.dataTransfer.files)
      }
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ blobUrl: file.blobUrl }),
      })

      if (response.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId))
        toast({
          title: "ファイルを削除しました",
          description: "クラウドからファイルが正常に削除されました。",
        })
      } else {
        throw new Error("Delete failed")
      }
    } catch (error) {
      toast({
        title: "削除エラー",
        description: "ファイルの削除に失敗しました。",
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

  const downloadFile = async (file: FileItem) => {
    try {
      const response = await fetch(file.downloadUrl)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        if (file.compressed) {
          toast({
            title: "ダウンロード完了",
            description: "ファイルは自動的に展開されました。",
          })
        }
      } else {
        throw new Error("Download failed")
      }
    } catch (error) {
      toast({
        title: "ダウンロードエラー",
        description: "ファイルのダウンロードに失敗しました。",
        variant: "destructive",
      })
    }
  }

  const getProgressStatusText = (status: string, compressionRatio?: number) => {
    switch (status) {
      case "compressing":
        return "圧縮中..."
      case "uploading":
        return compressionRatio
          ? `クラウドにアップロード中... (${compressionRatio.toFixed(1)}% 圧縮済み)`
          : "クラウドにアップロード中..."
      case "completed":
        return "完了"
      case "error":
        return "エラー"
      default:
        return "処理中..."
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">クラウドファイル転送</h1>
          <p className="text-base md:text-lg text-gray-600">Vercel Blob + 自動圧縮で高速・安全にファイル転送</p>
          <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
            <Cloud className="h-4 w-4" />
            <span>Powered by Vercel Blob Storage</span>
          </div>
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
            {/* Compression Toggle */}
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Archive className="h-4 w-4 text-blue-600" />
                <Label htmlFor="compression-toggle" className="text-sm font-medium">
                  自動圧縮を有効にする
                </Label>
              </div>
              <Switch
                id="compression-toggle"
                checked={compressionEnabled}
                onCheckedChange={setCompressionEnabled}
                disabled={isUploading}
              />
            </div>

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
              <CardTitle className="text-lg">処理進行状況</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {uploadProgress.map((progress, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate flex-1 mr-2">{progress.fileName}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {progress.status === "completed" && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {progress.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
                      {progress.status === "compressing" && <Archive className="h-4 w-4 text-blue-500 animate-pulse" />}
                      {progress.status === "uploading" && <Cloud className="h-4 w-4 text-blue-500 animate-pulse" />}
                      <span className="text-sm text-gray-500">{Math.round(progress.progress)}%</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {getProgressStatusText(progress.status, progress.compressionRatio)}
                  </div>
                  <Progress value={progress.progress} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
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
                          <span className="hidden sm:inline">{new Date(file.uploadedAt).toLocaleString("ja-JP")}</span>
                          <span className="sm:hidden">{new Date(file.uploadedAt).toLocaleDateString("ja-JP")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => downloadFile(file)} className="hidden sm:flex">
                        <Download className="h-4 w-4 mr-1" />
                        ダウンロード
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
          <Cloud className="h-4 w-4" />
          <AlertDescription className="text-sm">
            ファイルはVercel Blobクラウドストレージに安全に保存されます。
            自動圧縮機能により転送効率を向上させ、ダウンロード時は自動的に展開されます。
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
