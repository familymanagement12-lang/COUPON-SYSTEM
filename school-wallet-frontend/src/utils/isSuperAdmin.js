const bootstrapEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || '').trim().toLowerCase()

export default function isSuperAdmin(user) {
  if (user?.role === 'super_admin') return true
  return user?.role === 'admin'
    && Boolean(bootstrapEmail)
    && user.email?.trim().toLowerCase() === bootstrapEmail
}
