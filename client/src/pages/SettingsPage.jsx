import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Globe, User, CheckCircle2, Save, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { SUPPORTED_LANGUAGES, PRIMARY_VOICE_LANGUAGES } from '../i18n/translations.js';

export default function SettingsPage() {
  const { user, logout, updatePrimaryLanguage } = useAuth();
  const { shopProfile, updateShopProfile, refreshShop, language, setLanguage, showToast, t } = useShop();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('profile');
  const [savingVoiceLang, setSavingVoiceLang] = useState(false);
  const [profileForm, setProfileForm] = useState({
    shopName: shopProfile.shopName || shopProfile.name || '',
    ownerName: shopProfile.ownerName || shopProfile.owner || '',
    phone: shopProfile.phone || '',
    gstin: shopProfile.gstin || '',
    address: shopProfile.address || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setProfileForm({
      shopName: shopProfile.shopName || shopProfile.name || '',
      ownerName: shopProfile.ownerName || shopProfile.owner || '',
      phone: shopProfile.phone || '',
      gstin: shopProfile.gstin || '',
      address: shopProfile.address || '',
    });
  }, [shopProfile]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateShopProfile({
        shopName: profileForm.shopName.trim(),
        ownerName: profileForm.ownerName.trim(),
        phone: profileForm.phone.trim(),
        gstin: profileForm.gstin.trim(),
        address: profileForm.address.trim(),
      });
      setIsSaved(true);
      showToast(t('settings.savedSuccess'), 'success');
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLanguageChange = (nextLang) => {
    setLanguage(nextLang);
  };

  const handlePrimaryVoiceLanguageChange = async (nextVoiceLang) => {
    if (savingVoiceLang) return;
    setSavingVoiceLang(true);
    try {
      await updatePrimaryLanguage(nextVoiceLang);
      await refreshShop();
      showToast(t('settings.savedSuccess'), 'success');
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setSavingVoiceLang(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const tabs = [
    { id: 'profile', label: t('settings.tabProfile'), icon: Store },
    { id: 'language', label: t('settings.tabLanguage'), icon: Globe },
    { id: 'account', label: t('settings.tabAccount'), icon: User },
  ];

  const getLangDescription = (code) => {
    if (code === 'hi') return t('settings.langHiDesc');
    if (code === 'kn') return t('settings.langKnDesc');
    if (code === 'hinglish') return t('settings.langHinglishDesc');
    return t('settings.langEnDesc');
  };

  const activePrimaryVoiceLang =
    user?.primaryLanguage || shopProfile?.preferredLanguage || 'hi';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
          {t('settings.title')}
        </h1>
        <p className="text-xs sm:text-sm text-stone-500 mt-0.5">{t('settings.subtitle')}</p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200/80 overflow-x-auto pb-1.5 text-xs sm:text-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap transition-colors font-medium ${
                activeTab === tab.id
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/70'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Store Profile */}
      {activeTab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white rounded-2xl border border-stone-200/90 p-6 shadow-xs space-y-5"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-sm font-bold text-stone-900">{t('settings.storeInfoTitle')}</h2>
            {isSaved && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                <span>{t('settings.savedSuccess')}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                {t('settings.shopNameLabel')}
              </label>
              <input
                type="text"
                required
                value={profileForm.shopName}
                onChange={(e) => setProfileForm({ ...profileForm, shopName: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                {t('settings.ownerNameLabel')}
              </label>
              <input
                type="text"
                value={profileForm.ownerName}
                onChange={(e) => setProfileForm({ ...profileForm, ownerName: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                {t('settings.phoneLabel')}
              </label>
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                {t('settings.gstinLabel')}
              </label>
              <input
                type="text"
                value={profileForm.gstin}
                onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              {t('settings.addressLabel')}
            </label>
            <textarea
              rows={2}
              value={profileForm.address}
              onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
              className="input-field"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={isSaving} className="btn-primary text-xs py-2.5 px-5">
              <Save size={15} />
              <span>{isSaving ? t('settings.saving') : t('settings.saveChangesBtn')}</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Language Preference */}
      {activeTab === 'language' && (
        <div className="bg-white rounded-2xl border border-stone-200/90 p-6 shadow-xs space-y-6">
          <div className="border-b border-stone-100 pb-3">
            <h2 className="text-sm font-bold text-stone-900">{t('settings.voiceDialectTitle')}</h2>
            <p className="text-xs text-stone-500 mt-0.5">{t('settings.voiceDialectSub')}</p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-stone-700">
              {t('settings.defaultLangLabel')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  type="button"
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    language === lang.code
                      ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700/20'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm text-stone-900">{lang.nativeLabel}</p>
                    {language === lang.code && (
                      <CheckCircle2 size={16} className="text-emerald-700" />
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{getLangDescription(lang.code)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-stone-100 pt-5 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                {t('settings.primaryVoiceLangLabel')}
              </label>
              <p className="text-xs text-stone-500 mt-0.5">{t('settings.primaryVoiceLangSub')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PRIMARY_VOICE_LANGUAGES.map((lang) => (
                <button
                  type="button"
                  key={lang.code}
                  disabled={savingVoiceLang}
                  onClick={() => handlePrimaryVoiceLanguageChange(lang.code)}
                  className={`p-4 rounded-xl border text-left transition-colors disabled:opacity-60 ${
                    activePrimaryVoiceLang === lang.code
                      ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700/20'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-stone-900">{lang.nativeLabel}</p>
                    {activePrimaryVoiceLang === lang.code && (
                      <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{getLangDescription(lang.code)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: User Account & Logout */}
      {activeTab === 'account' && (
        <div className="bg-white rounded-2xl border border-stone-200/90 p-6 shadow-xs space-y-5">
          <div className="border-b border-stone-100 pb-3">
            <h2 className="text-sm font-bold text-stone-900">{t('settings.accountTitle')}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-warm-50 border border-stone-200/80">
              <p className="text-stone-500 font-medium">{t('settings.ownerNameLabel')}</p>
              <p className="text-sm font-semibold text-stone-900 mt-1">{user?.name || '—'}</p>
            </div>
            <div className="p-4 rounded-xl bg-warm-50 border border-stone-200/80">
              <p className="text-stone-500 font-medium">{t('settings.accountEmailLabel')}</p>
              <p className="text-sm font-semibold text-stone-900 mt-1">{user?.email || '—'}</p>
            </div>
          </div>

          <div className="pt-2 flex justify-end border-t border-stone-100">
            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary text-xs py-2.5 px-4 text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              <LogOut size={15} />
              <span>{t('settings.logoutBtn')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
