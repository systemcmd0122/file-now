"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Trash2, RefreshCw, Clock, FileIcon, AlertTriangle, CheckCircle, Loader2, Settings } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface FileStatus {
  name: string
  uploadedAt: string
  expiresAt: string
  remainingHours: number
  expired: boolean
}

interface CleanupStatus {
  totalFiles: number
  activeFiles: number
  expiredFiles: number
  files: FileStatus[]
  lastChecked: string
}

export default function AdminPage() {
  const [status, setStatus] = useState<CleanupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const { toast } = useToast()

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/cleanup-status")
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      } else {
        throw new Error("Failed to fetch status")
      }
    } catch (error) {
      toast({
        title: "エラー",
        description: "ステータスの取得に失敗しました",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const runCleanup = async () => {
    setCleaning(true)
    try {
      const response = await fetch("/api/cron/cleanup", {
        method: "POST",
      })

      if (response.ok) {
        const result = await response.json()
        toast({
          title: "クリーンアップ完了",
          description: `${result.deletedCount}個の期限切れファイルを削除しました`,
        })
        await fetchStatus() // Refresh status
      } else {
        throw new Error("Cleanup failed")
      }
    } catch (error) {
      toast({
        title: "エラー",
        description: "クリーンアップに失敗しました",
        variant: "destructive",
      })
    } finally {
      setCleaning(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">ステータスを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">管理ダッシュボード</h1>
          <p className="text-base md:text-lg text-gray-600">ファイル管理と自動削除システム</p>
        </div>

        {/* Stats Cards */}
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">総ファイル数</p>
                    <p className="text-2xl font-bold text-gray-900">{status.totalFiles}</p>
                  </div>
                  <FileIcon className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">アクティブファイル</p>
                    <p className="text-2xl font-bold text-green-600">{status.activeFiles}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">期限切れファイル</p>
                    <p className="text-2xl font-bold text-red-600">{status.expiredFiles}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              システム制御
            </CardTitle>
            <CardDescription>ファイルの管理と削除操作</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <Button onClick={fetchStatus} variant="outline" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                ステータス更新
              </Button>

              <Button onClick={runCleanup} disabled={cleaning} variant="destructive">
                {cleaning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                期限切れファイル削除
              </Button>

              <Button onClick={() => (window.location.href = "/")} variant="outline">
                メインページに戻る
              </Button>
            </div>

            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                自動削除は6時間ごとに実行されます。ファイルは24時間後に自動的に削除されます。
                {status && (
                  <>
                    <br />
                    最終チェック: {new Date(status.lastChecked).toLocaleString("ja-JP")}
                  </>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Files List */}
        {status && status.files.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileIcon className="h-5 w-5" />
                ファイル一覧 ({status.files.length})
              </CardTitle>
              <CardDescription>アップロードされたファイルの詳細情報</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {status.files.map((file, index) => (
                  <div
                    key={index}
                    className={`p-4 border rounded-lg ${
                      file.expired ? "bg-red-50 border-red-200" : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="relative">
                          <FileIcon
                            className={`h-6 w-6 ${file.expired ? "text-red-500" : "text-blue-500"} flex-shrink-0`}
                          />
                          {file.expired && (
                            <AlertTriangle className="h-3 w-3 text-red-500 absolute -top-1 -right-1 bg-white rounded-full" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm md:text-base truncate">{file.name}</p>
                          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500">
                            <span>アップロード: {new Date(file.uploadedAt).toLocaleString("ja-JP")}</span>
                            <span>•</span>
                            <span>期限: {new Date(file.expiresAt).toLocaleString("ja-JP")}</span>
                          </div>
                          {!file.expired && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                <span>残り時間: {file.remainingHours}時間</span>
                                <span>{Math.round((file.remainingHours / 24) * 100)}%</span>
                              </div>
                              <Progress value={(file.remainingHours / 24) * 100} className="h-1" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={file.expired ? "destructive" : "default"}>
                          {file.expired ? "期限切れ" : `${file.remainingHours}h残り`}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {status && status.files.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <FileIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">現在、保存されているファイルはありません。</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
