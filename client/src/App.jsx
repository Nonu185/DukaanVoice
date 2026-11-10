import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ShopProvider } from './context/ShopContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';

// Pages
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import VoiceAssistantPage from './pages/VoiceAssistantPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import SalesPage from './pages/SalesPage.jsx';
import DigitalKhataPage from './pages/DigitalKhataPage.jsx';
import AIInsightsPage from './pages/AIInsightsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ShopProvider>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected SaaS Application Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/voice" element={<VoiceAssistantPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/digital-khata" element={<DigitalKhataPage />} />
                <Route path="/khata" element={<Navigate to="/digital-khata" replace />} />
                <Route path="/ai-insights" element={<AIInsightsPage />} />
                <Route path="/insights" element={<Navigate to="/ai-insights" replace />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ShopProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
