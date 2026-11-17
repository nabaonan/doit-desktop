<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import Icon from './Icon.vue'

const props = defineProps<{
  modelValue: string
  options: Array<{ name: string; color: string }>
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
const open = ref(false)
watch(open, (v) => {
  const trigger = document.querySelector('.qa-dd')
  trigger?.classList.toggle('open', v)
})

function pick(name: string): void {
  emit('update:modelValue', name)
  open.value = false
}

function colorOf(name: string): string {
  return props.options.find((o) => o.name === name)?.color ?? 'transparent'
}
</script>

<template>
  <DropdownMenuRoot v-model:open="open">
    <DropdownMenuTrigger as-child>
      <button class="qa-dd-trigger" type="button">
        <span v-if="props.modelValue !== '全部'" class="qa-dd-dot" :style="{ background: colorOf(props.modelValue) }" />
        <span class="qa-dd-label">{{ props.modelValue }}</span>
        <Icon name="chevron" :size="14" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="ui-dd-content" side="top" align="end" :side-offset="6">
        <DropdownMenuItem class="qa-dd-opt" @click="pick('全部')">
          <span class="lbl">全部</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          v-for="opt in props.options"
          :key="opt.name"
          class="qa-dd-opt"
          @click="pick(opt.name)"
        >
          <span class="qa-dd-dot" :style="{ background: opt.color }" />
          <span class="lbl">{{ opt.name }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
