<script setup lang="ts">
import { computed } from 'vue'
import ContextMenu from '@/components/ui/ContextMenu.vue'
import Icon from '@/components/ui/Icon.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import CheckCircle from './CheckCircle.vue'
import MiniRing from './MiniRing.vue'
import PriorityTag from './PriorityTag.vue'
import CompletionFill from './CompletionFill.vue'
import InlineEditor from './InlineEditor.vue'
import InlineSubAdder from './InlineSubAdder.vue'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'
import { useContextMenu } from '@/composables/useContextMenu'
import { useHoldToComplete, isClickSuppressed } from '@/composables/useHoldToComplete'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { useInlineSub } from '@/composables/useInlineSub'
import { liveSubs, subProgress } from '@/domain/taskTree'
import type { MenuItem } from '@/components/ui/types'
import type { Priority, TaskNode } from '@/domain/types'

const props = withDefaults(
  defineProps<{ node: TaskNode; isSub?: boolean; showCategory?: boolean }>(),
  { isSub: false, showCategory: false },
)

const tasks = useTaskStore()
const ui = useUIStore()
const menu = useContextMenu(() => props.node)
const inlineEdit = useInlineEdit()
const inlineSub = useInlineSub()
const hold = useHoldToComplete({
  getNode: () => props.node,
  onComplete: (uid) => tasks.toggleDone(uid),
  notify: (msg) => ui.notify(msg),
})

const kids = computed(() => liveSubs(props.node))
const hasSubs = computed(() => kids.value.length > 0)
const editing = computed(() => tasks.inlineEditFor === props.node.uid)
const adding = computed(() => tasks.inlineSubFor === props.node.uid)
/** 添加子任务时强制展开：否则折叠卡片的 .subtasks 是 display:none，输入框不可见（等价于“添加没反应”）。 */
const expanded = computed(() => adding.value || (hasSubs.value && !tasks.collapsed[props.node.uid]))
const ring = computed(() => subProgress(props.node))
const cat = computed(() => tasks.categories.find((c) => c.name === props.node.category))
const showCat = computed(() => !props.isSub && props.showCategory && Boolean(cat.value))

function onCardClick(e: MouseEvent): void {
  if (isClickSuppressed()) return
  const t = e.target as HTMLElement
  if (t.closest('.check, .exp-btn, .inline-edit-input, .inline-sub, .ctx-row, .submenu')) return
  if (editing.value) { inlineEdit.commit(props.node.uid, props.node.title); return }
  if (!hasSubs.value) return
  tasks.toggleCollapsed(props.node.uid)
}

function onCheck(): void {
  if (!hasSubs.value) tasks.toggleDone(props.node.uid)
}

function onExpand(e: MouseEvent): void {
  e.stopPropagation()
  tasks.toggleCollapsed(props.node.uid)
}

function onHoldDown(e: PointerEvent): void {
  const t = e.target as HTMLElement
  if (t.closest('.check-dot, .exp-btn, .inline-edit-input, .inline-sub')) return
  hold.onPointerDown(e)
}

function onSelect(key: string, value?: string): void {
  if (key === 'edit') inlineEdit.start(props.node.uid)
  else if (key === 'sub') inlineSub.start(props.node.uid)
  else if (key === 'prio' && value !== undefined) tasks.setPriority(props.node.uid, Number(value) as Priority)
  else if (key === 'cat' && value !== undefined) tasks.setCategory(props.node.uid, value)
  else if (key === 'del') ui.askDelete(props.node.uid)
}

function onSubToggle(item: MenuItem, event: MouseEvent): void {
  void menu.toggleSub(item, event)
}
</script>

<template>
  <div class="task-group">
    <ContextMenu
      :items="menu.items.value"
      :open-sub="menu.openSub.value"
      :flip-left="menu.flipLeft.value"
      @toggle-sub="onSubToggle"
      @select="onSelect"
      @close="menu.closeAll"
    >
      <div
        :class="[props.isSub ? 'subtask' : 'task', {
          done: props.node.done,
          editing: editing,
          'has-subs': hasSubs,
        }]"
        @click="onCardClick"
        @pointerdown="onHoldDown"
        @pointerup="hold.onPointerUp"
        @pointercancel="hold.onPointerCancel"
        @pointerleave="hold.onPointerUp"
      >
        <CompletionFill :progress="hold.progress.value" />
        <div class="task-row">
          <CheckCircle
            :done="props.node.done"
            :readonly="hasSubs"
            :title="hasSubs ? '含子任务：完成状态由子任务决定' : '点击完成'"
            @toggle="onCheck"
          />
          <div class="task-body">
            <InlineEditor
              v-if="editing"
              :value="props.node.title"
              @commit="(v) => inlineEdit.commit(props.node.uid, v)"
              @cancel="inlineEdit.cancel"
            />
            <UiTooltip v-else-if="hasSubs" text="单击卡片或右侧按钮展开 / 收起子任务">
              <div class="task-title" :class="{ done: props.node.done }">{{ props.node.title }}</div>
            </UiTooltip>
            <div v-else class="task-title" :class="{ done: props.node.done }">{{ props.node.title }}</div>
          </div>
          <div class="task-side">
            <span v-if="showCat" class="cat-tag side-cat">
              <span class="cat-dot" :style="{ background: cat?.color }" />{{ cat?.name }}
            </span>
            <PriorityTag :value="props.node.priority" />
            <MiniRing v-if="ring" :pct="ring.pct" />
            <UiTooltip v-if="hasSubs" text="展开/收起子任务">
              <button class="exp-btn" :class="{ open: expanded }" @click="onExpand">
                <Icon name="chevron" :size="16" />
              </button>
            </UiTooltip>
          </div>
        </div>
      </div>
    </ContextMenu>

    <div v-if="hasSubs || adding" class="subtasks" :class="{ open: expanded }">
      <InlineSubAdder
        v-if="adding && !props.node.done"
        @commit="(v) => inlineSub.commit(props.node.uid, v)"
        @cancel="inlineSub.cancel"
      />
      <TaskNode
        v-for="child in kids"
        :key="child.uid"
        :node="child"
        :is-sub="true"
        :show-category="false"
      />
    </div>
  </div>
</template>
