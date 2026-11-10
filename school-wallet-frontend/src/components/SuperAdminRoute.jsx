import React, { useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import isSuperAdmin from '../utils/isSuperAdmin'

export default function SuperAdminRoute({ children }) {
  const { user, authLoading } = useContext(AuthContext)

  if (authLoading) return null
  if (!isSuperAdmin(user)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}