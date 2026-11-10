import React, { useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'

export default function AdminRoute({ children }) {
  const { user, authLoading } = useContext(AuthContext)

  if (authLoading) return null
  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
