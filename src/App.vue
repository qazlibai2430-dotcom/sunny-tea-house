<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { LANGUAGES, isLanguage, resolveLanguage, ERROR_KEYS } from '../shared/languages.js';
import { useI18n, readPreference, savePreference } from './i18n.js';
import { getShopConfig, requestReview } from './api.js';

const { locale, t } = useI18n();
const savedOutput = readPreference('sunny.reviewLanguage', 'auto');
const reviewLanguage = ref(isLanguage(savedOutput) ? savedOutput : 'auto');
watch(reviewLanguage, value => { savePreference('sunny.reviewLanguage', value); confirmed.value = false; notice.value = ''; });

const config = ref(null);
const selectedTags = ref([]);
const selectedPlatform = ref('Google');
const generatedContent = ref('');
const generatedFor = ref(null);
const isLoading = ref(false);
const error = ref('');
const notice = ref('');
const editor = ref(null);
const confirmed = ref(false);
const copying = ref(false);
const languageOpen = ref(false);
const platforms = [
  { name: 'Google', mark: 'G', detail: 'googleStyle', className: 'google' },
  { name: '小红书', mark: '小红书', detail: 'redStyle', className: 'red' },
];
const outputLanguage = computed(() => resolveLanguage(reviewLanguage.value, selectedPlatform.value));
// 界面语言不参与草稿签名；只改变展示语言不会让已编辑的文案失效。
const signature = computed(() => JSON.stringify({ platform: selectedPlatform.value, language: outputLanguage.value, tags: [...selectedTags.value].sort() }));
const platformName = platform => platform === '小红书' ? t('redName') : platform;
const languageName = code => LANGUAGES.find(item => item.code === code)?.label || '';
const stale = computed(() => generatedFor.value && generatedFor.value.signature !== signature.value);
const characterCount = computed(() => [...generatedContent.value].length);
const tooLong = computed(() => generatedFor.value?.platform === '小红书' && characterCount.value > 150);
const canCopy = computed(() => generatedContent.value.trim() && !stale.value && !tooLong.value && !isLoading.value && confirmed.value);
const targetUrl = computed(() => config.value?.urls[generatedFor.value?.platform] || '');
watch([locale, config], () => { document.title = `${config.value?.store.name || 'Sunny Tea House'} · ${t('assistant')}`; }, { immediate: true });

async function loadConfig() {
  error.value = '';
  try {
    config.value = await getShopConfig();
  } catch { error.value = 'loadError'; }
}
onMounted(loadConfig);

function toggleTag(tag) {
  if (isLoading.value) return;
  if (selectedTags.value.includes(tag)) selectedTags.value = selectedTags.value.filter(item => item !== tag);
  else if (selectedTags.value.length < 2) selectedTags.value.push(tag);
  confirmed.value = false;
  notice.value = '';
}

async function generateReview() {
  if (!config.value || isLoading.value || !selectedTags.value.length) return;
  // 保存本次请求快照：评价必须和生成时的平台、标签绑定。
  const request = { tags: [...selectedTags.value], platform: selectedPlatform.value, language: outputLanguage.value };
  const requestSignature = signature.value;
  isLoading.value = true;
  error.value = ''; notice.value = ''; confirmed.value = false;
  try {
    const data = await requestReview(request);
    // 仅在成功后替换，失败时保留顾客已经编辑的内容。
    generatedContent.value = data.content;
    generatedFor.value = { signature: requestSignature, platform: request.platform, language: data.language || request.language };
    notice.value = 'ready';
  } catch (err) {
    error.value = err.name === 'TimeoutError' ? 'timeout' : err instanceof TypeError ? 'networkError' : Object.values(ERROR_KEYS).includes(err.message) ? err.message : 'serverError';
  } finally { isLoading.value = false; }
}

async function copyAndRedirect() {
  if (!canCopy.value || copying.value) return;
  copying.value = true; notice.value = '';
  // 在用户点击的同步阶段预留窗口，避免等待剪贴板后被浏览器拦截。
  const popup = targetUrl.value ? window.open('about:blank', '_blank') : null;
  if (popup) popup.opener = null;
  try {
    await navigator.clipboard.writeText(generatedContent.value.trim());
  } catch {
    popup?.close();
    editor.value?.focus(); editor.value?.select();
    notice.value = 'copyFailed';
    copying.value = false;
    return;
  }
  if (popup) {
    popup.location.replace(targetUrl.value);
    notice.value = 'opened';
  } else {
    notice.value = targetUrl.value ? 'blocked' : 'copied';
  }
  copying.value = false;
}
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="/" :aria-label="t('home')">
        <img src="/sun.svg" width="44" height="44" alt="" />
        <span>{{ config?.store.name || 'Sunny Tea House' }}<small>{{ t('tagline') }}</small></span>
      </a>
      <div class="header-meta"><div class="language-picker"><button class="globe-button" type="button" :aria-expanded="languageOpen" :aria-label="t('language')" @click="languageOpen = !languageOpen">◎</button><div v-if="languageOpen" class="language-menu" role="menu"><button v-for="language in LANGUAGES" :key="language.code" type="button" :class="{ active: locale === language.code }" role="menuitem" @click="locale = language.code; languageOpen = false">{{ language.label }}</button></div></div><span class="location">{{ config?.store.city || 'San Jose' }} · CA</span></div>
    </header>

    <main>
      <section class="intro">
        <div><p class="eyebrow">YOUR TEA, YOUR WORDS</p><h1>{{ t('hero1') }}<br class="mobile-break" /> {{ t('hero2') }}<span>{{ locale.startsWith('zh') ? '。' : '.' }}</span></h1><p class="intro-copy">{{ t('intro') }}</p></div>
        <div class="tea-stamp" aria-hidden="true"><span>FRESHLY</span><b>茶</b><span>BREWED</span></div>
      </section>

      <div v-if="!config" class="connection-message" role="status"><p>{{ t(error || 'preparing') }}</p><button v-if="error" class="secondary" @click="loadConfig">{{ t('reconnect') }}</button></div>
      <div v-else class="workspace">
        <section class="selection-card" :aria-label="t('selection')">
          <div class="card-kicker"><span>{{ t('start') }}</span></div>
          <fieldset :disabled="isLoading">
            <legend><span class="step">01</span> {{ t('feeling') }}</legend>
            <p class="field-hint">{{ t('pick') }}<span>{{ selectedTags.length }}/2</span></p>
            <div class="tags"><button v-for="tag in config.tags" :key="tag" type="button" :aria-pressed="selectedTags.includes(tag)" :disabled="!selectedTags.includes(tag) && selectedTags.length >= 2" :class="['tag', { selected: selectedTags.includes(tag) }]" @click="toggleTag(tag)"><span aria-hidden="true">{{ selectedTags.includes(tag) ? '✓' : '+' }}</span>{{ t(tag) }}</button></div>
          </fieldset>
          <fieldset class="platform-field" :disabled="isLoading">
            <legend><span class="step">02</span> {{ t('where') }}</legend>
            <p class="field-hint">{{ t('platformHint') }}</p>
            <div class="platforms"><label v-for="platform in platforms" :key="platform.name" :class="['platform', { active: selectedPlatform === platform.name }]"><input v-model="selectedPlatform" type="radio" name="platform" :value="platform.name" @change="confirmed = false; notice = ''" /><span :class="['platform-mark', platform.className]">{{ platform.mark }}</span><strong>{{ platformName(platform.name) }}</strong><small>{{ t(platform.detail) }}</small><span class="radio-dot" aria-hidden="true"></span></label></div>
          </fieldset>
          <div class="output-language"><label for="review-language">{{ t('outputLanguage') }}</label><select id="review-language" v-model="reviewLanguage" :disabled="isLoading"><option value="auto">{{ t('auto') }}</option><option v-for="language in LANGUAGES" :key="language.code" :value="language.code">{{ language.label }}</option></select><p>{{ t('outputHint') }}</p></div>
          <button class="primary generate" :disabled="!selectedTags.length || isLoading" @click="generateReview"><span :class="{ spinner: isLoading }" aria-hidden="true">{{ isLoading ? '' : '✧' }}</span>{{ t(isLoading ? 'generating' : generatedContent ? 'regenerate' : 'generate') }}<span v-if="!isLoading" aria-hidden="true">↗</span></button>
          <p class="generation-note">{{ t(config.demo ? 'demoNote' : 'aiNote') }}</p>
          <p v-if="config.notificationEnabled" class="generation-note">{{ t('notifyNote') }}</p>
          <p v-if="error" class="error-message" role="alert">{{ t(error) }}</p>
        </section>

        <section class="preview-card" :aria-busy="isLoading" :aria-label="t('previewAria')">
          <div class="preview-heading"><h2><span class="step">03</span> {{ t('yours') }}</h2><span class="draft-badge">{{ generatedFor ? platformName(generatedFor.platform) + ' · ' + t('draft') : t('preview') }}</span></div>
          <template v-if="generatedContent || generatedFor">
            <p class="field-hint">{{ t('editHint') }}</p>
            <label class="sr-only" for="review">{{ t('content') }}</label>
            <textarea id="review" ref="editor" v-model="generatedContent" :disabled="isLoading" :placeholder="t('placeholder')" :lang="generatedFor?.language" @input="confirmed = false; notice = ''"></textarea>
            <div class="editor-meta"><span>{{ languageName(generatedFor?.language) }} · {{ t(config.demo ? 'demoDraft' : 'aiDraft') }}</span><span :class="{ 'over-limit': tooLong }">{{ characterCount }}{{ generatedFor?.platform === '小红书' ? ' / 150' : '' }} {{ t('characters') }}</span></div>
            <p v-if="stale" class="warning" role="status">{{ t('stale') }}</p>
            <p v-if="tooLong" class="warning" role="status">{{ t('tooLong') }}</p>
            <label class="confirm"><input v-model="confirmed" type="checkbox" :disabled="isLoading || !!stale" />{{ t('confirm') }}</label>
            <button class="primary copy" :disabled="!canCopy || copying" @click="copyAndRedirect">{{ t(copying ? 'copying' : targetUrl ? 'copyOpen' : 'copy') }}</button>
            <a v-if="targetUrl && !stale" class="manual-link" :href="targetUrl" target="_blank" rel="noopener noreferrer">{{ t('manual') }} {{ platformName(generatedFor.platform) }} ↗</a>
            <p v-else-if="!targetUrl" class="generation-note">{{ t('noGoogle') }}</p>
          </template>
          <div v-else class="empty-preview">
            <div class="tea-illustration" aria-hidden="true"><span class="spark one">✦</span><span class="spark two">✧</span><div class="straw"></div><div class="cup"><div class="tea-liquid"></div><div class="cup-label"><img src="/sun.svg" alt="" width="30" height="30" /><span>SUNNY TEA</span></div><i></i><i></i><i></i></div><div class="cup-shadow"></div></div>
            <h3>{{ t(isLoading ? 'brewing' : 'emptyTitle') }}</h3><p>{{ t(isLoading ? 'waiting' : 'emptyHint') }}</p>
          </div>
          <p v-if="notice" class="notice" role="status">{{ t(notice) }}</p>
          <div class="preview-foot"><span aria-hidden="true">✳</span> {{ t('foot') }}</div>
        </section>
      </div>
      <div class="bottom-note"><span>{{ t('bottom') }}</span><span>{{ t('step1') }} <b>→</b> {{ t('step2') }} <b>→</b> {{ t('step3') }}</span></div>
    </main>
    <footer><span>© {{ new Date().getFullYear() }} {{ config?.store.name || 'Sunny Tea House' }}</span><span>{{ t('fictional') }} · {{ config?.store.city || 'San Jose' }}</span></footer>
  </div>
</template>
