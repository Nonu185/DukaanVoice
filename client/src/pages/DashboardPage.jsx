import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IndianRupee,
  ShoppingBag,
  Package,
  AlertTriangle,
  BookOpen,
  Mic,
  ArrowUpRight,
  Plus,
  Receipt,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useShop } from '../context/ShopContext.jsx';
import StatCard from '../components/common/StatCard.jsx';
import Badge from '../components/ui/badge.jsx';
import Modal from '../components/common/Modal.jsx';
import Button from '../components/ui/button.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card.jsx';

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    dashboardStats,
    loadingStats,
    statsError,
    refreshDashboardStats,
    shopProfile,
    t,
    formatCurrency,
    formatDate,
    formatTime,
  } = useShop();

  const [selectedTxn, setSelectedTxn] = useState(null);

  const metrics = dashboardStats?.metrics || {
    todayRevenue: 0,
    todayBills: 0,
    totalProducts: 0,
    lowStockCount: 0,
    totalPendingCredit: 0,
    customersWithCreditCount: 0,
  };

  const lowStockAlerts = dashboardStats?.lowStockAlerts || [];
  const recentTransactions = dashboardStats?.recentTransactions || [];
  const topSellingProducts = dashboardStats?.topSellingProducts || [];
  const weeklyChartData = dashboardStats?.weeklyChart || [];

  const ownerDisplayName = shopProfile.ownerName || shopProfile.owner || t('header.ownerRole');

  const getPaymentLabel = (method) => {
    if (method === 'cash') return t('common.cash');
    if (method === 'upi') return t('common.upi');
    return t('common.khata');
  };

  return (
    <div className="space-y-6">
      {/* Store Greeting & Primary Actions */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
              {t('dashboard.greeting', { name: ownerDisplayName })}
            </h1>
            <p className="text-stone-600 text-sm leading-relaxed">
              {t('dashboard.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              onClick={() => navigate('/voice')}
              size="default"
              className="gap-2 font-semibold text-sm"
            >
              <Mic size={16} />
              <span>{t('dashboard.speakCommand')}</span>
            </Button>
            <Button
              onClick={() => navigate('/sales')}
              variant="secondary"
              size="default"
              className="gap-2 font-semibold text-sm"
            >
              <Receipt size={16} className="text-stone-600" />
              <span>{t('nav.salesHistory')}</span>
            </Button>
            <Button
              onClick={refreshDashboardStats}
              disabled={loadingStats}
              variant="outline"
              size="icon"
              title={t('common.refresh')}
              aria-label={t('common.refresh')}
            >
              <RefreshCw size={16} className={loadingStats ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {statsError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{statsError}</span>
          </div>
          <button
            onClick={refreshDashboardStats}
            className="font-semibold underline text-rose-900 hover:text-rose-950 shrink-0"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Key Metric Stat Cards (Equal Height Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label={t('dashboard.todayRevenue')}
          value={loadingStats ? '...' : formatCurrency(metrics.todayRevenue)}
          subtext={t('dashboard.todayRevenueSub')}
          icon={IndianRupee}
          iconColor="text-emerald-700"
          iconBg="bg-emerald-50 border-emerald-200/80"
          onClick={() => navigate('/sales')}
        />
        <StatCard
          label={t('dashboard.todayInvoices')}
          value={loadingStats ? '...' : metrics.todayBills}
          subtext={t('dashboard.todayInvoicesSub')}
          icon={ShoppingBag}
          iconColor="text-stone-700"
          iconBg="bg-stone-50 border-stone-200/80"
          onClick={() => navigate('/sales')}
        />
        <StatCard
          label={t('dashboard.totalProducts')}
          value={loadingStats ? '...' : metrics.totalProducts}
          subtext={t('dashboard.totalProductsSub')}
          icon={Package}
          iconColor="text-stone-700"
          iconBg="bg-stone-50 border-stone-200/80"
          onClick={() => navigate('/inventory')}
        />
        <StatCard
          label={t('dashboard.lowStockItems')}
          value={loadingStats ? '...' : metrics.lowStockCount}
          subtext={t('dashboard.lowStockSub')}
          icon={AlertTriangle}
          iconColor="text-amber-700"
          iconBg="bg-amber-50 border-amber-200/80"
          onClick={() => navigate('/inventory')}
        />
        <StatCard
          label={t('dashboard.pendingKhata')}
          value={loadingStats ? '...' : formatCurrency(metrics.totalPendingCredit)}
          subtext={t('dashboard.pendingKhataSub', {
            count: metrics.customersWithCreditCount || 0,
          })}
          icon={BookOpen}
          iconColor="text-amber-800"
          iconBg="bg-amber-50 border-amber-200/80"
          onClick={() => navigate('/digital-khata')}
        />
      </div>

      {/* Primary Row: Revenue Chart + Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Revenue Performance Chart */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('dashboard.revenueBreakdownTitle')}</CardTitle>
            <CardDescription>{t('dashboard.revenueBreakdownSub')}</CardDescription>
          </CardHeader>

          <CardContent className="pt-2 flex-1 flex flex-col justify-between">
            <div className="h-64 w-full flex items-center justify-center">
              {weeklyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={weeklyChartData}
                    margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#047857" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#047857" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f1ee" vertical={false} />
                    <XAxis
                      dataKey="_id"
                      stroke="#a8a29e"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
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
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
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
                      fill="url(#colorRevenue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center px-6 py-10 bg-warm-50/70 rounded-xl border border-dashed border-stone-200 w-full">
                  <TrendingUp size={24} className="text-stone-300 mx-auto mb-2" />
                  <p className="text-stone-500 text-xs sm:text-sm max-w-sm mx-auto">
                    {loadingStats ? t('common.loading') : t('dashboard.chartEmpty')}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
              <span>{t('dashboard.salesTrajectory7d')}</span>
              <button
                onClick={() => navigate('/sales')}
                className="text-emerald-700 font-semibold hover:underline flex items-center gap-1"
              >
                <span>{t('dashboard.detailedReport')}</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Alerts Card */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">{t('dashboard.lowStockTitle')}</CardTitle>
              <CardDescription>{t('dashboard.lowStockDesc')}</CardDescription>
            </div>
            <button
              onClick={() => navigate('/inventory')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 shrink-0"
            >
              {t('dashboard.viewAll', { count: metrics.lowStockCount })}
            </button>
          </CardHeader>

          <CardContent className="pt-1 flex-1 flex flex-col justify-between">
            <div className="divide-y divide-stone-100">
              {lowStockAlerts.map((item) => (
                <div key={item._id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-stone-900 truncate">{item.name}</p>
                    <p className="text-[11px] text-stone-500">
                      {item.unit} • {formatCurrency(item.sellingPrice)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200/70 px-2 py-0.5 rounded-md">
                      {item.quantity} {t('common.left')}
                    </span>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {t('common.min')}: {item.lowStockThreshold}
                    </p>
                  </div>
                </div>
              ))}

              {lowStockAlerts.length === 0 && !loadingStats && (
                <div className="py-10 text-center px-4 bg-warm-50/70 rounded-xl border border-dashed border-stone-200 my-2">
                  <Package size={22} className="text-emerald-600/60 mx-auto mb-2" />
                  <p className="text-xs text-stone-500">{t('dashboard.allStockSufficient')}</p>
                </div>
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-stone-100">
              <Button
                onClick={() => navigate('/inventory')}
                variant="secondary"
                size="sm"
                className="w-full gap-1.5"
              >
                <Plus size={14} />
                <span>{t('dashboard.addRestockBtn')}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Row: Recent Transactions & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Recent Transactions */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">{t('dashboard.recentTransactionsTitle')}</CardTitle>
              <CardDescription>{t('dashboard.recentTransactionsDesc')}</CardDescription>
            </div>
            <button
              onClick={() => navigate('/sales')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 shrink-0"
            >
              <span>{t('dashboard.allInvoices')}</span>
              <ArrowUpRight size={14} />
            </button>
          </CardHeader>

          <CardContent className="pt-1 flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200/80 text-stone-500">
                    <th className="pb-2.5 font-semibold whitespace-nowrap pr-3">
                      {t('dashboard.colBillNo')}
                    </th>
                    <th className="pb-2.5 font-semibold whitespace-nowrap pr-3">
                      {t('dashboard.colCustomer')}
                    </th>
                    <th className="pb-2.5 font-semibold whitespace-nowrap pr-3">
                      {t('dashboard.colTime')}
                    </th>
                    <th className="pb-2.5 font-semibold whitespace-nowrap pr-3">
                      {t('dashboard.colPayment')}
                    </th>
                    <th className="pb-2.5 font-semibold text-right whitespace-nowrap pr-3">
                      {t('dashboard.colAmount')}
                    </th>
                    <th className="pb-2.5 font-semibold text-right whitespace-nowrap">
                      {t('dashboard.colReceipt')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {recentTransactions.map((txn) => (
                    <tr key={txn._id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 font-semibold text-stone-900 font-mono text-[11px] pr-3 whitespace-nowrap">
                        {txn.invoiceNumber}
                      </td>
                      <td className="py-3 text-stone-700 font-medium pr-3 max-w-[160px] truncate">
                        {txn.customer?.name || txn.customerName || t('common.walkInCustomer')}
                      </td>
                      <td className="py-3 text-stone-500 pr-3 whitespace-nowrap">
                        {formatTime(txn.createdAt)}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Badge
                          variant={
                            txn.paymentMethod === 'cash'
                              ? 'cash'
                              : txn.paymentMethod === 'upi'
                              ? 'upi'
                              : 'khata'
                          }
                          size="sm"
                        >
                          {getPaymentLabel(txn.paymentMethod)}
                        </Badge>
                      </td>
                      <td className="py-3 font-semibold text-stone-900 text-right pr-3 whitespace-nowrap tabular-nums">
                        {formatCurrency(txn.total)}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedTxn(txn)}
                          className="text-emerald-700 hover:text-emerald-900 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors"
                          title={t('dashboard.colReceipt')}
                        >
                          <Receipt size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {recentTransactions.length === 0 && !loadingStats && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-stone-500">
                        {t('dashboard.noTransactionsToday')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top-Selling Items */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('dashboard.topSellingTitle')}</CardTitle>
            <CardDescription>{t('dashboard.topSellingDesc')}</CardDescription>
          </CardHeader>

          <CardContent className="pt-1 flex-1">
            <div className="divide-y divide-stone-100">
              {topSellingProducts.map((p, idx) => (
                <div
                  key={p._id || idx}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-stone-100 text-stone-700 font-semibold text-[11px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-stone-500">
                        {t('dashboard.unitsSold', { count: p.totalQuantitySold })}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold text-stone-900 shrink-0 tabular-nums">
                    {formatCurrency(p.totalRevenueGenerated)}
                  </span>
                </div>
              ))}

              {topSellingProducts.length === 0 && !loadingStats && (
                <div className="py-10 text-center px-4 bg-warm-50/70 rounded-xl border border-dashed border-stone-200 my-2">
                  <p className="text-xs text-stone-500">{t('dashboard.noTopSellingYet')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Detail Modal */}
      {selectedTxn && (
        <Modal
          isOpen={!!selectedTxn}
          onClose={() => setSelectedTxn(null)}
          title={t('dashboard.receiptTitle', { invoice: selectedTxn.invoiceNumber })}
        >
          <div className="space-y-4">
            <div className="text-center pb-4 border-b border-stone-200">
              <h4 className="font-bold text-stone-900 text-base">
                {shopProfile.shopName || shopProfile.name || t('common.brandName')}
              </h4>
              {shopProfile.address && (
                <p className="text-xs text-stone-500 mt-0.5">{shopProfile.address}</p>
              )}
              {shopProfile.phone && (
                <p className="text-xs text-stone-500">
                  {t('common.phone')}: {shopProfile.phone}
                </p>
              )}
              <div className="mt-2 inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/70">
                {t('dashboard.paidVia', { method: getPaymentLabel(selectedTxn.paymentMethod) })}
              </div>
            </div>

            <div className="flex justify-between gap-2 text-xs text-stone-600">
              <span>
                {t('common.customer')}:{' '}
                <strong className="text-stone-900">
                  {selectedTxn.customer?.name ||
                    selectedTxn.customerName ||
                    t('common.walkInCustomer')}
                </strong>
              </span>
              <span className="text-right">
                {t('common.date')}:{' '}
                <strong className="text-stone-900">
                  {formatDate(selectedTxn.createdAt)} {formatTime(selectedTxn.createdAt)}
                </strong>
              </span>
            </div>

            <div className="border border-stone-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="p-2.5 font-semibold">{t('dashboard.itemCol')}</th>
                    <th className="p-2.5 font-semibold text-center">{t('common.quantity')}</th>
                    <th className="p-2.5 font-semibold text-right">{t('common.price')}</th>
                    <th className="p-2.5 font-semibold text-right">{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {selectedTxn.items?.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-medium text-stone-900">{it.name}</td>
                      <td className="p-2.5 text-center">{it.quantity}</td>
                      <td className="p-2.5 text-right">{formatCurrency(it.price)}</td>
                      <td className="p-2.5 text-right font-semibold">
                        {formatCurrency(it.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 pt-2 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>{t('common.subtotal')}</span>
                <span>{formatCurrency(selectedTxn.subtotal)}</span>
              </div>
              {selectedTxn.discount > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>{t('common.discount')}</span>
                  <span>- {formatCurrency(selectedTxn.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-stone-900 font-bold text-sm pt-2 border-t border-stone-200">
                <span>{t('common.grandTotal')}</span>
                <span>{formatCurrency(selectedTxn.total)}</span>
              </div>
            </div>

            <div className="pt-3 flex gap-3">
              <Button
                onClick={() => window.print()}
                variant="secondary"
                size="sm"
                className="flex-1"
              >
                {t('dashboard.printReceipt')}
              </Button>
              <Button
                onClick={() => setSelectedTxn(null)}
                variant="default"
                size="sm"
                className="flex-1"
              >
                {t('common.done')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
