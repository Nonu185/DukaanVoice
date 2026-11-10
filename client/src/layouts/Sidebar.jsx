import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Mic,
  Package,
  TrendingUp,
  BookOpen,
  BarChart3,
  Settings,
  Store,
  X,
} from 'lucide-react';
import { useShop } from '../context/ShopContext.jsx';

export default function Sidebar({ isOpen, onClose }) {
  const { t, shopProfile } = useShop();

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/voice', icon: Mic, label: t('nav.voiceAssistant') },
    { to: '/inventory', icon: Package, label: t('nav.inventory') },
    { to: '/sales', icon: TrendingUp, label: t('nav.salesHistory') },
    { to: '/digital-khata', icon: BookOpen, label: t('nav.digitalKhata') },
    { to: '/ai-insights', icon: BarChart3, label: t('nav.aiInsights') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  const shopDisplayName = shopProfile.shopName || shopProfile.name || t('common.brandName');

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-stone-200/90 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-stone-200/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center text-white shrink-0">
              <Mic size={19} className="stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-base tracking-tight text-stone-900 truncate">
                {t('common.brandName')}
              </div>
              <p className="text-[11px] text-stone-500 font-medium truncate">
                {t('common.brandSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors duration-150 ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-stone-600 font-medium hover:text-stone-900 hover:bg-stone-100/70'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      className={`shrink-0 stroke-[1.9] ${
                        isActive ? 'text-emerald-700' : 'text-stone-500'
                      }`}
                    />
                    <span className="truncate whitespace-nowrap">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Shop Profile Footer */}
        <div className="p-3.5 border-t border-stone-200/80 bg-warm-50/70 shrink-0">
          <div className="p-3 bg-white rounded-xl border border-stone-200/80 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-700 shrink-0">
              <Store size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-stone-900 truncate">
                {shopDisplayName}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-[11px] text-stone-500 truncate">
                  {t('nav.storeOpen')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
