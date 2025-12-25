import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  'en-US': {
    translation: {
      nav: {
        home: 'Home',
        login: 'Login',
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
        submit: 'Sign In'
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
        genderFemale: 'Female',
        genderMale: 'Male',
        birthLocation: 'Birth Location',
        locationPlaceholder: 'City / Country',
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
        fourPillars: 'Four Pillars',
        fiveElements: 'Five Elements',
        tenGods: 'Ten Gods',
        luckCycles: 'Major Luck Cycles',
        timeContext: 'Time Context',
        timezoneInput: 'Timezone Input',
        timezoneResolved: 'Resolved Offset',
        birthUtc: 'Birth Time (UTC)',
        timezoneUnavailable: 'Unavailable',
        waiting: 'Enter your birth data to generate results.',
        fullWaiting: 'Request full analysis to reveal this section.',
        year: 'Year',
        month: 'Month',
        day: 'Day',
        hour: 'Hour'
      }
    }
  },
  'zh-CN': {
    translation: {
      nav: {
        home: '首页',
        login: '登录',
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
        submit: '登录'
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
        genderFemale: '女性',
        genderMale: '男性',
        birthLocation: '出生地',
        locationPlaceholder: '城市 / 国家',
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
        fourPillars: '四柱',
        fiveElements: '五行分布',
        tenGods: '十神概览',
        luckCycles: '大运排盘',
        timeContext: '时间校准',
        timezoneInput: '输入时区',
        timezoneResolved: '解析偏移',
        birthUtc: '换算为 UTC',
        timezoneUnavailable: '未能解析',
        waiting: '请输入出生信息生成结果。',
        fullWaiting: '请求完整解读后可查看。',
        year: '年柱',
        month: '月柱',
        day: '日柱',
        hour: '时柱'
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
