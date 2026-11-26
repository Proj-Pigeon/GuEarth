import { Button, DropdownMenu, Separator, Tooltip } from '@renderer/components/ui'
import type { DropdownMenuEntry } from '@renderer/components/ui'
import { useFlightStopsStore } from '@renderer/stores/flightStops'
import type { FlyToExecutor } from '@renderer/stores/flightStops'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import styles from './FlightStopSwitcher.module.css'

export interface FlightStopSwitcherProps {
  flyTo: FlyToExecutor
}

export function FlightStopSwitcher({ flyTo }: FlightStopSwitcherProps) {
  const stops = useFlightStopsStore(state => state.stops)
  const activeIndex = useFlightStopsStore(state => state.activeIndex)
  const total = useFlightStopsStore(state => state.total)
  const currentStop = useFlightStopsStore(state => state.currentStop)
  const visible = useFlightStopsStore(state => state.visible)
  const canPrev = useFlightStopsStore(state => state.canPrev)
  const canNext = useFlightStopsStore(state => state.canNext)
  const prev = useFlightStopsStore(state => state.prev)
  const next = useFlightStopsStore(state => state.next)
  const goTo = useFlightStopsStore(state => state.goTo)
  const dismiss = useFlightStopsStore(state => state.dismiss)

  const [menuOpen, setMenuOpen] = useState(false)

  if (!visible) {
    return null
  }

  function handlePrev(): void {
    setMenuOpen(false)
    void prev(flyTo)
  }

  function handleNext(): void {
    setMenuOpen(false)
    void next(flyTo)
  }

  function handleSelect(key: string): void {
    const index = Number(key)
    setMenuOpen(false)
    if (Number.isInteger(index)) {
      void goTo(index, flyTo)
    }
  }

  function handleClose(): void {
    setMenuOpen(false)
    dismiss()
  }

  const menuItems: DropdownMenuEntry[] = stops.map((stop, index) => ({
    key: String(index),
    label: (
      <div className={styles.flightSwitcherMenuRow}>
        <span
          className={
            index === activeIndex
              ? `${styles.flightSwitcherMenuIndex} ${styles.flightSwitcherMenuIndexActive}`
              : styles.flightSwitcherMenuIndex
          }
        >
          {index + 1}
        </span>
        <div className={styles.flightSwitcherMenuContent}>
          <div className={styles.flightSwitcherMenuName}>{stop.name}</div>
          {stop.note ? <div className={styles.flightSwitcherMenuNote}>{stop.note}</div> : null}
        </div>
      </div>
    )
  }))

  return (
    <div className={styles.flightSwitcher} role='region' aria-label='飞行地点切换'>
      <Tooltip title='上一个地点' placement='top'>
        <Button
          variant='ghost'
          className={styles.switcherBtn}
          disabled={!canPrev}
          aria-label='上一个地点'
          icon={<ChevronLeftIcon className='size-4' />}
          onClick={handlePrev}
        />
      </Tooltip>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        placement='topLeft'
        menuClassName={styles.flightSwitcherMenu}
        selectedKeys={[String(activeIndex)]}
        items={menuItems}
        onSelect={handleSelect}
      >
        <Button
          variant='ghost'
          className={styles.switcherTrigger}
          aria-label={`当前第 ${activeIndex + 1} 个地点，共 ${total} 个：${currentStop?.name ?? ''}，${menuOpen ? '点击收起地点列表' : '点击展开地点列表'}`}
          aria-haspopup='menu'
          aria-expanded={menuOpen}
        >
          <span className={styles.switcherCounter}>
            {activeIndex + 1}/{total}
          </span>
          <span className={styles.switcherName} title={currentStop?.name}>
            {currentStop?.name}
          </span>
          <ChevronDownIcon
            className={
              menuOpen
                ? `${styles.switcherArrow} ${styles.switcherArrowOpen}`
                : styles.switcherArrow
            }
          />
        </Button>
      </DropdownMenu>
      <Tooltip title='下一个地点' placement='top'>
        <Button
          variant='ghost'
          className={styles.switcherBtn}
          disabled={!canNext}
          aria-label='下一个地点'
          icon={<ChevronRightIcon className='size-4' />}
          onClick={handleNext}
        />
      </Tooltip>
      <Separator orientation='vertical' className={styles.switcherDivider} />
      <Tooltip title='关闭地点切换' placement='top'>
        <Button
          variant='ghost'
          className={styles.switcherBtn}
          aria-label='关闭地点切换'
          icon={<XIcon className='size-4' />}
          onClick={handleClose}
        />
      </Tooltip>
    </div>
  )
}

export default FlightStopSwitcher
