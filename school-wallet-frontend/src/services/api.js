import axios from 'axios'

const configuredApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const api = axios.create({
  baseURL: configuredApiUrl.replace(/\/+$/, ''),
  timeout: 15000
})

let isRefreshing = false
let refreshSubscribers = []

function onRefreshed(token) {
  refreshSubscribers.forEach(cb => cb(token))
  refreshSubscribers = []
}

function addRefreshSubscriber(cb) {
  refreshSubscribers.push(cb)
}

api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  async err => {
    const originalRequest = err.config
    if (err.response && err.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) return Promise.reject(err)

      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(api(originalRequest))
          })
        })
      }

      isRefreshing = true
      try {
        const r = await axios.post(`${api.defaults.baseURL}/auth/refresh-token`, { refreshToken })
        const newAccess = r.data?.data?.accessToken
        const newRefresh = r.data?.data?.refreshToken
        if (newAccess) {
          localStorage.setItem('accessToken', newAccess)
          if (newRefresh) localStorage.setItem('refreshToken', newRefresh)
          api.defaults.headers.common.Authorization = `Bearer ${newAccess}`
          onRefreshed(newAccess)
        }
        isRefreshing = false
        originalRequest.headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`
        return api(originalRequest)
      } catch (refreshErr) {
        isRefreshing = false
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        return Promise.reject(refreshErr)
      }
    }
    return Promise.reject(err)
  }
)

export default api
