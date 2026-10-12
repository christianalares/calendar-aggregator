import { type SVGProps, useId } from 'react'
import { cn } from '@/lib/utils'
import { LogoSymbol } from './logo/logo-symbol'
import { LogoWordmark } from './logo/logo-wordmark'

type LogoProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  variant?: 'symbol' | 'wordmark' | 'app-icon'
}

const symbolHeight = (552.76 / 703.112) * 128

export function Logo({ variant = 'wordmark', className, ...props }: LogoProps) {
  const titleId = useId()
  const appIcon = variant === 'app-icon'
  const width = appIcon ? 160 : variant === 'wordmark' ? 438.44 : 128
  const height = appIcon ? 160 : symbolHeight

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-labelledby={titleId}
      focusable="false"
      className={cn(
        'h-9 w-auto shrink-0',
        appIcon ? 'text-white' : 'text-black dark:text-white',
        className,
      )}
      {...props}
    >
      <title id={titleId}>CalPal</title>
      {appIcon ? (
        <>
          <rect width="160" height="160" rx="36" fill="#155bff" />
          <g transform={`translate(16 ${(160 - symbolHeight) / 2})`}>
            <LogoSymbol />
          </g>
        </>
      ) : (
        <>
          <LogoSymbol />
          {variant === 'wordmark' && <LogoWordmark />}
        </>
      )}
    </svg>
  )
}
