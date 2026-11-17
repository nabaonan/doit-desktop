/** ECharts 按需注册：只引入统计页用到的图表与组件，避免整包体积。 */
import { use } from 'echarts/core'
import { HeatmapChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([
  HeatmapChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
])
