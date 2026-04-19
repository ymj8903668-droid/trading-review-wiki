export type AppTheme = "default" | "midnight" | "forest" | "plum" | "amber"

export interface ThemeConfig {
  key: AppTheme
  label: string
  labelEn: string
  description: string
  descriptionEn: string
  previewColor: string
}

export const THEME_PRESETS: ThemeConfig[] = [
  {
    key: "default",
    label: "默认",
    labelEn: "Default",
    description: "经典暗色主题",
    descriptionEn: "Classic dark theme",
    previewColor: "#1a1a1a",
  },
  {
    key: "midnight",
    label: "午夜蓝",
    labelEn: "Midnight Blue",
    description: "深蓝调，经典交易终端风格",
    descriptionEn: "Deep blue, classic trading terminal feel",
    previewColor: "#0f1729",
  },
  {
    key: "forest",
    label: "墨绿",
    labelEn: "Forest Green",
    description: "护眼墨绿，长时间盯盘更舒适",
    descriptionEn: "Eye-care green for long sessions",
    previewColor: "#0a1f14",
  },
  {
    key: "plum",
    label: "深紫",
    labelEn: "Deep Plum",
    description: "优雅紫调，沉稳大气",
    descriptionEn: "Sophisticated purple tone",
    previewColor: "#1a0f29",
  },
  {
    key: "amber",
    label: "琥珀",
    labelEn: "Warm Amber",
    description: "暖琥珀色，温馨夜间氛围",
    descriptionEn: "Warm amber, cozy evening vibe",
    previewColor: "#1f180a",
  },
]

export function getThemeLabel(theme: AppTheme, lang: string = "zh"): string {
  const preset = THEME_PRESETS.find((t) => t.key === theme)
  if (!preset) return theme
  return lang === "zh" ? preset.label : preset.labelEn
}
