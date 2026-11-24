<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle,
  ScrollAreaCorner, ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport,
} from 'reka-ui'
import CategoryManagerDialog from '@/components/doit/CategoryManagerDialog.vue'
import ContextMenu from '@/components/ui/ContextMenu.vue'
import { categoryTint, normalizeCategoryColor } from '@/domain/color'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'
import type { Category } from '@/domain/types'
import type { MenuItem } from '@/components/ui/types'

const tasks = useTaskStore()
const ui = useUIStore()
const showManager = ref(false)
// 待删除的分类名：非空即打开删除确认弹框
const pendingDelete = ref<string | null>(null)
// 待编辑的分类名：非空即打开编辑弹框
const editingName = ref<string | null>(null)
const showEditor = ref(false)

/** 分类右键菜单：编辑 / 删除（分类名通过闭包带入 handler）。 */
const catMenuItems: MenuItem[] = [
  { key: 'edit', label: '编辑分类', icon: 'pencil' },
  { key: 'del', label: '删除分类', icon: 'trash', danger: true },
]

function onCatAction(c: Category, key: string): void {
  if (key === 'edit') {
    editingName.value = c.name
    showEditor.value = true
  } else if (key === 'del') {
    askDelete(c)
  }
}

/** 删除提示：分类下有任务时明确告知数量影响，否则普通确认。 */
const deleteMsg = computed(() => {
  const name = pendingDelete.value
  if (!name) return ''
  const count = tasks.categoryTaskCount(name)
  return count > 0
    ? `分类「${name}」下还有 ${count} 个任务，删除后这些任务将变为「无分类」。确定删除该分类吗？`
    : `确定删除分类「${name}」吗？`
})

function select(name: string): void {
  tasks.setFilter(name)
}

/** 兼容历史空色值：分类必须有可见颜色，否则胶囊圆点 / 卡片标签会退化成灰字。 */
function catColor(c: Category): string {
  return normalizeCategoryColor(c.color)
}

function activeStyle(c: Category): Record<string, string> | undefined {
  if (tasks.filter !== c.name) return undefined
  // 选中态不加投影：filterbar 横向滚动容器会裁掉投影，纯色底 + 白字已足够（与 .chip.active 的 CSS 一致）
  const color = catColor(c)
  return { background: color, 'border-color': color, color: '#fff' }
}

/**
 * 分类待办数 tag：未选中态用分类色文字 + 分类色 14% 淡底（与手机端一致）；
 * 选中态 chip 已是分类纯色底，数字反白。
 * 底色用 rgba() 而非 color-mix，避免旧版 WebView 解析失败导致背景丢失。
 */
function countStyle(c: Category, active: boolean): Record<string, string> {
  if (active) return { color: '#fff', background: 'rgba(255,255,255,.25)' }
  const color = catColor(c)
  return { color, background: categoryTint(color, 0.14) }
}

/** 右键菜单的「删除分类」：打开确认框（分类下有任务会自动提示受影响数量）。 */
function askDelete(c: Category): void {
  pendingDelete.value = c.name
}

function doDelete(): void {
  const name = pendingDelete.value
  if (!name) return
  const affected = tasks.removeCategory(name)
  pendingDelete.value = null
  ui.notify(affected > 0 ? `已删除分类「${name}」，${affected} 个任务变为无分类` : `已删除分类「${name}」`)
}
</script>

<template>
  <div class="filter-sticky">
    <!-- 分类横向滚动用 Reka ScrollArea：自定义滚动条与页面纵向滚动条统一样式（.ui-scroll-*） -->
    <ScrollAreaRoot class="ui-scroll-root ui-scroll-root--h filter-scroll">
      <ScrollAreaViewport class="ui-scroll-viewport">
        <div class="filterbar">
          <div class="chip" :class="{ active: tasks.filter === 'all' }" @click="select('all')">全部</div>
          <ContextMenu
            v-for="c in tasks.visibleCategories"
            :key="c.name"
            :items="catMenuItems"
            :open-sub="null"
            :flip-left="false"
            @select="(key) => onCatAction(c, key)"
          >
            <div
              class="chip"
              :class="{ active: tasks.filter === c.name }"
              :style="activeStyle(c)"
              :title="`右键编辑或删除分类「${c.name}」`"
              @click="select(c.name)"
            >
              <span v-if="tasks.filter !== c.name" class="cat-dot" :style="{ background: catColor(c) }" />
              {{ c.name }}
              <span
                class="chip-count"
                :style="countStyle(c, tasks.filter === c.name)"
              >{{ tasks.categoryOpenCount(c.name) }}</span>
            </div>
          </ContextMenu>
          <button type="button" class="chip chip-add" title="添加分类" @click="showManager = true">
            <span class="chip-add-plus">+</span> 添加分类
          </button>
        </div>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar orientation="horizontal" class="ui-scrollbar ui-scrollbar--h" force-mount>
        <ScrollAreaThumb class="ui-scroll-thumb" />
      </ScrollAreaScrollbar>
      <ScrollAreaCorner class="ui-scroll-corner" />
    </ScrollAreaRoot>
    <CategoryManagerDialog v-model:open="showManager" />
    <!-- 右键编辑分类：复用添加弹框，传入 editName 进入改名/改色模式 -->
    <CategoryManagerDialog v-model:open="showEditor" :edit-name="editingName" />
    <!-- 右键删除分类确认：有任务时给出受影响提示 -->
    <AlertDialogRoot :open="pendingDelete !== null" @update:open="(v) => { if (!v) pendingDelete = null }">
      <AlertDialogPortal>
        <AlertDialogOverlay class="dlg-overlay" />
        <AlertDialogContent class="dlg-content">
          <div class="modal-head"><b>删除分类</b></div>
          <div class="modal-body"><AlertDialogDescription class="dlg-desc">{{ deleteMsg }}</AlertDialogDescription></div>
          <div class="modal-foot">
            <AlertDialogCancel class="btn ghost" as-child><button>取消</button></AlertDialogCancel>
            <!-- 同 ConfirmDialog：确认按钮用普通 button 直接跑 doDelete（内部关闭 + 删除），
                 规避 AlertDialogAction 的 as-child 事件转接吞掉 click 的问题 -->
            <button type="button" class="btn accent dlg-danger" @click="doDelete">删除</button>
          </div>
          <AlertDialogTitle class="sr-only">删除分类</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  </div>
</template>
