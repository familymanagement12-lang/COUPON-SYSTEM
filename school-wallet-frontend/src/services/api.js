import axios from 'axios'

const configuredApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const SLOW_REQUEST_THRESHOLD_MS = 1000

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
  config.metadata = { startedAt: performance.now() }
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function logRequestPerformance(config, response, error) {
  const durationMs = Math.round(performance.now() - (config?.metadata?.startedAt ?? performance.now()))
  if (!error && durationMs < SLOW_REQUEST_THRESHOLD_MS) return

  console.warn('[api] request performance', {
    method: config?.method?.toUpperCase(),
    url: config?.url?.split('?')[0],
    durationMs,
    timeoutMs: config?.timeout,
    status: response?.status || error?.response?.status,
    code: error?.code,
    requestId: response?.headers?.['x-request-id'] || error?.response?.headers?.['x-request-id']
  })
}

api.interceptors.response.use(
  res => {
    logRequestPerformance(res.config, res)
    return res
  },
  async err => {
    logRequestPerformance(err.config, err.response, err)
    const originalRequest = err.config
    if (err.response && err.response.status === 401 && originalRequest && !originalRequest._retry) {
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
