import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, afterEach } from 'vitest'
import { generateIpcTypes } from '../generate'
import { createProject, scanIpcChannels } from '../ast/controller-scanner'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

describe('scanIpcChannels', () => {
  it('extracts channel names and types from @Controller/@IpcHandle', () => {
    const project = createProject(path.join(fixturesDir, 'tsconfig.json'))
    const channels = scanIpcChannels(project, { includeDevOnly: false })

    const byChannel = Object.fromEntries(channels.map((c) => [c.channel, c]))

    expect(byChannel['user:list']).toMatchObject({
      params: '',
      returnType: 'Promise<{ id: number; name: string; email: string }[]>',
    })

    expect(byChannel['user:get']).toMatchObject({
      params: 'id: number',
      returnType: 'Promise<{ id: number; name: string; email: string }>',
    })

    expect(byChannel['user:create']).toMatchObject({
      params: 'data: { name: string; email: string }',
    })

    expect(byChannel['file:read']).toMatchObject({
      params: 'filePath: string',
      returnType: 'Promise<string>',
    })

    expect(byChannel['user:debug']).toBeUndefined()
  })

  it('includes devOnly channels when includeDevOnly is true', () => {
    const project = createProject(path.join(fixturesDir, 'tsconfig.json'))
    const channels = scanIpcChannels(project, { includeDevOnly: true })
    expect(channels.some((c) => c.channel === 'user:debug')).toBe(true)
  })
})

describe('generateIpcTypes', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  it('writes IpcApi declaration file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'electrum-codegen-'))
    tempDirs.push(tempDir)
    const outputPath = path.join(tempDir, 'ipc-api.ts')

    const result = await generateIpcTypes({
      tsconfig: path.join(fixturesDir, 'tsconfig.json'),
      outputPath,
      include: [path.join(fixturesDir, '**/*.ts')],
      includeDevOnly: false,
    })

    expect(result.channels.length).toBeGreaterThanOrEqual(5)
    expect(fs.existsSync(outputPath)).toBe(true)

    const content = fs.readFileSync(outputPath, 'utf-8')
    expect(content).toContain('AUTO-GENERATED')
    expect(content).toContain("'user:list':")
    expect(content).toContain("'user:get': (id: number)")
    expect(content).not.toContain('any[]')
  })
})
