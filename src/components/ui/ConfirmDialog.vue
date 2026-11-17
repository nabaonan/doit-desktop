<script setup lang="ts">
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'

const props = defineProps<{ open: boolean; title?: string; message: string }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'confirm'): void }>()

function confirm(): void {
  emit('update:open', false)
  emit('confirm')
}
</script>

<template>
  <AlertDialogRoot :open="props.open" @update:open="(v) => emit('update:open', v)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="dlg-overlay" />
      <AlertDialogContent class="dlg-content">
        <div class="modal-head"><b>{{ props.title ?? '删除确认' }}</b></div>
        <div class="modal-body"><AlertDialogDescription class="dlg-desc">{{ props.message }}</AlertDialogDescription></div>
        <div class="modal-foot">
          <AlertDialogCancel class="btn ghost" as-child><button>取消</button></AlertDialogCancel>
          <!-- 确认按钮不用 AlertDialogAction：reka 的 as-child / 事件转接会吞掉自定义 click
               （出现“只关弹窗不删除”）。这里用普通 button 直接跑 confirm()，
               confirm 内部关闭弹窗并执行删除，行为完全可控。 -->
          <button type="button" class="btn accent dlg-danger" @click="confirm">删除</button>
        </div>
        <AlertDialogTitle class="sr-only">{{ props.title ?? '删除确认' }}</AlertDialogTitle>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
