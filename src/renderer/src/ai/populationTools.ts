import { useAiStore } from '@renderer/stores/ai'
import {
  POPULATION_CENSUS_YEAR,
  densityOf,
  densityRank,
  huSideLabelOf,
  nationalPopulation,
  populationRank,
  provincePopulation,
  provinceSummary,
  urbanizationSeries
} from '@renderer/thematic/populationCensus'

export function registerPopulationTools(): void {
  const aiStore = useAiStore.getState()
  const provinceNames = provincePopulation.map(province => province.name)
  const national = nationalPopulation[nationalPopulation.length - 1]
  const latestUrbanization = urbanizationSeries[urbanizationSeries.length - 1]

  aiStore.registerTool({
    label: '省级人口查询',
    definition: {
      name: 'query_population',
      description:
        '查询中国省级行政区的人口统计数据（2020年第七次全国人口普查）：常住人口、陆域面积、人口密度及全国排名、城镇化率、位于胡焕庸线哪一侧。province 传「全国」返回全国人口与城镇化率。',
      parameters: {
        type: 'object',
        properties: {
          province: {
            type: 'string',
            description: '省级行政区全称（如「广东省」）或「全国」',
            enum: ['全国', ...provinceNames]
          },
          metric: {
            type: 'string',
            description: '用户最关注的指标',
            enum: ['population', 'density', 'urbanization']
          }
        },
        required: ['province'],
        additionalProperties: false
      }
    },
    execute: async args => {
      const name = typeof args.province === 'string' ? args.province.trim() : ''
      if (!name) return { error: '需要 province 参数，省级行政区全称或「全国」' }
      if (name === '全国') {
        return {
          province: '全国',
          year: POPULATION_CENSUS_YEAR,
          populationWan: national.populationWan,
          mainland31Wan: 140978,
          urbanizationPct: latestUrbanization[1],
          urbanizationYear: latestUrbanization[0],
          note: `全国人口 ${national.populationWan} 万为大陆口径（含现役军人）；大陆31个省区市合计约140978万。城镇化率 ${latestUrbanization[1]}% 为常住人口口径（${latestUrbanization[0]} 年）。`
        }
      }
      const province = provincePopulation.find(item => item.name === name)
      if (!province)
        return {
          error: `未收录省级行政区「${name}」，请使用枚举中的全称`,
          available: provinceNames
        }
      const density = Math.round(densityOf(province) * 10) / 10
      return {
        province: province.name,
        year: POPULATION_CENSUS_YEAR,
        populationWan: province.populationWan,
        areaWanKm2: province.areaWanKm2,
        densityPerKm2: density,
        populationRank: populationRank(province.name),
        densityRank: densityRank(province.name),
        urbanizationPct: province.urbanizationPct,
        huSide: province.huSide,
        huSideLabel: huSideLabelOf(province.huSide),
        summary: provinceSummary(province.name)
      }
    }
  })
}
