# School Wallet Frontend

React + Vite frontend for School Digital Coupon Wallet System.

Setup:

```bash
cd school-wallet-frontend
npm install
npm run dev
```

Environment:
- `VITE_API_URL` - backend API base URL, including `/api` (defaults to `http://localhost:3000/api`)
- `VITE_SUPER_ADMIN_EMAIL` - email address allowed to see the super-admin UI; set this in the static site's build environment

For a Render deployment, create a Static Site with this directory as its root, run
`npm install && npm run build`, and publish `dist`. Set `VITE_API_URL` to the
backend URL ending in `/api`. Configure the static site's rewrite rule to send
all paths to `/index.html` so client-side routes work on refresh. Set
`VITE_SUPER_ADMIN_EMAIL` to the same email as the backend's `SUPER_ADMIN_EMAIL`.
