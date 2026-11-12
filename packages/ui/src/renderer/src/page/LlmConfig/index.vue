<template>
  <div class="llm-config-page">
    <div class="main-wrapper">
      <main>
        <div class="mt1em mb1em">
          <div class="flex flex-items-center flex-justify-between">
            <div>大语言模型设置</div>
            <el-dropdown
              @command="
                (item) => {
                  gtagRenderer('provider_url_for_secret_clicked', {
                    name: item.name
                  })
                  openExternalLink(item.url)
                }
              "
            >
              <el-button size="small"
                >获取 API Secret <el-icon class="el-icon--right"><arrow-down /></el-icon
              ></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="item in providerList" :key="item.name" :command="item">{{
                    item.name
                  }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <el-alert type="info" :closable="false" mb20px line-height-1.25em>
          <ul pl16px m0>
            <li>
              支持 OpenAI 兼容接口，可直接接入 DeepSeek、OpenAI、Ollama、LM Studio、Magpie
              等本地网关。本地地址通常形如 <code>http://127.0.0.1:3425/v1</code>，API Secret
              可留空。
            </li>
            <li>
              支持推理模型：在“高级设置”里选择推理强度。本场景只需要一句话，默认会尽量关闭或降低思考，避免等待和多余 token。
            </li>
            <li>
              填写 Base URL 后可点“获取模型”读取 <code>/v1/models</code>；不读取也可以直接手填模型 ID。
            </li>
            <li>
              请自行确保您所接入的服务商能够保护您的隐私。<b class="color-red"
                >此处列举的“服务商-模型”仅供配置参考，本程序不能保证第三方服务能够合法使用您的数据</b
              >
            </li>
          </ul>
        </el-alert>
        <el-form
          ref="formRef"
          :model="formContentForElForm"
          :rules="formRulesForElForm"
          label-position="top"
          class="llm-config-form"
          :validate-on-rule-change="false"
        >
          <div v-for="(conf, index) in formContent" :key="conf.id" class="flex gap12px">
            <div
              v-if="formContent.length > 1"
              :style="{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                height: 'fit-content',
                marginTop: '10px'
              }"
            >
              <el-button
                :disabled="index <= 0"
                style="margin: 0"
                circle
                size="small"
                :icon="ArrowUp"
                @click="moveConfigUp(index)"
              />
              <el-button
                :disabled="index >= formContent.length - 1"
                style="margin: 0"
                circle
                size="small"
                :icon="ArrowDown"
                @click="moveConfigDown(index)"
              />
              <el-button
                :disabled="1 >= formContent.length"
                style="margin: 0"
                circle
                size="small"
                :icon="Delete"
                @click="removeConfig(index)"
              />
            </div>
            <div class="w-full">
              <el-form-item :prop="`${index}_providerCompleteApiUrl`">
                <div
                  class="el-form-item__label flex-items-center flex-justify-between w-full pr0px"
                  :style="{ display: 'flex' }"
                >
                  <div>服务提供商 Base URL</div>
                  <el-dropdown @command="(item) => handlePresetClick(item, index)">
                    <el-button size="small"
                      >配置模板 <el-icon class="el-icon--right"><arrow-down /></el-icon
                    ></el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="item in llmPresetList"
                          :key="item.name"
                          :command="item"
                          >{{ item.name }}</el-dropdown-item
                        >
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
                <el-input
                  ref="firstInputRefList"
                  v-model="conf.providerCompleteApiUrl"
                  clearable
                  placeholder="https://api.deepseek.com 或 http://127.0.0.1:3425/v1"
                  font-size-12px
                ></el-input>
              </el-form-item>
              <el-form-item :prop="`${index}_model`">
                <div
                  class="el-form-item__label flex-items-center flex-justify-between w-full pr0px"
                  :style="{ display: 'flex' }"
                >
                  <div>要使用的模型（model 参数）</div>
                  <el-button
                    size="small"
                    :loading="!!modelListLoading[conf.id]"
                    @click="handleFetchModels(conf)"
                    >获取模型</el-button
                  >
                </div>
                <el-select
                  v-model="conf.model"
                  filterable
                  allow-create
                  default-first-option
                  clearable
                  placeholder="选择或直接输入模型 ID"
                  no-data-text="先填写 Base URL，再点击“获取模型”"
                  font-size-12px
                >
                  <el-option
                    v-for="modelItem in modelOptions[conf.id] ?? []"
                    :key="modelItem.id"
                    :label="
                      modelItem.displayName
                        ? `${modelItem.id} · ${modelItem.displayName}`
                        : modelItem.id
                    "
                    :value="modelItem.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item
                :prop="`${index}_providerApiSecret`"
                label="API Secret（本地网关可留空）"
              >
                <el-input
                  v-model="conf.providerApiSecret"
                  type="password"
                  show-password
                  clearable
                  placeholder="sk-... 或留空"
                  font-size-12px
                ></el-input>
              </el-form-item>
              <el-collapse class="llm-advanced">
                <el-collapse-item title="高级设置：推理模型 / 本地网关" :name="conf.id">
                  <div class="advanced-grid">
                    <el-form-item label="API 协议">
                      <el-select v-model="conf.apiMode" font-size-12px>
                        <el-option label="Chat Completions（兼容性最好）" value="chat" />
                        <el-option label="Responses API（OpenAI / Magpie）" value="responses" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="推理强度">
                      <el-select v-model="conf.reasoningEffort" font-size-12px>
                        <el-option label="默认（由服务商决定）" value="default" />
                        <el-option label="关闭或最低思考（最快）" value="none" />
                        <el-option label="低" value="low" />
                        <el-option label="中" value="medium" />
                        <el-option label="高" value="high" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="最大输出 tokens">
                      <el-input-number
                        v-model="conf.maxOutputTokens"
                        :min="64"
                        :max="131072"
                        :step="64"
                        step-strictly
                        :precision="0"
                        controls-position="right"
                        font-size-12px
                      />
                    </el-form-item>
                    <el-form-item label="温度">
                      <el-input-number
                        v-model="conf.temperature"
                        :min="0"
                        :max="2"
                        :step="0.1"
                        :precision="1"
                        controls-position="right"
                        font-size-12px
                      />
                    </el-form-item>
                    <el-form-item label="JSON 模式">
                      <el-switch v-model="conf.jsonMode" />
                    </el-form-item>
                    <el-form-item
                      :prop="`${index}_headersText`"
                      label="自定义请求头（JSON，可选）"
                      class="advanced-full"
                    >
                      <el-input
                        v-model="conf.headersText"
                        type="textarea"
                        :rows="2"
                        placeholder='例如 {"x-openai-actor-authorization": "magpie"}'
                        font-size-12px
                      ></el-input>
                    </el-form-item>
                  </div>
                </el-collapse-item>
              </el-collapse>
              <div class="serve-weight-config">
                <div class="flex">
                  <el-form-item prop="enabled">
                    <div class="el-form-item__label">启用</div>
                    <el-checkbox
                      v-if="formContent.length > 1"
                      v-model="conf.enabled"
                      font-size-12px
                      @click="
                        nextTick(() =>
                          gtagRenderer('model_enable_status_changed', { enabled: conf.enabled })
                        )
                      "
                    ></el-checkbox>
                    <el-checkbox v-else :model-value="true" font-size-12px disabled />
                  </el-form-item>
                  <el-form-item prop="serveWeight" class="ml40px">
                    <div class="el-form-item__label">权重</div>
                    <el-input-number
                      v-if="formContent.length > 1"
                      v-model="conf.serveWeight"
                      :min="1"
                      :max="100"
                      :step="1"
                      step-strictly
                      :precision="0"
                      font-size-12px
                      placeholder="1 ~ 100"
                      @change="
                        (new_val, old_val) => {
                          gtagRenderer('serve_weight_changed', { new_val, old_val })
                        }
                      "
                    ></el-input-number>
                    <el-input-number
                      v-else
                      font-size-12px
                      :model-value="SINGLE_ITEM_DEFAULT_SERVE_WEIGHT"
                      disabled
                    />
                  </el-form-item>
                </div>
                <div class="flex">
                  <!-- <el-form-item class="ml20px">
                    <el-button type="text">测试设置</el-button>
                  </el-form-item> -->
                </div>
              </div>
              <div
                v-if="index !== formContent.length - 1"
                class="mt6px mb20px h1px"
                style="background-color: #dcdcdc"
              />
            </div>
          </div>
        </el-form>
      </main>
    </div>
    <footer pt10px pb10px flex flex-justify-center>
      <div w600px max-w-full flex flex-justify-between>
        <div>
          <el-button font-size-12px type="text" @click="addConfig"
            >添加备用模型<span v-if="formContent.length <= 1">，以生成更随机的内容</span></el-button
          >
        </div>
        <div>
          <el-button @click="handleCancel">取消</el-button>
          <el-button type="primary" @click="handleSubmit">确定</el-button>
        </div>
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import {
  ElForm,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElIcon,
  ElButton,
  ElInput,
  ElSelect,
  ElOption,
  ElCollapse,
  ElCollapseItem,
  ElMessage,
  type FormItemRule,
  type FormRules
} from 'element-plus'
import { ArrowUp, ArrowDown, Delete } from '@element-plus/icons-vue'
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'
import { SINGLE_ITEM_DEFAULT_SERVE_WEIGHT } from '../../../../common/constant'
import { v4 as uuid } from 'uuid'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'

type LlmApiMode = 'chat' | 'responses'
type LlmReasoningEffort = 'default' | 'none' | 'low' | 'medium' | 'high'

interface LlmConfigItem {
  id: string
  providerCompleteApiUrl: string
  providerApiSecret: string
  model: string
  serveWeight: number
  enabled: boolean
  apiMode: LlmApiMode
  reasoningEffort: LlmReasoningEffort
  maxOutputTokens: number
  temperature: number
  jsonMode: boolean
  headers?: Record<string, string>
}

interface LlmConfigFormItem extends LlmConfigItem {
  headersText: string
}

interface LlmModelOption {
  id: string
  displayName: string | null
  ownedBy: string | null
  reasoning: boolean | null
  maxOutputTokens: number | null
}

const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'llm-config',
    ...params
  })
}

function getNewConfigItem(): LlmConfigFormItem {
  return {
    id: uuid(),
    providerCompleteApiUrl: '',
    providerApiSecret: '',
    model: '',
    serveWeight: 10,
    enabled: true,
    apiMode: 'chat',
    reasoningEffort: 'default',
    maxOutputTokens: 1024,
    temperature: 0.1,
    jsonMode: true,
    headersText: ''
  }
}

function createModelOption(id: string): LlmModelOption {
  return {
    id,
    displayName: null,
    ownedBy: null,
    reasoning: null,
    maxOutputTokens: null
  }
}

const formRef = ref<InstanceType<typeof ElForm>>()
const formContent = ref<LlmConfigFormItem[]>([getNewConfigItem()])
const modelOptions = ref<Record<string, LlmModelOption[]>>({})
const modelListLoading = ref<Record<string, boolean>>({})

const formContentForElForm = computed(() => {
  const valueMap: Record<string, unknown> = {}
  formContent.value.forEach((configItem, i) => {
    valueMap[`${i}_providerCompleteApiUrl`] = configItem.providerCompleteApiUrl
    valueMap[`${i}_model`] = configItem.model
    valueMap[`${i}_headersText`] = configItem.headersText
  })
  return valueMap
})

function parseHeadersText(text: string): Record<string, string> | undefined {
  const trimmed = text?.trim()
  if (!trimmed) {
    return undefined
  }
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('自定义请求头必须是 JSON 对象')
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)])
  )
}

const formRulesForElForm = computed<FormRules>(() => {
  const valueMap: FormRules = {}
  formContent.value.forEach((configItem, i) => {
    const urlRules: FormItemRule[] = []
    if (configItem.enabled) {
      urlRules.push({
        required: true,
        message: '请输入服务提供商 Base URL'
      })
    }
    urlRules.push({
      trigger: 'blur',
      validator(_, value, cb) {
        if (!value?.trim()) {
          cb()
          return
        }
        try {
          new URL(value.trim())
        } catch (err) {
          cb(`URL 格式无效，请重新输入`)
          return
        }
        if (/^http(s)?:\/\//.test(value)) {
          cb()
          return
        }
        cb(`服务提供商 Base URL 无效，请重新输入`)
      }
    })
    valueMap[`${i}_providerCompleteApiUrl`] = urlRules
    if (configItem.enabled) {
      valueMap[`${i}_model`] = [
        {
          required: true,
          message: '请选择或输入模型 ID',
          trigger: 'change'
        }
      ]
    }
    valueMap[`${i}_headersText`] = [
      {
        trigger: 'blur',
        validator(_, value, cb) {
          try {
            parseHeadersText(value)
            cb()
          } catch (err) {
            cb((err as Error)?.message ?? '自定义请求头格式无效')
          }
        }
      }
    ]
  })
  return valueMap
})

const handleCancel = () => {
  gtagRenderer('cancel_clicked')
  electron.ipcRenderer.send('close-llm-config')
  gtagRenderer('cancel_done')
}

const handleSubmit = async () => {
  gtagRenderer('submit_clicked', { llm_config_length: formContent.value.length })
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  if (!formContent.value.length) {
    gtagRenderer('empty_model_list')
    ElMessage.warning({
      message: '可选模型列表为空，请出现填写'
    })
    formContent.value = [getNewConfigItem()]
    return
  } else if (formContent.value.length > 1) {
    const firstEnabledModel = formContent.value.find(it => it.enabled)
    if (!firstEnabledModel) {
      gtagRenderer('no_enabled_model_find_in_model_list')
      ElMessage.warning({
        dangerouslyUseHTMLString: true,
        grouping: true,
        message: '<div style="white-space: nowrap">所有模型均被禁用；请至少启用一个模型</div>'
      })
      return
    }
  }
  const configToSave = formContent.value.map(({ headersText, ...item }) => {
    const headers = parseHeadersText(headersText)
    return headers ? { ...item, headers } : item
  })
  electron.ipcRenderer.invoke('save-llm-config', JSON.parse(JSON.stringify(configToSave)))
  gtagRenderer('submit_done')
}

onMounted(async () => {
  const savedFileContent = (await electron.ipcRenderer.invoke('fetch-config-file-content'))
    ?.config?.['llm.json']
  if (!savedFileContent?.length) {
    return
  }
  const defaults = getNewConfigItem()
  formContent.value = savedFileContent.map((it) => {
    const conf: any = { ...defaults, id: it.id ?? uuid() }
    for (const key of Object.keys(defaults)) {
      if (key === 'headersText') {
        continue
      }
      if (it[key] !== undefined && it[key] !== null) {
        conf[key] = it[key]
      }
    }
    conf.headersText = it.headers ? JSON.stringify(it.headers, null, 2) : ''
    modelOptions.value[conf.id] = conf.model ? [createModelOption(conf.model)] : []
    return conf
  })
  if (formContent.value.length === 1) {
    formContent.value[0].enabled = true
  }
})

type LlmPresetConfig = Omit<LlmConfigFormItem, 'id' | 'headersText' | 'headers'> & {
  headers?: Record<string, string>
}

const llmPresetList: {
  name: string
  config: LlmPresetConfig
}[] = [
  {
    name: 'Magpie 本地网关（127.0.0.1:3425）',
    config: {
      model: 'group/gpt-6.1-sol',
      providerApiSecret: '',
      providerCompleteApiUrl: 'http://127.0.0.1:3425/v1',
      serveWeight: 100,
      enabled: true,
      apiMode: 'chat',
      reasoningEffort: 'low',
      maxOutputTokens: 2048,
      temperature: 0.1,
      jsonMode: true
    }
  },
  {
    name: 'DeepSeek 官方（deepseek-flash，关闭思考）',
    config: {
      model: 'deepseek-flash',
      providerApiSecret: '',
      providerCompleteApiUrl: 'https://api.deepseek.com',
      serveWeight: 100,
      enabled: true,
      apiMode: 'chat',
      reasoningEffort: 'none',
      maxOutputTokens: 1024,
      temperature: 0.1,
      jsonMode: true
    }
  },
  {
    name: 'DeepSeek 官方（deepseek-v4-pro，低思考）',
    config: {
      model: 'deepseek-v4-pro',
      providerApiSecret: '',
      providerCompleteApiUrl: 'https://api.deepseek.com',
      serveWeight: 100,
      enabled: true,
      apiMode: 'chat',
      reasoningEffort: 'low',
      maxOutputTokens: 2048,
      temperature: 0.1,
      jsonMode: true
    }
  },
  {
    name: 'OpenAI 官方（gpt-6-astra，低思考）',
    config: {
      model: 'gpt-6-astra',
      providerApiSecret: '',
      providerCompleteApiUrl: 'https://api.openai.com/v1',
      serveWeight: 100,
      enabled: true,
      apiMode: 'chat',
      reasoningEffort: 'low',
      maxOutputTokens: 2048,
      temperature: 0.1,
      jsonMode: true
    }
  },
  {
    name: 'Ollama 本地（qwen3:8b）',
    config: {
      model: 'qwen3:8b',
      providerApiSecret: 'ollama',
      providerCompleteApiUrl: 'http://127.0.0.1:11434/v1',
      serveWeight: 100,
      enabled: true,
      apiMode: 'chat',
      reasoningEffort: 'default',
      maxOutputTokens: 1024,
      temperature: 0.1,
      jsonMode: true
    }
  },
  {
    name: '自定义 OpenAI 兼容接口',
    config: {
      model: '',
      providerApiSecret: '',
      providerCompleteApiUrl: '',
      serveWeight: 100,
      enabled: true,
      apiMode: 'chat',
      reasoningEffort: 'default',
      maxOutputTokens: 1024,
      temperature: 0.1,
      jsonMode: true
    }
  }
]

const providerList: Array<{ name: string; url: string }> = [
  {
    name: 'DeepSeek',
    url: 'https://platform.deepseek.com/'
  },
  {
    name: '阿里云百炼',
    url: 'https://bailian.console.aliyun.com/?tab=model#/api-key'
  },
  {
    name: 'OpenAI (国内可能不可用)',
    url: 'https://platform.openai.com/api-keys'
  },
  {
    name: 'Ollama（本地，无需 Secret）',
    url: 'https://ollama.com/download'
  },
  {
    name: 'Magpie（本地，无需 Secret）',
    url: 'http://127.0.0.1:3425'
  }
]

function handlePresetClick(selected: (typeof llmPresetList)[number], index) {
  gtagRenderer('model_preset_clicked', {
    name: selected.name
  })
  const id = formContent.value[index].id || uuid()
  const { headers, ...preset } = selected.config
  formContent.value[index] = {
    ...getNewConfigItem(),
    ...preset,
    id,
    headersText: headers ? JSON.stringify(headers, null, 2) : ''
  }
  modelOptions.value[id] = preset.model ? [createModelOption(preset.model)] : []
}

async function handleFetchModels(conf: LlmConfigFormItem) {
  if (!conf.providerCompleteApiUrl?.trim()) {
    ElMessage.warning('请先填写服务提供商 Base URL')
    return
  }
  let headers
  try {
    headers = parseHeadersText(conf.headersText)
  } catch (err) {
    ElMessage.error((err as Error)?.message ?? '自定义请求头格式无效')
    return
  }
  modelListLoading.value[conf.id] = true
  try {
    const models = await electron.ipcRenderer.invoke('fetch-llm-model-list', {
      baseURL: conf.providerCompleteApiUrl,
      apiKey: conf.providerApiSecret,
      headers
    })
    modelOptions.value[conf.id] = Array.isArray(models) ? models : []
    if (!modelOptions.value[conf.id].length) {
      ElMessage.warning('接口没有返回模型，可以直接手填模型 ID')
    } else {
      ElMessage.success(`已获取 ${modelOptions.value[conf.id].length} 个模型`)
    }
  } catch (err) {
    ElMessage.error(`获取模型失败：${(err as Error)?.message ?? err}`)
  } finally {
    modelListLoading.value[conf.id] = false
  }
}

const firstInputRefList = ref<InstanceType<typeof ElInput>[]>([])
function addConfig() {
  gtagRenderer('new_config_item_added', { config_list_length_before_add: formContent.value.length })
  formContent.value.push(getNewConfigItem())
  nextTick(() => {
    firstInputRefList.value[firstInputRefList.value.length - 1]?.focus()
  })
}
function moveConfigUp(index) {
  ;[formContent.value[index], formContent.value[index - 1]] = [
    formContent.value[index - 1],
    formContent.value[index]
  ]
  gtagRenderer('config_item_moved_up')
}

function moveConfigDown(index) {
  ;[formContent.value[index], formContent.value[index + 1]] = [
    formContent.value[index + 1],
    formContent.value[index]
  ]
  gtagRenderer('config_item_moved_down')
}

function removeConfig(index) {
  formContent.value.splice(index, 1)
  if (formContent.value.length === 1) {
    formContent.value[0].enabled = true
  }
  gtagRenderer('config_item_removed')
}

watch(
  () => formContent.value.length,
  async (nVal) => {
    await sleep(100)
    if (nVal <= 1) {
      electron.ipcRenderer.send('update-window-size', {
        width: window.innerWidth,
        height: 760
      })
    } else {
      electron.ipcRenderer.send('update-window-size', {
        width: window.innerWidth,
        height: 960
      })
    }
  },
  {
    immediate: true
  }
)
const openExternalLink = (url) => {
  electron.ipcRenderer.send('open-external-link', url)
}

// function handleTestAvailability() {}
</script>

<style lang="scss" scoped>
.llm-config-page {
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  height: 100vh;
  .main-wrapper {
    flex: 1;
    overflow: auto;
    main {
      margin: 0 auto;
      max-width: 600px;
    }
  }
  footer {
    background-color: #f0f0f0;
  }
}
</style>

<style lang="scss">
.llm-config-form.el-form {
  .el-form-item__error--inline {
    margin-left: 0;
    margin-top: 10px;
  }
  .el-select {
    width: 100%;
  }
  .llm-advanced {
    margin-bottom: 12px;
    border-top: none;
    border-bottom: none;
    .el-collapse-item__header {
      height: 32px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      border-bottom: none;
    }
    .el-collapse-item__wrap {
      border-bottom: none;
    }
    .el-collapse-item__content {
      padding-bottom: 8px;
    }
  }
  .advanced-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
    .el-form-item {
      margin-bottom: 12px;
    }
    .advanced-full {
      grid-column: 1 / -1;
    }
  }
  .serve-weight-config {
    display: flex;
    justify-content: space-between;
    .el-form-item__label {
      margin-bottom: 0;
    }
    .el-form-item__content {
      display: flex;
      flex-wrap: nowrap;
    }
  }
}
</style>
