import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  XCircle,
  IndianRupee,
  Minus,
  Edit2,
  Trash2,
  Eye,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useShop } from '../context/ShopContext.jsx';
import { productService } from '../services/productService.js';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import StatCard from '../components/common/StatCard.jsx';

const CATEGORY_IDS = ['all', 'grains', 'oils', 'spices', 'packaged', 'dairy', 'personal'];

export default function InventoryPage() {
  const { showToast, refreshDashboardStats, t, formatCurrency } = useShop();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalDocs: 0, totalPages: 1 });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals & Forms
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialForm = {
    name: '',
    hindiName: '',
    category: 'grains',
    unit: '1 kg',
    purchasePrice: '',
    sellingPrice: '',
    quantity: '0',
    lowStockThreshold: '5',
    barcode: '',
    SKU: '',
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (statusFilter !== 'all') params.status = statusFilter;

      const res = await productService.getProducts(params);
      if (res.data?.success) {
        setProducts(res.data.data || []);
        if (res.data.pagination) {
          setPagination(res.data.pagination);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, selectedCategory, statusFilter, t]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const totalSKUs = pagination.totalDocs || products.length;
  const lowStockCount = products.filter(
    (p) => p.quantity <= (p.lowStockThreshold || 5) && p.quantity > 0
  ).length;
  const outOfStockCount = products.filter((p) => p.quantity <= 0).length;
  const totalValuation = products.reduce(
    (acc, p) => acc + (p.purchasePrice || 0) * (p.quantity || 0),
    0
  );

  const handleOpenEdit = (prod) => {
    setEditingProduct(prod);
    setFormData({
      name: prod.name,
      hindiName: prod.hindiName || '',
      category: prod.category || 'grains',
      unit: prod.unit || 'pcs',
      purchasePrice: String(prod.purchasePrice ?? ''),
      sellingPrice: String(prod.sellingPrice ?? ''),
      quantity: String(prod.quantity ?? '0'),
      lowStockThreshold: String(prod.lowStockThreshold ?? '5'),
      barcode: prod.barcode || '',
      SKU: prod.SKU || '',
    });
    setIsAddModalOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormData(initialForm);
    setIsAddModalOpen(true);
  };

  const handleSubmitProduct = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.name.trim()) {
      showToast(t('inventory.nameRequiredError'), 'error');
      return;
    }
    if (Number(formData.sellingPrice) < 0 || Number(formData.purchasePrice) < 0) {
      showToast(t('inventory.negativePriceError'), 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        hindiName: formData.hindiName.trim(),
        category: formData.category,
        unit: formData.unit.trim(),
        purchasePrice: Number(formData.purchasePrice) || 0,
        sellingPrice: Number(formData.sellingPrice) || 0,
        quantity: Number(formData.quantity) || 0,
        lowStockThreshold: Number(formData.lowStockThreshold) || 5,
        barcode: formData.barcode.trim(),
        SKU: formData.SKU.trim(),
      };

      if (editingProduct) {
        await productService.updateProduct(editingProduct._id, payload);
        showToast(t('inventory.productUpdatedMsg', { name: payload.name }), 'success');
      } else {
        await productService.createProduct(payload);
        showToast(t('inventory.productAddedMsg', { name: payload.name }), 'success');
      }

      setIsAddModalOpen(false);
      setEditingProduct(null);
      setFormData(initialForm);
      fetchProducts();
      refreshDashboardStats();
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustStock = async (prod, delta) => {
    try {
      const res = await productService.adjustStock(prod._id, { delta });
      if (res.data?.success) {
        setProducts((prev) => prev.map((p) => (p._id === prod._id ? res.data.product : p)));
        refreshDashboardStats();
        showToast(t('inventory.stockUpdatedMsg'), 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setIsSubmitting(true);
    try {
      await productService.deleteProduct(deletingProduct._id);
      showToast(t('inventory.productDeletedMsg', { name: deletingProduct.name }), 'success');
      setDeletingProduct(null);
      fetchProducts();
      refreshDashboardStats();
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            {t('inventory.title')}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchProducts}
            disabled={loading}
            className="btn-secondary text-xs py-2 px-3"
            title={t('common.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </button>
          <button onClick={handleOpenCreate} className="btn-primary text-xs py-2 px-3.5">
            <Plus size={16} />
            <span>{t('inventory.addProductBtn')}</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('inventory.totalSkus')}
          value={loading ? '...' : totalSKUs}
          icon={Package}
        />
        <StatCard
          label={t('inventory.lowStockAlerts')}
          value={loading ? '...' : lowStockCount}
          icon={AlertTriangle}
          iconColor="text-amber-700"
          iconBg="bg-amber-50 border-amber-200/80"
        />
        <StatCard
          label={t('inventory.outOfStock')}
          value={loading ? '...' : outOfStockCount}
          icon={XCircle}
          iconColor="text-rose-700"
          iconBg="bg-rose-50 border-rose-200/80"
        />
        <StatCard
          label={t('inventory.inventoryValue')}
          value={loading ? '...' : formatCurrency(totalValuation)}
          icon={IndianRupee}
          iconColor="text-emerald-700"
          iconBg="bg-emerald-50 border-emerald-200/80"
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchProducts} className="font-semibold underline text-rose-900">
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Filters & Search Bar */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="text"
              placeholder={t('inventory.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-warm-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:border-emerald-700"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: t('inventory.statusAll') },
              { id: 'in_stock', label: t('inventory.statusInStock') },
              { id: 'low_stock', label: t('inventory.statusLowStock') },
              { id: 'out_of_stock', label: t('inventory.statusOutOfStock') },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === st.id
                    ? 'bg-emerald-700 text-white'
                    : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200/80'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2.5 border-t border-stone-100 pb-1 text-xs">
          {CATEGORY_IDS.map((catId) => (
            <button
              key={catId}
              onClick={() => setSelectedCategory(catId)}
              className={`px-3 py-1 rounded-lg whitespace-nowrap transition-colors font-medium ${
                selectedCategory === catId
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                  : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200/60'
              }`}
            >
              {t(`inventory.categories.${catId}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200/80 text-stone-500">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('inventory.colProduct')}</th>
                <th className="py-3 px-4 font-semibold">{t('inventory.colCategory')}</th>
                <th className="py-3 px-4 font-semibold text-right">
                  {t('inventory.colBuyPrice')}
                </th>
                <th className="py-3 px-4 font-semibold text-right">
                  {t('inventory.colSellPrice')}
                </th>
                <th className="py-3 px-4 font-semibold text-center">{t('inventory.colStock')}</th>
                <th className="py-3 px-4 font-semibold text-center">{t('inventory.colStatus')}</th>
                <th className="py-3 px-4 font-semibold text-center">
                  {t('inventory.adjustStock')}
                </th>
                <th className="py-3 px-4 font-semibold text-right">{t('inventory.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {products.map((p) => {
                const isLow = p.quantity <= (p.lowStockThreshold || 5);
                const isOut = p.quantity <= 0;

                return (
                  <tr key={p._id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-stone-900 text-sm">
                        {p.name}
                        {p.variant ? (
                          <span className="ml-1.5 text-xs font-medium text-stone-500">
                            ({p.variant})
                          </span>
                        ) : null}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-500">
                        <span>{p.unit}</span>
                        {p.hindiName && <span>• {p.hindiName}</span>}
                        {(p.barcode || p.SKU) && (
                          <span className="font-mono text-stone-400">• {p.barcode || p.SKU}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-stone-600">
                      {t(`inventory.categories.${p.category}`).startsWith('inventory.categories.')
                        ? p.category
                        : t(`inventory.categories.${p.category}`)}
                    </td>
                    <td className="py-3.5 px-4 text-stone-500 text-right tabular-nums">
                      {formatCurrency(p.purchasePrice)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-stone-900 tabular-nums">
                      {formatCurrency(p.sellingPrice)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="font-semibold text-stone-900 text-sm tabular-nums">
                        {p.quantity}
                      </span>
                      <span className="text-[10px] text-stone-400 block">
                        {t('common.min')}: {p.lowStockThreshold || 5}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <Badge variant={isOut ? 'danger' : isLow ? 'warning' : 'success'} size="sm">
                        {isOut
                          ? t('inventory.outOfStockBadge')
                          : isLow
                          ? t('inventory.lowStockBadge')
                          : t('inventory.inStockBadge')}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
                        <button
                          onClick={() => handleAdjustStock(p, -1)}
                          disabled={p.quantity <= 0}
                          className="p-1 hover:bg-white rounded text-stone-600 hover:text-stone-900 disabled:opacity-40"
                          title="-1"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="px-1.5 font-semibold text-stone-900 text-[11px] tabular-nums">
                          {p.quantity}
                        </span>
                        <button
                          onClick={() => handleAdjustStock(p, 5)}
                          className="p-1 hover:bg-white rounded text-emerald-700 hover:text-emerald-900"
                          title="+5"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewingProduct(p)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg"
                          title={t('common.view')}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                          title={t('common.edit')}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setDeletingProduct(p)}
                          className="p-1.5 text-stone-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title={t('common.delete')}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {products.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center space-y-2">
                    <Package size={32} className="mx-auto text-stone-300" />
                    <p className="text-xs sm:text-sm text-stone-500 max-w-sm mx-auto">
                      {t('inventory.noProductsFound')}
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
              {t('common.showing', { count: products.length, total: pagination.totalDocs })} (
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

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={
          editingProduct ? t('inventory.editProductModalTitle') : t('inventory.addProductModalTitle')
        }
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmitProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.productNameLabel')}
              </label>
              <input
                type="text"
                required
                placeholder={t('inventory.productNamePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.hindiNameLabel')}
              </label>
              <input
                type="text"
                placeholder={t('inventory.hindiNamePlaceholder')}
                value={formData.hindiName}
                onChange={(e) => setFormData({ ...formData, hindiName: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.categoryLabel')}
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input-field"
              >
                {CATEGORY_IDS.filter((c) => c !== 'all').map((c) => (
                  <option key={c} value={c}>
                    {t(`inventory.categories.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.unitLabel')}
              </label>
              <input
                type="text"
                required
                placeholder={t('inventory.unitPlaceholder')}
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.barcodeLabel')}
              </label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.purchasePriceLabel')}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={formData.purchasePrice}
                onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.sellingPriceLabel')}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={formData.sellingPrice}
                onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.quantityLabel')}
              </label>
              <input
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('inventory.thresholdLabel')}
              </label>
              <input
                type="number"
                min="0"
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="flex-1 btn-secondary text-xs py-2.5"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 btn-primary text-xs py-2.5"
            >
              {isSubmitting ? t('common.loading') : t('inventory.saveProductBtn')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Product Detail View Modal */}
      {viewingProduct && (
        <Modal
          isOpen={!!viewingProduct}
          onClose={() => setViewingProduct(null)}
          title={`${t('inventory.viewProductModalTitle')} • ${viewingProduct.name}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-warm-50 rounded-xl border border-stone-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-stone-500">{t('inventory.colProduct')}</span>
                <span className="font-semibold text-stone-900">{viewingProduct.name}</span>
              </div>
              {viewingProduct.hindiName && (
                <div className="flex justify-between">
                  <span className="text-stone-500">{t('inventory.hindiNameLabel')}</span>
                  <span className="font-medium text-stone-800">{viewingProduct.hindiName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-stone-500">{t('inventory.colCategory')}</span>
                <span className="font-medium text-stone-700">
                  {t(`inventory.categories.${viewingProduct.category}`)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">{t('inventory.unitLabel')}</span>
                <span className="font-medium text-stone-700">{viewingProduct.unit}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-warm-50 rounded-xl border border-stone-200">
                <span className="text-stone-500 block">{t('inventory.colBuyPrice')}</span>
                <span className="text-base font-bold text-stone-900">
                  {formatCurrency(viewingProduct.purchasePrice)}
                </span>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-emerald-800 block font-medium">
                  {t('inventory.colSellPrice')}
                </span>
                <span className="text-base font-bold text-emerald-900">
                  {formatCurrency(viewingProduct.sellingPrice)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-warm-50 rounded-xl border border-stone-200 flex justify-between items-center">
              <div>
                <span className="text-stone-500 block">{t('inventory.colStock')}</span>
                <span className="text-sm font-bold text-stone-900">
                  {viewingProduct.quantity} {t('common.units')}
                </span>
              </div>
              <Badge
                variant={
                  viewingProduct.quantity <= 0
                    ? 'danger'
                    : viewingProduct.quantity <= (viewingProduct.lowStockThreshold || 5)
                    ? 'warning'
                    : 'success'
                }
              >
                {viewingProduct.quantity <= 0
                  ? t('inventory.outOfStockBadge')
                  : viewingProduct.quantity <= (viewingProduct.lowStockThreshold || 5)
                  ? t('inventory.lowStockBadge')
                  : t('inventory.inStockBadge')}
              </Badge>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setViewingProduct(null)}
                className="w-full btn-secondary text-xs py-2"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <Modal
          isOpen={!!deletingProduct}
          onClose={() => setDeletingProduct(null)}
          title={t('inventory.deleteConfirmTitle')}
          maxWidth="max-w-sm"
        >
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={22} />
            </div>
            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
              {t('inventory.deleteConfirmMsg', { name: deletingProduct.name })}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeletingProduct(null)}
                className="flex-1 btn-secondary text-xs py-2.5"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs py-2.5 rounded-xl transition-colors"
              >
                {isSubmitting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
