<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  ContextMenuContent,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
} from 'reka-ui'
import Icon from './Icon.vue'
import type { MenuItem } from './types'

/**
 * Reka UI 的 Root / Trigger / Portal / Content 负责指针定位、碰撞翻转、Esc 与外部点击关闭；
 * 二级子菜单因原型要求「点击展开 + 同时只开一个 + 靠边翻左」，用受控行实现。
 */
const props = withDefaults(defineProps<{
  items: MenuItem[]
  openSub: string | null
  flipLeft: boolean
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  (e: 'select', key: string, value?: string): void
  (e: 'toggle-sub', item: MenuItem, event: MouseEvent): void
  (e: 'close'): void
}>()

const open = ref(false)
watch(open, (v) => { if (!v) emit('close') })

function choose(item: MenuItem): void {
  if (item.children) return
  open.value = false
  emit('select', item.key)
}

function chooseChild(parent: MenuItem, childKey: string): void {
  open.value = false
  emit('select', parent.key, childKey)
}
</script>

<template>
  <ContextMenuRoot v-model:open="open" :modal="false">
    <ContextMenuTrigger as-child :disabled="props.disabled">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="ui-menu-content doit-ctx" :collision-padding="8">
        <template v-for="item in props.items" :key="item.key">
          <div
            v-if="item.children"
            class="ctx-row has-sub"
            :class="{ open: props.openSub === item.key, left: props.flipLeft }"
            @click.stop="emit('toggle-sub', item, $event)"
          >
            <Icon :name="item.icon" :size="16" />
            <span>{{ item.label }}</span>
            <Icon name="chevron" :size="14" cls="caret" />
            <div v-show="props.openSub === item.key" class="submenu" @click.stop>
              <div
                v-for="child in item.children"
                :key="child.key"
                class="ctx-opt"
                :class="{ cur: child.current }"
                @click.stop="chooseChild(item, child.key)"
              >
                <span class="dot" :style="{ background: child.color ?? 'transparent' }" />
                <span>{{ child.label }}</span>
              </div>
            </div>
          </div>
          <div v-else class="ctx-row" :class="{ danger: item.danger }" @click.stop="choose(item)">
            <Icon :name="item.icon" :size="16" />
            <span>{{ item.label }}</span>
          </div>
        </template>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
