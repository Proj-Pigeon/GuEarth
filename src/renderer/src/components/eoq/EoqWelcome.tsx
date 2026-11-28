import { ArrowUpRightIcon, CompassIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'

const SUGGESTIONS = [
  {
    label: '找典型流水侵蚀地貌',
    description: '讲解成因并带我去看',
    prompt: '找典型流水侵蚀地貌并讲解成因'
  },
  { label: '珠穆朗玛峰在哪', description: '定位地名并飞行', prompt: '帮我找珠穆朗玛峰在哪' },
  { label: '黄土高原海拔多高', description: '查询地形高程', prompt: '黄土高原的平均海拔是多少？' },
  { label: '带我去马里亚纳海沟', description: '看看地球最深处', prompt: '带我去马里亚纳海沟看看' },
  { label: '帮我标记秦岭位置', description: '在地球上添加标记', prompt: '帮我标记秦岭的位置' },
  {
    label: '珠峰和乔戈里峰谁高',
    description: '对比两座高峰高程',
    prompt: '珠穆朗玛峰和乔戈里峰哪个更高？'
  },
  {
    label: '七彩丹霞怎么形成的',
    description: '地貌成因解读',
    prompt: '张掖七彩丹霞是怎么形成的？'
  },
  { label: '截取当前视角画面', description: '保存地球截图', prompt: '帮我截取当前视角的画面' }
] as const

const PAGE_SIZE = 3

export interface EoqWelcomeProps {
  onSelectPrompt: (prompt: string) => void
}

export function EoqWelcome({ onSelectPrompt }: EoqWelcomeProps) {
  const [offset, setOffset] = useState(0)

  const visibleSuggestions = Array.from(
    { length: PAGE_SIZE },
    (_, index) => SUGGESTIONS[(offset + index) % SUGGESTIONS.length]
  )

  return (
    <div className='flex flex-1 flex-col justify-center gap-6 px-1 py-6'>
      <div className='flex flex-col gap-2'>
        <div className='border-border bg-muted text-foreground/65 flex size-9 items-center justify-center rounded-xl border'>
          <CompassIcon className='size-5' />
        </div>
        <h3 className='text-foreground m-0 text-[18px] leading-7 font-semibold'>
          有什么地理问题想一起探索？
        </h3>
        <p className='text-muted-foreground m-0 text-[13px] leading-5'>
          我可以帮你定位地貌、查询地形高程、切换专题图层并讲解地理成因。
        </p>
      </div>

      <div className='flex flex-col gap-1'>
        {visibleSuggestions.map(item => (
          <button
            key={item.label}
            type='button'
            onClick={() => onSelectPrompt(item.prompt)}
            className='group border-border bg-background hover:border-foreground/20 hover:bg-muted/60 focus-visible:ring-primary flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none'
          >
            <span className='text-foreground min-w-0 flex-1 truncate text-[13px] leading-5'>
              <span className='font-semibold'>{item.label}</span>
              <span className='text-muted-foreground ml-2 text-[12px]'>{item.description}</span>
            </span>
            <ArrowUpRightIcon className='text-muted-foreground group-hover:text-foreground size-3.5 shrink-0 opacity-60 transition-[opacity,transform] duration-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 motion-reduce:transition-none' />
          </button>
        ))}

        <button
          type='button'
          onClick={() => setOffset(prev => (prev + PAGE_SIZE) % SUGGESTIONS.length)}
          className='text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-primary mt-1 inline-flex w-fit cursor-pointer items-center gap-1.5 self-end rounded-md border-0 bg-transparent px-2 py-1 text-[12px] leading-5 transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none'
        >
          <RefreshCwIcon className='size-3' />
          换一批
        </button>
      </div>
    </div>
  )
}

export default EoqWelcome
