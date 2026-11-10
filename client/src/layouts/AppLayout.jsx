import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import Toast from '../components/common/Toast.jsx';
import { useShop } from '../context/ShopContext.jsx';

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { toast, setToast } = useShop();

  return (
    <div className="min-h-screen bg-warm-50 text-warm-charcoal flex">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setIsSidebarOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Global Notification Toast */}
      {toast && <Toast notification={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
