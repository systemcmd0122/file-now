"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Copy, Mail, MessageCircle, Share2, X, Check, ExternalLink } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface FileItem {
  id: string
  name: string
  size: number
  uploadedAt: string
  downloadUrl: string
}

interface ShareModalProps {
  file: FileItem
  isOpen: boolean
  onClose: () => void
}

export function ShareModal({ file, isOpen, onClose }: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState("")
  const [copySuccess, setCopySuccess] = useState(false)
  const [qrLoading, setQrLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen && file) {
      const url = `${window.location.origin}/download/${file.id}`
      setShareUrl(url)
      setQrLoading(true)

      // Generate QR code
      setTimeout(() => {
        generateQRCode(url, `qr-${file.id}`)
      }, 100)
    }
  }, [isOpen, file])

  const generateQRCode = async (text: string, containerId: string) => {
    try {
      const qrContainer = document.getElementById(containerId)
      if (!qrContainer) return

      // ローダーを表示
      setQrLoading(true)
      qrContainer.innerHTML = ""

      // QR 画像を生成
      const img = new Image()
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(text)}`
      img.alt = "QR Code"
      img.className = "mx-auto border rounded"
      img.onload = () => setQrLoading(false) // 読み込み完了でローダーを非表示
      img.onerror = () => setQrLoading(false) // 失敗時もローダーを非表示

      qrContainer.appendChild(img)
    } catch (error) {
      console.error("QR Code generation failed:", error)
      setQrLoading(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopySuccess(true)
      toast({
        title: "リンクをコピーしました",
        description: "共有リンクがクリップボードにコピーされました。",
      })
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea")
      textArea.value = shareUrl
      textArea.style.position = "fixed"
      textArea.style.left = "-999999px"
      textArea.style.top = "-999999px"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      try {
        document.execCommand("copy")
        setCopySuccess(true)
        toast({
          title: "リンクをコピーしました",
          description: "共有リンクがクリップボードにコピーされました。",
        })
        setTimeout(() => setCopySuccess(false), 2000)
      } catch (err) {
        toast({
          title: "コピーに失敗しました",
          description: "手動でリンクをコピーしてください。",
          variant: "destructive",
        })
      }

      document.body.removeChild(textArea)
    }
  }

  const shareViaEmail = () => {
    const subject = `ファイル共有: ${file.name}`
    const body = `以下のリンクからファイルをダウンロードできます:\n\n${shareUrl}\n\nファイル名: ${file.name}\nサイズ: ${formatFileSize(file.size)}\n\n※このリンクは24時間後に無効になります。`
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  const shareViaWhatsApp = () => {
    const message = `ファイルを共有します: ${file.name}\n${shareUrl}\n\n※このリンクは24時間後に無効になります。`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`)
  }

  const shareViaLine = () => {
    const message = `ファイルを共有します: ${file.name}\n${shareUrl}`
    window.open(
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(message)}`,
    )
  }

  const openInNewTab = () => {
    window.open(shareUrl, "_blank")
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="w-full max-w-md my-8">
        <Card className="w-full max-h-[90vh] flex flex-col">
          <CardHeader className="flex-shrink-0 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Share2 className="h-5 w-5" />
                ファイルを共有
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto space-y-4">
            {/* File Info */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">ファイル名</p>
                <p className="text-sm text-gray-900 break-all font-medium">{file.name}</p>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>サイズ: {formatFileSize(file.size)}</span>
                <span>{new Date(file.uploadedAt).toLocaleDateString("ja-JP")}</span>
              </div>
            </div>

            {/* Share URL */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">共有リンク</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-xs bg-gray-50 text-gray-700 min-w-0"
                />
                <Button
                  onClick={copyToClipboard}
                  size="sm"
                  variant={copySuccess ? "default" : "outline"}
                  className={`flex-shrink-0 ${copySuccess ? "bg-green-500 hover:bg-green-600 text-white" : ""}`}
                >
                  {copySuccess ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* QR Code */}
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-gray-700">QRコード</p>
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-lg border shadow-sm">
                  {qrLoading && (
                    <div className="qr-loading flex items-center justify-center w-[120px] h-[120px]">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
                    </div>
                  )}
                  <div id={`qr-${file.id}`} className="min-h-[120px] flex items-center justify-center" />
                </div>
              </div>
            </div>

            {/* Share Options */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">共有方法</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={shareViaEmail}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 justify-start h-10 bg-transparent"
                >
                  <Mail className="h-4 w-4" />
                  <span className="text-sm">メール</span>
                </Button>
                <Button
                  onClick={openInNewTab}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 justify-start h-10 bg-transparent"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="text-sm">新しいタブ</span>
                </Button>
                <Button
                  onClick={shareViaWhatsApp}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 justify-start h-10 bg-transparent"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-sm">WhatsApp</span>
                </Button>
                <Button
                  onClick={shareViaLine}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 justify-start h-10 bg-transparent"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-sm">LINE</span>
                </Button>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800 text-center">⚠️ このリンクは24時間後に自動的に無効になります</p>
            </div>
          </CardContent>

          {/* Actions */}
          <div className="flex-shrink-0 p-4 pt-0">
            <div className="flex gap-2">
              <Button onClick={onClose} variant="outline" className="flex-1 bg-transparent">
                閉じる
              </Button>
              <Button onClick={copyToClipboard} className="flex-1">
                {copySuccess ? "コピー済み" : "リンクをコピー"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
