<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

const emit = defineEmits<{ commit: [value: string]; cancel: [] }>()
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
let done = false

function commit(): void {
  if (done) return
  done = true
  emit('commit', draft.value)
}

function cancel(): void {
  if (done) return
  done = true
  emit('cancel')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') { e.preventDefault(); commit() }
  else if (e.key === 'Escape') { e.preventDefault(); cancel() }
}

onMounted(async () => {
  await nextTick()
  input.value?.focus()
})
</script>

<template>
  <div class="subtask inline-sub">
    <div class="inline-sub-row">
      <span class="inline-sub-dot" />
      <input
        id="inlineSubInput" ref="input" v-model="draft" class="inline-sub-input"
        placeholder="添加子任务，回车提交…" autocomplete="off"
        @keydown="onKeydown" @click.stop
      />
    </div>
    <p class="inline-sub-hint">回车提交 · Esc 取消 · 继承父任务分类与优先级</p>
  </div>
</template>
