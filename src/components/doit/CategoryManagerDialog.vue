<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { CATEGORY_SWATCHES } from '@/constants/tokens'
import { normalizeCategoryColor } from '@/domain/color'
import { commitCategories, editCategory, useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'

/** 一行可编辑的分类草稿；key 仅用于本地稳定渲染，不写入快照。 */
interface DraftRow {
  key: number
  name: string
  color: string
}

/** editName 非空时为「编辑分类」模式：预填该分类并原地更新，否则为「添加分类」。 */
const props = withDefaults(defineProps<{ open: boolean; editName?: string | null }>(), { editName: null })
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const tasks = useTaskStore()
const ui = useUIStore()
// 用 storeToRefs 拿到 store 一直存在的响应式字段；写入走模块级 commitCategories / editCategory，
// 不依赖 store 实例上可能缺失的新增 action（兼容 HMR 保留的旧实例）。
const { categories, root, snapshot, revision, deviceId, dirty } = storeToRefs(tasks)
const catCtx = { categories, root, snapshot, revision, deviceId, dirty }

let seq = 0
const rows = ref<DraftRow[]>([])
/** 当前展开颜色气泡的行 key；null 表示全部收起（默认不展开） */
const openPaletteFor = ref<number | null>(null)
/** 保存中标记，避免重复点击导致多次写入 */
const saving = ref(false)

function makeRow(): DraftRow {
  return { key: seq++, name: '', color: CATEGORY_SWATCHES[rows.value.length % CATEGORY_SWATCHES.length].value }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      const editing = props.editName ? categories.value.find((c) => c.name === props.editName) : undefined
      rows.value = editing
        ? [{ key: seq++, name: editing.name, color: normalizeCategoryColor(editing.color) }]
        : [makeRow()]
      openPaletteFor.value = null
      saving.value = false
      // 用 querySelector 聚焦第一行，避免函数式 ref 写入响应式数组
      void nextTick(() => document.querySelector<HTMLInputElement>('.cat-dialog .cat-name-input')?.focus())
    }
  },
)

function addRow(): void {
  rows.value.push(makeRow())
  openPaletteFor.value = null
  void nextTick(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('.cat-dialog .cat-name-input')
    inputs[inputs.length - 1]?.focus()
  })
}

function removeRow(key: number): void {
  rows.value = rows.value.filter((r) => r.key !== key)
  if (openPaletteFor.value === key) openPaletteFor.value = null
}

/** 点击颜色入口：仅切换当前行气泡，其他行收起。 */
function togglePalette(key: number): void {
  openPaletteFor.value = openPaletteFor.value === key ? null : key
}

function pickColor(row: DraftRow, color: string): void {
  row.color = color
  openPaletteFor.value = null
}

/** 点击颜色入口/气泡以外区域时收起气泡。 */
function onDocumentClick(e: MouseEvent): void {
  if (openPaletteFor.value === null) return
  const target = e.target as HTMLElement
  if (!target.closest('.cat-color-anchor')) openPaletteFor.value = null
}

onMounted(() => document.addEventListener('click', onDocumentClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick, true))

function close(): void {
  emit('update:open', false)
}

/**
 * 保存：完全从 DOM 读取每行数据，规避两类 WebKit 陷阱：
 *  1) 中文输入法 composition 未提交时 v-model 未同步 → 读 input.value;
 *  2) 内联函数式 ref 写入响应式数组在 WebKit 下可能触发更新循环异常 → 不再用 ref 收集输入框。
 * 每行用 data-cat-key 关联草稿，颜色从 trigger 的 data-color 读取（这是选色后的真实值）。
 */
function save(): void {
  if (saving.value) return
  saving.value = true
  try {
    const rowEls = document.querySelectorAll<HTMLElement>('.cat-dialog .cat-edit-row')
    const inputs: Array<{ name: string; color: string }> = []
    rowEls.forEach((el) => {
      const key = Number(el.dataset.catKey)
      const name = (el.querySelector<HTMLInputElement>('.cat-name-input')?.value ?? '').trim()
      const color = el.querySelector<HTMLElement>('.cat-color-trigger')?.dataset.color ?? ''
      if (!name) return
      const draft = rows.value.find((r) => r.key === key)
      inputs.push({ name, color: color || draft?.color || CATEGORY_SWATCHES[0].value })
    })

    if (!inputs.length) {
      ui.notify('请至少填写一个分类名称')
      return
    }

    if (props.editName) {
      const next = inputs[0]
      const res = editCategory(catCtx, props.editName, next.name, next.color)
      if (!res.ok) {
        ui.notify(res.reason ?? '保存失败')
        return
      }
      // 若当前正筛着被改名的分类，同步切到新名，避免筛选落空
      if (next.name !== props.editName && tasks.filter === props.editName) tasks.setFilter(next.name)
      close()
      ui.notify(`已保存分类「${next.name}」`)
      return
    }

    const added = commitCategories(catCtx, inputs)
    close()
    if (added > 0) ui.notify(`已保存 ${added} 个分类`)
    else ui.notify('分类已存在，未重复添加')
  } catch (e) {
    // 暴露真实错误，避免只提示“保存失败”无法定位
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[CategoryManagerDialog] save failed:', e)
    ui.notify(`保存失败：${msg}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="(v) => emit('update:open', v)">
    <DialogPortal>
      <DialogOverlay class="dlg-overlay" />
      <DialogContent class="dlg-content cat-dialog">
        <div class="modal-head"><b>{{ props.editName ? '编辑分类' : '添加分类' }}</b></div>
        <DialogDescription class="cat-dialog-desc">{{ props.editName
          ? '修改名称或颜色后保存，属于该分类的待办会同步更新。'
          : '可一次添加多个分类，点颜色圆点选色，保存后生效。' }}</DialogDescription>
        <div class="modal-body cat-dialog-body">
          <div v-for="row in rows" :key="row.key" class="cat-edit-row" :data-cat-key="row.key">
            <!-- 颜色选择器入口：默认只显示当前颜色的圆点，点击才弹气泡展示全部颜色 -->
            <div class="cat-color-anchor">
              <button
                type="button"
                class="cat-color-trigger"
                :style="{ background: row.color }"
                :data-color="row.color"
                :title="'选择颜色：' + row.color"
                :aria-label="'选择分类颜色，当前 ' + row.color"
                @click="togglePalette(row.key)"
              />
              <div v-if="openPaletteFor === row.key" class="cat-palette" @click.stop>
                <button
                  v-for="swatch in CATEGORY_SWATCHES"
                  :key="swatch.value"
                  type="button"
                  class="cat-swatch"
                  :class="{ selected: row.color === swatch.value }"
                  :style="{ background: swatch.value }"
                  :title="swatch.name"
                  :aria-label="swatch.name"
                  :aria-pressed="row.color === swatch.value"
                  @click="pickColor(row, swatch.value)"
                />
              </div>
            </div>
            <input
              v-model="row.name"
              class="cat-name-input"
              type="text"
              maxlength="12"
              placeholder="分类名称"
              @keydown.enter="save"
            />
            <button v-if="!props.editName" type="button" class="cat-row-del" title="移除此行" @click="removeRow(row.key)">×</button>
          </div>
          <button v-if="!props.editName" type="button" class="cat-add-row" @click="addRow">+ 再加一个</button>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn ghost" @click="close">取消</button>
          <button type="button" class="btn accent" :disabled="saving" @click="save">保存</button>
        </div>
        <DialogTitle class="sr-only">{{ props.editName ? '编辑分类' : '添加分类' }}</DialogTitle>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
