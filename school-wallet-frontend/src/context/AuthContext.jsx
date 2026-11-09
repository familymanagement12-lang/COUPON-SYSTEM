import React, { createContext, useCallback, useEffect, useState } from 'react'
import api from '../services/api'

export const AuthContext = createContext(null)

const LOGOUT_TIMEOUT_MINUTES = Number(import.meta.env.VITE_LOGOUT_TIMEOUT_MINUTES || 30)
const LOGOUT_TIMEOUT_MS = Math.max(LOGOUT_TIMEOUT_MINUTES, 1) * 60 * 1000
const AUTH_ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll']

function clearAuthStorage() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}

export function AuthProvider({ children }){
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const logout = useCallback((message = null) => {
    if (message) sessionStorage.setItem('authMessage', message)
    clearAuthStorage()
    setUser(null)
    delete api.defaults.headers.common.Authorization
    window.location.href = '/'
  }, [])

  useEffect(()=>{
    const token = localStorage.getItem('accessToken')
    const storedUser = localStorage.getItem('user')
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser))
        } catch {
          localStorage.removeItem('user')
        }
      } else {
        setUser({ token })
      }
    }
    setAuthLoading(false)
  },[])

  useEffect(() => {
    if (!user && !localStorage.getItem('accessToken')) return undefined

    let timeoutId
    const resetLogoutTimer = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        logout('You were logged out after being inactive.')
      }, LOGOUT_TIMEOUT_MS)
    }

    resetLogoutTimer()
    AUTH_ACTIVITY_EVENTS.forEach(eventName => {
      window.addEventListener(eventName, resetLogoutTimer, { passive: true })
    })

    return () => {
      window.clearTimeout(timeoutId)
      AUTH_ACTIVITY_EVENTS.forEach(eventName => {
        window.removeEventListener(eventName, resetLogoutTimer)
      })
    }
  }, [logout, user])

  async function login({ identifier, password }){
    const res = await api.post('/auth/login', { identifier, password })
    const tokens = res.data?.data?.tokens
    const userData = res.data?.data?.user
    const access = tokens?.accessToken
    const refresh = tokens?.refreshToken
    if (access) {
      sessionStorage.removeItem('authMessage')
      localStorage.setItem('accessToken', access)
      if (refresh) localStorage.setItem('refreshToken', refresh)
      api.defaults.headers.common.Authorization = `Bearer ${access}`
      if (userData) {
        localStorage.setItem('user', JSON.stringify(userData))
        setUser(userData)
      } else {
        setUser({ token: access })
      }
    }
    return res
  }

  async function register(payload){
    const res = await api.post('/auth/register', payload)
    const tokens = res.data?.data?.tokens
    const userData = res.data?.data?.user
    const access = tokens?.accessToken
    const refresh = tokens?.refreshToken
    if (access) {
      sessionStorage.removeItem('authMessage')
      localStorage.setItem('accessToken', access)
      if (refresh) localStorage.setItem('refreshToken', refresh)
      api.defaults.headers.common.Authorization = `Bearer ${access}`
      if (userData) {
        localStorage.setItem('user', JSON.stringify(userData))
        setUser(userData)
      } else {
        setUser({ token: access })
      }
    }
    return res
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  )
}
