(() => {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.error('Service worker registration failed', error);
      });
    });
  }

  const TIMER_TICK_MS = 10;
  const LOG_TOTAL_MS = 8_000;
  const POST_LOG_DELAY_MS = 2_500;
  const RETURN_HOME_DELAY_MS = 7_000;
  const MIN_DURATION_MS = 10_000;
  const ABORT_HOLD_MS = 1_500;
  const STORAGE_KEY = 'mi_prop_rankings_v1';
  const CODE_LENGTH = 4;
  const PENALTY_MS = 10_000;
  const MAX_RANKING_ENTRIES = 200;
  const REWARD_QUEUE_DELAY_MS = 1_800;
  const REWARD_AUTO_RETURN_MS = 3_500;

  const DEFAULT_VIDEOS = {
    explosion: { name: 'BOM_video.mp4', url: 'videoes/BOM_video.mp4' },
    reward: {
      fast: { name: 'BestSpeed.mp4', url: 'videoes/BestSpeed.mp4' },
      normal: { name: 'NormalSpeed.mp4', url: 'videoes/NormalSpeed.mp4' },
      slow: { name: 'BadSpeed.mp4', url: 'videoes/BadSpeed.mp4' }
    }
  };

  const STATUS_CONFIG = {
    ready: { text: '待機', variant: 'ready' },
    armed: { text: '起動', variant: 'armed' },
    verify: { text: '判定', variant: 'verify' },
    success: { text: '解除', variant: 'success' },
    failure: { text: '失敗', variant: 'failure' },
    retry: { text: '再挑戦', variant: 'failure' }
  };

  const SEGMENT_MAP = {
    '0': ['a', 'b', 'c', 'd', 'e', 'f'],
    '1': ['b', 'c'],
    '2': ['a', 'b', 'g', 'e', 'd'],
    '3': ['a', 'b', 'c', 'd', 'g'],
    '4': ['f', 'g', 'b', 'c'],
    '5': ['a', 'f', 'g', 'c', 'd'],
    '6': ['a', 'f', 'e', 'd', 'c', 'g'],
    '7': ['a', 'b', 'c'],
    '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    '9': ['a', 'b', 'c', 'd', 'f', 'g'],
    ' ': []
  };

  const LOG_JP_INFO = [
    '監視卓: 映像フィード同期中',
    '支援班: ワイヤリングチェック完了',
    '報告: センサー群キャリブレーションOK',
    '司令: タイムトラッカー自動保存開始',
    '搬入班: 予備バッテリー接続済み',
    '音響: BGM音量を安全値に設定',
    '警備班: 巡回ルート変更完了',
    '中継塔: 暗号通信チャネル安定',
    '補給班: 工具キットを再配置',
    '解析班: ロジック分岐テスト成功',
    '記録班: 参加グループID登録済み',
    '管制: 会場照明フェイルセーフ待機'
  ];


  const LOG_EN_INFO = [
    'CONTROL LINK GREEN',
    'SYNC: CLOCK LOCKED IN',
    'COOLING LOOP NOMINAL',
    'SENSOR GRID STABLE',
    'BACKUP RELAY ONLINE',
    'AUTH CACHE REFRESHED',
    'CHANNEL CLEAN / NOISE LOW',
    'CHECKPOINT PASS: EXTERNAL SHIELD'
  ];


  const LOG_JP_ERROR = [
    '警告: 回路ノイズ上昇 -> 手動監視へ移行',
    '警告: 冷却ファン負荷 112% -> 状況確認',
    '異常: 通信ライン遅延 240ms',
    '注意: 振動センサーが短期閾値超過',
    '障害: デバッグポートが再接続を要求',
    '警報: 出力リレー再起動シーケンス実行'
  ];


  const LOG_EN_ERROR = [
    'ALERT: VOLTAGE RIPPLE OUT OF RANGE',
    'FAULT: AUTH TOKEN RETRY REQUESTED',
    'WARNING: PACKET LOSS ON NODE 4',
    'CRITICAL: COOLANT FLOW IRREGULAR'
  ];

  const LOG_JP_WEIGHT = 0.6;

  const LOG_SUMMARY_LINES = {
    success: [
      { text: '報告: 解除コード一致 -> タイマー停止', error: false, emphasize: true },
      { text: 'SYSTEM: DEVICE DISARMED / SAFE MODE', error: false, emphasize: false }
    ],
    failure: [
      { text: '警告: 解除コード不一致 -> 再試行プロトコル移行', error: true, emphasize: true },
      { text: 'NOTICE: TIMER RESUMED FOR RETRY WINDOW', error: false, emphasize: false }
    ]
  };


  const dom = {
    screens: {
      admin: document.getElementById('adminScreen'),
      bomb: document.getElementById('bombScreen')
    },
    startButton: document.getElementById('startButton'),
    abortButton: document.getElementById('abortButton'),
    abortProgress: document.getElementById('abortProgress'),
    timerDisplay: document.getElementById('timerDisplay'),
    timerArea: document.getElementById('timerArea'),
    logArea: document.getElementById('logArea'),
    resultArea: document.getElementById('resultArea'),
    logOutput: document.getElementById('logOutput'),
    keypadDisplay: document.getElementById('keypadDisplay'),
    statusLabel: document.getElementById('statusLabel'),
    keypad: document.getElementById('keypad'),
    flashOverlay: document.getElementById('flashOverlay'),
    videoOverlay: document.getElementById('videoOverlay'),
    explosionVideo: document.getElementById('explosionVideo'),
    videoFallback: document.getElementById('videoFallback'),
    rewardOverlay: document.getElementById('rewardOverlay'),
    rewardVideo: document.getElementById('rewardVideo'),
    rewardCloseButton: document.getElementById('rewardCloseButton'),
    bgmInput: document.getElementById('bgmInput'),
    bgmStatus: document.getElementById('bgmStatus'),
    videoInput: document.getElementById('videoInput'),
    videoStatus: document.getElementById('videoStatus'),
    minutesInput: document.getElementById('minutesInput'),
    secondsInput: document.getElementById('secondsInput'),
    codeInput: document.getElementById('codeInput'),
    resultTitle: document.getElementById('resultTitle'),
    resultSubtitle: document.getElementById('resultSubtitle'),
    resultCaption: document.getElementById('resultCaption'),
    playerResult: document.getElementById('playerResult'),
    playerTime: document.getElementById('playerTime'),
    playerRank: document.getElementById('playerRank'),
    resultLeaderboard: document.getElementById('resultLeaderboard'),
    rankingDescription: document.getElementById('rankingDescription'),
    rankingList: document.getElementById('rankingList'),
    fastMinutesInput: document.getElementById('fastMinutesInput'),
    fastSecondsInput: document.getElementById('fastSecondsInput'),
    normalMinutesInput: document.getElementById('normalMinutesInput'),
    normalSecondsInput: document.getElementById('normalSecondsInput'),
    fastVideoInput: document.getElementById('fastVideoInput'),
    fastVideoStatus: document.getElementById('fastVideoStatus'),
    normalVideoInput: document.getElementById('normalVideoInput'),
    normalVideoStatus: document.getElementById('normalVideoStatus'),
    slowVideoInput: document.getElementById('slowVideoInput'),
    slowVideoStatus: document.getElementById('slowVideoStatus'),
    clearRankingButton: document.getElementById('clearRankingButton'),
    stageGrid: document.querySelector('.stage-grid'),
    adminPanel: document.getElementById('admin-panel'),
    saveCard: document.getElementById('save-settings-card'),
    saveButton: document.getElementById('save-button'),
    cancelButton: document.getElementById('cancel-button'),
    bgmSourceDefault: document.getElementById('bgm-source-default'),
    bgmSourceCustom: document.getElementById('bgm-source-custom'),
    customBgmPicker: document.getElementById('custom-bgm-picker'),
    bgmEnabledToggle: document.getElementById('bgm-enabled-toggle'),
    bgmVolumeSlider: document.getElementById('bgm-volume-slider'),
    sfxVolumeSlider: document.getElementById('sfx-volume-slider'),
    explosionVideoVolume: document.getElementById('explosion-video-volume'),
    fastVideoVolume: document.getElementById('fast-video-volume'),
    normalVideoVolume: document.getElementById('normal-video-volume'),
    slowVideoVolume: document.getElementById('slow-video-volume'),
  };

  dom.flashOverlay.dataset.mode = 'danger';

  const keypadButtons = Array.from(dom.keypad.querySelectorAll('button'));
  const beepTone = document.getElementById('beep');
  const enterTone = document.getElementById('enterTone');
  const warningTone = document.getElementById('warningTone');
  const errorTone = document.getElementById('errorTone');

  let audioCtx = null;
  let holdStopTimer = null;
  let holdSourceNode = null;
  let holdGainNode = null;
  let holdBuffer = null;
  let holdBufferPromise = null;
  let activeHoldElement = null;
  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch {
      audioCtx = null;
    }
    return audioCtx;
  }

  function requestHoldBuffer() {
    if (holdBuffer || holdBufferPromise || !beepTone || !window.fetch) return;
    const src = beepTone.currentSrc || beepTone.src;
    if (!src) return;
    holdBufferPromise = fetch(src)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((data) => {
        if (!data) return null;
        const ctx = ensureAudioContext();
        if (!ctx) return null;
        return ctx.decodeAudioData(data.slice(0));
      })
      .then((buffer) => {
        holdBuffer = buffer;
        return buffer;
      })
      .catch(() => {
        holdBufferPromise = null;
        return null;
      });
  }

  requestHoldBuffer();

  const preventScale = (event) => {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
  };

  const preventCtrlScrollZoom = (event) => {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  };

  window.addEventListener('gesturestart', (event) => event.preventDefault());
  document.addEventListener('touchstart', preventScale, { passive: false });
  document.addEventListener('touchmove', preventScale, { passive: false });
  document.addEventListener('wheel', preventCtrlScrollZoom, { passive: false });
  document.addEventListener('dblclick', (event) => event.preventDefault());

  function playHoldTone(durationMs = 2_000, volume = 0.5) {
    requestHoldBuffer();
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const safeVolume = Math.min(1, Math.max(0, volume));
    stopHoldTone();
    if (ctx && holdBuffer) {
      try {
        holdGainNode = ctx.createGain();
        holdGainNode.gain.value = safeVolume;
        holdSourceNode = ctx.createBufferSource();
        holdSourceNode.buffer = holdBuffer;
        holdSourceNode.loop = true;
        if (holdBuffer.duration > 0.2) {
          const offset = Math.min(0.08, holdBuffer.duration / 4);
          holdSourceNode.loopStart = offset;
          holdSourceNode.loopEnd = holdBuffer.duration - offset;
        }
        holdSourceNode.connect(holdGainNode);
        holdGainNode.connect(ctx.destination);
        holdSourceNode.start();
        if (typeof state !== 'undefined') state.holdToneActive = true;
        holdStopTimer = setTimeout(stopHoldTone, durationMs);
        return;
      } catch {
        if (holdSourceNode) {
          try { holdSourceNode.stop(); } catch { /* noop */ }
          holdSourceNode.disconnect();
        }
        holdSourceNode = null;
        if (holdGainNode) {
          holdGainNode.disconnect();
          holdGainNode = null;
        }
      }
    }
    if (!beepTone) return;
    activeHoldElement = beepTone;
    activeHoldElement.loop = true;
    activeHoldElement.playbackRate = 1;
    activeHoldElement.volume = safeVolume;
    activeHoldElement.currentTime = 0;
    const playPromise = activeHoldElement.play();
    if (playPromise) playPromise.catch(() => {});
    if (typeof state !== 'undefined') state.holdToneActive = true;
    holdStopTimer = setTimeout(stopHoldTone, durationMs);
  }

  function stopHoldTone() {
    if (holdStopTimer) {
      clearTimeout(holdStopTimer);
      holdStopTimer = null;
    }
    if (holdSourceNode) {
      try {
        holdSourceNode.stop();
      } catch {
        /* noop */
      }
      holdSourceNode.disconnect();
      holdSourceNode = null;
    }
    if (holdGainNode) {
      holdGainNode.disconnect();
      holdGainNode = null;
    }
    if (activeHoldElement) {
      try {
        activeHoldElement.loop = false;
        activeHoldElement.pause();
        activeHoldElement.currentTime = 0;
      } catch {
        /* noop */
      }
      activeHoldElement = null;
    }
    if (typeof state !== 'undefined') state.holdToneActive = false;
  }



const bgmPlayer = new Audio();
bgmPlayer.loop = true;
bgmPlayer.preload = 'auto';
bgmPlayer.addEventListener('loadedmetadata', () => {
  bgmPlayer.volume = state.config.bgmVolume / 100;
});

  if (beepTone) {
    beepTone.preservesPitch = false;
    beepTone.mozPreservesPitch = false;
    beepTone.webkitPreservesPitch = false;
    beepTone.loop = false;
  }

  const state = {
    mode: 'admin',
    config: {
      durationMs: 2 * 60 * 1000,
      code: '2580',
      bgmEnabled: true,
      bgmSource: 'default', // 'default' or 'custom'
      bgmVolume: 50, // 0-100
      sfxVolume: 100, // 0-100
      bgm: { name: '未選択', url: null },
      explosion: { ...DEFAULT_VIDEOS.explosion },
      fastThresholdMs: 55 * 1000,
      normalThresholdMs: 90 * 1000,
      rewardVideos: {
        fast: { ...DEFAULT_VIDEOS.reward.fast },
        normal: { ...DEFAULT_VIDEOS.reward.normal },
        slow: { ...DEFAULT_VIDEOS.reward.slow }
      },
      videoVolumes: {
        explosion: 100,
        fast: 100,
        normal: 100,
        slow: 100
      }
    },
    buffer: '',
    remainingMs: 4 * 60 * 1000,
    timerId: null,
    lastTick: null,
    beepElapsed: 0,
    logController: null,
    returnTimer: null,
    criticalBeepTimer: null,
    bgmFadeTimer: null,
    awaitingReward: false,
    activeRewardCategory: null,
    rewardTimeout: null,
    explosionDelayTimer: null,
    flashTimer: null,
    holdToneActive: false,
    lastResultId: null,
    abortHold: {
      active: false,
      start: 0,
      raf: null,
      pointerId: null
    }
  };

  let rankingData = loadRanking();
  const digitControllers = buildSevenSegment(dom.timerDisplay);

  renderTimer(state.remainingMs);
  renderInputBuffer();
  setKeypadEnabled(false);
  setStatus('ready');
  renderRanking();
  syncThresholdInputs();
  showScreen('admin');
  updateFileStatus(dom.bgmStatus, state.config.bgm.name);
  updateFileStatus(dom.videoStatus, state.config.explosion.name);
  updateFileStatus(dom.fastVideoStatus, state.config.rewardVideos.fast.name);
  updateFileStatus(dom.normalVideoStatus, state.config.rewardVideos.normal.name);
  updateFileStatus(dom.slowVideoStatus, state.config.rewardVideos.slow.name);

  dom.explosionVideoVolume.value = String(state.config.videoVolumes.explosion);
  dom.fastVideoVolume.value = String(state.config.videoVolumes.fast);
  dom.normalVideoVolume.value = String(state.config.videoVolumes.normal);
  dom.slowVideoVolume.value = String(state.config.videoVolumes.slow);
  dom.explosionVideo.volume = state.config.videoVolumes.explosion / 100;
  dom.rewardVideo.volume = state.config.videoVolumes.slow / 100;

  dom.startButton.addEventListener('click', startSession);

  dom.abortButton.addEventListener('pointerdown', startAbortHold);
  dom.abortButton.addEventListener('pointerup', cancelAbortHold);
  dom.abortButton.addEventListener('pointerleave', cancelAbortHold);
  dom.abortButton.addEventListener('pointercancel', cancelAbortHold);

  dom.bgmEnabledToggle.addEventListener('change', updateBgmState);
  dom.bgmSourceDefault.addEventListener('change', updateBgmState);
  dom.bgmSourceCustom.addEventListener('change', updateBgmState);
  dom.bgmInput.addEventListener('change', handleCustomBgmSelection);
  dom.bgmVolumeSlider.addEventListener('input', () => {
    state.config.bgmVolume = parseInt(dom.bgmVolumeSlider.value, 10);
    bgmPlayer.volume = state.config.bgmVolume / 100;
  });
  dom.sfxVolumeSlider.addEventListener('input', () => {
    state.config.sfxVolume = parseInt(dom.sfxVolumeSlider.value, 10);
  });
  dom.explosionVideoVolume.addEventListener('input', handleExplosionVolumeChange);
  dom.fastVideoVolume.addEventListener('input', () => handleRewardVideoVolumeChange('fast'));
  dom.normalVideoVolume.addEventListener('input', () => handleRewardVideoVolumeChange('normal'));
  dom.slowVideoVolume.addEventListener('input', () => handleRewardVideoVolumeChange('slow'));
  dom.videoInput.addEventListener('change', handleExplosionVideoSelection);
  dom.fastVideoInput.addEventListener('change', (event) => handleRewardVideoSelection('fast', event.target.files?.[0] || null));
  dom.normalVideoInput.addEventListener('change', (event) => handleRewardVideoSelection('normal', event.target.files?.[0] || null));
  dom.slowVideoInput.addEventListener('change', (event) => handleRewardVideoSelection('slow', event.target.files?.[0] || null));

  dom.minutesInput.addEventListener('change', sanitizeTimeInputs);
  dom.secondsInput.addEventListener('change', sanitizeTimeInputs);
  dom.codeInput.addEventListener('input', sanitizeCodeInput);
  [dom.fastMinutesInput, dom.fastSecondsInput, dom.normalMinutesInput, dom.normalSecondsInput].forEach((input) => input.addEventListener('change', syncThresholdInputs));

  dom.explosionVideo.addEventListener('ended', () => {
    if (state.mode === 'timeout') {
      stopTickSound();
      resetTickPlaybackRate();
      scheduleReturn(1_500, { highlight: 'danger' });
    }
    stopCriticalBeep();
    resetTickPlaybackRate();
  });
  dom.explosionVideo.addEventListener('error', () => {
    if (state.mode === 'timeout') {
      showVideoFallback();
      scheduleReturn(4_000, { highlight: 'danger' });
    }
  });

  dom.rewardVideo.addEventListener('ended', () => stopRewardVideo(true));
  dom.rewardVideo.addEventListener('error', () => stopRewardVideo(true));
  if (dom.rewardCloseButton) {
    dom.rewardCloseButton.addEventListener('click', () => stopRewardVideo(true));
  }

  dom.keypad.addEventListener('click', onKeypadClick);
  document.addEventListener('keydown', onKeydown);
  dom.rankingList.addEventListener('click', onRankingListClick);
  dom.clearRankingButton.addEventListener('click', onClearRanking);
  document.addEventListener('touchmove', (event) => {
    if (state.mode === 'armed') event.preventDefault();
  }, { passive: false });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      handleAppHidden();
    }
  });
  window.addEventListener('pagehide', handleAppHidden);

  // Load settings on startup and add listeners for the save card
  loadSettings();
  updateBgmState(); // Ensure BGM state is applied after loading settings
  dom.saveButton.addEventListener('click', () => {
    saveSettings();
    alert('設定を保存しました。');
  });
  dom.cancelButton.addEventListener('click', () => {
    loadSettings(); // Revert changes by reloading from storage
  });




  function saveSettings() {
    try {
      const settingsToSave = {
        durationMs: state.config.durationMs,
        code: state.config.code,
        fastThresholdMs: state.config.fastThresholdMs,
        normalThresholdMs: state.config.normalThresholdMs,
        bgmEnabled: state.config.bgmEnabled,
        bgmSource: state.config.bgmSource,
        bgmVolume: state.config.bgmVolume,
        sfxVolume: state.config.sfxVolume,
        videoVolumes: {
          explosion: state.config.videoVolumes.explosion,
          fast: state.config.videoVolumes.fast,
          normal: state.config.videoVolumes.normal,
          slow: state.config.videoVolumes.slow
        },
      };
      localStorage.setItem('mi_prop_settings_v1', JSON.stringify(settingsToSave));
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  }

  function loadSettings() {
    try {
      const savedSettings = localStorage.getItem('mi_prop_settings_v1');
      if (!savedSettings) return;

      const parsed = JSON.parse(savedSettings);
      if (!parsed) return;

      // Apply settings from localStorage
      state.config.durationMs = parsed.durationMs || state.config.durationMs;
      state.config.code = parsed.code || state.config.code;
      state.config.fastThresholdMs = parsed.fastThresholdMs || state.config.fastThresholdMs;
      state.config.normalThresholdMs = parsed.normalThresholdMs || state.config.normalThresholdMs;
      state.config.bgmEnabled = parsed.bgmEnabled !== false; // default to true
      state.config.bgmSource = parsed.bgmSource || 'default';
      state.config.bgmVolume = parsed.bgmVolume !== undefined ? parsed.bgmVolume : 65;
      state.config.sfxVolume = parsed.sfxVolume !== undefined ? parsed.sfxVolume : 65;
      if (parsed.videoVolumes) {
        const savedVolumes = parsed.videoVolumes;
        state.config.videoVolumes.explosion = sanitizeVolumeValue(savedVolumes.explosion, state.config.videoVolumes.explosion);
        state.config.videoVolumes.fast = sanitizeVolumeValue(savedVolumes.fast, state.config.videoVolumes.fast);
        state.config.videoVolumes.normal = sanitizeVolumeValue(savedVolumes.normal, state.config.videoVolumes.normal);
        state.config.videoVolumes.slow = sanitizeVolumeValue(savedVolumes.slow, state.config.videoVolumes.slow);
      }

      // Update UI elements from the loaded settings
      dom.bgmVolumeSlider.value = state.config.bgmVolume;
      bgmPlayer.volume = state.config.bgmVolume / 100;

      dom.sfxVolumeSlider.value = state.config.sfxVolume;
      dom.explosionVideoVolume.value = String(state.config.videoVolumes.explosion);
      dom.fastVideoVolume.value = String(state.config.videoVolumes.fast);
      dom.normalVideoVolume.value = String(state.config.videoVolumes.normal);
      dom.slowVideoVolume.value = String(state.config.videoVolumes.slow);
      dom.explosionVideo.volume = state.config.videoVolumes.explosion / 100;
      dom.rewardVideo.volume = state.config.videoVolumes.slow / 100;
      dom.bgmEnabledToggle.checked = state.config.bgmEnabled;
      if (state.config.bgmSource === 'custom') {
        dom.bgmSourceCustom.checked = true;
        dom.customBgmPicker.style.display = 'block';
      } else {
        dom.bgmSourceDefault.checked = true;
        dom.customBgmPicker.style.display = 'none';
      }

      // Update UI elements from the loaded settings
      const minutes = Math.floor(state.config.durationMs / 60000);
      const seconds = Math.floor((state.config.durationMs % 60000) / 1000);
      dom.minutesInput.value = String(minutes);
      dom.secondsInput.value = String(seconds).padStart(2, '0');

      dom.codeInput.value = state.config.code;

      const fastMin = Math.floor(state.config.fastThresholdMs / 60000);
      const fastSec = Math.floor((state.config.fastThresholdMs % 60000) / 1000);
      dom.fastMinutesInput.value = String(fastMin);
      dom.fastSecondsInput.value = String(fastSec).padStart(2, '0');

      const normalMin = Math.floor(state.config.normalThresholdMs / 60000);
      const normalSec = Math.floor((state.config.normalThresholdMs % 60000) / 1000);
      dom.normalMinutesInput.value = String(normalMin);
      dom.normalSecondsInput.value = String(normalSec).padStart(2, '0');
      
      // Ensure state is consistent after updating UI
      sanitizeTimeInputs();
      sanitizeCodeInput();
      syncThresholdInputs();

    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }

  function showScreen(name) {
    if (name === 'admin') {
      stopTickSound();
      resetTickPlaybackRate();
    }
    Object.entries(dom.screens).forEach(([id, element]) => {
      element.classList.toggle('active', id === name);
    });
  }

  function setStatus(key) {
    const config = STATUS_CONFIG[key] || { text: key, variant: 'ready' };
    dom.statusLabel.textContent = config.text;
    dom.statusLabel.className = 'status-chip';
    if (config.variant) dom.statusLabel.classList.add(`status-chip--${config.variant}`);
  }

  function setKeypadEnabled(enabled) {
    keypadButtons.forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function renderInputBuffer() {
    const padded = state.buffer.padEnd(CODE_LENGTH, '_');
    dom.keypadDisplay.textContent = padded.split('').join(' ');
  }

  function renderTimer(ms) {
    const formatted = formatDuration(ms);
    digitControllers.forEach((update, index) => update(formatted[index] || ' '));
  }

  function showTimerArea() {
    dom.logArea.classList.add('hidden');
    dom.resultArea.classList.add('hidden');
    dom.timerArea.classList.remove('hidden');
    dom.stageGrid.classList.remove('is-fullscreen');
    resetResultCaption();
    hidePlayerResult();
    resetResultLeaderboard();
  }

  function showLogArea() {
    dom.timerArea.classList.add('hidden');
    dom.resultArea.classList.add('hidden');
    dom.logArea.classList.remove('hidden');
    dom.stageGrid.classList.add('is-fullscreen');
    stopTickSound();
    resetTickPlaybackRate();
    resetResultLeaderboard();
  }

  function showResultArea(title, subtitle, caption = '') {
    dom.resultTitle.textContent = title;
    dom.resultSubtitle.textContent = subtitle;
    resetResultCaption();
    resetResultLeaderboard();
    if (caption) {
      dom.resultCaption.textContent = caption;
      dom.resultCaption.classList.remove('hidden');
      void dom.resultCaption.offsetWidth;
      dom.resultCaption.classList.add('visible');
    }
    dom.timerArea.classList.add('hidden');
    dom.logArea.classList.add('hidden');
    dom.resultArea.classList.remove('hidden');
    dom.stageGrid.classList.add('is-fullscreen');
  }

  function resetResultCaption() {
    dom.resultCaption.classList.remove('visible');
    dom.resultCaption.classList.add('hidden');
    dom.resultCaption.textContent = '';
  }

  function showPlayerResult(elapsedMs, rankIndex) {
    const totalTeams = rankingData.length;
    const safeRank = rankIndex >= 0 ? rankIndex + 1 : totalTeams + 1;
    dom.playerTime.textContent = formatDuration(elapsedMs);
    dom.playerRank.textContent = totalTeams ? `${safeRank}位 / ${totalTeams}` : '-';
    dom.playerResult.classList.remove('hidden');
  }

  function hidePlayerResult() {
    dom.playerResult.classList.add('hidden');
    dom.playerTime.textContent = '--:--.--';
    dom.playerRank.textContent = '-';
    resetResultLeaderboard();
  }

  function renderResultLeaderboard(activeId) {
    if (!dom.resultLeaderboard) return;
    dom.resultLeaderboard.innerHTML = '';
    const total = rankingData.length;
    if (!total) {
      resetResultLeaderboard();
      return;
    }

    const maxVisible = 5;
    const topEntries = rankingData.slice(0, maxVisible);
    const activeEntry = activeId ? rankingData.find((entry) => entry.id === activeId) : null;
    const rows = [...topEntries];
    if (activeEntry && !rows.some((entry) => entry.id === activeEntry.id)) {
      rows.push(activeEntry);
    }

    const structured = rows
      .map((entry) => ({ entry, rank: rankingData.findIndex((item) => item.id === entry.id) + 1 }))
      .filter(({ rank }) => rank > 0)
      .sort((a, b) => a.rank - b.rank);

    if (!structured.length) {
      resetResultLeaderboard();
      return;
    }

    structured.forEach(({ entry, rank }) => {
      const item = document.createElement('div');
      item.className = 'result-entry';
      item.setAttribute('role', 'listitem');
      if (entry.id === activeId) item.classList.add('result-entry--active');

      const label = document.createElement('span');
      label.className = 'result-entry__label';
      label.textContent = entry.id === activeId ? 'あなたたち' : `${rank}位`;

      const time = document.createElement('span');
      time.className = 'result-entry__time';
      time.textContent = formatDuration(entry.elapsedMs);

      item.append(label, time);
      dom.resultLeaderboard.appendChild(item);
    });

    dom.resultLeaderboard.classList.remove('hidden');
  }

  function resetResultLeaderboard() {
    if (!dom.resultLeaderboard) return;
    dom.resultLeaderboard.innerHTML = '';
    dom.resultLeaderboard.classList.add('hidden');
  }

  function triggerFlash(mode = 'danger') {
    if (state.flashTimer) {
      clearTimeout(state.flashTimer);
      state.flashTimer = null;
    }
    dom.flashOverlay.dataset.mode = mode;
    dom.flashOverlay.classList.remove('hidden');
    dom.flashOverlay.classList.remove('active');
    void dom.flashOverlay.offsetWidth;
    dom.flashOverlay.classList.add('active');
    state.flashTimer = setTimeout(() => {
      dom.flashOverlay.classList.remove('active');
      state.flashTimer = setTimeout(() => {
        dom.flashOverlay.classList.add('hidden');
        state.flashTimer = null;
      }, 200);
    }, 220);
  }

  function startTimer() {
    stopTimer();
    state.lastTick = performance.now();
    state.timerId = setInterval(tickTimer, TIMER_TICK_MS);
  }

  function stopTimer(options = {}) {
    const { preserveTone = false } = options;
    if (state.timerId !== null) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    state.lastTick = null;
    state.beepElapsed = 0;
    if (!preserveTone) {
      stopTickSound();
      resetTickPlaybackRate();
    }
  }

  function tickTimer() {
    if (state.lastTick === null) {
      state.lastTick = performance.now();
    }
    const now = performance.now();
    const delta = now - state.lastTick;
    state.lastTick = now;

    if (state.mode === 'armed') {
      state.remainingMs = Math.max(0, state.remainingMs - delta);
      state.beepElapsed += delta;
      renderTimer(state.remainingMs);
      handleBeep();
      if (state.remainingMs <= 0) {
        handleTimeout();
      }
    }
  }

  function handleBeep() {
    if (state.mode !== 'armed') return;
    if (state.remainingMs <= 0) return;
    const interval = determineBeepInterval(state.remainingMs);
    if (state.beepElapsed >= interval) {
      state.beepElapsed = 0;
      updateTickPlaybackRate(state.remainingMs);
      playBeep(state.config.sfxVolume / 100);
    }
  }

  function determineBeepInterval(ms) {
    if (ms <= 5_000) return 160;
    if (ms <= 10_000) return 220;
    if (ms <= 30_000) return 400;
    if (ms <= 60_000) return 700;
    return 1_000;
  }

  function determineTickPlaybackRate(ms) {
    if (ms <= 5_000) return 2.5;
    if (ms <= 10_000) return 2.1;
    if (ms <= 30_000) return 1.8;
    if (ms <= 60_000) return 1.35;
    if (ms <= 120_000) return 1.15;
    return 1;
  }

  function updateTickPlaybackRate(ms) {
    if (!beepTone) return;
    const rate = determineTickPlaybackRate(ms);
    beepTone.playbackRate = rate;
  }

  function resetTickPlaybackRate() {
    if (!beepTone) return;
    beepTone.playbackRate = 1;
  }

  function stopTickSound() {
    stopHoldTone();
    if (!beepTone) return;
    try {
      beepTone.pause();
      beepTone.currentTime = 0;
    } catch {
      /* noop */
    }
    if (typeof state !== 'undefined') state.holdToneActive = false;
  }

  function playClip(audio, { volume = 1, playbackRate } = {}) {
    if (!audio) return;
    try {
      audio.pause();
      if (typeof playbackRate === 'number') audio.playbackRate = playbackRate;
      audio.currentTime = 0;
      audio.volume = Math.min(1, Math.max(0, volume));
      console.log('playClip: audio.src:', audio.src, 'audio.readyState:', audio.readyState, 'volume:', audio.volume);
      const playPromise = audio.play();
      if (playPromise) playPromise.catch((e) => console.error('playClip audio.play() failed:', e, 'for src:', audio.src));
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.error('Error in playClip:', e, 'for src:', audio.src);
    }
  }

  function playBeep(volume = 1, options = {}) {
    if (options.hold) {
      stopTickSound();
      playHoldTone(2_000, volume);
      return;
    }
    playClip(beepTone, { volume });
  }

  function playEnterTone() {
    playClip(enterTone, { volume: state.config.sfxVolume / 100 });
  }

  function playWarningTone() {
    playClip(warningTone, { volume: state.config.sfxVolume / 100 });
  }

  function playErrorTone() {
    if (!errorTone) return;
    const volume = state.config.sfxVolume / 100;
    const playOnceReady = () => {
      errorTone.removeEventListener('loadeddata', playOnceReady);
      errorTone.removeEventListener('canplaythrough', playOnceReady);
      errorTone.removeEventListener('error', onLoadError);
      playClip(errorTone, { volume });
    };
    const onLoadError = (event) => {
      errorTone.removeEventListener('loadeddata', playOnceReady);
      errorTone.removeEventListener('canplaythrough', playOnceReady);
      errorTone.removeEventListener('error', onLoadError);
      console.warn('Failed to load error tone', event?.message || event);
    };

    if (errorTone.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      playClip(errorTone, { volume });
      return;
    }

    errorTone.addEventListener('loadeddata', playOnceReady);
    errorTone.addEventListener('canplaythrough', playOnceReady);
    errorTone.addEventListener('error', onLoadError);
    try {
      errorTone.load();
    } catch (error) {
      console.warn('errorTone.load() failed; attempting direct playback', error);
      playClip(errorTone, { volume });
    }
  }

  function startCriticalBeep() {
    stopCriticalBeep();
    if (beepTone) {
      beepTone.playbackRate = 2.2;
    }
    state.criticalBeepTimer = setInterval(() => playBeep(state.config.sfxVolume / 100), 180);
  }

  function stopCriticalBeep() {
    if (state.criticalBeepTimer) {
      clearInterval(state.criticalBeepTimer);
      state.criticalBeepTimer = null;
    }
    resetTickPlaybackRate();
  }

  function startBgm() {
    if (!state.config.bgmEnabled || !state.config.bgm.url) return;
    try {
      bgmPlayer.pause();
          bgmPlayer.currentTime = 0;
          const playPromise = bgmPlayer.play();
      if (playPromise) playPromise.catch((e) => console.error('BGM play failed:', e));
    } catch (e) {
      console.error('Error in startBgm:', e);
    }
  }

  function fadeOutBgm(stopFully = true) {
    if (!bgmPlayer.src) return;
    if (state.bgmFadeTimer) {
      clearInterval(state.bgmFadeTimer);
      state.bgmFadeTimer = null;
    }
    state.bgmFadeTimer = setInterval(() => {
      if (bgmPlayer.volume <= 0.05) {
        bgmPlayer.volume = 0;
        clearInterval(state.bgmFadeTimer);
        state.bgmFadeTimer = null;
        if (stopFully) {
          try {
            bgmPlayer.pause();
            bgmPlayer.currentTime = 0;
          } catch {
            /* noop */
          }
        }
        bgmPlayer.volume = state.config.bgmVolume / 100;
      } else {
        bgmPlayer.volume = Math.max(0, bgmPlayer.volume - 0.06);
      }
    }, 90);
  }

  function stopBgm() {
    if (state.bgmFadeTimer) {
      clearInterval(state.bgmFadeTimer);
      state.bgmFadeTimer = null;
    }
    try {
      bgmPlayer.pause();
      bgmPlayer.currentTime = 0;
    } catch {
      /* noop */
    }
  }

  function silenceMediaElement(media) {
    if (!media) return;
    try {
      media.pause();
      media.currentTime = 0;
    } catch {
      /* noop */
    }
  }

  function handleAppHidden() {
    resetToAdmin();
    stopBgm();
    silenceMediaElement(beepTone);
    silenceMediaElement(enterTone);
    silenceMediaElement(warningTone);
    silenceMediaElement(errorTone);
  }

  function startSession() {
    if (state.mode !== 'admin') return;

    requestHoldBuffer();
    sanitizeTimeInputs();
    sanitizeCodeInput();
    syncThresholdInputs();

    if (state.config.code.length !== CODE_LENGTH) {
      triggerFlash('warning');
      playErrorTone();
      dom.codeInput.focus();
      return;
    }

    cancelScheduledReturn();
    stopCriticalBeep();
    stopRewardVideo(false);
    stopLogSequence();

    state.mode = 'armed';
    state.buffer = '';
    state.lastResultId = null;
    state.remainingMs = state.config.durationMs;
    state.beepElapsed = 0;
    resetTickPlaybackRate();
    resetResultLeaderboard();

    renderInputBuffer();
    renderTimer(state.remainingMs);
    showTimerArea();
    setKeypadEnabled(true);
    setStatus('armed');
    showScreen('bomb');

    dom.logOutput.innerHTML = '';
    dom.videoOverlay.classList.add('hidden');
    dom.videoFallback.classList.add('hidden');
    dom.rewardOverlay.classList.add('hidden');

    startBgm();
    startTimer();
  }

  function handleTimeout() {
    if (state.mode === 'timeout') return;
    state.mode = 'timeout';
    state.lastResultId = null;
    stopTimer({ preserveTone: true });
    stopTickSound();
    resetTickPlaybackRate();
    setKeypadEnabled(false);
    state.buffer = '';
    renderInputBuffer();
    state.remainingMs = 0;
    renderTimer(0);
    setStatus('failure');
    showTimerArea();
    triggerFlash('danger');
    fadeOutBgm();
    if (state.explosionDelayTimer) clearTimeout(state.explosionDelayTimer);
    state.explosionDelayTimer = setTimeout(() => {
      showExplosionSequence();
    }, 2_000);
  }

  function showExplosionSequence() {
    if (state.explosionDelayTimer) {
      clearTimeout(state.explosionDelayTimer);
      state.explosionDelayTimer = null;
    }
    stopCriticalBeep();
    stopTickSound();
    dom.videoOverlay.classList.remove('hidden');
    dom.videoFallback.classList.add('hidden');
    const source = state.config.explosion.url;
    if (source) {
      dom.explosionVideo.src = source;
      dom.explosionVideo.currentTime = 0;
      const playPromise = dom.explosionVideo.play();
      if (playPromise) {
        playPromise.catch(() => {
          showVideoFallback();
          scheduleReturn(4_000, { highlight: 'danger' });
        });
      }
    } else {
      showVideoFallback();
      scheduleReturn(4_000, { highlight: 'danger' });
    }
  }

  function showVideoFallback() {
    dom.videoFallback.classList.remove('hidden');
  }

  function scheduleReturn(delay, options = {}) {
    cancelScheduledReturn();
    state.returnTimer = setTimeout(() => {
      resetToAdmin(options.highlight);
    }, delay);
  }

  function cancelScheduledReturn() {
    if (state.returnTimer) {
      clearTimeout(state.returnTimer);
      state.returnTimer = null;
    }
  }

  function resetToAdmin(highlight) {
    stopTimer();
    stopCriticalBeep();
    stopRewardVideo(false);
    fadeOutBgm();
    stopLogSequence();
    cancelScheduledReturn();
    if (state.rewardTimeout) {
      clearTimeout(state.rewardTimeout);
      state.rewardTimeout = null;
    }
    if (state.explosionDelayTimer) {
      clearTimeout(state.explosionDelayTimer);
      state.explosionDelayTimer = null;
    }
    state.awaitingReward = false;

    state.lastResultId = null;

    dom.explosionVideo.pause();
    dom.explosionVideo.removeAttribute('src');
    dom.explosionVideo.load();
    dom.videoOverlay.classList.add('hidden');
    dom.videoFallback.classList.add('hidden');

    showTimerArea();
    showScreen('admin');
    setKeypadEnabled(false);
    setStatus('ready');

    state.mode = 'admin';
    state.buffer = '';
    renderInputBuffer();
    state.remainingMs = state.config.durationMs;
    renderTimer(state.remainingMs);
    resetResultLeaderboard();

    if (highlight) {
      triggerFlash(highlight);
    }
  }

  function handleMissionSuccess() {
    const elapsedMs = state.config.durationMs - state.remainingMs;
    const { rankIndex, entryId } = addRankingRecord(elapsedMs);
    state.lastResultId = entryId;
    renderRanking();

    state.mode = 'success';
    setStatus('success');
    triggerFlash('success');
    fadeOutBgm();
    showResultArea('ACCESS GRANTED', 'DEVICE DEACTIVATED', 'MISSION COMPLETE/ミッション成功');
    showPlayerResult(elapsedMs, rankIndex);
    renderResultLeaderboard(entryId);

    const rewardCategory = selectRewardCategory(elapsedMs);
    const slot = rewardCategory ? state.config.rewardVideos[rewardCategory] : null;

    scheduleReturn(RETURN_HOME_DELAY_MS, { highlight: 'success' });

    if (slot && slot.url) {
      state.awaitingReward = true;
      state.rewardTimeout = setTimeout(() => {
        if (state.mode === 'success') {
          playRewardVideo(slot);
        }
      }, REWARD_QUEUE_DELAY_MS);
    }
  }

  function selectRewardCategory(elapsedMs) {
    if (elapsedMs <= state.config.fastThresholdMs) return 'fast';
    if (elapsedMs <= state.config.normalThresholdMs) return 'normal';
    return 'slow';
  }

  function playRewardVideo(slot) {
    cancelScheduledReturn();
    state.awaitingReward = false;
    stopTickSound();
    dom.rewardOverlay.classList.remove('hidden');
    const category = state.activeRewardCategory;
    const volumeConfig = state.config.videoVolumes;
    const fallbackVolume = volumeConfig.slow ?? 100;
    const volumeValue = category && volumeConfig[category] !== undefined ? volumeConfig[category] : fallbackVolume;
    dom.rewardVideo.volume = volumeValue / 100;
    dom.rewardVideo.src = slot.url;
    dom.rewardVideo.currentTime = 0;
    const playPromise = dom.rewardVideo.play();
    if (playPromise) playPromise.catch(() => scheduleReturn(REWARD_AUTO_RETURN_MS, { highlight: 'success' }));
  }

  function stopRewardVideo(autoSchedule) {
    state.activeRewardCategory = null;
    dom.rewardVideo.volume = state.config.videoVolumes.slow / 100;
    dom.rewardOverlay.classList.add('hidden');
    try {
      dom.rewardVideo.pause();
    } catch {
      /* noop */
    }
    stopTickSound();
    resetTickPlaybackRate();
    dom.rewardVideo.removeAttribute('src');
    dom.rewardVideo.load();
    if (autoSchedule) {
      scheduleReturn(REWARD_AUTO_RETURN_MS, { highlight: 'success' });
    }
  }

  function handleMissionRetry() {
    state.lastResultId = null;
    triggerFlash('danger');
    playWarningTone();
    state.mode = 'armed';
    state.buffer = '';
    renderInputBuffer();

    const nextMs = Math.max(0, state.remainingMs - PENALTY_MS);
    state.remainingMs = nextMs;
    renderTimer(state.remainingMs);
    updateTickPlaybackRate(state.remainingMs);

    if (nextMs <= 0) {
      handleTimeout();
      return;
    }

    setStatus('retry');
    showTimerArea();
    setKeypadEnabled(true);
    state.beepElapsed = 0;
    startTimer();
  }
  function startLogSequence(resultType, onComplete) {
    stopLogSequence();
    dom.logOutput.innerHTML = '';
    dom.logOutput.scrollTop = 0;
    showLogArea();

    const errorRate = resultType === 'success' ? 0.28 : 0.45;
    const controller = {
      next: null,
      killer: null,
      running: true
    };
    state.logController = controller;
    const started = performance.now();

    function emitLine() {
      if (!controller.running) return;
      const elapsed = performance.now() - started;
      if (elapsed >= LOG_TOTAL_MS) return;
      const isError = Math.random() < errorRate;
      const textLine = isError ? pickErrorLine() : pickInfoLine();
      appendLogLine(textLine, isError);
      const remaining = LOG_TOTAL_MS - elapsed;
      const base = resultType === 'success' ? 200 : 170;
      const delay = Math.max(80, Math.min(320, base + (Math.random() - 0.5) * 120));
      controller.next = setTimeout(emitLine, Math.min(delay, remaining));
    }

    emitLine();

    controller.killer = setTimeout(() => {
      if (!controller.running) return;
      controller.running = false;
      if (controller.next) {
        clearTimeout(controller.next);
        controller.next = null;
      }
      const summary = LOG_SUMMARY_LINES[resultType] || [];
      summary.forEach((entry) => appendLogLine(entry.text, !!entry.error, !!entry.emphasize));
      state.logController = null;
      setTimeout(() => {
        if (typeof onComplete === 'function') onComplete();
      }, POST_LOG_DELAY_MS);
    }, LOG_TOTAL_MS);
  }

  function stopLogSequence() {
    if (!state.logController) return;
    state.logController.running = false;
    if (state.logController.next) clearTimeout(state.logController.next);
    if (state.logController.killer) clearTimeout(state.logController.killer);
    state.logController = null;
  }

  function appendLogLine(text, isError, emphasize = false) {
    const line = document.createElement('div');
    line.className = 'log-line';
    if (isError) line.classList.add('log-line--error');
    if (emphasize) line.classList.add('log-line--emphasis');
    const stamp = new Date();
    const timeString = `${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}:${String(stamp.getSeconds()).padStart(2, '0')}`;
    line.textContent = `[${timeString}] ${text}`;
    dom.logOutput.appendChild(line);
    dom.logOutput.scrollTop = dom.logOutput.scrollHeight;
  }

  function pickInfoLine() {
    const useJapanese = Math.random() < LOG_JP_WEIGHT;
    const pool = useJapanese ? LOG_JP_INFO : LOG_EN_INFO;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function pickErrorLine() {
    const useJapanese = Math.random() < LOG_JP_WEIGHT;
    const pool = useJapanese ? LOG_JP_ERROR : LOG_EN_ERROR;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function onKeypadClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.disabled) return;
    const digit = target.dataset.key;
    const action = target.dataset.action;

    if (digit) {
      appendDigit(digit);
    } else if (action === 'clear') {
      clearBuffer();
    } else if (action === 'enter') {
      submitBuffer();
    }
  }

  function onKeydown(event) {
    if (state.mode !== 'armed' && !(state.mode === 'verify' && event.key === 'Escape')) return;

    if (event.key >= '0' && event.key <= '9' && state.mode === 'armed') {
      event.preventDefault();
      appendDigit(event.key);
    } else if (event.key === 'Enter' && state.mode === 'armed') {
      event.preventDefault();
      submitBuffer();
    } else if (event.key === 'Backspace' && state.mode === 'armed') {
      event.preventDefault();
      removeLastDigit();
    } else if (event.key === 'Escape') {
      if (state.mode === 'armed') {
        event.preventDefault();
        clearBuffer();
      }
    }
  }

  function appendDigit(char) {
    if (state.mode !== 'armed') return;
    if (state.buffer.length >= CODE_LENGTH) return;
    state.buffer += char;
    renderInputBuffer();
  }

  function removeLastDigit() {
    if (state.mode !== 'armed') return;
    if (!state.buffer) return;
    state.buffer = state.buffer.slice(0, -1);
    renderInputBuffer();
  }

  function clearBuffer() {
    if (state.mode !== 'armed') return;
    state.buffer = '';
    renderInputBuffer();
  }

  function submitBuffer() {
    if (state.mode !== 'armed') return;
    if (state.buffer.length !== CODE_LENGTH) {
      playErrorTone();
      triggerFlash('warning');
      return;
    }

    const isSuccess = state.buffer === state.config.code;
    if (isSuccess) {
      playEnterTone();
    } else {
      playEnterTone();
      playErrorTone();
    }

    state.mode = 'verify';
    setStatus('verify');
    setKeypadEnabled(false);
    stopTimer();
    fadeOutBgm(false);
    startLogSequence(isSuccess ? 'success' : 'failure', () => {
      if (isSuccess) {
        handleMissionSuccess();
      } else {
        handleMissionRetry();
      }
    });
  }
  function handleCustomBgmSelection(event) {
    const file = event.target.files?.[0] || null;
    assignMedia(state.config.bgm, file);
    updateBgmState();
  }

  function updateBgmState() {
    // Update state from UI
    state.config.bgmEnabled = dom.bgmEnabledToggle.checked;
    state.config.bgmSource = dom.bgmSourceCustom.checked ? 'custom' : 'default';

    if (state.config.bgmSource === 'default') {
      // Use default BGM
      dom.customBgmPicker.style.display = 'none';
      if (state.config.bgm.url && state.config.bgm.url.startsWith('blob:')) {
        // Revoke old blob URL if it exists
        URL.revokeObjectURL(state.config.bgm.url);
      }
      state.config.bgm.name = 'デフォルトBGM';
      state.config.bgm.url = 'audio/BGM.m4a';
      updateFileStatus(dom.bgmStatus, state.config.bgm.name);
      bgmPlayer.src = state.config.bgm.url;
    } else {
      // Use custom BGM
      dom.customBgmPicker.style.display = 'block';
      updateFileStatus(dom.bgmStatus, state.config.bgm.name);
      if (state.config.bgm.url) {
        bgmPlayer.src = state.config.bgm.url;
      } else {
        bgmPlayer.removeAttribute('src');
        stopBgm();
      }
    }

    // If BGM is disabled, stop it.
    if (!state.config.bgmEnabled) {
        stopBgm();
    }
  }

  function handleExplosionVideoSelection(event) {
    const file = event.target.files?.[0] || null;
    assignMedia(state.config.explosion, file);
    updateFileStatus(dom.videoStatus, state.config.explosion.name);
  }

  function handleRewardVideoSelection(category, file) {
    const slot = state.config.rewardVideos[category];
    if (!slot) return;
    assignMedia(slot, file);
    const statusMap = {
      fast: dom.fastVideoStatus,
      normal: dom.normalVideoStatus,
      slow: dom.slowVideoStatus
    };
    updateFileStatus(statusMap[category], slot.name);
  }

  function handleExplosionVolumeChange() {
    const value = sanitizeVolumeValue(dom.explosionVideoVolume.value, state.config.videoVolumes.explosion);
    state.config.videoVolumes.explosion = value;
    dom.explosionVideoVolume.value = String(value);
    dom.explosionVideo.volume = value / 100;
  }

  function handleRewardVideoVolumeChange(category) {
    const sliders = {
      fast: dom.fastVideoVolume,
      normal: dom.normalVideoVolume,
      slow: dom.slowVideoVolume
    };
    const slider = sliders[category];
    if (!slider) return;
    const current = state.config.videoVolumes[category];
    const value = sanitizeVolumeValue(slider.value, current);
    state.config.videoVolumes[category] = value;
    slider.value = String(value);
    if (state.activeRewardCategory === category) {
      dom.rewardVideo.volume = value / 100;
    }
  }

  function assignMedia(slot, file) {
    if (slot.url) {
      if (typeof slot.url === 'string' && slot.url.startsWith('blob:')) {
        URL.revokeObjectURL(slot.url);
      }
      slot.url = null;
    }
    if (file) {
      slot.url = URL.createObjectURL(file);
      slot.name = file.name;
    } else {
      slot.name = '未選択';
    }
  }

  function updateFileStatus(element, text) {
    if (!element) return;
    element.textContent = text || '未選択';
  }

  function sanitizeTimeInputs() {
    const minutes = clampInt(dom.minutesInput.value, 0, 59);
    const seconds = clampInt(dom.secondsInput.value, 0, 59);
    dom.minutesInput.value = String(minutes);
    dom.secondsInput.value = String(seconds).padStart(2, '0');

    let totalMs = (minutes * 60 + seconds) * 1000;
    if (!Number.isFinite(totalMs) || totalMs < MIN_DURATION_MS) {
      totalMs = Math.max(MIN_DURATION_MS, totalMs);
      const min = Math.floor(totalMs / 60_000);
      const sec = Math.floor((totalMs % 60_000) / 1_000);
      dom.minutesInput.value = String(min);
      dom.secondsInput.value = String(sec).padStart(2, '0');
    }

    state.config.durationMs = totalMs;
    if (state.mode === 'admin') {
      state.remainingMs = totalMs;
      renderTimer(state.remainingMs);
    }
  }

  function sanitizeCodeInput() {
    const cleaned = dom.codeInput.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    dom.codeInput.value = cleaned;
    state.config.code = cleaned;
  }

  function syncThresholdInputs() {
    const fastMin = clampInt(dom.fastMinutesInput.value, 0, 9);
    const fastSec = clampInt(dom.fastSecondsInput.value, 0, 59);
    dom.fastMinutesInput.value = String(fastMin);
    dom.fastSecondsInput.value = String(fastSec).padStart(2, '0');
    let fastMs = (fastMin * 60 + fastSec) * 1000;
    if (fastMs < 1_000) fastMs = 1_000;

    const normalMin = clampInt(dom.normalMinutesInput.value, 0, 9);
    const normalSec = clampInt(dom.normalSecondsInput.value, 0, 59);
    dom.normalMinutesInput.value = String(normalMin);
    dom.normalSecondsInput.value = String(normalSec).padStart(2, '0');
    let normalMs = (normalMin * 60 + normalSec) * 1000;
    if (normalMs < fastMs) {
      normalMs = fastMs;
      const nMin = Math.floor(normalMs / 60_000);
      const nSec = Math.floor((normalMs % 60_000) / 1_000);
      dom.normalMinutesInput.value = String(nMin);
      dom.normalSecondsInput.value = String(nSec).padStart(2, '0');
    }

    state.config.fastThresholdMs = fastMs;
    state.config.normalThresholdMs = normalMs;
  }

  function sanitizeVolumeValue(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(100, Math.max(0, parsed));
  }

  function clampInt(value, min, max) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return min;
    return Math.min(max, Math.max(min, parsed));
  }

  function renderRanking() {
    dom.rankingList.innerHTML = '';
    const total = rankingData.length;
    if (dom.clearRankingButton) dom.clearRankingButton.disabled = total === 0;

    if (!total) {
      dom.rankingDescription.textContent = '記録はありません';
      const empty = document.createElement('p');
      empty.className = 'ranking-empty';
      empty.textContent = '記録が追加されると一覧に表示されます。';
      dom.rankingList.appendChild(empty);
      return;
    }

    const label = total > 10 ? `登録数 ${total} 件（上位10件を表示）` : `登録数 ${total} 件`;
    dom.rankingDescription.textContent = label;

    const fragment = document.createDocumentFragment();
    rankingData.slice(0, 10).forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'ranking-entry';
      item.dataset.id = entry.id;
      item.setAttribute('role', 'listitem');

      const rank = document.createElement('span');
      rank.className = 'rank-index';
      rank.textContent = `${index + 1}位`;

      const body = document.createElement('div');
      body.className = 'rank-body';

      const time = document.createElement('span');
      time.className = 'rank-time';
      time.textContent = formatDuration(entry.elapsedMs);

      const date = document.createElement('span');
      date.className = 'rank-date';
      date.textContent = formatRankDate(entry.timestamp);

      body.append(time, date);

      const actions = document.createElement('div');
      actions.className = 'rank-actions';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'ranking-action';
      removeBtn.type = 'button';
      removeBtn.dataset.action = 'delete';
      removeBtn.dataset.id = entry.id;
      removeBtn.textContent = '削除';
      actions.appendChild(removeBtn);

      item.append(rank, body, actions);
      fragment.appendChild(item);
    });

    dom.rankingList.appendChild(fragment);

    if (state.mode === 'success' && state.lastResultId && !dom.resultArea.classList.contains('hidden')) {
      renderResultLeaderboard(state.lastResultId);
    }
  }

  function onRankingListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === 'delete' && id) {
      if (window.confirm('この記録を削除しますか？')) {
        removeRankingEntry(id);
      }
    }
  }

  function onClearRanking() {
    if (!rankingData.length) return;
    if (window.confirm('ランキングを全て消去しますか？')) {
      rankingData = [];
      state.lastResultId = null;
      saveRanking();
      renderRanking();
      resetResultLeaderboard();
    }
  }

  function removeRankingEntry(id) {
    const index = rankingData.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    rankingData.splice(index, 1);
    if (state.lastResultId === id) {
      state.lastResultId = null;
      if (state.mode === 'success' && !dom.resultArea.classList.contains('hidden')) {
        renderResultLeaderboard(null);
      }
    }
    saveRanking();
    renderRanking();
  }

  function addRankingRecord(elapsedMs) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      elapsedMs,
      timestamp: Date.now()
    };
    rankingData.push(entry);
    rankingData.sort((a, b) => a.elapsedMs - b.elapsedMs);
    const rankIndex = rankingData.findIndex((item) => item.id === entry.id);

    if (rankingData.length > MAX_RANKING_ENTRIES) {
      rankingData = rankingData.slice(0, MAX_RANKING_ENTRIES);
    }

    saveRanking();
    return { rankIndex, entryId: entry.id };
  }

  function formatRankDate(timestamp) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  }

  function startAbortHold(event) {
    if (state.mode === 'admin') return;
    if (state.abortHold.active) return;

    state.abortHold.active = true;
    state.abortHold.start = performance.now();
    state.abortHold.pointerId = event.pointerId;
    dom.abortButton.classList.add('is-holding');
    dom.abortProgress.style.transform = 'scaleX(0)';
    state.abortHold.raf = requestAnimationFrame(abortHoldLoop);
  }

  function abortHoldLoop() {
    if (!state.abortHold.active) return;
    const now = performance.now();
    const elapsed = now - state.abortHold.start;
    const progress = Math.min(1, elapsed / ABORT_HOLD_MS);
    dom.abortProgress.style.transform = `scaleX(${progress})`;
    if (progress >= 1) {
      resetAbortHoldState();
      resetToAdmin('warning');
    } else {
      state.abortHold.raf = requestAnimationFrame(abortHoldLoop);
    }
  }

  function cancelAbortHold(event) {
    if (!state.abortHold.active) return;
    if (event && event.pointerId !== state.abortHold.pointerId) return;
    resetAbortHoldState();
  }

  function resetAbortHoldState() {
    state.abortHold.active = false;
    state.abortHold.pointerId = null;
    if (state.abortHold.raf) {
      cancelAnimationFrame(state.abortHold.raf);
      state.abortHold.raf = null;
    }
    dom.abortButton.classList.remove('is-holding');
    dom.abortProgress.style.transform = 'scaleX(0)';
  }

  function formatDuration(ms) {
    const safe = Math.max(0, Math.floor(ms));
    const totalCentiseconds = Math.floor(safe / 10);
    const minutes = Math.floor(totalCentiseconds / 6000);
    const seconds = Math.floor((totalCentiseconds % 6000) / 100);
    const centiseconds = totalCentiseconds % 100;

    const minuteTens = Math.floor(minutes / 10) % 10;
    const minuteOnes = minutes % 10;
    const secondTens = Math.floor(seconds / 10);
    const secondOnes = seconds % 10;
    const centiTens = Math.floor(centiseconds / 10);
    const centiOnes = centiseconds % 10;

    return `${minuteTens}${minuteOnes}:${secondTens}${secondOnes}.${centiTens}${centiOnes}`;
  }

  function buildSevenSegment(container) {
    container.innerHTML = '';
    const structure = ['digit', 'digit', 'colon', 'digit', 'digit', 'dot', 'digit', 'digit'];
    const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

    return structure.map((type) => {
      if (type === 'digit') {
        const digit = document.createElement('div');
        digit.className = 'seven-digit';
        const segmentElements = segments.map((seg) => {
          const span = document.createElement('span');
          span.className = `segment seg-${seg}`;
          digit.appendChild(span);
          return { seg, span };
        });
        container.appendChild(digit);
        return (value) => {
          const active = SEGMENT_MAP[value] || [];
          segmentElements.forEach(({ seg, span }) => {
            span.classList.toggle('on', active.includes(seg));
          });
        };
      }
      if (type === 'colon') {
        const colon = document.createElement('div');
        colon.className = 'seven-colon';
        const top = document.createElement('span');
        const bottom = document.createElement('span');
        colon.append(top, bottom);
        container.appendChild(colon);
        return (value) => {
          const on = value === ':';
          top.classList.toggle('on', on);
          bottom.classList.toggle('on', on);
        };
      }
      const dot = document.createElement('div');
      dot.className = 'seven-dot';
      const point = document.createElement('span');
      dot.appendChild(point);
      container.appendChild(dot);
      return (value) => {
        point.classList.toggle('on', value === '.');
      };
    });
  }

  function loadRanking() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data
        .filter((entry) => typeof entry === 'object' && entry !== null && Number.isFinite(entry.elapsedMs) && Number.isFinite(entry.timestamp))
        .map((entry, index) => ({
          id: `persisted-${index}-${entry.timestamp}`,
          elapsedMs: entry.elapsedMs,
          timestamp: entry.timestamp
        }))
        .sort((a, b) => a.elapsedMs - b.elapsedMs);
    } catch {
      return [];
    }
  }

  function saveRanking() {
    try {
      const payload = rankingData.slice(0, MAX_RANKING_ENTRIES).map((entry) => ({
        elapsedMs: entry.elapsedMs,
        timestamp: entry.timestamp
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }


})();




























































