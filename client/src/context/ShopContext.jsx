import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { dashboardService } from '../services/dashboardService.js';
import { shopService } from '../services/authService.js';
import { useAuth } from './AuthContext.jsx';
import { translate, SUPPORTED_LANGUAGES } from '../i18n/translations.js';

const ShopContext = createContext(null);
const LANG_STORAGE_KEY = 'dukaanvoice_lang';

const EMPTY_SHOP_PROFILE = {
  shopName: '',
  ownerName: '',
  phone: '',
  address: '',
  gstin: '',
  currency: '₹',
};

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && ['en', 'hi', 'kn'].includes(saved)) {
      return saved;
    }
  } catch (_e) {
    // Ignore storage access errors
  }
  return 'en';
}

export function ShopProvider({ children }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState(getInitialLanguage);
  const [shopProfile, setShopProfile] = useState(EMPTY_SHOP_PROFILE);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success', title = '') => {
    setToast({ message, type, title });
    setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4000);
  }, []);

  const setLanguage = useCallback((nextLang) => {
    const normalized = ['en', 'hi', 'kn'].includes(nextLang) ? nextLang : 'en';
    setLanguageState(normalized);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, normalized);
      document.documentElement.lang = normalized;
    } catch (_e) {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch (_e) {
      // Ignore
    }
  }, [language]);

  const t = useCallback((key, vars = {}) => translate(language, key, vars), [language]);

  const locale = useMemo(() => {
    return SUPPORTED_LANGUAGES.find((l) => l.code === language)?.locale || 'en-IN';
  }, [language]);

  const formatCurrency = useCallback((amount) => {
    const num = Number(amount || 0);
    return `₹${num.toLocaleString('en-IN')}`;
  }, []);

  const formatDate = useCallback(
    (dateInput, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
      if (!dateInput) return '';
      return new Date(dateInput).toLocaleDateString(locale, options);
    },
    [locale]
  );

  const formatTime = useCallback(
    (dateInput) => {
      if (!dateInput) return '';
      return new Date(dateInput).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [locale]
  );

  const fetchShop = useCallback(async () => {
    if (!user) return null;
    try {
      const res = await shopService.getMyShop();
      if (res.data?.shop) {
        setShopProfile(res.data.shop);
        setDbConnected(true);
        const hasSavedLang = localStorage.getItem(LANG_STORAGE_KEY);
        const savedPref = user?.primaryLanguage || res.data.shop.preferredLanguage;
        if (!hasSavedLang && savedPref) {
          const mapped = savedPref === 'hinglish' ? 'hi' : savedPref;
          if (['en', 'hi', 'kn'].includes(mapped)) {
            setLanguage(mapped);
          }
        }
        return res.data.shop;
      }
    } catch (_err) {
      setDbConnected(false);
    }
    return null;
  }, [user, setLanguage]);

  const updateShopProfile = useCallback(async (updates) => {
    const res = await shopService.updateMyShop(updates);
    if (res.data?.shop) {
      setShopProfile(res.data.shop);
      return res.data.shop;
    }
    return null;
  }, []);

  const fetchDashboardStats = useCallback(async () => {
    if (!user) return;
    setLoadingStats(true);
    setStatsError(null);
    try {
      const res = await dashboardService.getStats();
      if (res.data?.success) {
        setDashboardStats(res.data);
        setDbConnected(true);
      }
    } catch (err) {
      setDbConnected(false);
      setStatsError(err.response?.data?.message || err.message || t('common.errorGeneric'));
    } finally {
      setLoadingStats(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (user) {
      fetchShop();
      fetchDashboardStats();
    } else {
      setShopProfile(EMPTY_SHOP_PROFILE);
      setDashboardStats(null);
      setStatsError(null);
      setDbConnected(false);
      setLoadingStats(false);
    }
  }, [user, fetchShop, fetchDashboardStats]);

  return (
    <ShopContext.Provider
      value={{
        language,
        setLanguage,
        t,
        locale,
        formatCurrency,
        formatDate,
        formatTime,
        shopProfile,
        setShopProfile,
        updateShopProfile,
        dbConnected,
        dashboardStats,
        loadingStats,
        statsError,
        refreshDashboardStats: fetchDashboardStats,
        refreshShop: fetchShop,
        toast,
        showToast,
        setToast,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
}
