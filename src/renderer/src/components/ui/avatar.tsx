import type { ReactNode } from 'react'
import { Avatar as BaseAvatar } from '@base-ui/react/avatar'
import { cn } from '@renderer/lib/utils'

export interface AvatarProps {
  src?: string
  alt?: string
  size?: number
  fallback?: ReactNode
  className?: string
}

export function Avatar({ src, alt, size = 40, fallback, className }: AvatarProps) {
  return (
    <BaseAvatar.Root
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[14px] font-medium text-ink select-none',
        className
      )}
    >
      {src && <BaseAvatar.Image src={src} alt={alt ?? ''} className="size-full object-cover" />}
      <BaseAvatar.Fallback className="flex size-full items-center justify-center">
        {fallback}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  )
}

export default Avatar
