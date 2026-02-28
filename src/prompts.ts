import { homedir } from 'node:os'
import process from 'node:process'
import readline from 'node:readline'
import c from 'ansis'

export interface GroupPromptItem<T> {
  id: string
  label: string
  hint?: string
  value: T
}

export interface GroupPromptGroup<T> {
  id: string
  label: string
  path?: string
  items: Array<GroupPromptItem<T>>
}

interface TerminalKey {
  ctrl?: boolean
  name?: string
}

interface PromptState {
  mode: 'groups' | 'items'
  groupIndex: number
  itemIndex: number
  selectedKeys: Set<string>
}

interface NormalizedItem<T> {
  key: string
  id: string
  label: string
  hint?: string
  value: T
}

interface NormalizedGroup<T> {
  id: string
  label: string
  path?: string
  items: Array<NormalizedItem<T>>
}

const FIG_CHECK = c.green('◉')
const FIG_UNCHECK = c.gray('◌')
const FIG_PARTIAL = c.yellow('◍')
const FIG_POINTER = c.cyan('❯')
const FIG_NO_POINTER = ' '

export async function promptGroupedMultiSelect<T>(
  groups: Array<GroupPromptGroup<T>>,
): Promise<T[] | null> {
  const normalizedGroups = normalizeGroups(groups)
  if (normalizedGroups.length === 0)
    return []

  if (!process.stdin.isTTY || !process.stdout.isTTY)
    return []

  const state: PromptState = {
    mode: 'groups',
    groupIndex: 0,
    itemIndex: 0,
    selectedKeys: new Set<string>(),
  }

  return await new Promise<T[] | null>((resolve) => {
    const previousRaw = Boolean(process.stdin.isRaw)

    function cleanup() {
      process.stdin.off('keypress', onKeyPress)
      if (process.stdin.isTTY)
        process.stdin.setRawMode(previousRaw)
      process.stdout.write('\x1B[?25h')
      clearScreen()
    }

    function onDone(value: T[] | null) {
      cleanup()
      resolve(value)
    }

    function onKeyPress(_: string, key: TerminalKey) {
      if (key.ctrl && key.name === 'c') {
        onDone(null)
        return
      }

      if (state.mode === 'groups') {
        handleGroupModeKey(state, normalizedGroups, key, onDone)
      }
      else {
        handleItemModeKey(state, normalizedGroups, key)
      }

      render(state, normalizedGroups)
    }

    readline.emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdout.write('\x1B[?25l')
    process.stdin.on('keypress', onKeyPress)
    render(state, normalizedGroups)
  })
}

function handleGroupModeKey<T>(
  state: PromptState,
  groups: Array<NormalizedGroup<T>>,
  key: TerminalKey,
  onDone: (value: T[] | null) => void,
) {
  if (groups.length === 0)
    return

  const currentGroup = groups[state.groupIndex]

  switch (key.name) {
    case 'escape':
      onDone(null)
      return
    case 'enter':
    case 'return':
      onDone(collectSelectedValues(groups, state.selectedKeys))
      return
    case 'up':
    case 'k':
      state.groupIndex = (state.groupIndex - 1 + groups.length) % groups.length
      return
    case 'down':
    case 'j':
      state.groupIndex = (state.groupIndex + 1) % groups.length
      return
    case 'space':
      toggleGroup(currentGroup, state.selectedKeys)
      return
    case 'a':
      toggleAll(groups, state.selectedKeys)
      return
    case 'right':
    case 'l':
      state.mode = 'items'
      state.itemIndex = 0
      break
  }
}

function handleItemModeKey<T>(
  state: PromptState,
  groups: Array<NormalizedGroup<T>>,
  key: TerminalKey,
) {
  const currentGroup = groups[state.groupIndex]
  if (!currentGroup || currentGroup.items.length === 0)
    return

  switch (key.name) {
    case 'left':
    case 'h':
    case 'escape':
    case 'enter':
    case 'return':
      state.mode = 'groups'
      return
    case 'up':
    case 'k':
      state.itemIndex = (state.itemIndex - 1 + currentGroup.items.length) % currentGroup.items.length
      return
    case 'down':
    case 'j':
      state.itemIndex = (state.itemIndex + 1) % currentGroup.items.length
      return
    case 'space': {
      const item = currentGroup.items[state.itemIndex]
      toggleItem(item.key, state.selectedKeys)
      return
    }
    case 'a':
      toggleGroup(currentGroup, state.selectedKeys)
      break
  }
}

function render<T>(state: PromptState, groups: Array<NormalizedGroup<T>>) {
  clearScreen()

  if (state.mode === 'groups')
    renderGroups(state, groups)
  else
    renderItems(state, groups)
}

function renderGroups<T>(state: PromptState, groups: Array<NormalizedGroup<T>>) {
  const Y = (value: string) => c.green.bold(value)
  const selectedCount = countSelected(groups, state.selectedKeys)
  const totalCount = groups.reduce((acc, group) => acc + group.items.length, 0)

  process.stdout.write(`${c.gray(`${Y('↑↓')} select  ${Y('space')} toggle group  ${Y('→')} enter group`)}\n`)
  process.stdout.write(`${c.gray(`${Y('enter')} confirm  ${Y('esc')} cancel  ${Y('a')} toggle all`)}\n\n`)
  process.stdout.write(`selected ${c.red(`${selectedCount}/${totalCount}`)}\n\n`)

  const labelWidth = Math.min(36, Math.max(12, ...groups.map(group => group.label.length)))
  const countWidth = Math.max(7, ...groups.map((group) => {
    const selected = countSelectedInGroup(group, state.selectedKeys)
    return `${selected}/${group.items.length}`.length
  }))

  const { start, end } = getRenderWindow(groups.length, state.groupIndex, 12)
  if (start > 0)
    process.stdout.write(`${c.gray(`... ${start} more groups above`)}\n`)

  for (let index = start; index < end; index += 1) {
    const group = groups[index]
    const pointer = index === state.groupIndex ? FIG_POINTER : FIG_NO_POINTER
    const count = group.items.length
    const selected = countSelectedInGroup(group, state.selectedKeys)
    const mark = selected === 0 ? FIG_UNCHECK : selected === count ? FIG_CHECK : FIG_PARTIAL
    const countText = `${selected}/${count}`.padStart(countWidth, ' ')
    const label = fitText(group.label, labelWidth)
    const path = group.path ? c.gray(tildifyPath(group.path)) : c.gray('(unknown cwd)')

    process.stdout.write(`${pointer} ${mark} ${label} ${c.red(countText)}   ${path}\n`)
  }

  if (end < groups.length)
    process.stdout.write(`${c.gray(`... ${groups.length - end} more groups below`)}\n`)
}

function renderItems<T>(state: PromptState, groups: Array<NormalizedGroup<T>>) {
  const Y = (value: string) => c.green.bold(value)
  const group = groups[state.groupIndex]
  const selectedCount = countSelected(groups, state.selectedKeys)
  const totalCount = groups.reduce((acc, item) => acc + item.items.length, 0)

  process.stdout.write(`${c.gray(`${Y('↑↓')} select  ${Y('space')} toggle  ${Y('←')} back`)}\n`)
  process.stdout.write(`${c.gray(`${Y('enter')} back  ${Y('esc')} back  ${Y('a')} toggle group`)}\n\n`)
  process.stdout.write(`selected ${c.red(`${selectedCount}/${totalCount}`)}\n`)
  process.stdout.write('\n')
  process.stdout.write(`${c.green(group.label)} ${c.gray(group.path ? tildifyPath(group.path) : '(unknown cwd)')}\n\n`)

  const { start, end } = getRenderWindow(group.items.length, state.itemIndex, 8)
  if (start > 0)
    process.stdout.write(`${c.gray(`... ${start} more threads above`)}\n`)

  for (let index = start; index < end; index += 1) {
    const item = group.items[index]
    const pointer = index === state.itemIndex ? FIG_POINTER : FIG_NO_POINTER
    const checked = state.selectedKeys.has(item.key) ? FIG_CHECK : FIG_UNCHECK
    process.stdout.write(`${pointer} ${checked} ${item.label}\n`)
    if (item.hint)
      process.stdout.write(`    ${c.gray(item.hint)}\n`)
  }

  if (end < group.items.length)
    process.stdout.write(`${c.gray(`... ${group.items.length - end} more threads below`)}\n`)
}

function normalizeGroups<T>(groups: Array<GroupPromptGroup<T>>): Array<NormalizedGroup<T>> {
  return groups.map(group => ({
    id: group.id,
    label: group.label,
    path: group.path,
    items: group.items.map(item => ({
      key: `${group.id}::${item.id}`,
      id: item.id,
      label: item.label,
      hint: item.hint,
      value: item.value,
    })),
  }))
}

function collectSelectedValues<T>(groups: Array<NormalizedGroup<T>>, selected: Set<string>): T[] {
  const values: T[] = []
  for (const group of groups) {
    for (const item of group.items) {
      if (selected.has(item.key))
        values.push(item.value)
    }
  }
  return values
}

function toggleGroup<T>(group: NormalizedGroup<T>, selected: Set<string>) {
  const allSelected = group.items.length > 0 && group.items.every(item => selected.has(item.key))
  for (const item of group.items) {
    if (allSelected)
      selected.delete(item.key)
    else
      selected.add(item.key)
  }
}

function toggleItem(key: string, selected: Set<string>) {
  if (selected.has(key))
    selected.delete(key)
  else
    selected.add(key)
}

function toggleAll<T>(groups: Array<NormalizedGroup<T>>, selected: Set<string>) {
  const allSelected = groups.every(group => group.items.every(item => selected.has(item.key)))
  for (const group of groups) {
    for (const item of group.items) {
      if (allSelected)
        selected.delete(item.key)
      else
        selected.add(item.key)
    }
  }
}

function countSelected<T>(groups: Array<NormalizedGroup<T>>, selected: Set<string>): number {
  let count = 0
  for (const group of groups) {
    for (const item of group.items) {
      if (selected.has(item.key))
        count += 1
    }
  }
  return count
}

function countSelectedInGroup<T>(group: NormalizedGroup<T>, selected: Set<string>): number {
  let count = 0
  for (const item of group.items) {
    if (selected.has(item.key))
      count += 1
  }
  return count
}

function getRenderWindow(total: number, index: number, size: number) {
  if (total <= size)
    return { start: 0, end: total }

  const half = Math.floor(size / 2)
  let start = Math.max(0, index - half)
  let end = start + size

  if (end > total) {
    end = total
    start = Math.max(0, end - size)
  }

  return { start, end }
}

function fitText(value: string, width: number) {
  if (value.length <= width)
    return value.padEnd(width, ' ')
  if (width <= 1)
    return value.slice(0, width)
  return `${value.slice(0, width - 1)}…`
}

function tildifyPath(value: string) {
  const home = homedir()
  if (value === home)
    return '~'
  if (value.startsWith(`${home}/`))
    return `~${value.slice(home.length)}`
  return value
}

function clearScreen() {
  process.stdout.write('\x1Bc')
}
