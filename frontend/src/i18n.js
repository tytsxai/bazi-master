import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  'en-US': {
    translation: {
      nav: {
        home: 'Home',
        login: 'Login',
        bazi: 'BaZi',
        tarot: 'Tarot',
        iching: 'I Ching',
        zodiac: 'Zodiac',
        ziwei: 'Zi Wei',
        profile: 'Profile',
        history: 'History',
        favorites: 'Favorites',
        logout: 'Logout',
        skip: 'Skip to content'
      },
      home: {
        title: 'BaZi Master',
        subtitle: 'Unlock your destiny with ancient wisdom',
        cta: 'Start your journey'
      },
      login: {
        title: 'Welcome Back',
        email: 'Email',
        password: 'Password',
        submit: 'Sign In',
        registerTitle: 'Create account',
        registerSubmit: 'Create account',
        sessionExpired: 'Your session expired. Please sign in again to continue.',
        errors: {
          emailRequired: 'Email is required.',
          emailInvalid: 'Enter a valid email address.',
          passwordRequired: 'Password is required.',
          passwordStrength: 'Password must be at least 8 characters and include letters and numbers.',
          passwordsNotMatch: 'Passwords do not match.',
          nameTooShort: 'Name must be at least 2 characters.',
          loginFailed: 'Incorrect email or password.',
          tokenRequired: 'Reset code is required.',
          newPasswordRequired: 'New password is required.'
        },
        ui: {
          displayName: 'Display name (optional)',
          confirmPassword: 'Confirm password',
          forgotPassword: 'Forgot password?',
          haveCode: 'Have a reset code?',
          newHere: 'New here?',
          backToLogin: 'Back to login',
          resetPassword: 'Reset password',
          setNewPassword: 'Set new password',
          sendResetLink: 'Send reset link',
          updatePassword: 'Update password',
          resetSent: 'If an account exists for that email, a reset link has been sent.',
          passwordUpdated: 'Password updated. You can log in now.'
        }
      },
      protected: {
        title: 'Sacred Archive',
        subtitle: 'Only registered seekers may enter.'
      },
      bazi: {
        title: 'BaZi Destiny Chart',
        subtitle: 'Enter your birth data to reveal the Four Pillars and Five Elements.',
        birthYear: 'Birth Year',
        birthMonth: 'Birth Month',
        birthDay: 'Birth Day',
        birthHour: 'Birth Hour (0-23)',
        gender: 'Gender',
        genderPlaceholder: 'Select gender',
        genderFemale: 'Female',
        genderMale: 'Male',
        birthLocation: 'Birth Location',
        locationPlaceholder: 'City / Country',
        locationHint: 'Supports coordinates (lat, lon) or common cities like Beijing, Shanghai, London, New York.',
        timezone: 'Timezone',
        calculate: 'Calculate',
        fullAnalysis: 'Request Full Analysis',
        saveRecord: 'Save to History',
        addFavorite: 'Add to Favorites',
        calculated: 'Basic chart generated.',
        restored: 'Restored your last guest calculation.',
        fullReady: 'Full analysis ready.',
        saved: 'Record saved to history.',
        favorited: 'Added to favorites.',
        favoriteReady: 'Favorite saved. View it in Favorites.',
        loginRequired: 'Please log in to access this feature.',
        saveFirst: 'Save the record before favoriting.',
        fullRequired: 'Request full analysis before asking AI.',
        aiInterpret: 'Open AI',
        aiOpen: 'Open AI dialog',
        aiThinking: 'Consulting the oracle...',
        aiReady: 'AI interpretation ready.',
        aiAnalysis: 'AI BaZi Analysis',
        fourPillars: 'Four Pillars',
        fiveElements: 'Five Elements',
        tenGods: 'Ten Gods',
        luckCycles: 'Major Luck Cycles',
        timeContext: 'Time Context',
        timezoneInput: 'Timezone Input',
        timezoneResolved: 'Resolved Offset',
        birthUtc: 'Birth Time (UTC)',
        trueSolarTime: 'True Solar Time',
        trueSolarCorrection: 'True Solar Correction',
        trueSolarLocation: 'Location Used',
        trueSolarUnavailable: 'Not available (location not recognized)',
        timezoneUnavailable: 'Unavailable',
        waiting: 'Enter your birth data to generate results.',
        fullWaiting: 'Request full analysis to reveal this section.',
        year: 'Year',
        month: 'Month',
        day: 'Day',
        hour: 'Hour',
        errors: {
          yearRequired: 'Birth year is required.',
          yearInvalid: 'Enter a valid year.',
          monthRequired: 'Birth month is required.',
          monthInvalid: 'Enter a valid month (1-12).',
          dayRequired: 'Birth day is required.',
          dayInvalid: 'Enter a valid day (1-31).',
          dateInvalid: 'Enter a valid date.',
          futureDate: 'Birth date cannot be in the future.',
          hourRequired: 'Birth hour is required.',
          hourInvalid: 'Enter a valid hour (0-23).',
          genderRequired: 'Gender is required.',
          locationWhitespace: 'Birth location cannot be only whitespace.',
          timezoneWhitespace: 'Timezone cannot be only whitespace.'
        }
      },
      history: {
        detailsTitle: 'BaZi Record',
        recordHeading: 'Record #{{id}}',
        detailsSubtitle: 'Review your saved chart details and time context.',
        viewDetails: 'View details',
        backToHistory: 'Back to history',
        recordLoading: 'Loading record...',
        recordInvalid: 'Invalid record id.',
        recordMissing: 'Record not found.',
        recordLoadError: 'Unable to load record.'
      },
      profile: {
        title: 'Sacred Archive',
        subtitle: 'Only registered seekers may enter.',
        name: 'Name',
        displayName: 'Display name',
        email: 'Email',
        settingsTitle: 'Profile settings',
        settingsSubtitle: 'Keep your locale and ritual preferences synced across devices.',
        locale: 'Locale',
        displayNamePlaceholder: 'Add a short name for your profile',
        displayNameHint: '2-40 characters.',
        preferences: 'Preferences',
        dailyGuidance: 'Daily guidance',
        dailyGuidanceDesc: 'Get a short daily prompt based on your charts.',
        ritualReminders: 'Ritual reminders',
        ritualRemindersDesc: 'Receive reminders for your chosen timing rituals.',
        researchUpdates: 'Research updates',
        researchUpdatesDesc: 'Stay informed on new analyses and insights.',
        aiProvider: 'AI provider',
        aiProviderDesc: 'Select the AI model host for interpretations. Only enabled providers can be saved.',
        preferredProvider: 'Preferred provider',
        useDefault: 'Use default',
        activeServerProvider: 'Active server provider',
        providersEnabled: '{{count}} provider(s) enabled.',
        noProvidersEnabled: 'No providers enabled. Using fallback summaries.',
        saveSettings: 'Save settings',
        saving: 'Saving...',
        settingsSaved: 'Settings saved.',
        cancel: 'Cancel',
        dangerZone: 'Danger Zone',
        dangerZoneDesc: 'Irreversible actions. Proceed with caution.',
        deleteAccount: 'Delete Account',
        deleteAccountTitle: 'Delete your account?',
        deleteAccountDesc: 'This will permanently delete your profile, history, favorites, and settings. This action cannot be undone.',
        confirmDelete: 'Confirm Delete',
        historySnapshot: 'History snapshot',
        historySnapshotDesc: 'Recent BaZi history records synced from your account.',
        openHistory: 'Open history',
        totalRecords: 'Total records',
        showingLatest: 'Showing latest 3 records',
        noHistory: 'No history records yet.',
        ziweiQuickChart: 'Zi Wei (V2) quick chart',
        ziweiQuickChartDesc: 'Generate a Zi Wei chart using your most recent BaZi record.',
        latestBaziRecord: 'Latest saved BaZi record',
        noRecordAvailable: 'No record available',
        generateZiwei: 'Generate Zi Wei Chart',
        ziweiReady: 'Zi Wei chart generated from your latest BaZi record.',
        createBaziFirst: 'Create a BaZi chart first to unlock Zi Wei quick charts.',
        saveBaziFirst: 'Save a BaZi record first to generate Zi Wei charts.',
        calculating: 'Calculating...'
      },
      favorites: {
        title: 'Favorites',
        subtitle: 'Curated destiny charts you saved for quick access.',
        savedCount: '{{count}} saved',
        availableToAdd: '{{count}} available to add',
        noFavorites: 'No favorites yet',
        noFavoritesDesc: 'Save a record to keep it handy here.',
        addFromHistory: 'Add from history',
        addFromHistoryDesc: 'Pick from your saved records to add them to favorites.',
        allFavorited: 'All saved records are favorited',
        noHistoryYet: 'No saved history yet',
        noHistoryYetDesc: 'Complete a reading first, then add it here.',
        view: 'View',
        hide: 'Hide',
        share: 'Share',
        remove: 'Remove',
        removing: 'Removing...',
        adding: 'Adding...',
        add: 'Add to favorites',
        shareSuccess: 'Shared successfully.',
        shareFailed: 'Share failed. Copying instead.',
        copied: 'Copied to clipboard.',
        copyFailed: 'Unable to copy share text.',
        loadError: 'Unable to load favorites.',
        recordsLoadError: 'Unable to load records.',
        removeError: 'Unable to remove favorite.',
        addError: 'Unable to add favorite.'
      }
    }
  },
  'zh-CN': {
    translation: {
      nav: {
        home: '首页',
        login: '登录',
        bazi: 'BaZi',
        tarot: '塔罗',
        iching: '周易',
        zodiac: '星座',
        ziwei: '紫微',
        profile: '个人中心',
        history: '历史记录',
        favorites: '收藏',
        logout: '退出登录',
        skip: '跳到主要内容'
      },
      home: {
        title: '八字大师',
        subtitle: '以古老智慧解读你的命运',
        cta: '开启探索'
      },
      login: {
        title: '欢迎回来',
        email: '邮箱',
        password: '密码',
        submit: '登录',
        registerTitle: '创建账号',
        registerSubmit: '创建账号',
        sessionExpired: '登录已过期，请重新登录以继续操作。',
        errors: {
          emailRequired: '需输入邮箱。',
          emailInvalid: '请输入有效的邮箱地址。',
          passwordRequired: '需输入密码。',
          passwordStrength: '密码必须至少为 8 位，且包含字母和数字。',
          passwordsNotMatch: '两次输入的密码不一致。',
          nameTooShort: '姓名至少需要 2 个字符。',
          loginFailed: '邮箱或密码错误。',
          tokenRequired: '需输入重置代码。',
          newPasswordRequired: '需输入新密码。'
        },
        ui: {
          displayName: '显示名称（可选）',
          confirmPassword: '确认密码',
          forgotPassword: '忘记密码？',
          haveCode: '已有重置代码？',
          newHere: '新用户？',
          backToLogin: '返回登录',
          resetPassword: '重置密码',
          setNewPassword: '设置新密码',
          sendResetLink: '发送重置链接',
          updatePassword: '更新密码',
          resetSent: '如果该邮箱已注册，重置链接已发送。',
          passwordUpdated: '密码已更新，请重新登录。'
        }
      },
      protected: {
        title: '圣典档案',
        subtitle: '仅注册用户可进入此处。'
      },
      bazi: {
        title: '八字命盘',
        subtitle: '输入出生信息即可生成四柱与五行分布。',
        birthYear: '出生年份',
        birthMonth: '出生月份',
        birthDay: '出生日',
        birthHour: '出生时辰 (0-23)',
        gender: '性别',
        genderPlaceholder: '请选择性别',
        genderFemale: '女性',
        genderMale: '男性',
        birthLocation: '出生地',
        locationPlaceholder: '城市 / 国家',
        locationHint: '支持坐标（纬度, 经度）或常见城市，如北京、上海、伦敦、纽约。',
        timezone: '时区',
        calculate: '开始排盘',
        fullAnalysis: '请求完整解读',
        saveRecord: '保存到历史',
        addFavorite: '加入收藏',
        calculated: '基础命盘已生成。',
        restored: '已恢复上次游客排盘结果。',
        fullReady: '完整解读已就绪。',
        saved: '记录已保存到历史。',
        favorited: '已加入收藏。',
        favoriteReady: '收藏成功，可在收藏页查看。',
        loginRequired: '请先登录以使用此功能。',
        saveFirst: '请先保存记录再收藏。',
        fullRequired: '请先生成完整解读后再请求 AI。',
        aiInterpret: '打开 AI 解读',
        aiOpen: '打开 AI 解读窗口',
        aiThinking: 'AI 解读生成中…',
        aiReady: 'AI 解读已生成。',
        aiAnalysis: 'AI 八字解读',
        fourPillars: '四柱',
        fiveElements: '五行分布',
        tenGods: '十神概览',
        luckCycles: '大运排盘',
        timeContext: '时间校准',
        timezoneInput: '输入时区',
        timezoneResolved: '解析偏移',
        birthUtc: '换算为 UTC',
        trueSolarTime: '真太阳时',
        trueSolarCorrection: '真太阳时修正',
        trueSolarLocation: '使用的地点',
        trueSolarUnavailable: '不可用（未识别地点）',
        timezoneUnavailable: '未能解析',
        waiting: '请输入出生信息生成结果。',
        fullWaiting: '请求完整解读后可查看。',
        year: '年柱',
        month: '月柱',
        day: '日柱',
        hour: '时柱',
        errors: {
          yearRequired: '需输入出生年份。',
          yearInvalid: '请输入有效的年份。',
          monthRequired: '需输入出生月份。',
          monthInvalid: '请输入有效的月份 (1-12)。',
          dayRequired: '需输入出生日期。',
          dayInvalid: '请输入有效的日期 (1-31)。',
          dateInvalid: '请输入有效的日期。',
          futureDate: '出生日期不能晚于当前时间。',
          hourRequired: '需输入出生时辰。',
          hourInvalid: '请输入有效的时辰 (0-23)。',
          genderRequired: '需选择性别。',
          locationWhitespace: '出生地不能为空白。',
          timezoneWhitespace: '时区不能为空白。'
        }
      },
      history: {
        detailsTitle: '八字记录',
        recordHeading: '记录 #{{id}}',
        detailsSubtitle: '查看已保存的命盘详情与时间校准信息。',
        viewDetails: '查看详情',
        backToHistory: '返回历史',
        recordLoading: '正在加载记录…',
        recordInvalid: '记录编号无效。',
        recordMissing: '未找到记录。',
        recordLoadError: '无法加载记录。'
      },
      profile: {
        title: '个人中心',
        subtitle: '仅注册用户可进入此处。',
        name: '姓名',
        displayName: '显示名称',
        email: '邮箱',
        settingsTitle: '个人设置',
        settingsSubtitle: '保持你的语言偏好与通知设置在不同设备间同步。',
        locale: '语言',
        displayNamePlaceholder: '为你的个人资料添加一个简短名称',
        displayNameHint: '2-40 个字符。',
        preferences: '偏好设置',
        dailyGuidance: '每日引导',
        dailyGuidanceDesc: '获取根据你的命盘生成的每日提示。',
        ritualReminders: '仪式提醒',
        ritualRemindersDesc: '接收你选择的择时仪式提醒。',
        researchUpdates: '研究动态',
        researchUpdatesDesc: '随时了解最新的分析方法与洞察。',
        aiProvider: 'AI 提供商',
        aiProviderDesc: '选择用于解读的 AI 模型。仅启用的提供商可被保存。',
        preferredProvider: '首选提供商',
        useDefault: '使用默认',
        activeServerProvider: '当前服务器提供商',
        providersEnabled: '{{count}} 个提供商已启用。',
        noProvidersEnabled: '未启用提供商。使用回退摘要。',
        saveSettings: '保存设置',
        saving: '保存中…',
        settingsSaved: '设置已保存。',
        cancel: '取消',
        dangerZone: '危险区域',
        dangerZoneDesc: '不可逆操作，请谨慎进行。',
        deleteAccount: '删除账号',
        deleteAccountTitle: '确定删除账号？',
        deleteAccountDesc: '这将永久删除你的个人资料、历史记录、收藏和设置。此操作无法撤销。',
        confirmDelete: '确认删除',
        historySnapshot: '历史快照',
        historySnapshotDesc: '同步自你账号的最近八字历史记录。',
        openHistory: '打开历史',
        totalRecords: '总记录数',
        showingLatest: '显示最近 3 条记录',
        noHistory: '暂无历史记录。',
        ziweiQuickChart: '紫微 (V2) 快速排盘',
        ziweiQuickChartDesc: '使用你最近的一条八字记录生成紫微命盘。',
        latestBaziRecord: '最近保存的八字记录',
        noRecordAvailable: '没有可用记录',
        generateZiwei: '生成紫微命盘',
        ziweiReady: '已根据你最近的八字记录生成紫微命盘。',
        createBaziFirst: '请先创建八字记录以解锁紫微快速排盘。',
        saveBaziFirst: 'Save a BaZi record first to generate Zi Wei charts.',
        calculating: 'Calculating...'
      },
      favorites: {
        title: '收藏夹',
        subtitle: '你收藏的命盘记录，方便快速查看。',
        savedCount: '{{count}} 条已收藏',
        availableToAdd: '{{count}} 条可添加',
        noFavorites: '暂无收藏',
        noFavoritesDesc: '保存一条记录，它将出现在这里。',
        addFromHistory: '从历史中添加',
        addFromHistoryDesc: '从你保存的记录中选择并加入收藏。',
        allFavorited: '所有记录已收藏',
        noHistoryYet: '暂无历史记录',
        noHistoryYetDesc: '先进行一次排盘，然后再添加到此处。',
        view: '查看',
        hide: '收起',
        share: '分享',
        remove: '移除',
        removing: '移除中…',
        adding: '添加中…',
        add: '加入收藏',
        shareSuccess: '分享成功。',
        shareFailed: '分享失败，已尝试复制到剪贴板。',
        copied: '已复制到剪贴板。',
        copyFailed: '无法复制分享文本。',
        loadError: '无法加载收藏夹。',
        recordsLoadError: '无法加载历史记录。',
        removeError: '无法移除收藏。',
        addError: '无法添加收藏。'
      }
    }
  }
};

const STORAGE_KEY = 'locale';
const SUPPORTED_LOCALES = new Set(['en-US', 'zh-CN']);

const normalizeLocale = (locale) => {
  if (!locale) return 'en-US';
  if (locale.toLowerCase().startsWith('zh')) return 'zh-CN';
  if (SUPPORTED_LOCALES.has(locale)) return locale;
  return 'en-US';
};

const safeGetStoredLocale = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const safeSetStoredLocale = (locale) => {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures (e.g. private mode).
  }
};

const getInitialLocale = () => {
  const stored = safeGetStoredLocale();
  if (stored) return normalizeLocale(stored);
  return normalizeLocale(navigator.language);
};

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLocale(),
    fallbackLng: 'en-US',
    interpolation: { escapeValue: false }
  });

i18n.on('languageChanged', (locale) => {
  const normalized = normalizeLocale(locale);
  if (normalized !== locale) {
    void i18n.changeLanguage(normalized);
    return;
  }
  safeSetStoredLocale(normalized);
});

export default i18n;
