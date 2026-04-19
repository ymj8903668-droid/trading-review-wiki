import { useState, useEffect } from "react"
import { open } from "@tauri-apps/plugin-dialog"
import i18n from "@/i18n"
import { useWikiStore } from "@/stores/wiki-store"
import { useReviewStore } from "@/stores/review-store"
import { useChatStore } from "@/stores/chat-store"
import { useResearchStore } from "@/stores/research-store"
import { listDirectory, openProject, getClipServerToken } from "@/commands/fs"
import { getLastProject, getRecentProjects, saveLastProject, loadLlmConfig, loadLanguage, loadSearchApiConfig, loadEmbeddingConfig, loadAppTheme } from "@/lib/project-store"
import { loadReviewItems, loadChatHistory } from "@/lib/persist"
import { setupAutoSave } from "@/lib/auto-save"
import { startClipWatcher } from "@/lib/clip-watcher"
import { AppLayout } from "@/components/layout/app-layout"
import { WelcomeScreen } from "@/components/project/welcome-screen"
import { CreateProjectDialog } from "@/components/project/create-project-dialog"
import type { WikiProject } from "@/types/wiki"

function App() {
  const project = useWikiStore((s) => s.project)
  const setProject = useWikiStore((s) => s.setProject)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const setChatExpanded = useWikiStore((s) => s.setChatExpanded)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [loading, setLoading] = useState(true)

  // Set up auto-save and clip watcher once on mount
  useEffect(() => {
    setupAutoSave()
    startClipWatcher()
  }, [])

  // Auto-open last project on startup
  useEffect(() => {
    async function init() {
      try {
        const savedConfig = await loadLlmConfig()
        if (savedConfig) {
          useWikiStore.getState().setLlmConfig(savedConfig)
        }
        const savedSearchConfig = await loadSearchApiConfig()
        if (savedSearchConfig) {
          useWikiStore.getState().setSearchApiConfig(savedSearchConfig)
        }
        const savedEmbeddingConfig = await loadEmbeddingConfig()
        if (savedEmbeddingConfig) {
          useWikiStore.getState().setEmbeddingConfig(savedEmbeddingConfig)
        }
        const savedLang = await loadLanguage()
        if (savedLang) {
          await i18n.changeLanguage(savedLang)
        }
        const savedTheme = await loadAppTheme()
        if (savedTheme) {
          useWikiStore.getState().setAppTheme(savedTheme)
        }
        const lastProject = await getLastProject()
        if (lastProject) {
          try {
            const proj = await openProject(lastProject.path)
            await handleProjectOpened(proj)
          } catch (err) {
            console.warn("[App] Failed to open last project:", err)
          }
        }
      } catch (err) {
        console.warn("[App] Init error:", err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function handleProjectOpened(proj: WikiProject) {
    // Clear project-scoped stores so we don't leak data from the previous project
    useReviewStore.getState().setItems([])
    useChatStore.getState().resetProjectState()
    useResearchStore.getState().clearTasks()
    useResearchStore.getState().setPanelOpen(false)

    setProject(proj)
    setFileTree([])
    setSelectedFile(null)
    setFileContent("")
    setActiveView("wiki")
    setChatExpanded(false)
    await saveLastProject(proj)

    // Restore ingest queue (resume interrupted tasks)
    import("@/lib/ingest-queue").then(({ restoreQueue }) => {
      restoreQueue(proj.path).catch((err) =>
        console.error("Failed to restore ingest queue:", err)
      )
    })
    // Notify local clip server of the current project + all recent projects
    getClipServerToken().then((token) => {
      fetch("http://127.0.0.1:19827/project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clip-Token": token,
        },
        body: JSON.stringify({ path: proj.path }),
      }).catch((err) => console.warn("[App] Failed to notify clip server project:", err))

      // Send all recent projects to clip server for extension project picker
      getRecentProjects().then((recents) => {
        const projects = recents.map((p) => ({ name: p.name, path: p.path }))
        fetch("http://127.0.0.1:19827/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Clip-Token": token,
          },
          body: JSON.stringify({ projects }),
        }).catch((err) => console.warn("[App] Failed to send recent projects to clip server:", err))
      }).catch((err) => console.warn("[App] Failed to get recent projects:", err))
    }).catch((err) => console.warn("[App] Failed to get clip server token:", err))
    try {
      const tree = await listDirectory(proj.path)
      setFileTree(tree)
    } catch (err) {
      console.error("Failed to load file tree:", err)
    }
    // Load persisted review items
    try {
      const savedReview = await loadReviewItems(proj.path)
      useReviewStore.getState().setItems(savedReview)
    } catch (err) {
      console.warn("[App] Failed to load review items:", err)
    }
    // Load persisted chat history
    try {
      const savedChat = await loadChatHistory(proj.path)
      useChatStore.getState().setConversations(savedChat.conversations)
      useChatStore.getState().setMessages(savedChat.messages)
      // Set most recent conversation as active
      const sorted = [...savedChat.conversations].sort((a, b) => b.updatedAt - a.updatedAt)
      if (sorted[0]) {
        useChatStore.getState().setActiveConversation(sorted[0].id)
      }
    } catch (err) {
      console.warn("[App] Failed to load chat history:", err)
    }
  }

  async function handleSelectRecent(proj: WikiProject) {
    try {
      const validated = await openProject(proj.path)
      await handleProjectOpened(validated)
    } catch (err) {
      window.alert(`Failed to open project: ${err}`)
    }
  }

  async function handleOpenProject() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Wiki Project",
    })
    if (!selected) return
    try {
      const proj = await openProject(selected)
      await handleProjectOpened(proj)
    } catch (err) {
      window.alert(`Failed to open project: ${err}`)
    }
  }

  function handleSwitchProject() {
    setProject(null)
    setFileTree([])
    setSelectedFile(null)
    setFileContent("")
    setActiveView("wiki")
    setChatExpanded(false)
    useReviewStore.getState().setItems([])
    useChatStore.getState().resetProjectState()
    useResearchStore.getState().clearTasks()
    useResearchStore.getState().setPanelOpen(false)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (!project) {
    return (
      <>
        <WelcomeScreen
          onCreateProject={() => setShowCreateDialog(true)}
          onOpenProject={handleOpenProject}
          onSelectProject={handleSelectRecent}
        />
        <CreateProjectDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onCreated={handleProjectOpened}
        />
      </>
    )
  }

  return (
    <>
      <AppLayout onSwitchProject={handleSwitchProject} />
      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleProjectOpened}
      />
    </>
  )
}

export default App
