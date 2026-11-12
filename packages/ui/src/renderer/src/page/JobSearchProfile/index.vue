<template>
  <div class="job-search-profile-page">
    <div class="page-header">
      <div>
        <div class="page-title">求职配置</div>
        <div class="page-description">
          每个方案保存职位筛选、搜索词、期望条件、目标公司和简历。从自动开聊页进入时会先自动保存当前表单；切换后会刷新自动开聊页面。模型、浏览器和摸鱼模式等公共设置不会切换。
        </div>
      </div>
      <el-button :loading="saving" @click="handleSaveCurrent">保存当前配置</el-button>
    </div>

    <div class="create-row">
      <el-input
        v-model="newProfileName"
        maxlength="40"
        placeholder="例如：线上 SEO 兼职"
        @keyup.enter="handleCreate"
      />
      <el-button type="primary" :loading="creating" @click="handleCreate">新建方案</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="profiles"
      row-key="id"
      :row-class-name="getRowClassName"
      class="profile-table"
    >
      <el-table-column label="方案" min-width="300">
        <template #default="{ row }">
          <div class="profile-name">
            {{ row.name }}
            <el-tag v-if="row.isActive" size="small" effect="plain">当前</el-tag>
          </div>
          <div class="profile-description">{{ row.description }}</div>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">
          <span class="updated-at">{{ formatTime(row.updatedAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="210">
        <template #default="{ row }">
          <el-button v-if="!row.isActive" text type="primary" @click="handleSwitch(row)">
            切换
          </el-button>
          <el-button text @click="handleRename(row)">重命名</el-button>
          <el-button
            text
            type="danger"
            :disabled="row.isActive || profiles.length <= 1"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="page-footer">
      <span class="footer-hint">切换配置前请先停止正在运行的任务</span>
      <el-button @click="closeWindow">关闭</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElButton, ElInput, ElMessage, ElMessageBox, ElTable, ElTableColumn, ElTag } from 'element-plus'

type ProfileRow = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  isActive: boolean
  description: string
  hasResume: boolean
}

const profiles = ref<ProfileRow[]>([])
const newProfileName = ref('')
const loading = ref(false)
const saving = ref(false)
const creating = ref(false)

function getErrorMessage(err: unknown) {
  return String((err as Error)?.message ?? err).replace(
    /^Error invoking remote method '[^']+':\s*(Error:\s*)?/,
    ''
  )
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function getRowClassName({ row }: { row: ProfileRow }) {
  return row.isActive ? 'is-active-profile' : ''
}

async function loadProfiles() {
  loading.value = true
  try {
    const result = await electron.ipcRenderer.invoke('list-job-search-profiles')
    profiles.value = result.profiles
  } catch (err) {
    ElMessage.error({ message: getErrorMessage(err), grouping: true })
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (!newProfileName.value.trim()) {
    ElMessage.warning('请输入方案名称')
    return
  }
  creating.value = true
  try {
    const result = await electron.ipcRenderer.invoke(
      'create-job-search-profile',
      { name: newProfileName.value }
    )
    profiles.value = result.profiles
    newProfileName.value = ''
    ElMessage.success('方案已创建，已用当前已保存的配置作为初始配置')
  } catch (err) {
    ElMessage.error({ message: getErrorMessage(err), grouping: true })
  } finally {
    creating.value = false
  }
}

async function handleSaveCurrent() {
  saving.value = true
  try {
    const result = await electron.ipcRenderer.invoke('save-current-job-search-profile')
    profiles.value = result.profiles
    ElMessage.success('当前配置已保存到当前方案')
  } catch (err) {
    ElMessage.error({ message: getErrorMessage(err), grouping: true })
  } finally {
    saving.value = false
  }
}

async function handleSwitch(row: ProfileRow) {
  try {
    await ElMessageBox.confirm(
      `切换到“${row.name}”后，当前配置会存入当前方案，并刷新自动开聊页面。请先停止正在运行的任务。`,
      '切换求职配置',
      {
        confirmButtonText: '切换',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  try {
    const result = await electron.ipcRenderer.invoke('switch-job-search-profile', {
      id: row.id
    })
    profiles.value = result.profiles
    ElMessage.success(`已切换到“${row.name}”`)
  } catch (err) {
    ElMessage.error({ message: getErrorMessage(err), grouping: true })
  }
}

async function handleRename(row: ProfileRow) {
  let value = ''
  try {
    const result = await ElMessageBox.prompt('新的方案名称', '重命名方案', {
      inputValue: row.name,
      inputValidator: (input) => {
        if (!String(input ?? '').trim()) {
          return '方案名称不能为空'
        }
        if (String(input).trim().length > 40) {
          return '方案名称不能超过 40 个字符'
        }
        return true
      },
      confirmButtonText: '保存',
      cancelButtonText: '取消'
    })
    value = result.value
  } catch {
    return
  }

  try {
    const result = await electron.ipcRenderer.invoke('rename-job-search-profile', {
      id: row.id,
      name: value
    })
    profiles.value = result.profiles
    ElMessage.success('方案已重命名')
  } catch (err) {
    ElMessage.error({ message: getErrorMessage(err), grouping: true })
  }
}

async function handleDelete(row: ProfileRow) {
  try {
    await ElMessageBox.confirm(`删除“${row.name}”？此操作不会删除当前正在使用的配置。`, '删除方案', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  try {
    const result = await electron.ipcRenderer.invoke('delete-job-search-profile', {
      id: row.id
    })
    profiles.value = result.profiles
    ElMessage.success('方案已删除')
  } catch (err) {
    ElMessage.error({ message: getErrorMessage(err), grouping: true })
  }
}

function closeWindow() {
  window.close()
}

onMounted(loadProfiles)
</script>

<style scoped lang="scss">
.job-search-profile-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 24px 28px 18px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
}

.page-description {
  max-width: 620px;
  margin-top: 8px;
  color: #666;
  font-size: 12px;
  line-height: 1.6;
}

.create-row {
  display: flex;
  gap: 10px;
  margin: 22px 0 14px;
}

.profile-table {
  flex: 1;
  overflow: hidden;
}

.profile-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}

.profile-description {
  margin-top: 4px;
  color: #777;
  font-size: 12px;
}

.updated-at {
  color: #666;
  font-size: 12px;
}

.page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
}

.footer-hint {
  color: #999;
  font-size: 12px;
}

:deep(.is-active-profile) {
  --el-table-tr-bg-color: var(--el-color-primary-light-9);
}
</style>
