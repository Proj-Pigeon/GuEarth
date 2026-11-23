import { useState } from 'react'
import { DownOutlined, LoadingOutlined } from '@ant-design/icons'
import type { AiSearchReference } from '../../../preload'
import styles from './SearchSources.module.css'

export interface SearchSourcesProps {
  references: AiSearchReference[]
  searching?: boolean
}

const VISIBLE_COUNT = 3
const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

function domainOf(reference: AiSearchReference): string {
  if (reference.website) return reference.website
  try {
    return new URL(reference.url).hostname
  } catch {
    return reference.url
  }
}

function safeHref(reference: AiSearchReference): string | undefined {
  try {
    const parsed = new URL(reference.url)
    return ALLOWED_SCHEMES.has(parsed.protocol) ? parsed.href : undefined
  } catch {
    return undefined
  }
}

export function SearchSources({ references, searching = false }: SearchSourcesProps) {
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? references : references.slice(0, VISIBLE_COUNT)
  const hiddenCount = Math.max(0, references.length - VISIBLE_COUNT)

  return (
    <div className={styles.searchSources}>
      <div className={styles.searchStatus} role="status" aria-live="polite">
        {searching ? (
          <>
            <LoadingOutlined spin className={styles.searchStatusLoading} />
            <span className={styles.searchStatusShimmer}>正在搜索</span>
          </>
        ) : (
          <span>已阅读 {references.length} 个来源</span>
        )}
      </div>
      <div className={styles.searchList}>
        {visible.map((reference, index) => {
          const href = safeHref(reference)
          const domain = domainOf(reference)
          const rowContent = (
            <>
              <span className={styles.searchFavicon} aria-hidden="true">
                {domain.charAt(0).toUpperCase()}
              </span>
              <span className={styles.searchRowTitle}>{reference.title}</span>
              <span className={styles.searchRowDomain}>{domain}</span>
            </>
          )
          return href ? (
            <a
              key={`${reference.url}-${index}`}
              className={styles.searchRow}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={reference.content || reference.title}
            >
              {rowContent}
            </a>
          ) : (
            <div key={`${reference.title}-${index}`} className={styles.searchRow} title={reference.content || reference.title}>
              {rowContent}
            </div>
          )
        })}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className={styles.searchMore}
          aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
        >
          <DownOutlined className={expanded ? styles.searchMoreOpen : undefined} />
          {expanded ? '收起来源' : `展开其余 ${hiddenCount} 个来源`}
        </button>
      )}
    </div>
  )
}

export default SearchSources
