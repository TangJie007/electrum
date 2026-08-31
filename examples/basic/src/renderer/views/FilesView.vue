<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createClient } from '@electrum/client'
import type { IpcApi } from '../ipc-api'

const api = createClient<IpcApi>()

const path = ref('')
const content = ref('Hello from Electrum!\n')
const saving = ref(false)
const watching = ref(false)
const lastChange = ref('')

let offSaved: (() => void) | undefined
let offChanged: (() => void) | undefined

async function initPath() {
  try {
    const info = await api.app.info()
    path.value = info.demoFile
  } catch (err: any) {
    ElMessage.error(String(err))
  }
}

async function onRead() {
  try {
    content.value = await api.file.read(path.value)
    ElMessage.success('读取成功')
  } catch (err: any) {
    ElMessage.error(`${err.code || 'ERROR'}: ${err.message || err}`)
  }
}

async function onWrite() {
  saving.value = true
  try {
    await api.file.write({ path: path.value, content: content.value })
  } catch (err: any) {
    ElMessage.error(`${err.code || 'ERROR'}: ${err.message || err}`)
  } finally {
    saving.value = false
  }
}

function onWatch() {
  if (!path.value) {
    ElMessage.warning('请先填写路径')
    return
  }
  api.send('file:watch', path.value)
  watching.value = true
  ElMessage.success(`已订阅 file:watch → ${path.value}`)
}

onMounted(() => {
  void initPath()
  offSaved = api.on('file:saved', (savedPath) => {
    ElMessage.success(`主进程已推送 file:saved → ${savedPath}`)
  })
  offChanged = api.on('file:changed', (payload) => {
    lastChange.value = typeof payload === 'object' ? JSON.stringify(payload) : String(payload)
    ElMessage.info(`file:changed → ${lastChange.value}`)
  })
})

onUnmounted(() => {
  offSaved?.()
  offChanged?.()
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>文件读写</h2>
      <p>
        演示 file:read / file:write、@IpcEmit 推送 file:saved，以及 @IpcOn('watch') →
        file:changed。
      </p>
    </div>

    <el-card shadow="never">
      <el-form label-position="top">
        <el-form-item label="路径">
          <el-input v-model="path" spellcheck="false" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="content"
            type="textarea"
            :rows="12"
            spellcheck="false"
            class="mono"
          />
        </el-form-item>
        <el-form-item>
          <el-button @click="onRead">读取</el-button>
          <el-button type="primary" :loading="saving" @click="onWrite">写入</el-button>
          <el-button type="success" @click="onWatch">
            {{ watching ? '已监听' : '开始监听' }}
          </el-button>
        </el-form-item>
        <el-form-item v-if="lastChange" label="最近 file:changed">
          <el-text type="info" class="mono-text">{{ lastChange }}</el-text>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 16px;
}

.page-head h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 650;
}

.page-head p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

:deep(.mono textarea) {
  font-family: Consolas, 'Cascadia Code', monospace;
  font-size: 13px;
}

.mono-text {
  font-family: Consolas, 'Cascadia Code', monospace;
  font-size: 12px;
  word-break: break-all;
}
</style>
