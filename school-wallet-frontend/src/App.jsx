import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Header from './components/Header'
import Transactions from './pages/Transactions'
import Purchase from './pages/Purchase'
import Wallet from './pages/Wallet'
import TopUp from './pages/TopUp'
import VendorDashboard from './pages/VendorDashboard'
import SuperAdmin from './pages/SuperAdmin'
import StudentDirectory from './pages/StudentDirectory'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import SuperAdminRoute from './components/SuperAdminRoute'
import AdminRoute from './components/AdminRoute'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute><Wallet/></ProtectedRoute>} />
          <Route path="/topup" element={<ProtectedRoute><TopUp/></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><Transactions/></ProtectedRoute>} />
          <Route path="/purchase" element={<ProtectedRoute><Purchase/></ProtectedRoute>} />
          <Route path="/vendor" element={<ProtectedRoute><VendorDashboard/></ProtectedRoute>} />
          <Route path="/admin" element={<SuperAdminRoute><SuperAdmin/></SuperAdminRoute>} />
          <Route path="/student-directory" element={<AdminRoute><StudentDirectory/></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
