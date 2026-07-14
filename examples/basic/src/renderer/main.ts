import './styles.css'

interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  demoFile: string
}

const appEl = document.querySelector('#app')!

appEl.innerHTML = `
  <main class="shell">
    <header class="hero">
      <p class="brand">Electrum</p>
      <h1>electron-mvc 示例</h1>
      <p class="lede">装饰器 + DI + IPC，主进程像 Nest 一样组织业务。</p>
    </header>

    <section class="panel">
      <h2>应用信息</h2>
      <pre id="info" class="code">加载中…</pre>
      <button type="button" id="btn-ping">Ping 主进程</button>
      <pre id="ping" class="code muted"></pre>
    </section>

    <section class="panel">
      <h2>文件读写 (file:read / file:write)</h2>
      <label class="field">
        <span>路径</span>
        <input id="path" type="text" spellcheck="false" />
      </label>
      <label class="field">
        <span>内容</span>
        <textarea id="content" rows="8" spellcheck="false"></textarea>
      </label>
      <div class="actions">
        <button type="button" id="btn-read">读取</button>
        <button type="button" id="btn-write" class="primary">写入</button>
      </div>
      <p id="status" class="status" role="status"></p>
    </section>
  </main>
`

const infoEl = document.querySelector('#info') as HTMLPreElement
const pingEl = document.querySelector('#ping') as HTMLPreElement
const pathEl = document.querySelector('#path') as HTMLInputElement
const contentEl = document.querySelector('#content') as HTMLTextAreaElement
const statusEl = document.querySelector('#status') as HTMLParagraphElement

pathEl.value = ''
contentEl.value = 'Hello from Electrum!\n'

function setStatus(message: string, ok = true) {
  statusEl.textContent = message
  statusEl.dataset.ok = ok ? '1' : '0'
}

async function loadInfo() {
  try {
    const info = (await window.api.invoke('app:info')) as AppInfo
    infoEl.textContent = JSON.stringify(info, null, 2)
    document.title = `${info.name} v${info.version}`
    if (info.demoFile) pathEl.value = info.demoFile
  } catch (err) {
    infoEl.textContent = String(err)
  }
}

document.querySelector('#btn-ping')!.addEventListener('click', async () => {
  const res = await window.api.invoke('app:ping', 'hello-electron-mvc')
  pingEl.textContent = JSON.stringify(res, null, 2)
})

document.querySelector('#btn-read')!.addEventListener('click', async () => {
  try {
    const text = (await window.api.invoke('file:read', pathEl.value)) as string
    contentEl.value = text
    setStatus('读取成功')
  } catch (err: any) {
    setStatus(`${err.code || 'ERROR'}: ${err.message}`, false)
  }
})

document.querySelector('#btn-write')!.addEventListener('click', async () => {
  try {
    await window.api.invoke('file:write', {
      path: pathEl.value,
      content: contentEl.value,
    })
    setStatus('写入成功，主进程已推送 file:saved')
  } catch (err: any) {
    setStatus(`${err.code || 'ERROR'}: ${err.message}`, false)
  }
})

window.api.on('file:saved', (savedPath) => {
  setStatus(`已保存: ${savedPath}`)
})

void loadInfo()
