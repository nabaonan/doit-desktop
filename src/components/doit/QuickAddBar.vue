<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import CategoryDropdown from '@/components/ui/CategoryDropdown.vue'
import PriorityDropdown from '@/components/ui/PriorityDropdown.vue'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'
import type { Priority } from '@/domain/types'

const tasks = useTaskStore()
const ui = useUIStore()
const selected = ref(tasks.currentCategory)
// 新建待办默认优先级：与手机端一致为「普通」(2)
const priority = ref<Priority>(2)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)

watch(
  () => tasks.filter,
  (f) => { selected.value = f === 'all' ? tasks.visibleCategories[0]?.name ?? '' : f },
)

function submit(): void {
  const title = draft.value.trim()
  if (!title) { ui.notify('请输入待办内容'); input.value?.focus(); return }
  const category = selected.value && selected.value !== '全部'
    ? selected.value
    : (tasks.filter !== 'all' ? tasks.filter : tasks.visibleCategories[0]?.name ?? '')
  tasks.createTop(title, category, priority.value)
  draft.value = ''
  void nextTick(() => input.value?.focus())
}
</script>

<template>
  <div class="qa-bar">
    <PriorityDropdown v-model="priority" />
    <input
      id="qaInput" ref="input" v-model="draft" class="qa-input"
      placeholder="添加待办，回车快速创建…" autocomplete="off"
      @keydown.enter.prevent="submit"
    />
    <div id="qaDD" class="qa-dd">
      <CategoryDropdown v-model="selected" :options="tasks.visibleCategories" />
    </div>
  </div>
</template>
