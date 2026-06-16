import * as p from '@clack/prompts'
import c from 'ansis'
import { NAME, VERSION } from './constants'

export function printIntro() {
  p.intro(`${c.yellow`${NAME} `}${c.dim`v${VERSION}`}`)
}
