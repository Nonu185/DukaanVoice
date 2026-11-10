import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { SUPPORTED_LANGUAGES } from '../i18n/translations.js';
import { Mic, Globe } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const { language, setLanguage, t } = useShop();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || t('auth.loginFailed'));
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
                onClick={() => setLanguage(lang.code)}
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

        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs p-6 sm:p-8 space-y-6">
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
            <h2 className="text-lg font-bold text-stone-900">{t('auth.signInTitle')}</h2>
            <p className="text-xs text-stone-500 mt-1">{t('auth.signInSubtitle')}</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
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
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-sm font-semibold"
            >
              {loading ? t('auth.signingIn') : t('auth.signInBtn')}
            </button>
          </form>

          <p className="text-center text-xs text-stone-500">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-emerald-700 font-semibold hover:underline">
              {t('auth.registerLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
