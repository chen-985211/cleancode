import { Button } from '@animate-ui/react/primitives/buttons/button'
import {
  GithubStars,
  GithubStarsIcon,
  GithubStarsLogo,
  GithubStarsNumber,
  GithubStarsParticles
} from '@animate-ui/react/primitives/github-stars'
import { ReducedMotionContext } from '@animate-ui/react/utils/motion'
import { StarIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState, type ComponentProps } from 'react'

import { applicationRepository } from '../../../../platform/ipc/applicationRepositoryChannels'
import { useI18n } from '../../../i18n/useI18n'
import { TooltipLabel } from '../../../shared/components/Tooltip'
import { usePrefersReducedMotion } from '../../../shared/hooks/usePrefersReducedMotion'

type StarsState =
  | { readonly status: 'loading' | 'unavailable' }
  | { readonly status: 'ready'; readonly count: number }

export function GitHubStarsButton() {
  const { t } = useI18n()
  const query = window.cleancode?.getApplicationRepositoryStars
  const [state, setState] = useState<StarsState>(() => ({
    status: query ? 'loading' : 'unavailable'
  }))
  const reducedMotion = usePrefersReducedMotion()
  const count = state.status === 'ready' ? state.count : null

  useEffect(() => {
    if (!query) return
    let active = true
    const load = async (): Promise<void> => {
      try {
        const result = await query()
        if (active)
          setState(
            Number.isSafeInteger(result) && result >= 0
              ? { status: 'ready', count: result }
              : { status: 'unavailable' }
          )
      } catch {
        if (active) setState({ status: 'unavailable' })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [query])

  const label =
    count === null ? t('settings.about.githubStar') : t('settings.about.githubStars', { count })
  // Same composition as Animate UI's buttons-github-stars registry item.
  // Its number, fill, particles and press spring run in the upstream package.
  const button = (
    <Button asChild data-slot="github-stars-button">
      <a
        className="github-stars-button"
        href={`https://github.com/${applicationRepository}`}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        aria-busy={state.status === 'loading'}
      >
        <GithubStarsLogo width={16} height={16} aria-hidden="true" />
        {count === null ? (
          <>
            <span>{t('settings.about.githubStarFallback')}</span>
            <Star className="github-stars-button__star" />
          </>
        ) : (
          <>
            <GithubStarsNumber className="github-stars-button__number" aria-hidden="true" />
            <GithubStarsParticles className="github-stars-button__particles">
              <GithubStarsIcon
                icon={Star}
                className="github-stars-button__star"
                color="var(--cc-github-star)"
              />
            </GithubStarsParticles>
          </>
        )}
      </a>
    </Button>
  )
  return (
    <ReducedMotionContext value={reducedMotion ? 'always' : 'never'}>
      <TooltipLabel content={label}>
        {count === null ? (
          button
        ) : (
          <GithubStars asChild value={count} aria-busy={false}>
            {button}
          </GithubStars>
        )}
      </TooltipLabel>
    </ReducedMotionContext>
  )
}

function Star(props: Omit<ComponentProps<typeof HugeiconsIcon>, 'icon'>) {
  return <HugeiconsIcon icon={StarIcon} size={18} strokeWidth={2} {...props} />
}
