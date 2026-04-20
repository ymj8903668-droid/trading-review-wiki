import type { LlmConfig } from "@/stores/wiki-store"
import { getProviderConfig } from "./llm-providers"

export type { ChatMessage } from "./llm-providers"

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

const DECODER = new TextDecoder()

function parseLines(chunk: Uint8Array, buffer: string): [string[], string] {
  const text = buffer + DECODER.decode(chunk, { stream: true })
  const lines = text.split("\n")
  const remaining = lines.pop() ?? ""
  return [lines, remaining]
}

export async function streamChat(
  config: LlmConfig,
  messages: import("./llm-providers").ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { onToken, onDone, onError } = callbacks
  const providerConfig = getProviderConfig(config)

  // Create a combined signal: user abort OR 15-minute timeout
  const timeoutMs = 15 * 60 * 1000 // 15 minutes — some models with large context need a long time
  let combinedSignal = signal
  let timeoutController: AbortController | undefined

  let abortListener: (() => void) | undefined
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  if (typeof AbortSignal.timeout === "function") {
    // Combine user signal with timeout
    timeoutController = new AbortController()
    timeoutId = setTimeout(() => timeoutController?.abort(), timeoutMs)

    if (signal) {
      abortListener = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutController?.abort()
      }
      signal.addEventListener("abort", abortListener)
    }
    combinedSignal = timeoutController.signal
  }

  let response: Response
  try {
    response = await fetch(providerConfig.url, {
      method: "POST",
      headers: providerConfig.headers,
      body: JSON.stringify(providerConfig.buildBody(messages)),
      signal: combinedSignal,
      // @ts-ignore — keepalive hint for Tauri webview
      keepalive: false,
    })
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message === "Load failed")) {
      // Check if it was user-initiated abort
      if (signal?.aborted) {
        onDone()
        return
      }
      // Otherwise it's a timeout or network error
      onError(new Error("Request timed out or network error. The model may need more time — try again or use a faster model."))
      return
    }
    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}: ${response.statusText}`
    try {
      const body = await response.text()
      if (body) errorDetail += ` — ${body}`
    } catch {
      // ignore body read failure
    }
    onError(new Error(errorDetail))
    return
  }

  if (!response.body) {
    onError(new Error("Response body is null"))
    return
  }

  const reader = response.body.getReader()
  let lineBuffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        if (lineBuffer.trim()) {
          const token = providerConfig.parseStream(lineBuffer.trim())
          if (token !== null) onToken(token)
        }
        break
      }

      const [lines, remaining] = parseLines(value, lineBuffer)
      lineBuffer = remaining

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const token = providerConfig.parseStream(trimmed)
        if (token !== null) onToken(token)
      }
    }

    onDone()
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || (signal?.aborted))) {
      onDone()
      return
    }
    if (err instanceof Error && err.message === "Load failed") {
      // WebKit network error during streaming — connection dropped
      onError(new Error("Connection lost during streaming. Try again."))
      return
    }
    onError(err instanceof Error ? err : new Error(String(err)))
  } finally {
    reader.releaseLock()
    if (timeoutId) clearTimeout(timeoutId)
    if (signal && abortListener) {
      signal.removeEventListener("abort", abortListener)
    }
  }
}
