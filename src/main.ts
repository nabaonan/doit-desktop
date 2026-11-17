import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'

// 顺序重要：Tailwind（无 preflight）→ 原型令牌 → 原型布局 → 兼容兜底 → 浮层层级
import './styles/tailwind.css'
import './styles/tokens.css'
import './styles/prototype.css'
import './styles/base.css'
import './styles/layers.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
