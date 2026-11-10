import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Receipt,
  Printer,
  CreditCard,
  IndianRupee,
  Share2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useShop } from '../context/ShopContext.jsx';
import { saleService } from '../services/saleService.js';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import StatCard from '../components/common/StatCard.jsx';

export default function SalesPage() {
  const { shopProfile, t, formatCurrency, formatDate, formatTime } = useShop();

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalDocs: 0, totalPages: 1 });

  const [paymentFilter, setPaymentFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTxn, setSelectedTxn] = useState(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (paymentFilter !== 'all') params.paymentMethod = paymentFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await saleService.getSales(params);
      if (res.data?.success) {
        setSales(res.data.data || []);
        if (res.data.pagination) {
          setPagination(res.data.pagination);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, paymentFilter, startDate, endDate, t]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleViewDetail = async (sale) => {
    setSelectedTxn(sale);
    try {
      const res = await saleService.getSale(sale._id);
      if (res.data?.success) {
        setSelectedTxn(res.data.sale);
      }
    } catch (_e) {
      // Keep existing sale object
    }
  };

  const totalVolume = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalInvoices = pagination.totalDocs || sales.length;
  const avgOrderVal = sales.length > 0 ? Math.round(totalVolume / sales.length) : 0;

  const cashCount = sales.filter((s) => s.paymentMethod === 'cash').length;
  const upiCount = sales.filter((s) => s.paymentMethod === 'upi').length;
  const khataCount = sales.filter((s) => s.paymentMethod === 'khata').length;

  const getPaymentLabel = (method) => {
    if (method === 'cash') return t('common.cash');
    if (method === 'upi') return t('common.upi');
    return t('common.khata');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            {t('sales.title')}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">{t('sales.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchSales}
            disabled={loading}
            className="btn-secondary text-xs py-2 px-3"
            title={t('common.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </button>
          <button onClick={() => window.print()} className="btn-secondary text-xs py-2 px-3">
            <Printer size={15} />
            <span>{t('sales.printReport')}</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('sales.pageVolume')}
          value={loading ? '...' : formatCurrency(totalVolume)}
          subtext={t('sales.billsOnPage', { count: sales.length })}
          icon={IndianRupee}
          iconColor="text-emerald-700"
          iconBg="bg-emerald-50 border-emerald-200/80"
        />
        <StatCard
          label={t('sales.totalInvoices')}
          value={loading ? '...' : totalInvoices}
          subtext={t('sales.inPeriod')}
          icon={Receipt}
        />
        <StatCard
          label={t('sales.avgBillValue')}
          value={loading ? '...' : formatCurrency(avgOrderVal)}
          subtext={t('sales.perTransaction')}
          icon={TrendingUp}
        />
        <StatCard
          label={t('sales.paymentSplit')}
          value={`${cashCount} / ${upiCount} / ${khataCount}`}
          subtext={`${t('common.cash')} / ${t('common.upi')} / ${t('common.khata')}`}
          icon={CreditCard}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchSales} className="font-semibold underline text-rose-900">
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Filters & Date Selector */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs">
          <span className="text-stone-500 font-medium">{t('sales.dateFrom')}:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input-field py-1.5 px-2.5 text-xs w-36"
          />
          <span className="text-stone-500 font-medium">{t('sales.dateTo')}:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input-field py-1.5 px-2.5 text-xs w-36"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-stone-500 hover:text-stone-800 text-xs underline"
            >
              {t('sales.clearFilters')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto self-start md:self-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: t('sales.filterAllPayments') },
            { id: 'cash', label: t('common.cash') },
            { id: 'upi', label: t('common.upi') },
            { id: 'khata', label: t('common.khata') },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setPaymentFilter(mode.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                paymentFilter === mode.id
                  ? 'bg-emerald-700 text-white'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200/80 text-stone-500">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('sales.colInvoice')}</th>
                <th className="py-3 px-4 font-semibold">{t('sales.colDateTime')}</th>
                <th className="py-3 px-4 font-semibold">{t('sales.colCustomer')}</th>
                <th className="py-3 px-4 font-semibold text-center">{t('sales.colItems')}</th>
                <th className="py-3 px-4 font-semibold">{t('sales.colPayment')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('sales.colTotal')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('sales.colReceipt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sales.map((sale) => (
                <tr key={sale._id} className="hover:bg-stone-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-stone-900 font-mono text-xs whitespace-nowrap">
                    {sale.invoiceNumber}
                  </td>
                  <td className="py-3.5 px-4 text-stone-500 whitespace-nowrap">
                    <div>{formatTime(sale.createdAt)}</div>
                    <div className="text-[11px] text-stone-400">{formatDate(sale.createdAt)}</div>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-stone-800">
                    {sale.customer?.name || sale.customerName || t('common.walkInCustomer')}
                  </td>
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className="font-medium text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                      {t('sales.itemsCount', { count: sale.items?.length || 1 })}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <Badge
                      variant={
                        sale.paymentMethod === 'cash'
                          ? 'cash'
                          : sale.paymentMethod === 'upi'
                          ? 'upi'
                          : 'khata'
                      }
                      size="sm"
                    >
                      {getPaymentLabel(sale.paymentMethod)}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-stone-900 text-right text-sm tabular-nums whitespace-nowrap">
                    {formatCurrency(sale.total)}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleViewDetail(sale)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded-lg border border-emerald-200/80 transition-colors"
                    >
                      <Receipt size={13} />
                      <span>{t('common.view')}</span>
                    </button>
                  </td>
                </tr>
              ))}

              {sales.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center space-y-2">
                    <Receipt size={32} className="mx-auto text-stone-300" />
                    <p className="text-xs sm:text-sm text-stone-500 max-w-sm mx-auto">
                      {t('sales.noSalesFound')}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span>
              {t('common.showing', { count: sales.length, total: pagination.totalDocs })} (
              {t('common.pageOf', { page: pagination.page, totalPages: pagination.totalPages })})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={!pagination.hasPrevPage}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                className="px-2.5 py-1 rounded-lg border border-stone-200 disabled:opacity-40 hover:bg-stone-50"
              >
                {t('common.previous')}
              </button>
              <button
                disabled={!pagination.hasNextPage}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                className="px-2.5 py-1 rounded-lg border border-stone-200 disabled:opacity-40 hover:bg-stone-50"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
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
                <p className="text-xs text-stone-500">{shopProfile.address}</p>
              )}
              {shopProfile.phone && (
                <p className="text-xs text-stone-500">
                  {t('common.phone')}: {shopProfile.phone}
                </p>
              )}
              <div className="mt-2 inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                {t('dashboard.paidVia', { method: getPaymentLabel(selectedTxn.paymentMethod) })}
              </div>
            </div>

            <div className="flex justify-between text-xs text-stone-600">
              <div>
                <span className="block text-stone-400">{t('common.customer')}</span>
                <span className="font-semibold text-stone-900">
                  {selectedTxn.customer?.name ||
                    selectedTxn.customerName ||
                    t('common.walkInCustomer')}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-stone-400">{t('common.date')}</span>
                <span className="font-semibold text-stone-900">
                  {formatDate(selectedTxn.createdAt)} {formatTime(selectedTxn.createdAt)}
                </span>
              </div>
            </div>

            <div className="border border-stone-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="p-2.5 font-semibold">{t('dashboard.itemCol')}</th>
                    <th className="p-2.5 font-semibold text-center">{t('common.quantity')}</th>
                    <th className="p-2.5 font-semibold text-right">{t('common.rate')}</th>
                    <th className="p-2.5 font-semibold text-right">{t('common.amount')}</th>
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
              <button
                onClick={() => {
                  const text = `${shopProfile.shopName || shopProfile.name}: ${t('dashboard.receiptTitle', { invoice: selectedTxn.invoiceNumber })} — ${formatCurrency(selectedTxn.total)}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
                className="flex-1 btn-secondary text-xs py-2.5 flex items-center justify-center gap-1.5"
              >
                <Share2 size={14} className="text-emerald-700" />
                <span>WhatsApp</span>
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 btn-primary text-xs py-2.5 flex items-center justify-center gap-1.5"
              >
                <Printer size={14} />
                <span>{t('common.print')}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
