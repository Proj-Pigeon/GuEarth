import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Autocomplete as BaseAutocomplete } from '@base-ui/react/autocomplete'
import { ChevronDownIcon, Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import { Button, DropdownMenu } from '@renderer/components/ui';
import type { DropdownMenuEntry } from '@renderer/components/ui';
import { useGlobeStore } from '@renderer/stores/globe'
import { useFailureStore } from '@renderer/stores/failure'
import type { PlaceSearchProvider, PlaceSuggestion } from '../../../preload'
import styles from './PlaceSearchBox.module.css'

export interface PlaceSearchBoxProps {
  onSelect: (place: PlaceSuggestion) => void
}

interface PlaceOption {
  value: string
  key: string
  disabled?: boolean
  loading?: boolean
  statusText?: string
  isError?: boolean
  retry?: () => void
  place?: PlaceSuggestion
}

const providerDefinitions: { id: PlaceSearchProvider; name: string }[] = [
  { id: 'amap', name: '高德' },
  { id: 'baidu', name: '百度' }
]

function regionText(place: PlaceSuggestion): string {
  const region = [place.province, place.city, place.district]
    .filter((part) => part && part !== place.name)
    .join(' · ')
  return [region, place.address].filter((part) => part).join(' · ')
}

function providerName(id?: PlaceSearchProvider): string {
  return providerDefinitions.find((item) => item.id === id)?.name ?? ''
}

function statusOption(text: string, isError: boolean, retry?: () => void): PlaceOption {
  return {
    value: `status:${text}`,
    key: `status:${text}`,
    disabled: true,
    statusText: text,
    isError,
    retry
  }
}

function placeOption(place: PlaceSuggestion, index: number): PlaceOption {
  const value = `${place.name}:${place.longitude},${place.latitude}:${index}`
  return {
    value,
    key: value,
    place
  }
}

export function PlaceSearchBox({ onSelect }: PlaceSearchBoxProps) {
  const providerCredentials = useGlobeStore((state) => state.providerCredentials)
  const reportDegrade = useFailureStore((state) => state.reportDegrade)

  const [keyword, setKeyword] = useState('')
  const [options, setOptions] = useState<PlaceOption[]>([])
  const [preferredProvider, setPreferredProvider] = useState<PlaceSearchProvider>('amap')
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  const searchBarRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const requestSeqRef = useRef(0)
  const suppressWatchRef = useRef(false)
  const lastQueryRef = useRef('')
  const previousRef = useRef<{ text: string; providerId?: PlaceSearchProvider }>({
    text: '',
    providerId: undefined
  })

  const availableProviders = useMemo(
    () => providerDefinitions.filter((item) => providerCredentials[item.id]?.configured),
    [providerCredentials]
  )
  const showProviderSelect = availableProviders.length > 1
  const provider = useMemo(
    () => availableProviders.find((item) => item.id === preferredProvider) ?? availableProviders[0],
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
        if (query) {void search(query)}
      }
      setOptions([
        {
          value: 'status:loading',
          key: 'status:loading',
          disabled: true,
          loading: true,
          statusText: '正在搜索…'
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
      if (seq !== requestSeqRef.current) {return}
      if (result.superseded) {return}
      if (result.fellBackFrom) {
        reportDegrade(`${providerName(result.fellBackFrom)}不可用，已改用${providerName(result.source)}`)
      }
      if (result.error) {
        setOptions([statusOption(result.error, true, retryLast)])
      } else if (result.places.length === 0) {
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

    if (debounceTimerRef.current) {clearTimeout(debounceTimerRef.current)}
    requestSeqRef.current += 1
    setOptions([])
    if (suppressWatchRef.current) {
      suppressWatchRef.current = false
      if (providerId === previousProvider && keyword !== previousText) {return}
    }
    const query = keyword.trim()
    if (!query) {return}
    debounceTimerRef.current = setTimeout(() => {
      void search(query)
    }, 300)
  }, [keyword, providerId, credentialUpdatedAt, search])

  useEffect(() => {
    if (!showProviderSelect) {setProviderMenuOpen(false)}
  }, [showProviderSelect])

  useEffect(() => 
    () => {
      if (debounceTimerRef.current) {clearTimeout(debounceTimerRef.current)}
      requestSeqRef.current += 1
    }
  , [])

  function handleSelectOption(option: PlaceOption): void {
    if (!option.place) {return}
    if (debounceTimerRef.current) {clearTimeout(debounceTimerRef.current)}
    requestSeqRef.current += 1
    suppressWatchRef.current = keyword !== option.place.name
    setKeyword(option.place.name)
    setOptions([])
    setSuggestionsOpen(false)
    onSelect(option.place)
  }

  function handleProviderSelect(key: string): void {
    if (key !== 'amap' && key !== 'baidu') {return}
    if (!availableProviders.some((item) => item.id === key)) {return}
    setPreferredProvider(key)
    setProviderMenuOpen(false)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      setSuggestionsOpen(true)
    })
  }

  const providerMenuItems: DropdownMenuEntry[] = availableProviders.map((item) => ({
    key: item.id,
    label: item.name
  }))

  const popupVisible = suggestionsOpen && !providerMenuOpen && options.length > 0

  return (
    <div className={styles.placeSearch} data-guide-target="place-search">
      <BaseAutocomplete.Root<PlaceOption>
        items={options}
        value={keyword}
        open={popupVisible}
        filter={null}
        itemToStringValue={(item) => item.place?.name ?? item.value}
        onValueChange={(next) => {
          setKeyword(next)
          setSuggestionsOpen(true)
        }}
        onOpenChange={(nextOpen) => setSuggestionsOpen(nextOpen)}
      >
        <div
          ref={searchBarRef}
          className={
            showProviderSelect ? `${styles.searchBar} ${styles.searchBarWithProvider}` : styles.searchBar
          }
        >
          <SearchIcon className={styles.placeSearchIcon} aria-hidden="true" />
          <BaseAutocomplete.Input
            ref={searchInputRef}
            placeholder="输入关键词以搜索"
            aria-label="搜索地点"
            className={styles.searchInput}
          />
          {keyword && (
            <button
              type="button"
              aria-label="清除搜索关键词"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setKeyword('')
                setOptions([])
                searchInputRef.current?.focus()
              }}
              className={styles.clearButton}
            >
              <XIcon className="size-3.5" />
            </button>
          )}
          {showProviderSelect && (
            <DropdownMenu
              open={providerMenuOpen}
              onOpenChange={setProviderMenuOpen}
              placement="bottomRight"
              selectedKeys={provider ? [provider.id] : []}
              items={providerMenuItems}
              onSelect={handleProviderSelect}
            >
              <Button
                variant="ghost"
                size="sm"
                className={styles.placeProviderButton}
                aria-label={`搜索源：${provider?.name ?? ''}`}
                aria-haspopup="menu"
                aria-expanded={providerMenuOpen}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {setProviderMenuOpen(false)}
                }}
              >
                <span>{provider?.name}</span>
                <ChevronDownIcon className="size-3.5 text-ink-tertiary" />
              </Button>
            </DropdownMenu>
          )}
        </div>
        <BaseAutocomplete.Portal>
          <BaseAutocomplete.Positioner
            anchor={searchBarRef}
            align="start"
            sideOffset={6}
            className="z-[1500] outline-none"
          >
            <BaseAutocomplete.Popup className={styles.placeDropdown}>
              <BaseAutocomplete.List className={styles.placeList}>
                {(option: PlaceOption) =>
                  option.place ? (
                    <BaseAutocomplete.Item
                      key={option.key}
                      value={option}
                      onClick={() => handleSelectOption(option)}
                      className={styles.placeItem}
                    >
                      <div className={styles.placeOption}>
                        <div className={styles.placeOptionName}>{option.place.name}</div>
                        <div className={styles.placeOptionMeta}>
                          {regionText(option.place) || option.place.type}
                        </div>
                      </div>
                    </BaseAutocomplete.Item>
                  ) : (
                    <div
                      key={option.key}
                      className={
                        option.isError
                          ? `${styles.placeStatus} ${styles.placeStatusError}`
                          : styles.placeStatus
                      }
                    >
                      {option.loading && <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />}
                      <span>{option.statusText}</span>
                      {option.retry && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={styles.placeRetry}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.stopPropagation()
                            option.retry?.()
                          }}
                        >
                          重试
                        </Button>
                      )}
                    </div>
                  )
                }
              </BaseAutocomplete.List>
            </BaseAutocomplete.Popup>
          </BaseAutocomplete.Positioner>
        </BaseAutocomplete.Portal>
      </BaseAutocomplete.Root>
    </div>
  )
}

export default PlaceSearchBox
