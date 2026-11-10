import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Mic,
  Globe,
  ChevronDown,
  LogOut,
  Store,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import { useShop } from '../context/ShopContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { SUPPORTED_LANGUAGES } from '../i18n/translations.js';

export default function Navbar({ onMenuClick }) {
  const navigate = useNavigate();
  const { language, setLanguage, shopProfile, dbConnected, t } = useShop();
  const { user, logout } = useAuth();

  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const langRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setIsLangOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setIsProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const displayName =
    shopProfile.shopName || shopProfile.name || user?.shopName || t('common.brandName');
  const ownerName =
    shopProfile.ownerName || shopProfile.owner || user?.name || t('header.ownerRole');

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-stone-200/80 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile Menu Trigger, Shop Name & DB Status */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-1.5 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors shrink-0"
          aria-label={t('nav.openNavigation')}
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-semibold text-stone-900 text-sm truncate max-w-[160px] sm:max-w-xs">
            {displayName}
          </span>
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${
              dbConnected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/70'
                : 'bg-stone-50 text-stone-600 border-stone-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                dbConnected ? 'bg-emerald-600' : 'bg-amber-500'
              }`}
            />
            {dbConnected ? t('header.dbConnected') : t('header.dbOffline')}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Voice Assistant Quick Access */}
        <button
          onClick={() => navigate('/voice')}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border border-emerald-200/90 rounded-xl font-medium text-xs sm:text-sm transition-colors"
          title={t('nav.voiceAssistant')}
        >
          <Mic size={15} className="text-emerald-700 shrink-0" />
          <span className="hidden md:inline whitespace-nowrap">{t('header.voiceReady')}</span>
        </button>

        {/* Language Selector Dropdown */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setIsLangOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-xl border border-stone-200/90 bg-white transition-colors"
            aria-label={t('header.selectLanguage')}
          >
            <Globe size={15} className="text-stone-500 shrink-0" />
            <span className="whitespace-nowrap">{currentLangObj.nativeLabel}</span>
            <ChevronDown size={14} className="text-stone-400 shrink-0" />
          </button>

          {isLangOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-md border border-stone-200 py-1.5 z-50">
              <div className="px-3.5 py-1.5 border-b border-stone-100">
                <p className="text-[11px] font-semibold text-stone-400">
                  {t('header.selectLanguage')}
                </p>
              </div>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsLangOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center justify-between hover:bg-stone-50 transition-colors ${
                    language === lang.code
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-stone-700'
                  }`}
                >
                  <span>{lang.nativeLabel}</span>
                  {language === lang.code && (
                    <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl hover:bg-stone-50 border border-stone-200/90 bg-white transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-semibold text-xs shrink-0">
              {(ownerName || 'U')[0].toUpperCase()}
            </div>
            <span className="text-xs sm:text-sm font-medium text-stone-800 hidden sm:inline max-w-[120px] truncate">
              {ownerName}
            </span>
            <ChevronDown size={14} className="text-stone-400 shrink-0" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-md border border-stone-200 py-1.5 z-50">
              <div className="px-4 py-2.5 border-b border-stone-100">
                <p className="text-xs font-semibold text-stone-900 truncate">{ownerName}</p>
                <p className="text-[11px] text-stone-500 truncate mt-0.5">{displayName}</p>
                <p className="text-[11px] text-emerald-700 font-medium mt-1">
                  {t('header.ownerRole')}
                </p>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-stone-700 hover:bg-stone-50 flex items-center gap-2.5"
                >
                  <Store size={15} className="text-stone-400 shrink-0" />
                  <span>{t('header.shopSettings')}</span>
                </button>
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate('/ai-insights');
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-stone-700 hover:bg-stone-50 flex items-center gap-2.5"
                >
                  <BarChart3 size={15} className="text-stone-400 shrink-0" />
                  <span>{t('header.businessInsights')}</span>
                </button>
              </div>

              <div className="border-t border-stone-100 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 font-medium"
                >
                  <LogOut size={15} className="shrink-0" />
                  <span>{t('header.signOut')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
