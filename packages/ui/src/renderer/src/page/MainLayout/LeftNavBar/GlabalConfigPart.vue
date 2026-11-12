<template>
  <div class="group-item">
    <div class="group-title">全局设置</div>
    <div flex flex-col class="link-list">
      <a href="javascript:void(0)" @click="handleClickEditResume"> 编辑简历 </a>
      <a href="javascript:void(0)" @click="handleClickJobSearchProfile"> 求职配置 </a>
      <a href="javascript:void(0)" @click="handleClickConfigCommonJobCondition">
        公共职位筛选条件
      </a>
      <a href="javascript:void(0)" @click="handleClickBrowserSetting">
        编辑浏览器偏好<TopRight w-1em h-1em mr10px />
      </a>
      <a href="javascript:void(0)" @click="handleClickConfigLlm">
        配置大语言模型
        <div>
          <el-tooltip
            placement="right"
            :enterable="false"
            @show="gtagRenderer('tooltip_show_for_rnrr_entry')"
          >
            <template #content>
              <div class="font-size-12px">
                支持 OpenAI 兼容接口<br />DeepSeek、OpenAI、Magpie、Ollama 等本地网关<br />
                支持多个“服务商-模型”组合按权重搭配使用
              </div>
            </template>
            <QuestionFilled w-1em h-1em mr10px />
          </el-tooltip>
          <TopRight w-1em h-1em mr10px />
        </div>
      </a>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { gtagRenderer } from '@renderer/utils/gtag'
import { ElMessage } from 'element-plus'
import { TopRight, QuestionFilled } from '@element-plus/icons-vue'

const handleClickBrowserSetting = async () => {
  gtagRenderer('browser_setting_clicked')
  try {
    await electron.ipcRenderer.invoke('config-with-browser-assistant')
    ElMessage({
      type: 'success',
      message: '浏览器偏好保存成功'
    })
  } catch {
    //
  }
}

const handleClickConfigLlm = async () => {
  gtagRenderer('config_llm_clicked')
  try {
    await electron.ipcRenderer.invoke('llm-config')
  } catch (err) {
    console.log(err)
  }
}

const handleClickEditResume = async () => {
  gtagRenderer('edit_resume_clicked', { entry: 'left-nav' })
  try {
    await electron.ipcRenderer.invoke('resume-edit')
  } catch (err) {
    console.log(err)
  }
}

const handleClickJobSearchProfile = async () => {
  gtagRenderer('job_search_profile_clicked', { entry: 'left-nav' })
  try {
    await electron.ipcRenderer.invoke('open-job-search-profile')
  } catch (err) {
    console.log(err)
  }
}

const handleClickConfigCommonJobCondition = async () => {
  gtagRenderer('config_cjc_clicked', { entry: 'left-nav' })
  try {
    await electron.ipcRenderer.invoke('common-job-condition-config')
  } catch (err) {
    console.log(err)
  }
}
</script>

<style scoped lang="scss" src="./style.scss"></style>
