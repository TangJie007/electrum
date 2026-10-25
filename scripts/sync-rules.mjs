#!/usr/bin/env node
/**
 * 把 rules/ 下的规则文件（唯一真源）镜像到各编辑器的规则目录。
 *
 * 用法：node scripts/sync-rules.mjs    （或 pnpm rules:sync）
 *
 * 新增编辑器支持：往 TARGETS 数组加一项即可。
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)))
const SOURCE_DIR = join(ROOT, 'rules')

/** 镜像目标：dir = 编辑器规则目录，ext = 该编辑器要求的扩展名 */
const TARGETS = [
  { dir: '.cursor/rules', ext: '.mdc' }, // Cursor
  { dir: '.codebuddy/rules', ext: '.md' }, // CodeBuddy
  // { dir: '.windsurf/rules', ext: '.md' },      // Windsurf（需要时取消注释）
  // { dir: '.github/rules',   ext: '.md' },      // GitHub Copilot（需配合 .github/copilot-instructions.md 索引）
]

const GENERATED_MARKER =
  '\n<!-- 本文件由 scripts/sync-rules.mjs 从 rules/ 生成，请勿直接编辑，改 rules/ 后重新运行 pnpm rules:sync -->\n'

function stripMarker(content) {
  return content.replace(/\n?<!--\s*本文件由 scripts\/sync-rules\.mjs[^>]*-->\n?/g, '')
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`[sync-rules] 找不到源目录：${SOURCE_DIR}`)
    process.exit(1)
  }

  const sources = (await readdir(SOURCE_DIR)).filter((f) => f.endsWith('.md'))
  if (sources.length === 0) {
    console.error('[sync-rules] rules/ 下没有 .md 规则文件')
    process.exit(1)
  }

  for (const target of TARGETS) {
    const targetDir = join(ROOT, target.dir)
    await mkdir(targetDir, { recursive: true })

    const expected = new Set()

    for (const file of sources) {
      const raw = await readFile(join(SOURCE_DIR, file), 'utf8')
      const outName = `${basename(file, '.md')}${target.ext}`
      const outPath = join(targetDir, outName)
      expected.add(outName)

      const next = stripMarker(raw).replace(/\s*$/, '\n') + GENERATED_MARKER
      const prev = existsSync(outPath) ? await readFile(outPath, 'utf8') : null

      if (prev === next) {
        console.log(`  = ${target.dir}/${outName}（无变化）`)
        continue
      }
      await writeFile(outPath, next, 'utf8')
      console.log(`  + ${target.dir}/${outName}`)
    }

    // 清理源目录已删除的陈旧镜像
    for (const file of await readdir(targetDir)) {
      if (!file.endsWith(target.ext)) continue
      if (expected.has(file)) continue
      await rm(join(targetDir, file), { force: true })
      console.log(`  - ${target.dir}/${file}（源已删除）`)
    }
  }

  console.log(`[sync-rules] 完成，同步 ${sources.length} 个规则文件到 ${TARGETS.length} 个目标`)
}

main().catch((err) => {
  console.error('[sync-rules] 失败：', err)
  process.exit(1)
})
