import { useReviewStore } from "@/stores/review-store"
import { useChatStore } from "@/stores/chat-store"
import { useWikiStore } from "@/stores/wiki-store"
import { saveReviewItems, saveChatHistory } from "./persist"

let reviewTimer: ReturnType<typeof setTimeout> | null = null
let chatTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeReview: (() => void) | null = null
let unsubscribeChat: (() => void) | null = null

export function setupAutoSave(): void {
  if (unsubscribeReview || unsubscribeChat) return // Already set up

  // Auto-save review items (debounced 1s)
  unsubscribeReview = useReviewStore.subscribe((state) => {
    if (reviewTimer) clearTimeout(reviewTimer)
    reviewTimer = setTimeout(() => {
      const project = useWikiStore.getState().project
      if (project) {
        saveReviewItems(project.path, state.items).catch((err) => console.warn("Auto-save review failed:", err))
      }
    }, 1000)
  })

  // Auto-save chat conversations and messages (debounced 2s, skip during streaming)
  unsubscribeChat = useChatStore.subscribe((state) => {
    if (state.isStreaming) return
    if (chatTimer) clearTimeout(chatTimer)
    chatTimer = setTimeout(() => {
      const project = useWikiStore.getState().project
      if (project) {
        saveChatHistory(project.path, state.conversations, state.messages).catch((err) => console.warn("Auto-save chat failed:", err))
      }
    }, 2000)
  })
}

export function teardownAutoSave(): void {
  if (reviewTimer) {
    clearTimeout(reviewTimer)
    reviewTimer = null
  }
  if (chatTimer) {
    clearTimeout(chatTimer)
    chatTimer = null
  }
  unsubscribeReview?.()
  unsubscribeReview = null
  unsubscribeChat?.()
  unsubscribeChat = null
}
