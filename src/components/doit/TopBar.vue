<script setup lang="ts">
import Brand from './Brand.vue'
import NavTabs from './NavTabs.vue'
import StatusPills from './StatusPills.vue'
import type { PageId } from '@/domain/types'

defineProps<{ page: PageId }>()
</script>

<template>
  <header id="topbar">
    <div class="tb-inner">
      <Brand />
      <NavTabs :page="page" />
      <StatusPills :page="page" />
    </div>
  </header>
</template>
