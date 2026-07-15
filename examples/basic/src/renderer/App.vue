<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  demoFile: string
}

const infoText = ref('加载中…')
const pingText = ref('')
const path = ref('')
const content = ref('Hello from Electrum!\n')
const status = ref('')
const statusOk = ref(true)
const usersText = ref('加载中…')
const userName = ref('')
const userEmail = ref('')
const userStatus = ref('')
const userStatusOk = ref(true)

function setStatus(message: string, ok = true) {
  status.value = message
  statusOk.value = ok
}

function setUserStatus(message: string, ok = true) {
  userStatus.value = message
  userStatusOk.value = ok
}

async function loadInfo() {
  try {
    const info = (await window.api.invoke('app:info')) as AppInfo
    infoText.value = JSON.stringify(info, null, 2)
    document.title = `${info.name} v${info.version}`
    if (info.demoFile) path.value = info.demoFile
  } catch (err) {
    infoText.value = String(err)
  }
}

async function loadUsers() {
  try {
    const users = await window.api.invoke('user:list')
    usersText.value = JSON.stringify(users, null, 2)
  } catch (err: any) {
    usersText.value = String(err)
    setUserStatus(`${err.code || 'ERROR'}: ${err.message}`, false)
  }
}

async function onPing() {
  const res = await window.api.invoke('app:ping', 'hello-electrum')
  pingText.value = JSON.stringify(res, null, 2)
}

async function onRead() {
  try {
    const text = (await window.api.invoke('file:read', path.value)) as string
    content.value = text
    setStatus('读取成功'  + text)
  } catch (err: any) {
    setStatus(`${err.code || 'ERROR'}: ${err.message}`, false)
  }
}

async function onWrite() {
  try {
    await window.api.invoke('file:write', {
      path: path.value,
      content: content.value,
    })
    setStatus('写入成功，主进程已推送 file:saved')
  } catch (err: any) {
    setStatus(`${err.code || 'ERROR'}: ${err.message}`, false)
  }
}

async function onCreateUser() {
  try {
    await window.api.invoke('user:create', {
      name: userName.value || 'New User',
      email: userEmail.value || 'user@example.com',
    })
    userName.value = ''
    userEmail.value = ''
    setUserStatus('创建成功')
    await loadUsers()
  } catch (err: any) {
    setUserStatus(`${err.code || 'ERROR'}: ${err.message}`, false)
  }
}

let offSaved: (() => void) | undefined

onMounted(() => {
  void loadInfo()
  void loadUsers()
  offSaved = window.api.on('file:saved', (savedPath) => {
    setStatus(`已保存: ${savedPath}`)
  })
})

onUnmounted(() => {
  offSaved?.()
})
</script>

<template>
  <main class="shell">
    <header class="hero">
      <p class="brand">Electrum</p>
      <h1>electrum 示例</h1>
      <p class="lede">装饰器 + DI + IPC，主进程像 Nest 一样组织业务。</p>
    </header>

    <section class="panel">
      <h2>应用信息</h2>
      <pre class="code">{{ infoText }}</pre>
      <button type="button" @click="onPing">Ping 主进程</button>
      <pre class="code muted">{{ pingText }}</pre>
    </section>

    <section class="panel">
      <h2>文件读写 (file:read / file:write)</h2>
      <label class="field">
        <span>路径</span>
        <input v-model="path" type="text" spellcheck="false" />
      </label>
      <label class="field">
        <span>内容</span>
        <textarea v-model="content" rows="8" spellcheck="false" />
      </label>
      <div class="actions">
        <button type="button" @click="onRead">读取</button>
        <button type="button" class="primary" @click="onWrite">写入</button>
      </div>
      <p class="status" role="status" :data-ok="statusOk ? '1' : '0'">
        {{ status }}
      </p>
    </section>

    <section class="panel">
      <h2>用户 (user:list / user:create)</h2>
      <pre class="code">{{ usersText }}</pre>
      <label class="field">
        <span>姓名</span>
        <input v-model="userName" type="text" placeholder="New User" />
      </label>
      <label class="field">
        <span>邮箱</span>
        <input v-model="userEmail" type="email" placeholder="user@example.com" />
      </label>
      <div class="actions">
        <button type="button" @click="loadUsers">刷新</button>
        <button type="button" class="primary" @click="onCreateUser">创建</button>
      </div>
      <p class="status" role="status" :data-ok="userStatusOk ? '1' : '0'">
        {{ userStatus }}
      </p>
    </section>
  </main>
</template>
