<script setup lang="ts">
import { computed } from 'vue'
import CategoryChips from '@/components/doit/CategoryChips.vue'
import TaskNode from '@/components/doit/TaskNode.vue'
import { useTaskStore } from '@/stores/tasks'

const tasks = useTaskStore()
const showCat = computed(() => tasks.filter === 'all')
</script>

<template>
  <div class="page page-today">
    <CategoryChips />
    <template v-if="tasks.visibleNodes.length">
      <TaskNode
        v-for="node in tasks.visibleNodes"
        :key="node.uid"
        :node="node"
        :show-category="showCat"
      />
    </template>
    <div v-else class="breather">
      <div class="big">🌿</div>
      这个分类今天没有待办，歇口气～
    </div>
  </div>
</template>
