# DomainPortal

Minimal domain submission portal and password-protected admin dashboard with mandatory sign in.

## Features

- **Mandatory Minimal Sign In (Shown FIRST on launch)**:
  - When opening the web app, the clean, minimal sign-in card appears first.
  - No access to the portal or admin console is allowed until signed in.
  - Choose between **Sign In** and **Create ID** tabs.
  - Convenient 1-click test buttons:
    - 👑 **Admin**: `admin7@gmail.com` / `admin123`
    - 👤 **Client**: `alex@vancemedia.com` / `user123`
- **Zero Email Exposure & Privacy Protection**:
  - Personal emails are **never** displayed to other users or in table listings.
  - Domain records show fixed anonymized references like `Client #104`, `Client #208`, or `Admin`.
  - Clients can **only** see their own submissions under "My Submissions". One client can never see another client's data.
- **Protected Admin Dashboard**:
  - Features **Price: Low to High** filter/sorting, keyword search, status filtering, and CSV export.
  - Only accessible to verified administrator (`admin7@gmail.com`).
- **Submission Portal**:
  - Insert Domain Name, Category (freeform text area), and Asking Price ($ USD).
  - **Note is completely OPTIONAL** (leave empty without any validation issues).

## How to Run

```bash
cd domain-manager-app
npm install
npm run dev
```

Open `http://localhost:5173/` in your browser.
