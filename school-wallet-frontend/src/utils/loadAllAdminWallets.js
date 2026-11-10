import api from '../services/api'

const PAGE_SIZE = 100

export default async function loadAllAdminWallets() {
  const wallets = []
  let offset = 0

  while (true) {
    const response = await api.get('/wallets/me', {
      params: { limit: PAGE_SIZE, offset }
    })
    const data = response.data.data
    const page = data.wallets || []
    wallets.push(...page)

    if (page.length < PAGE_SIZE || wallets.length >= data.totalCount) {
      return {
        wallets,
        totalCount: data.totalCount ?? wallets.length
      }
    }

    offset += page.length
  }
}
