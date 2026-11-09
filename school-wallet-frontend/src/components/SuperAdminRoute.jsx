import React, { useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'

const SUPER_ADMIN_EMAIL = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || '').trim().toLowerCase()

export default function SuperAdminRoute({ children }) {
  const { user, authLoading } = useContext(AuthContext)

  if (authLoading) return null
  if (user?.role !== 'admin' || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}