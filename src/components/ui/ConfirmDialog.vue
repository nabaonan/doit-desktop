<script setup lang="ts">
import {
  AlertDialogAction,
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
          <AlertDialogAction class="btn accent dlg-danger" as-child><button @click="confirm">删除</button></AlertDialogAction>
        </div>
        <AlertDialogTitle class="sr-only">{{ props.title ?? '删除确认' }}</AlertDialogTitle>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
