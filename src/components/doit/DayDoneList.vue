<script setup lang="ts">
import TaskNode from './TaskNode.vue'
import { fmtMD } from '@/domain/date'
import type { TaskNode as TaskNodeType } from '@/domain/types'

defineProps<{ dateKey: string; tasks: TaskNodeType[] }>()
</script>

<template>
  <div class="cal-daylist">
    <h3>{{ fmtMD(new Date(`${dateKey}T00:00:00`)) }} 完成（{{ tasks.length }}）</h3>
    <template v-if="tasks.length">
      <TaskNode v-for="t in tasks" :key="t.uid" :node="t" :show-category="true" />
    </template>
    <div v-else class="breather" style="padding: 30px 20px">这一天没有完成的任务</div>
  </div>
</template>
