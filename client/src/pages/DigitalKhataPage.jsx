import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Search,
  IndianRupee,
  CheckCircle2,
  Phone,
  Share2,
  ArrowDownLeft,
  ArrowUpRight,
  UserPlus,
  Edit2,
  Printer,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useShop } from '../context/ShopContext.jsx';
import { customerService } from '../services/customerService.js';
import { khataService } from '../services/khataService.js';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import StatCard from '../components/common/StatCard.jsx';

export default function DigitalKhataPage() {
  const {
    shopProfile,
    showToast,
    refreshDashboardStats,
    t,
    formatCurrency,
    formatDate,
    formatTime,
  } = useShop();

  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({
    totalOutstanding: 0,
    customersWithCredit: 0,
    settledCustomers: 0,
    totalCustomers: 0,
  });
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [creditConfirmation, setCreditConfirmation] = useState(null);
  const [paymentConfirmation, setPaymentConfirmation] = useState(null);

  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    creditLimit: 5000,
    address: '',
    notes: '',
  });
  const [creditForm, setCreditForm] = useState({ amount: '', description: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCustomersAndSummary = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const [custRes, summaryRes] = await Promise.all([
        customerService.getCustomers({ limit: 100 }),
        khataService.getSummary(),
      ]);

      if (custRes.data?.success) {
        const custList = custRes.data.data || [];
        setCustomers(custList);
        if (!selectedCustomerId && custList.length > 0) {
          setSelectedCustomerId(custList[0]._id);
        }
      }

      if (summaryRes.data?.success) {
        setSummary(summaryRes.data.summary);
      }
    } catch (_err) {
      showToast(t('common.errorGeneric'), 'error');
    } finally {
      setLoadingCustomers(false);
    }
  }, [selectedCustomerId, showToast, t]);

  useEffect(() => {
    loadCustomersAndSummary();
  }, [loadCustomersAndSummary]);

  const activeCustomer = useMemo(() => {
    return customers.find((c) => c._id === selectedCustomerId) || customers[0] || null;
  }, [customers, selectedCustomerId]);

  const loadActiveLedger = useCallback(async (customerId) => {
    if (!customerId) return;
    setLoadingLedger(true);
    try {
      const res = await khataService.getCustomerLedger(customerId, { limit: 50 });
      if (res.data?.success) {
        setLedgerTransactions(res.data.data || []);
      }
    } catch (_err) {
      // Non-blocking
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  useEffect(() => {
    if (activeCustomer?._id) {
      loadActiveLedger(activeCustomer._id);
    } else {
      setLedgerTransactions([]);
    }
  }, [activeCustomer?._id, loadActiveLedger]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));

      const balance = c.totalCredit || 0;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'overdue' && balance > 0) ||
        (statusFilter === 'settled' && balance <= 0);

      return matchesSearch && matchesStatus;
    });
  }, [customers, searchQuery, statusFilter]);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.name.trim() || !customerForm.phone.trim()) {
      showToast(t('khata.requiredFieldsError'), 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await customerService.createCustomer({
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        creditLimit: Number(customerForm.creditLimit) || 5000,
        address: customerForm.address.trim(),
        notes: customerForm.notes.trim(),
      });

      if (res.data?.success) {
        showToast(t('khata.customerCreatedMsg'), 'success');
        setIsAddCustomerOpen(false);
        setCustomerForm({ name: '', phone: '', creditLimit: 5000, address: '', notes: '' });
        await loadCustomersAndSummary();
        setSelectedCustomerId(res.data.customer._id);
      }
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (cust) => {
    setCustomerForm({
      name: cust.name,
      phone: cust.phone,
      creditLimit: cust.creditLimit || 5000,
      address: cust.address || '',
      notes: cust.notes || '',
    });
    setIsEditCustomerOpen(true);
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    if (!activeCustomer?._id) return;

    setIsSubmitting(true);
    try {
      const res = await customerService.updateCustomer(activeCustomer._id, {
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        creditLimit: Number(customerForm.creditLimit),
        address: customerForm.address.trim(),
        notes: customerForm.notes.trim(),
      });

      if (res.data?.success) {
        showToast(t('khata.customerUpdatedMsg'), 'success');
        setIsEditCustomerOpen(false);
        await loadCustomersAndSummary();
      }
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInitiateCredit = (e) => {
    e.preventDefault();
    const amount = Number(creditForm.amount);
    if (!amount || amount <= 0 || !activeCustomer) {
      showToast(t('khata.validAmountError'), 'warning');
      return;
    }

    setCreditConfirmation({
      customer: activeCustomer,
      amount,
      description: creditForm.description || t('khata.typeCredit'),
    });
    setIsCreditModalOpen(false);
  };

  const handleConfirmCredit = async () => {
    if (!creditConfirmation) return;
    setIsSubmitting(true);

    try {
      const idempotencyKey = `khata_credit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await khataService.recordCredit({
        customer: creditConfirmation.customer._id,
        amount: creditConfirmation.amount,
        description: creditConfirmation.description,
        idempotencyKey,
      });

      if (res.data?.success) {
        showToast(
          t('khata.creditRecordedMsg', {
            amount: creditConfirmation.amount,
            name: creditConfirmation.customer.name,
          }),
          'success'
        );
        setCreditConfirmation(null);
        setCreditForm({ amount: '', description: '' });
        await loadCustomersAndSummary();
        await loadActiveLedger(creditConfirmation.customer._id);
        refreshDashboardStats();
      }
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInitiatePayment = (e) => {
    e.preventDefault();
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0 || !activeCustomer) {
      showToast(t('khata.validAmountError'), 'warning');
      return;
    }

    setPaymentConfirmation({
      customer: activeCustomer,
      amount,
      description: paymentForm.description || t('khata.typePayment'),
    });
    setIsPaymentModalOpen(false);
  };

  const handleConfirmPayment = async () => {
    if (!paymentConfirmation) return;
    setIsSubmitting(true);

    try {
      const idempotencyKey = `khata_pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await khataService.recordPayment({
        customer: paymentConfirmation.customer._id,
        amount: paymentConfirmation.amount,
        description: paymentConfirmation.description,
        idempotencyKey,
      });

      if (res.data?.success) {
        showToast(
          t('khata.paymentRecordedMsg', {
            amount: paymentConfirmation.amount,
            name: paymentConfirmation.customer.name,
          }),
          'success'
        );
        setPaymentConfirmation(null);
        setPaymentForm({ amount: '', description: '' });
        await loadCustomersAndSummary();
        await loadActiveLedger(paymentConfirmation.customer._id);
        refreshDashboardStats();
      }
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendWhatsAppReminder = (cust) => {
    if (!cust) return;
    const text = t('khata.whatsappMessage', {
      customer: cust.name,
      shop: shopProfile.shopName || shopProfile.name || t('common.brandName'),
      amount: cust.totalCredit || 0,
    });
    window.open(`https://wa.me/91${cust.phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            {t('khata.title')}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">{t('khata.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={loadCustomersAndSummary}
            disabled={loadingCustomers}
            className="btn-secondary text-xs py-2 px-3"
            title={t('common.refresh')}
          >
            <RefreshCw size={14} className={loadingCustomers ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </button>
          <button
            onClick={() => {
              setCustomerForm({ name: '', phone: '', creditLimit: 5000, address: '', notes: '' });
              setIsAddCustomerOpen(true);
            }}
            className="btn-primary text-xs py-2 px-3.5"
          >
            <UserPlus size={15} />
            <span>{t('khata.addCustomerBtn')}</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('khata.totalOutstanding')}
          value={loadingCustomers ? '...' : formatCurrency(summary.totalOutstanding)}
          icon={IndianRupee}
          iconColor="text-amber-700"
          iconBg="bg-amber-50 border-amber-200/80"
        />
        <StatCard
          label={t('khata.customersWithCredit')}
          value={loadingCustomers ? '...' : summary.customersWithCredit}
          icon={BookOpen}
        />
        <StatCard
          label={t('khata.settledAccounts')}
          value={loadingCustomers ? '...' : summary.settledCustomers}
          icon={CheckCircle2}
          iconColor="text-emerald-700"
          iconBg="bg-emerald-50 border-emerald-200/80"
        />
        <StatCard
          label={t('khata.totalCustomers')}
          value={loadingCustomers ? '...' : summary.totalCustomers}
          icon={UserPlus}
        />
      </div>

      {/* Two Column Khata Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Customer Directory (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-stone-100 space-y-3">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                placeholder={t('khata.searchCustomerPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-warm-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { id: 'all', label: t('khata.filterAll') },
                { id: 'overdue', label: t('khata.filterOverdue') },
                { id: 'settled', label: t('khata.filterSettled') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-emerald-700 text-white'
                      : 'bg-stone-100 text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-stone-100 max-h-[540px] overflow-y-auto">
            {filteredCustomers.map((cust) => {
              const isSelected = activeCustomer?._id === cust._id;
              const balance = cust.totalCredit || 0;

              return (
                <button
                  key={cust._id}
                  onClick={() => setSelectedCustomerId(cust._id)}
                  className={`w-full text-left p-4 transition-colors flex items-center justify-between gap-2 ${
                    isSelected ? 'bg-emerald-50/70' : 'hover:bg-stone-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-xs sm:text-sm text-stone-900 truncate">
                      {cust.name}
                    </p>
                    <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                      <Phone size={11} />
                      <span>{cust.phone}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-bold text-xs sm:text-sm tabular-nums ${
                        balance > 0 ? 'text-amber-800' : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(balance)}
                    </p>
                    <span className="text-[10px] text-stone-400">
                      {balance > 0 ? t('khata.dueLabel') : t('khata.settledLabel')}
                    </span>
                  </div>
                </button>
              );
            })}

            {filteredCustomers.length === 0 && !loadingCustomers && (
              <div className="py-12 px-4 text-center text-xs text-stone-500">
                {t('khata.noCustomersFound')}
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Customer Ledger (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
          {activeCustomer ? (
            <>
              {/* Customer Header Card */}
              <div className="p-5 sm:p-6 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-stone-900">{activeCustomer.name}</h2>
                    <button
                      onClick={() => openEditModal(activeCustomer)}
                      className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100"
                      title={t('common.edit')}
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-stone-500">
                    {t('common.phone')}: {activeCustomer.phone} • {t('khata.creditLimitLabel')}:{' '}
                    {formatCurrency(activeCustomer.creditLimit || 5000)}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xs text-stone-500">{t('khata.currentBalanceLabel')}</p>
                  <p
                    className={`text-2xl font-bold tabular-nums ${
                      (activeCustomer.totalCredit || 0) > 0
                        ? 'text-amber-800'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatCurrency(activeCustomer.totalCredit || 0)}
                  </p>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="p-4 bg-warm-50/70 border-b border-stone-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setCreditForm({ amount: '', description: '' });
                      setIsCreditModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <ArrowUpRight size={15} />
                    <span>{t('khata.giveCreditBtn')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setPaymentForm({ amount: '', description: '' });
                      setIsPaymentModalOpen(true);
                    }}
                    className="btn-primary text-xs py-2 px-3.5"
                  >
                    <ArrowDownLeft size={15} />
                    <span>{t('khata.recordPaymentBtn')}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {(activeCustomer.totalCredit || 0) > 0 && (
                    <button
                      onClick={() => sendWhatsAppReminder(activeCustomer)}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      <Share2 size={14} className="text-emerald-700" />
                      <span>{t('khata.whatsappReminder')}</span>
                    </button>
                  )}
                  <button
                    onClick={() => window.print()}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    <Printer size={14} />
                    <span>{t('khata.printStatement')}</span>
                  </button>
                </div>
              </div>

              {/* Ledger History */}
              <div className="p-5 sm:p-6">
                <h3 className="text-xs font-semibold text-stone-500 mb-3">
                  {t('khata.ledgerHistoryTitle')}
                </h3>

                <div className="divide-y divide-stone-100">
                  {ledgerTransactions.map((txn) => {
                    const isCredit = txn.type === 'credit';
                    return (
                      <div
                        key={txn._id}
                        className="py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isCredit
                                ? 'bg-amber-50 text-amber-700 border border-amber-200/70'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                            }`}
                          >
                            {isCredit ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-900 truncate">
                              {txn.description ||
                                (isCredit ? t('khata.typeCredit') : t('khata.typePayment'))}
                            </p>
                            <p className="text-[11px] text-stone-500">
                              {formatDate(txn.createdAt)} • {formatTime(txn.createdAt)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p
                            className={`font-bold text-sm tabular-nums ${
                              isCredit ? 'text-amber-800' : 'text-emerald-700'
                            }`}
                          >
                            {isCredit ? '+' : '-'} {formatCurrency(txn.amount)}
                          </p>
                          {txn.balanceAfter !== undefined && (
                            <p className="text-[10px] text-stone-400 tabular-nums">
                              {t('khata.balanceAfter', { amount: txn.balanceAfter })}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {ledgerTransactions.length === 0 && !loadingLedger && (
                    <div className="py-12 text-center text-xs text-stone-500">
                      {t('khata.noTransactionsFound')}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-xs sm:text-sm text-stone-500">
              {t('khata.selectCustomerPrompt')}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {(isAddCustomerOpen || isEditCustomerOpen) && (
        <Modal
          isOpen={isAddCustomerOpen || isEditCustomerOpen}
          onClose={() => {
            setIsAddCustomerOpen(false);
            setIsEditCustomerOpen(false);
          }}
          title={
            isEditCustomerOpen
              ? t('khata.editCustomerModalTitle')
              : t('khata.addCustomerModalTitle')
          }
          maxWidth="max-w-md"
        >
          <form
            onSubmit={isEditCustomerOpen ? handleUpdateCustomer : handleCreateCustomer}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('khata.customerNameLabel')}
              </label>
              <input
                type="text"
                required
                placeholder={t('khata.customerNamePlaceholder')}
                value={customerForm.name}
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('khata.phoneLabel')}
              </label>
              <input
                type="tel"
                required
                maxLength="10"
                placeholder={t('khata.phonePlaceholder')}
                value={customerForm.phone}
                onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('khata.creditLimitInputLabel')}
              </label>
              <input
                type="number"
                min="0"
                value={customerForm.creditLimit}
                onChange={(e) => setCustomerForm({ ...customerForm, creditLimit: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('khata.addressLabel')}
              </label>
              <input
                type="text"
                value={customerForm.address}
                onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                className="input-field"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddCustomerOpen(false);
                  setIsEditCustomerOpen(false);
                }}
                className="flex-1 btn-secondary text-xs py-2.5"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 btn-primary text-xs py-2.5"
              >
                {isSubmitting ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Give Credit Modal */}
      {isCreditModalOpen && (
        <Modal
          isOpen={isCreditModalOpen}
          onClose={() => setIsCreditModalOpen(false)}
          title={t('khata.giveCreditModalTitle')}
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleInitiateCredit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('khata.amountLabel')}
              </label>
              <input
                type="number"
                min="1"
                required
                value={creditForm.amount}
                onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('khata.descriptionLabel')}
              </label>
              <input
                type="text"
                placeholder={t('khata.descriptionPlaceholder')}
                value={creditForm.description}
                onChange={(e) => setCreditForm({ ...creditForm, description: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCreditModalOpen(false)}
                className="flex-1 btn-secondary text-xs py-2.5"
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="flex-1 btn-primary text-xs py-2.5">
                {t('common.next')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Receive Payment Modal */}
      {isPaymentModalOpen && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          title={t('khata.recordPaymentModalTitle')}
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleInitiatePayment} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('khata.amountLabel')}
              </label>
              <input
                type="number"
                min="1"
                required
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t('khata.descriptionLabel')}
              </label>
              <input
                type="text"
                placeholder={t('khata.descriptionPlaceholder')}
                value={paymentForm.description}
                onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="flex-1 btn-secondary text-xs py-2.5"
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="flex-1 btn-primary text-xs py-2.5">
                {t('common.next')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Credit Confirmation Modal */}
      {creditConfirmation && (
        <Modal
          isOpen={!!creditConfirmation}
          onClose={() => setCreditConfirmation(null)}
          title={t('khata.confirmCreditTitle')}
          maxWidth="max-w-sm"
        >
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
              <ShieldAlert size={22} />
            </div>
            <p className="text-xs sm:text-sm text-stone-800 font-medium">
              {t('khata.confirmCreditMsg', {
                amount: creditConfirmation.amount,
                name: creditConfirmation.customer.name,
              })}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCreditConfirmation(null)}
                className="flex-1 btn-secondary text-xs py-2.5"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmCredit}
                disabled={isSubmitting}
                className="flex-1 btn-primary text-xs py-2.5"
              >
                {isSubmitting ? t('common.loading') : t('common.confirm')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Payment Confirmation Modal */}
      {paymentConfirmation && (
        <Modal
          isOpen={!!paymentConfirmation}
          onClose={() => setPaymentConfirmation(null)}
          title={t('khata.confirmPaymentTitle')}
          maxWidth="max-w-sm"
        >
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 size={22} />
            </div>
            <p className="text-xs sm:text-sm text-stone-800 font-medium">
              {t('khata.confirmPaymentMsg', {
                amount: paymentConfirmation.amount,
                name: paymentConfirmation.customer.name,
              })}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPaymentConfirmation(null)}
                className="flex-1 btn-secondary text-xs py-2.5"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={isSubmitting}
                className="flex-1 btn-primary text-xs py-2.5"
              >
                {isSubmitting ? t('common.loading') : t('common.confirm')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
