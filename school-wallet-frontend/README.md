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
- `VITE_SUPER_ADMIN_EMAIL` - bootstrap super-admin email allowed to see the super-admin UI; additional super-admins use the `super_admin` database role

For a Render deployment, create a Static Site with this directory as its root, run
`npm install && npm run build`, and publish `dist`. Set `VITE_API_URL` to the
backend URL ending in `/api`. Configure the static site's rewrite rule to send
all paths to `/index.html` so client-side routes work on refresh. Set
`VITE_SUPER_ADMIN_EMAIL` to the same email as the backend's `SUPER_ADMIN_EMAIL`.
Run the backend migrations before deploying the frontend changes. The bootstrap
super admin can create up to four additional super admins from the admin portal;
their accounts do not require per-user Render environment variables. Existing
active admin accounts can also be promoted without changing their credentials.
