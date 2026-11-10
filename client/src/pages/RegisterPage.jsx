import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { shopService } from '../services/authService.js';
import { SUPPORTED_LANGUAGES, PRIMARY_VOICE_LANGUAGES } from '../i18n/translations.js';
import { Mic, Globe } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const { language, setLanguage, refreshShop, refreshDashboardStats, t } = useShop();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    shopName: '',
    phone: '',
    primaryLanguage: 'hi',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (name === 'primaryLanguage' && ['en', 'hi', 'kn'].includes(value)) {
      setLanguage(value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirmPassword,
        primaryLanguage: form.primaryLanguage,
      });
      await shopService.onboard({
        shopName: form.shopName.trim(),
        phone: form.phone.trim(),
        preferredLanguage: form.primaryLanguage,
      });
      await Promise.all([refreshShop(), refreshDashboardStats()]);
      navigate('/dashboard');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0]?.msg ||
          t('auth.registrationFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Top Language Switcher */}
        <div className="flex justify-end">
          <div className="inline-flex items-center gap-1 bg-white border border-stone-200/90 rounded-xl p-1 shadow-xs">
            <Globe size={14} className="text-stone-400 ml-2 mr-1" />
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setLanguage(lang.code);
                  setForm((f) => ({ ...f, primaryLanguage: lang.code }));
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  language === lang.code
                    ? 'bg-emerald-700 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {lang.nativeLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs p-6 sm:p-8 space-y-5">
          {/* Brand Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <Mic size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-stone-900">
                {t('common.brandName')}
              </h1>
              <p className="text-xs text-stone-500 font-medium">{t('auth.tagline')}</p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-stone-900">{t('auth.createAccountTitle')}</h2>
            <p className="text-xs text-stone-500 mt-1">{t('auth.createAccountSubtitle')}</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('auth.fullNameLabel')}
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder={t('auth.fullNamePlaceholder')}
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('auth.emailLabel')}
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder={t('auth.emailPlaceholder')}
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('auth.passwordLabel')}
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder={t('auth.passwordPlaceholder')}
                required
                className="input-field"
              />
              <p className="text-[11px] text-stone-400 mt-1">{t('auth.passwordHint')}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('auth.confirmPasswordLabel')}
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder={t('auth.confirmPasswordPlaceholder')}
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('auth.shopNameLabel')}
              </label>
              <input
                type="text"
                name="shopName"
                value={form.shopName}
                onChange={handleChange}
                placeholder={t('auth.shopNamePlaceholder')}
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('auth.phoneLabel')}
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder={t('auth.phonePlaceholder')}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('auth.preferredLangLabel')}
              </label>
              <select
                name="primaryLanguage"
                value={form.primaryLanguage}
                onChange={handleChange}
                className="input-field"
              >
                {PRIMARY_VOICE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeLabel}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-sm font-semibold mt-2"
            >
              {loading ? t('auth.creatingAccount') : t('auth.createAccountBtn')}
            </button>
          </form>

          <p className="text-center text-xs text-stone-500 pt-1">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-emerald-700 font-semibold hover:underline">
              {t('auth.loginLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
