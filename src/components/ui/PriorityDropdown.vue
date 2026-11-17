<script setup lang="ts">
import { ref } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { PRIORITY_META, PRIORITY_OPTIONS } from '@/constants/tokens'
import type { Priority } from '@/domain/types'

/** 底部快速添加优先级选择：选中后用优先级背景色 + 文字展示；下拉从高到低 + 最后「不设」（与手机端一致）。 */
const model = defineModel<Priority>({ default: 2 })
const open = ref(false)

function metaOf(v: Priority) {
  return PRIORITY_META[v] ?? PRIORITY_META[1]
}
</script>

<template>
  <DropdownMenuRoot v-model:open="open">
    <DropdownMenuTrigger as-child>
      <button class="qa-prio" :class="`prio-${metaOf(model).varName}`" type="button" title="选择优先级" aria-label="选择优先级">
        <span class="prio-dot" aria-hidden="true" />
        <span class="qa-prio-txt">{{ metaOf(model).label }}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="ui-dd-content qa-prio-menu" side="top" align="start" :side-offset="6">
        <DropdownMenuItem
          v-for="p in PRIORITY_OPTIONS"
          :key="p.value"
          class="qa-dd-opt"
          @click="model = p.value"
        >
          <span class="prio-dot" :style="{ background: `var(--prio-${p.varName})` }" aria-hidden="true" />
          <span class="lbl">{{ p.label }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
