import { createRouter, createWebHashHistory } from 'vue-router'
import TodayView from '@/views/TodayView.vue'
import CalendarView from '@/views/CalendarView.vue'
import SettingsView from '@/views/SettingsView.vue'

/** hash history 兼容 Tauri 自定义协议，避免刷新后 404。 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/today', name: 'today', component: TodayView },
    // ECharts 体积较大：统计页按需加载，避免拖慢今日页首屏
    { path: '/stats', name: 'stats', component: () => import('@/views/StatsView.vue') },
    { path: '/calendar', name: 'calendar', component: CalendarView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/:pathMatch(.*)*', redirect: '/today' },
  ],
})
