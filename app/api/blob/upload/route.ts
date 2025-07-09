import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"

// ─────────────────────────────────────────────
//  クライアントの upload() から呼ばれるルート
//  必須要件
//   1. body     : HandleUploadBody
//   2. token    : BLOB_READ_WRITE_TOKEN を明示
//   3. 戻り値   : handleUpload() の Response をそのまま返す
// ─────────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody

  return handleUpload({
    body,
    request,
    // ✅ ここでトークンを渡すことで「client token を取得できない」問題を解消
    token: process.env.BLOB_READ_WRITE_TOKEN,
    // 必要に応じてアップロード制限
    onBeforeGenerateToken: async () => ({
      // 例: 受け入れる MIME を制限したい場合
      // allowedContentTypes: [ "image/*", "application/pdf" ],
    }),
    // アップロード完了時の通知 (任意)
    onUploadCompleted: async () => {
      /* DB 更新やログ出力を行う場合はここに記述 */
    },
  })
}
