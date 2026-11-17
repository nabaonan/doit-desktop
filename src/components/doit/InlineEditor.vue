<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

const props = defineProps<{ value: string }>()
const emit = defineEmits<{ commit: [value: string]; cancel: [] }>()
const draft = ref(props.value)
const input = ref<HTMLInputElement | null>(null)
let done = false
// 挂载时间戳：忽略挂载后极短窗口内的瞬时 blur。
// 原因：从右键菜单进编辑时，输入框 focus() 后会被「菜单关闭的焦点回抢」立刻触发一次 blur，
// 若第一时间就 @blur 提交，会表现为「点编辑进不了可编辑状态」（输入框一闪即退）。
const mountedAt = Date.now()

function commit(): void {
  if (done) return
  done = true
  emit('commit', draft.value)
}

/** 失焦提交：忽略挂载后极短窗口内的瞬时 blur（右键菜单关闭时的焦点回抢所致）。 */
function blurCommit(): void {
  if (done) return
  if (Date.now() - mountedAt < 200) return
  commit()
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
    @keydown="onKeydown" @blur="blurCommit" @click.stop
  />
</template>
