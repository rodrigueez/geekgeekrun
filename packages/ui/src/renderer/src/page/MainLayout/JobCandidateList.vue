<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div class="flex flex-0 flex-wrap flex-items-center gap10px pb10px">
      <el-select
        v-model="statusFilter"
        multiple
        collapse-tags
        size="small"
        style="width: 260px"
        placeholder="状态"
        @change="reload"
      >
        <el-option
          v-for="item in statusOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <el-button size="small" :loading="isTableLoading" @click="reload">刷新</el-button>
      <el-checkbox v-model="showRecommendedOnly" size="small">只看模型推荐</el-checkbox>
      <div class="flex-1" />
      <span font-size-12px color-gray>每次</span>
      <el-input-number v-model="batchSize" :min="1" :max="50" size="small" />
      <span font-size-12px color-gray>个，每日</span>
      <el-input-number v-model="dailyLimit" :min="1" :max="200" size="small" />
      <el-button type="primary" size="small" :loading="isChatting" @click="handleStartChat">
        开始开聊
      </el-button>
    </div>

    <div v-if="chatProgressText" class="flex flex-0 pb10px" font-size-12px color-gray>
      {{ chatProgressText }}
    </div>

    <div v-loading="isTableLoading" class="flex-1 of-hidden">
      <ElTable :data="filteredTableData" row-key="encryptJobId" size="small" highlight-current-row>
        <ElTableColumn label="公司" min-width="140">
          <template #default="{ row }">{{ row.snapshot.brandName || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn label="职位" min-width="160">
          <template #default="{ row }">
            <a
              class="link"
              @click="openJobOnline(row.encryptJobId)"
            >{{ row.snapshot.jobName || '-' }}</a>
          </template>
        </ElTableColumn>
        <ElTableColumn label="薪资" width="110">
          <template #default="{ row }">{{ row.snapshot.salaryDesc || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn label="城市" width="90">
          <template #default="{ row }">{{ row.snapshot.cityName || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn label="类型" width="80">
          <template #default="{ row }">{{ jobTypeText(row.snapshot.jobType) }}</template>
        </ElTableColumn>
        <ElTableColumn label="匹配分" width="80">
          <template #default="{ row }">
            {{ typeof row.matchScore === 'number' ? row.matchScore : '-' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="判定原因" min-width="220">
          <template #default="{ row }">
            <span font-size-12px>{{ row.reasons.join(' / ') || '-' }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="90">
          <template #default="{ row }">{{ statusText(row.status) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <ElButton
              v-if="row.status !== Status.CHATTED && row.status !== Status.EXCLUDED"
              link
              type="primary"
              size="small"
              :loading="isChatting"
              @click="handleChatOne(row)"
            >开聊</ElButton>
            <ElButton
              v-if="row.status !== Status.QUEUED && row.status !== Status.CHATTED"
              link
              type="primary"
              size="small"
              @click="setStatus(row, Status.QUEUED)"
            >加入待聊</ElButton>
            <ElButton
              v-if="row.status !== Status.EXCLUDED"
              link
              type="danger"
              size="small"
              @click="setStatus(row, Status.EXCLUDED)"
            >排除</ElButton>
            <ElButton
              v-if="row.status === Status.EXCLUDED || row.status === Status.INVALID"
              link
              type="primary"
              size="small"
              @click="setStatus(row, Status.CANDIDATE)"
            >恢复</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <div class="flex flex-0 flex-justify-end pt10px pb10px">
      <ElPagination
        v-model:current-page="pagination.pageNo"
        v-model:page-size="pagination.pageSize"
        small
        layout="total, sizes, prev, pager, next"
        :page-sizes="[20, 50, 100]"
        :total="pagination.totalItemCount"
        @current-change="getList"
        @size-change="reload"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ElTable,
  ElTableColumn,
  ElButton,
  ElPagination,
  ElSelect,
  ElOption,
  ElInputNumber,
  ElMessage
} from 'element-plus'

const Status = {
  CANDIDATE: 1,
  QUEUED: 2,
  CHATTING: 3,
  CHATTED: 4,
  INVALID: 5,
  EXCLUDED: 6
} as const

const statusOptions = [
  { value: Status.CANDIDATE, label: '候选' },
  { value: Status.QUEUED, label: '待聊' },
  { value: Status.CHATTED, label: '已聊' },
  { value: Status.INVALID, label: '已失效' },
  { value: Status.EXCLUDED, label: '已排除' }
]

const statusMap = {
  [Status.CANDIDATE]: '候选',
  [Status.QUEUED]: '待聊',
  [Status.CHATTING]: '开聊中',
  [Status.CHATTED]: '已聊',
  [Status.INVALID]: '已失效',
  [Status.EXCLUDED]: '已排除'
}

function statusText(status) {
  return statusMap[status] ?? '-'
}

function jobTypeText(jobType) {
  const map = { 0: '全职', 4: '实习', 6: '兼职' }
  return map[jobType] ?? '兼职/未知'
}

const isTableLoading = ref(false)
const isChatting = ref(false)
const tableData = ref<any[]>([])
const showRecommendedOnly = ref(true)
const statusFilter = ref<number[]>([Status.CANDIDATE, Status.QUEUED])
const batchSize = ref(10)
const dailyLimit = ref(20)
const chatProgressText = ref('')
const pagination = ref({ pageNo: 1, pageSize: 50, totalItemCount: 0 })

const filteredTableData = computed(() => {
  if (!showRecommendedOnly.value) {
    return tableData.value
  }
  return tableData.value.filter((row) => !String(row.decision ?? '').startsWith('rejected'))
})

function normalizeRow(item) {
  let snapshot = {}
  let reasons = []
  let decision = 'candidate'
  try {
    snapshot = JSON.parse(item.jobSnapshotJson ?? '{}') ?? {}
  } catch {
    snapshot = {}
  }
  try {
    const parsed = JSON.parse(item.reasonJson ?? '{}') ?? {}
    reasons = parsed.reasons ?? []
    decision = parsed.decision ?? 'candidate'
  } catch {
    reasons = []
  }
  return { ...item, snapshot, reasons, decision }
}

async function getList() {
  isTableLoading.value = true
  try {
    const res = await window.electron.ipcRenderer.invoke('get-job-candidate-list', {
      pageNo: pagination.value.pageNo,
      pageSize: pagination.value.pageSize,
      statusList: statusFilter.value
    })
    tableData.value = (res?.data ?? []).map(normalizeRow)
    pagination.value.totalItemCount = res?.totalItemCount ?? 0
  } finally {
    isTableLoading.value = false
  }
}

function reload() {
  pagination.value.pageNo = 1
  void getList()
}

async function setStatus(row, status) {
  await window.electron.ipcRenderer.invoke('set-job-candidate-status', {
    encryptJobId: row.encryptJobId,
    profileId: row.profileId,
    status
  })
  await getList()
}

async function handleStartChat({ onlyJobId = '' }: { onlyJobId?: string } = {}) {
  isChatting.value = true
  chatProgressText.value = '正在启动浏览器…'
  try {
    const res = await window.electron.ipcRenderer.invoke('start-chat-with-candidates', {
      batchSize: batchSize.value,
      dailyLimit: dailyLimit.value,
      onlyJobId
    })
    if (!res?.ok) {
      const reasonMap = {
        NO_QUEUED_CANDIDATE: '清单里没有待聊的职位',
        DAILY_LIMIT_REACHED: '今天已达设定的开聊上限',
        NO_COOKIE: '没有可用的登录凭据，请先登录 BOSS',
        ALREADY_RUNNING: '已经在跑了'
      }
      ElMessage.warning(reasonMap[res?.reason] ?? '开聊未能启动')
    } else {
      ElMessage.success(`已开聊 ${res.chatStarted} 个，今日剩余 ${res.remainingToday} 个`)
    }
  } finally {
    isChatting.value = false
    chatProgressText.value = ''
    await getList()
  }
}

async function handleChatOne(row) {
  if (row.status !== Status.QUEUED) {
    await window.electron.ipcRenderer.invoke('set-job-candidate-status', {
      encryptJobId: row.encryptJobId,
      profileId: row.profileId,
      status: Status.QUEUED
    })
  }
  await handleStartChat({ onlyJobId: row.encryptJobId })
}

function openJobOnline(encryptJobId) {
  void window.electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
    url: `https://www.zhipin.com/job_detail/${encryptJobId}.html`
  })
}

function handleProgress(_event, payload) {
  if (!payload) {
    return
  }
  if (payload.stage === 'end') {
    chatProgressText.value = `完成：成功 ${payload.chatStarted ?? 0} 个，失败 ${payload.failed ?? 0} 个`
    return
  }
  const total = payload.total ?? 0
  const index = payload.index ?? 0
  const stageMap = { start: '正在开聊', skip: '跳过', fail: '未确认', done: '已完成' }
  chatProgressText.value = `${stageMap[payload.stage] ?? payload.stage} ${index}/${total}`
}

let unlistenChatProgress
onMounted(() => {
  unlistenChatProgress = window.electron.ipcRenderer.on(
    'candidate-chat-progress',
    handleProgress
  )
  void getList()
})

onBeforeUnmount(() => {
  unlistenChatProgress?.()
})
</script>

<style scoped lang="scss">
.link {
  color: var(--el-color-primary);
  cursor: pointer;
}
</style>
