<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

const props = defineProps<{ value: string }>()
const emit = defineEmits<{ commit: [value: string]; cancel: [] }>()
const draft = ref(props.value)
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
  input.value?.select()
})
</script>

<template>
  <input
    id="inlineEditInput" ref="input" v-model="draft" class="inline-edit-input"
    placeholder="输入任务标题，回车保存…" autocomplete="off"
    @keydown="onKeydown" @blur="commit" @click.stop
  />
</template>
