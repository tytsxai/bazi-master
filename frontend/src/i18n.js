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
        sessionExpired: 'Your session expired. Please sign in again to continue.'
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
        hour: 'Hour'
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
        sessionExpired: '登录已过期，请重新登录以继续操作。'
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
        hour: '时柱'
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
