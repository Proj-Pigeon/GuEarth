import { DownOutlined, LoadingOutlined, SearchOutlined } from '@ant-design/icons'
import type { BaseSelectRef } from '@rc-component/select'
import { useFailureStore } from '@renderer/stores/failure'
import { useGlobeStore } from '@renderer/stores/globe'
import { AutoComplete, Button, Dropdown, Input } from 'antd'
import type { MenuProps } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { PlaceSearchProvider, PlaceSuggestion } from '../../../preload'

import styles from './PlaceSearchBox.module.css'

export interface PlaceSearchBoxProps {
  onSelect: (place: PlaceSuggestion) => void
}

interface PlaceOption {
  value: string
  key: string
  disabled?: boolean
  place?: PlaceSuggestion
  label: ReactNode
}

const providerDefinitions: Array<{ id: PlaceSearchProvider; name: string }> = [
  { id: 'amap', name: '高德' },
  { id: 'baidu', name: '百度' }
]

function regionText(place: PlaceSuggestion): string {
  const region = [place.province, place.city, place.district]
    .filter(part => part && part !== place.name)
    .join(' · ')
  return [region, place.address].filter(part => part).join(' · ')
}

function providerName(id?: PlaceSearchProvider): string {
  return providerDefinitions.find(item => item.id === id)?.name ?? ''
}

function statusOption(text: string, isError: boolean, retry?: () => void): PlaceOption {
  return {
    value: `status:${text}`,
    key: `status:${text}`,
    disabled: true,
    label: (
      <div
        className={
          isError ? `${styles.placeStatus} ${styles.placeStatusError}` : styles.placeStatus
        }
      >
        <span>{text}</span>
        {retry ? (
          <Button
            type='text'
            size='small'
            className={styles.placeRetry}
            onMouseDown={event => event.preventDefault()}
            onClick={event => {
              event.stopPropagation()
              retry()
            }}
          >
            重试
          </Button>
        ) : null}
      </div>
    )
  }
}

function placeOption(place: PlaceSuggestion, index: number): PlaceOption {
  const value = `${place.name}:${place.longitude},${place.latitude}:${index}`
  return {
    value,
    key: value,
    place,
    label: (
      <div className={styles.placeOption}>
        <div className={styles.placeOptionName}>{place.name}</div>
        <div className={styles.placeOptionMeta}>{regionText(place) || place.type}</div>
      </div>
    )
  }
}

export function PlaceSearchBox({ onSelect }: PlaceSearchBoxProps) {
  const providerCredentials = useGlobeStore(state => state.providerCredentials)
  const reportDegrade = useFailureStore(state => state.reportDegrade)

  const [keyword, setKeyword] = useState('')
  const [options, setOptions] = useState<PlaceOption[]>([])
  const [preferredProvider, setPreferredProvider] = useState<PlaceSearchProvider>('amap')
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  const searchInputRef = useRef<BaseSelectRef | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const requestSeqRef = useRef(0)
  const suppressWatchRef = useRef(false)
  const lastQueryRef = useRef('')
  const previousRef = useRef<{ text: string; providerId?: PlaceSearchProvider }>({
    text: '',
    providerId: undefined
  })

  const availableProviders = useMemo(
    () => providerDefinitions.filter(item => providerCredentials[item.id]?.configured),
    [providerCredentials]
  )
  const showProviderSelect = availableProviders.length > 1
  const provider = useMemo(
    () => availableProviders.find(item => item.id === preferredProvider) ?? availableProviders[0],
    [availableProviders, preferredProvider]
  )
  const providerId = provider?.id
  const credentialUpdatedAt = providerId ? providerCredentials[providerId]?.updatedAt : undefined

  const search = useCallback(
    async (text: string): Promise<void> => {
      const seq = ++requestSeqRef.current
      lastQueryRef.current = text
      if (!window.guEarth?.places) {
        setOptions([statusOption('搜索服务不可用', true)])
        return
      }
      if (!providerId) {
        setOptions([statusOption('请先在「设置 → 地图」中配置高德或百度密钥', true)])
        return
      }
      const retryLast = (): void => {
        const query = lastQueryRef.current.trim()
        if (query) void search(query)
      }
      setOptions([
        {
          value: 'status:loading',
          key: 'status:loading',
          disabled: true,
          label: (
            <div className={styles.placeStatus}>
              <LoadingOutlined spin className={styles.placeLoadingIcon} />
              <span>正在搜索…</span>
            </div>
          )
        }
      ])
      let result
      try {
        result = await window.guEarth.places.search(text, providerId)
      } catch {
        if (seq === requestSeqRef.current) {
          setOptions([statusOption('搜索失败，请稍后重试', true, retryLast)])
        }
        return
      }
      if (seq !== requestSeqRef.current) return
      if (result.superseded) return
      if (result.fellBackFrom) {
        reportDegrade(
          `${providerName(result.fellBackFrom)}不可用，已改用${providerName(result.source)}`
        )
      }
      if (result.error) {
        setOptions([statusOption(result.error, true, retryLast)])
      } else if (!result.places.length) {
        setOptions([
          statusOption(result.note ?? '没有找到匹配的地点，可换个说法或切换搜索源', false)
        ])
      } else {
        setOptions(result.places.map((place, index) => placeOption(place, index)))
      }
    },
    [providerId, reportDegrade]
  )

  useEffect(() => {
    const previousText = previousRef.current.text
    const previousProvider = previousRef.current.providerId
    previousRef.current = { text: keyword, providerId }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    requestSeqRef.current += 1
    setOptions([])
    if (suppressWatchRef.current) {
      suppressWatchRef.current = false
      if (providerId === previousProvider && keyword !== previousText) return
    }
    const query = keyword.trim()
    if (!query) return
    debounceTimerRef.current = setTimeout(() => {
      void search(query)
    }, 300)
  }, [keyword, providerId, credentialUpdatedAt, search])

  useEffect(() => {
    if (!showProviderSelect) setProviderMenuOpen(false)
  }, [showProviderSelect])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      requestSeqRef.current += 1
    }
  }, [])

  function handleSelect(_value: string, option: PlaceOption): void {
    if (!option.place) return
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    requestSeqRef.current += 1
    suppressWatchRef.current = keyword !== option.place.name
    setKeyword(option.place.name)
    setOptions([])
    setSuggestionsOpen(false)
    onSelect(option.place)
  }

  const handleProviderSelect: MenuProps['onClick'] = ({ key }) => {
    if (key !== 'amap' && key !== 'baidu') return
    if (!availableProviders.some(item => item.id === key)) return
    setPreferredProvider(key)
    setProviderMenuOpen(false)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      setSuggestionsOpen(true)
    })
  }

  const providerMenuItems: MenuProps['items'] = availableProviders.map(item => ({
    key: item.id,
    label: item.name
  }))

  return (
    <div className={styles.placeSearch} data-guide-target='place-search'>
      <AutoComplete<string, PlaceOption>
        ref={searchInputRef}
        value={keyword}
        onChange={value => setKeyword(value)}
        className={styles.placeAutocomplete}
        options={options}
        showSearch={{ filterOption: false }}
        open={suggestionsOpen && !providerMenuOpen}
        classNames={{ popup: { root: styles.placeDropdown } }}
        onOpenChange={setSuggestionsOpen}
        onSelect={handleSelect}
      >
        <Input
          allowClear
          size='large'
          placeholder='输入关键词以搜索'
          aria-label='搜索地点'
          prefix={<SearchOutlined className={styles.placeSearchIcon} />}
          suffix={
            showProviderSelect ? (
              <span className={styles.placeProviderSpace} aria-hidden='true' />
            ) : undefined
          }
        />
      </AutoComplete>
      {showProviderSelect && (
        <Dropdown
          open={providerMenuOpen}
          onOpenChange={setProviderMenuOpen}
          trigger={['click']}
          placement='bottomRight'
          menu={{
            selectedKeys: provider ? [provider.id] : [],
            items: providerMenuItems,
            onClick: handleProviderSelect
          }}
        >
          <Button
            type='text'
            className={styles.placeProviderButton}
            aria-label={`搜索源：${provider?.name ?? ''}`}
            aria-haspopup='menu'
            aria-expanded={providerMenuOpen}
            onMouseDown={event => event.stopPropagation()}
            onKeyDown={event => {
              if (event.key === 'Escape') setProviderMenuOpen(false)
            }}
          >
            {provider?.name}
            <DownOutlined />
          </Button>
        </Dropdown>
      )}
    </div>
  )
}

export default PlaceSearchBox
