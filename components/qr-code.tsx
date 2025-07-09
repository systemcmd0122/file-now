"use client"

import { useEffect, useRef } from "react"

interface QRCodeProps {
  text: string
  size?: number
  containerId: string
}

export function QRCode({ text, size = 150, containerId }: QRCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const generateQR = async () => {
      try {
        // Dynamic import of QR code library
        const QRCode = (await import("qrcode")).default

        const container = document.getElementById(containerId)
        if (container) {
          container.innerHTML = ""

          const canvas = document.createElement("canvas")
          await QRCode.toCanvas(canvas, text, {
            width: size,
            margin: 1,
            color: {
              dark: "#000000",
              light: "#FFFFFF",
            },
          })

          container.appendChild(canvas)
        }
      } catch (error) {
        console.error("QR Code generation failed:", error)
        // Fallback: show text link if QR generation fails
        const container = document.getElementById(containerId)
        if (container) {
          container.innerHTML = `<div class="text-xs text-gray-500 p-4">QRコードを生成できませんでした</div>`
        }
      }
    }

    if (text) {
      generateQR()
    }
  }, [text, size, containerId])

  return null
}
