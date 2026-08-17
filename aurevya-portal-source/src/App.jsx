import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'

// Pages
import Login from './pages/Login.jsx'
import LinkExpired from './pages/LinkExpired.jsx'
import ClientLayout from './components/ClientLayout.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import ClientDashboard from './pages/client/Dashboard.jsx'
import ClientEntities from './pages/client/Entities.jsx'
import ClientDocuments from './pages/client/Documents.jsx'
import ClientInvoices from './pages/client/Invoices.jsx'
import ClientMessages from './pages/client/Messages.jsx'
import ClientQuestionnaire from './pages/client/Questionnaire.jsx'
import StructureDeclaration from './pages/client/StructureDeclaration.jsx'
import JourneyTracker from './pages/client/JourneyTracker.jsx'
import AdminDashboard from './pages/admin/Dashboard.jsx'
import AdminClients from './pages/admin/AllClients.jsx'
import ClientOnboarding from './pages/admin/ClientOnboarding.jsx'
import AdminKYC from './pages/admin/KYC.jsx'
import AdminUsers from './pages/admin/UserManagement.jsx'
import AdminSecurity from './pages/admin/Security.jsx'
import AdminInvoices from './pages/admin/Invoices.jsx'
import AdminMessages from './pages/admin/Messages.jsx'
import AdminClientDetail from './pages/admin/ClientDetail.jsx'
import UBODeclarationForm from './pages/UBODeclarationForm.jsx'
import PreQualForm from './pages/PreQualForm.jsx'

function ProtectedRoute({ children, requireAdmin }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#0a0f1e' }}>
      <div className="spinner" style={{ width:40,height:40 }}></div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && profile?.role !== 'admin' && profile?.role !== 'staff') {
    return <Navigate to="/portal/dashboard" replace />
  }
  return children
}

function RootRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === 'admin' || profile?.role === 'staff') return <Navigate to="/admin/dashboard" replace />
  return <Navigate to="/portal/dashboard" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/link-expired" element={<LinkExpired />} />
          <Route path="/ubo-declaration/:token" element={<UBODeclarationForm />} />
          <Route path="/prequal/:token" element={<PreQualForm />} />

          {/* Client Portal */}
          <Route path="/portal" element={
            <ProtectedRoute><ClientLayout /></ProtectedRoute>
          }>
            <Route path="dashboard" element={<ClientDashboard />} />
            <Route path="entities" element={<ClientEntities />} />
            <Route path="documents" element={<ClientDocuments />} />
            <Route path="invoices" element={<ClientInvoices />} />
            <Route path="messages" element={<ClientMessages />} />
            <Route path="questionnaire" element={<ClientQuestionnaire />} />
            <Route path="structure" element={<StructureDeclaration />} />
            <Route path="journey" element={<JourneyTracker />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Staff Admin */}
          <Route path="/admin" element={
            <ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>
          }>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="clients/:id" element={<AdminClientDetail />} />
            <Route path="onboarding" element={<ClientOnboarding />} />
            <Route path="kyc" element={<AdminKYC />} />
            <Route path="invoices" element={<AdminInvoices />} />
            <Route path="messages" element={<AdminMessages />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
