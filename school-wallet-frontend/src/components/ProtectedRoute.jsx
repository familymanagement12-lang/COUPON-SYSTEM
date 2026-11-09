import React, { useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'

export default function ProtectedRoute({ children }){
  const { user, authLoading } = useContext(AuthContext)
  if (authLoading) return null
  if (!user) return <Navigate to="/" replace />
  return children
}
