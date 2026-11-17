import { watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

/** 主题只改 data-theme / data-skin / --done-anim，不重建 DOM。 */
export function useTheme() {
  const settings = useSettingsStore()
  watch(
    () => [settings.settings.theme, settings.settings.skin, settings.settings.progressColor],
    () => settings.applyThemeVars(),
    { immediate: true },
  )
  return { settings }
}
