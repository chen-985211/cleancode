/*
MIT + Commons Clause License Condition

Copyright (c) 2025 Elliot Sutton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell or redistribute the components themselves in their original form—whether alone or in a bundle.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Adapted from Animate UI's official icons-lucide-download registry item.
// https://animate-ui.com/r/icons-lucide-download.json
import { motion, type Variants } from 'motion/react'
import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps
} from '@animate-ui/react/icons'

const animations = {
  default: {
    group: {
      initial: { y: 0, transition: { duration: 0.3, ease: 'easeInOut' } },
      animate: { y: 2, transition: { duration: 0.3, ease: 'easeInOut' } }
    },
    path1: {},
    path2: {},
    path3: {}
  } satisfies Record<string, Variants>
} as const
type DownloadProps = IconProps<keyof typeof animations>
function DownloadShape({ size, ...props }: DownloadProps) {
  const { controls } = useAnimateIconContext()
  const variants = getVariants(animations)
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.g variants={variants.group} initial="initial" animate={controls}>
        <motion.path d="M12 15V3" variants={variants.path1} initial="initial" animate={controls} />
        <motion.path
          d="m7 10 5 5 5-5"
          variants={variants.path2}
          initial="initial"
          animate={controls}
        />
      </motion.g>
      <motion.path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        variants={variants.path3}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  )
}
export function UpdateDownloadIcon(props: DownloadProps) {
  return <IconWrapper icon={DownloadShape} {...props} />
}
