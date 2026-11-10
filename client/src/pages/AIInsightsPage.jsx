import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  AlertTriangle,
  IndianRupee,
  Calendar,
  Volume2,
  Pause,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  Package,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { useShop } from '../context/ShopContext.jsx';
import { insightsService } from '../services/insightsService.js';
import { playSpokenAudio } from '../services/voiceService.js';
import { SUPPORTED_LANGUAGES } from '../i18n/translations.js';
import Badge from '../components/common/Badge.jsx';
import StatCard from '../components/common/StatCard.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';

const CATEGORY_COLORS = ['#047857', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#78716c'];

export default function AIInsightsPage() {
  const navigate = useNavigate();
  const { language, setLanguage, showToast, t, formatCurrency, formatDate } = useShop();

  const [loading, setLoading] = useState(true);
  const [verifiedMetrics, setVerifiedMetrics] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [insightsError, setInsightsError] = useState('');

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioPlayerRef.current && typeof audioPlayerRef.current.pause === 'function') {
        audioPlayerRef.current.pause();
      }
    };
  }, []);

  const fetchInsights = useCallback(
    async (lang) => {
      setLoading(true);
      setInsightsError('');
      try {
        const res = await insightsService.getInsights({ language: lang || language });
        if (res.data?.success) {
          setVerifiedMetrics(res.data.verifiedMetrics);
          setAiSummary(res.data.aiSummary);
        }
      } catch (err) {
        const msg = err.response?.data?.message || t('insights.failedToLoad');
        setInsightsError(msg);
        showToast(msg, 'error');
      } finally {
        setLoading(false);
      }
    },
    [language, showToast, t]
  );

  useEffect(() => {
    fetchInsights(language);
  }, [language, fetchInsights]);

  const handlePlayVoiceSummary = () => {
    if (isPlayingAudio) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioPlayerRef.current && typeof audioPlayerRef.current.pause === 'function') {
        audioPlayerRef.current.pause();
      }
      setIsPlayingAudio(false);
      return;
    }

    if (!aiSummary?.narrative) return;
    setIsPlayingAudio(true);

    audioPlayerRef.current = playSpokenAudio({
      audioBase64: aiSummary.audioBase64,
      spokenText: aiSummary.narrative,
      language,
      onEnd: () => setIsPlayingAudio(false),
    });
  };

  const getPriorityBadge = (priority) => {
    if (priority === 'high') {
      return <Badge variant="danger">{t('insights.priorityHigh')}</Badge>;
    }
    if (priority === 'medium') {
      return <Badge variant="warning">{t('insights.priorityMedium')}</Badge>;
    }
    return <Badge variant="emerald">{t('insights.priorityLow')}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            {t('insights.title')}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">{t('insights.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => fetchInsights(language)}
            disabled={loading}
            className="btn-secondary text-xs py-2 px-3"
            title={t('common.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </button>

          <div className="inline-flex items-center gap-1 p-1 bg-white rounded-xl border border-stone-200/90 shadow-xs">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
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
      </div>

      {/* 1. Daily Store Summary Briefing Card */}
      <div className="bg-white rounded-2xl border border-emerald-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center shrink-0">
              <BarChart3 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                {t('insights.dailySummaryTitle')}
              </h2>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-800">
                <ShieldCheck size={13} className="text-emerald-700" />
                {t('insights.verifiedFactsBadge')}
              </span>
            </div>
          </div>

          <button
            onClick={handlePlayVoiceSummary}
            disabled={loading || !aiSummary?.narrative}
            className="btn-primary text-xs py-2 px-4 self-start sm:self-auto"
          >
            {isPlayingAudio ? (
              <>
                <Pause size={15} />
                <span>{t('insights.pauseBriefing')}</span>
              </>
            ) : (
              <>
                <Volume2 size={15} />
                <span>{t('insights.playBriefing')}</span>
              </>
            )}
          </button>
        </div>

        <div>
          {loading ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-stone-400">
              <Loader2 size={16} className="animate-spin text-emerald-700" />
              <span>{t('common.loading')}</span>
            </div>
          ) : insightsError ? (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {insightsError}
            </div>
          ) : (
            <p className="text-sm sm:text-base font-medium text-stone-800 leading-relaxed">
              {aiSummary?.narrative || t('insights.noInsightsAvailable')}
            </p>
          )}
        </div>
      </div>

      {/* 2. Verified Database Figures */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-700" />
          <h3 className="text-xs font-semibold text-stone-600">
            {t('insights.verifiedFactsBadge')}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t('insights.todayRevenue')}
            value={loading ? '...' : formatCurrency(verifiedMetrics?.todayRevenue)}
            subtext={t('insights.billsCountLabel', { count: verifiedMetrics?.todayBills || 0 })}
            icon={IndianRupee}
            iconColor="text-emerald-700"
            iconBg="bg-emerald-50 border-emerald-200/80"
          />
          <StatCard
            label={t('insights.weeklyRevenue')}
            value={loading ? '...' : formatCurrency(verifiedMetrics?.weeklyRevenue)}
            subtext={t('insights.billsCountLabel', { count: verifiedMetrics?.weeklyBills || 0 })}
            icon={Calendar}
          />
          <StatCard
            label={t('insights.monthlyRevenue')}
            value={loading ? '...' : formatCurrency(verifiedMetrics?.monthlyRevenue)}
            subtext={t('insights.billsCountLabel', { count: verifiedMetrics?.monthlyBills || 0 })}
            icon={TrendingUp}
          />
          <StatCard
            label={t('insights.avgOrderValue')}
            value={loading ? '...' : formatCurrency(verifiedMetrics?.averageSaleValue)}
            icon={Package}
          />
        </div>
      </div>

      {/* 3. Charts Row: 7-Day Trend + Category Share */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('insights.revenueTrend7d')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 flex-1">
            <div className="h-64 w-full flex items-center justify-center">
              {verifiedMetrics?.dailyChart?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={verifiedMetrics.dailyChart}
                    margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="insightRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#047857" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#047857" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f1ee" vertical={false} />
                    <XAxis dataKey="_id" stroke="#a8a29e" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#a8a29e"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `₹${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #e7e5e4',
                        fontSize: '12px',
                      }}
                      formatter={(val) => [formatCurrency(val), t('common.total')]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#047857"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#insightRev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-stone-400">{t('insights.noInsightsData')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('insights.categoryShare')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 flex-1 flex flex-col justify-center">
            {verifiedMetrics?.categoryChart?.length > 0 ? (
              <>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={verifiedMetrics.categoryChart}
                        dataKey="revenue"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={66}
                      >
                        {verifiedMetrics.categoryChart.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 mt-3 text-xs">
                  {verifiedMetrics.categoryChart.slice(0, 4).map((cat, idx) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                        />
                        <span className="text-stone-700 truncate max-w-[140px]">
                          {t(`inventory.categories.${cat.category}`) !==
                          `inventory.categories.${cat.category}`
                            ? t(`inventory.categories.${cat.category}`)
                            : cat.category}
                        </span>
                      </div>
                      <span className="font-semibold text-stone-900 tabular-nums">
                        {formatCurrency(cat.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-stone-400 text-center py-8">
                {t('insights.noInsightsData')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Recommendations Section */}
      {aiSummary?.recommendations?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <h3 className="text-xs font-semibold text-stone-600">
              {t('insights.recommendationsTitle')}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aiSummary.recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    {getPriorityBadge(rec.priority)}
                  </div>
                  <h4 className="text-sm font-bold text-stone-900">{rec.title}</h4>
                  <p className="text-xs text-stone-600 leading-relaxed">{rec.desc}</p>
                </div>

                <button
                  onClick={() =>
                    navigate(
                      rec.actionType === 'KHATA_REMINDER' ? '/digital-khata' : '/inventory'
                    )
                  }
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 self-start"
                >
                  <span>
                    {rec.actionType === 'KHATA_REMINDER'
                      ? t('nav.digitalKhata')
                      : t('nav.inventory')}
                  </span>
                  <ArrowRight size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Inventory Health: Best Sellers, Slow Moving, Recent Changes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('insights.bestSellers')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 divide-y divide-stone-100 text-xs">
            {verifiedMetrics?.bestSellingProducts?.length > 0 ? (
              verifiedMetrics.bestSellingProducts.slice(0, 5).map((p, idx) => (
                <div key={p._id || idx} className="py-2.5 flex items-center justify-between gap-2">
                  <span className="font-semibold text-stone-900 truncate">{p.name}</span>
                  <span className="font-semibold text-emerald-700 shrink-0 tabular-nums">
                    {formatCurrency(p.totalRevenueGenerated)}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-stone-400">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('insights.slowMoving')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 divide-y divide-stone-100 text-xs">
            {verifiedMetrics?.slowMovingProducts?.length > 0 ? (
              verifiedMetrics.slowMovingProducts.map((p) => (
                <div key={p._id} className="py-2.5 flex items-center justify-between gap-2">
                  <span className="font-medium text-stone-800 truncate">{p.name}</span>
                  <span className="text-stone-500 shrink-0">
                    {p.currentStock} {t('common.units')}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-stone-400">{t('insights.noSlowMoving')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('insights.recentChanges')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 divide-y divide-stone-100 text-xs">
            {verifiedMetrics?.recentInventoryChanges?.length > 0 ? (
              verifiedMetrics.recentInventoryChanges.slice(0, 5).map((log, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-2">
                  <span className="font-medium text-stone-800 truncate">
                    {log.details?.name || log.action}
                  </span>
                  <span className="text-[11px] text-stone-400 shrink-0">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-stone-400">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
