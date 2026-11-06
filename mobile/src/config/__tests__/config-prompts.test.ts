import { DAY } from '../limits'
import { DEFAULT_APP_CONFIG, parseAppConfig, type AppConfig } from '../app-config'
import { UPDATE_REMINDER_INTERVAL, createConfigPrompts, type ConfigPrompt } from '../config-prompts'
import { NOW, configText, memoryStorage, noticePart, updatePart, type MemoryStorage } from './helpers'

const config = (parts: string): AppConfig => {
  const parsed = parseAppConfig(configText(parts))
  if (parsed === null) throw new Error('refused')
  return parsed.config
}

/** Prompts as a start of the app makes them: what was remembered is read first. */
async function start(storage: MemoryStorage, playBuild: boolean, installed: number) {
  const prompts = createConfigPrompts({ storage, playBuild, installed })
  await prompts.load()
  return prompts
}

const noticeOf = (prompt: ConfigPrompt | null) => (prompt?.kind === 'notice' ? prompt.notice : null)
const updateOf = (prompt: ConfigPrompt | null) => (prompt?.kind === 'update' ? prompt : null)

describe('there is nothing to show', () => {
  it('unless the website says so', async () => {
    const prompts = await start(memoryStorage(), true, 16)
    expect(prompts.next(DEFAULT_APP_CONFIG, NOW)).toBeNull()
    expect(prompts.next(config('"notice":null,"update":null'), NOW)).toBeNull()
  })

  it('before what was remembered has been read, so that a notice already seen is not put up again', async () => {
    const storage = memoryStorage({ 'plax.prompts.noticeSeen': 'n1' })
    const prompts = createConfigPrompts({ storage, playBuild: true, installed: 16 })
    expect(prompts.next(config(noticePart('n1', 'info')), NOW)).toBeNull()
    expect(prompts.next(config(noticePart('n2', 'info')), NOW)).toBeNull()
    await prompts.load()
    expect(prompts.next(config(noticePart('n1', 'info')), NOW)).toBeNull()
    expect(prompts.next(config(noticePart('n2', 'info')), NOW)).not.toBeNull()
  })
})

describe('a notice', () => {
  it('is shown once for each id, whatever the reader did with it', async () => {
    const storage = memoryStorage()
    const prompts = await start(storage, true, 16)
    const withNotice = config(noticePart('n1', 'info'))
    const prompt = prompts.next(withNotice, NOW) as ConfigPrompt
    expect(noticeOf(prompt)?.id).toBe('n1')
    prompts.shown(prompt)
    expect(prompts.next(withNotice, NOW)).toBeNull()
    await prompts.closed(prompt, false, NOW)
    // An ordinary notice is counted as read however it was closed.
    expect(storage.data.get('plax.prompts.noticeSeen')).toBe('n1')
    expect((await start(storage, true, 16)).next(withNotice, NOW)).toBeNull()
    expect((await start(storage, true, 16)).next(config(noticePart('n2', 'info')), NOW)).not.toBeNull()
  })

  it('comes back at the next start, if it is important, until the reader has said Done', async () => {
    const storage = memoryStorage()
    const withNotice = config(noticePart('n1', 'important'))
    const first = await start(storage, true, 16)
    let prompt = first.next(withNotice, NOW) as ConfigPrompt
    first.shown(prompt)
    await first.closed(prompt, false, NOW)
    // Closed any other way than Done: not counted as read.
    expect(storage.data.get('plax.prompts.noticeSeen') ?? '').toBe('')
    // But not again in the same run, which would be a loop.
    expect(first.next(withNotice, NOW)).toBeNull()
    const second = await start(storage, true, 16)
    prompt = second.next(withNotice, NOW) as ConfigPrompt
    expect(prompt).not.toBeNull()
    second.shown(prompt)
    await second.closed(prompt, true, NOW)
    expect(storage.data.get('plax.prompts.noticeSeen')).toBe('n1')
    expect((await start(storage, true, 16)).next(withNotice, NOW)).toBeNull()
  })

  it('is only for the builds, versions and times it names', async () => {
    const forPlay = config(noticePart('n', 'info', ',"build":"play","minVersionCode":10,"maxVersionCode":16,"until":"2027-02-01T00:00:00Z"'))
    expect((await start(memoryStorage(), true, 16)).next(forPlay, NOW)).not.toBeNull()
    expect((await start(memoryStorage(), false, 16)).next(forPlay, NOW)).toBeNull()
    expect((await start(memoryStorage(), true, 17)).next(forPlay, NOW)).toBeNull()
    expect((await start(memoryStorage(), true, 9)).next(forPlay, NOW)).toBeNull()
    expect((await start(memoryStorage(), true, 16)).next(forPlay, Date.UTC(2027, 1, 1))).toBeNull()
    expect((await start(memoryStorage(), true, 16)).next(forPlay, Date.UTC(2027, 0, 31, 23, 59, 59))).not.toBeNull()
  })

  it('is for the website\'s build when it says direct', async () => {
    const direct = config(noticePart('n', 'info', ',"build":"direct"'))
    expect((await start(memoryStorage(), false, 16)).next(direct, NOW)).not.toBeNull()
    expect((await start(memoryStorage(), true, 16)).next(direct, NOW)).toBeNull()
  })

  it('is not counted as read just by being put on the screen: only the reader\'s answer is', async () => {
    const storage = memoryStorage()
    const withNotice = config(noticePart('n1', 'info'))
    const first = await start(storage, true, 16)
    first.shown(first.next(withNotice, NOW) as ConfigPrompt)
    // Nothing was said by the reader yet, so nothing is kept; the next start shows it again.
    expect(storage.data.has('plax.prompts.noticeSeen')).toBe(false)
    expect((await start(storage, true, 16)).next(withNotice, NOW)).not.toBeNull()
  })

  it('remembers only the last id: a notice that came back after another one is shown again', async () => {
    const storage = memoryStorage()
    const one = config(noticePart('n1', 'info'))
    const two = config(noticePart('n2', 'info'))
    const prompts = await start(storage, true, 16)
    await prompts.closed(prompts.next(one, NOW) as ConfigPrompt, true, NOW)
    await prompts.closed(prompts.next(two, NOW) as ConfigPrompt, true, NOW)
    const next = await start(storage, true, 16)
    expect(next.next(two, NOW)).toBeNull()
    expect(next.next(one, NOW)).not.toBeNull()
  })
})

describe('a notice and an update', () => {
  it('come one at a time, the notice first', async () => {
    const prompts = await start(memoryStorage(), true, 16)
    const both = config(`${noticePart('n1', 'info')},${updatePart(17, 0)}`)
    const first = prompts.next(both, NOW) as ConfigPrompt
    expect(first.kind).toBe('notice')
    prompts.shown(first)
    await prompts.closed(first, true, NOW)
    const second = updateOf(prompts.next(both, NOW))
    expect(second?.update.latestVersionCode).toBe(17)
    expect(second?.required).toBe(false)
  })
})

describe('an update on Google Play', () => {
  it('is put off for a day by Later', () => {
    expect(UPDATE_REMINDER_INTERVAL).toBe(DAY)
  })

  it('is offered to a build below the newest one, and not again for a day once the reader said Later', async () => {
    const storage = memoryStorage()
    const newer = config(updatePart(17, 0))
    const prompts = await start(storage, true, 16)
    const prompt = prompts.next(newer, NOW) as ConfigPrompt
    expect(updateOf(prompt)?.messageKey).toBe('update_play_message')
    prompts.shown(prompt)
    await prompts.closed(prompt, false, NOW)
    expect(prompts.next(newer, NOW + 1)).toBeNull()
    expect((await start(storage, true, 16)).next(newer, NOW + 3_600_000)).toBeNull()
    expect((await start(storage, true, 16)).next(newer, NOW + DAY - 1)).toBeNull()
    expect((await start(storage, true, 16)).next(newer, NOW + DAY)).not.toBeNull()
    // A newer version is offered at once.
    expect((await start(storage, true, 16)).next(config(updatePart(18, 0)), NOW + 1)).not.toBeNull()
  })

  it('remembers the version and the time of the reader\'s answer', async () => {
    const storage = memoryStorage()
    const prompts = await start(storage, true, 16)
    await prompts.closed(prompts.next(config(updatePart(17, 0)), NOW) as ConfigPrompt, true, NOW)
    expect(storage.data.get('plax.prompts.updateVersion')).toBe('17')
    expect(storage.data.get('plax.prompts.updateAt')).toBe(String(NOW))
  })

  it('carries the version it names, for the message', async () => {
    const prompt = updateOf((await start(memoryStorage(), true, 16)).next(config(updatePart(17, 0)), NOW))
    expect(prompt?.update).toEqual({ latestVersionCode: 17, latestVersionName: '1.7.0', minSupportedVersionCode: 0 })
  })

  it('is never offered to the website\'s build, nor to the newest build or a newer one', async () => {
    const newest = config(updatePart(17, 16))
    expect((await start(memoryStorage(), false, 12)).next(newest, NOW)).toBeNull()
    expect((await start(memoryStorage(), true, 17)).next(newest, NOW)).toBeNull()
    expect((await start(memoryStorage(), true, 18)).next(newest, NOW)).toBeNull()
  })

  it('is asked of a build below the least supported at every start, and never twice in one', async () => {
    const storage = memoryStorage()
    const required = config(updatePart(17, 16))
    const first = await start(storage, true, 15)
    const prompt = updateOf(first.next(required, NOW))
    expect(prompt?.required).toBe(true)
    expect(prompt?.messageKey).toBe('update_play_required')
    first.shown(prompt as ConfigPrompt)
    await first.closed(prompt as ConfigPrompt, false, NOW)
    expect(first.next(required, NOW + 1)).toBeNull()
    // At the next start, though the reader said Later a moment ago.
    expect(updateOf((await start(storage, true, 15)).next(required, NOW + 2))?.required).toBe(true)
  })

  it('is asked of a build at the least supported version only as an ordinary update', async () => {
    const prompt = updateOf((await start(memoryStorage(), true, 16)).next(config(updatePart(17, 16)), NOW))
    expect(prompt?.required).toBe(false)
  })

  it('is not held back in this run by having been shown (the screen does not draw it over what is open)', async () => {
    const prompts = await start(memoryStorage(), true, 16)
    const newer = config(updatePart(17, 0))
    const prompt = prompts.next(newer, NOW) as ConfigPrompt
    prompts.shown(prompt)
    expect(prompts.next(newer, NOW)).not.toBeNull()
  })
})

describe('what is remembered', () => {
  it('is kept between starts, under the keys of the prompts', async () => {
    const storage = memoryStorage()
    const prompts = await start(storage, true, 16)
    await prompts.closed(prompts.next(config(noticePart('n1', 'info')), NOW) as ConfigPrompt, true, NOW)
    expect([...storage.data.keys()].sort()).toEqual(['plax.prompts.noticeSeen'])
  })

  it('is still known in this run when it cannot be kept', async () => {
    const storage = memoryStorage()
    storage.failWrites = true
    const prompts = await start(storage, true, 16)
    const withNotice = config(noticePart('n1', 'info'))
    await expect(prompts.closed(prompts.next(withNotice, NOW) as ConfigPrompt, true, NOW)).resolves.toBeUndefined()
    expect(storage.data.size).toBe(0)
    expect(prompts.next(withNotice, NOW)).toBeNull()
  })

  it('is forgotten when it cannot be read: everything may be shown again', async () => {
    const storage = memoryStorage({ 'plax.prompts.noticeSeen': 'n1' })
    storage.failReads = true
    const prompts = await start(storage, true, 16)
    expect(prompts.next(config(noticePart('n1', 'info')), NOW)).not.toBeNull()
  })

  it('is ignored when what was kept is not a number where one is expected', async () => {
    const storage = memoryStorage({ 'plax.prompts.updateVersion': 'x', 'plax.prompts.updateAt': 'y' })
    const prompts = await start(storage, true, 16)
    expect(prompts.next(config(updatePart(17, 0)), NOW)).not.toBeNull()
  })
})
