# DomainPortal

A secure, multi-tenant domain submission portal and password-protected administrator dashboard.

## Security Architecture

- **Zero Hardcoded Accounts**:
  - No credentials, user records, or passwords are stored in client source code.
  - Accounts and salted password hashes (`bcrypt`) are stored exclusively in the server-side SQLite database.
- **Server-Side Authentication & Session Security**:
  - Cryptographically signed JWT tokens stored in secure `HttpOnly`, `SameSite=Lax` cookies.
  - Browser developer tools or `localStorage` manipulation cannot elevate privileges or grant admin access.
- **Enforced Multi-Tenancy Data Isolation**:
  - Client data is partitioned on the server (`SELECT ... WHERE user_id = ?`).
  - Clients never receive another client's domain submissions over the network.
- **Role-Based Access Control (RBAC)**:
  - Admin endpoints (`/api/admin/*`) require server-side verification of administrative role.
- **Admin Setup CLI**:
  - Provision the master administrator without hardcoding using an interactive CLI prompt:
    ```bash
    npm run create-admin
    ```

## Features

- **Mandatory Minimal Sign In**:
  - App opens directly to a clean sign-in screen; zero portal or admin data is exposed without server authentication.
- **Client Submission Portal**:
  - Clients can submit individual domains (Name, Category, Asking Price, optional Note) or bulk upload via Excel (`.xlsx`, `.xls`, `.csv`).
  - Real-time client view of their own active submissions.
- **Administrator Console**:
  - Master view of all client domains with Price Low-to-High sorting, keyword search, and CSV export.
  - Client Account management: create new client logins with encrypted passwords, view client listings, and revoke accounts.
  - Edit or delete listings directly from the table.

## How to Run

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Create Administrator Account (First Time Setup)**:
   ```bash
   npm run create-admin
   ```
   Follow the prompts to enter your secure administrator name, email, and password.

3. **Start the Application**:
   ```bash
   npm run dev
   ```
   This starts both the Express backend API (`http://localhost:3001`) and the Vite frontend dev server (`http://localhost:5173`).

4. Open `http://localhost:5173/` in your browser.
