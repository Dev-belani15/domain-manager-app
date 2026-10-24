# DomainPortal

A secure, enterprise-grade multi-tenant domain submission portal and administrator dashboard powered by **Supabase PostgreSQL**, **Firebase Authentication**, and **Strict Client Data Isolation**.

---

## 🏛️ Multi-Client Architecture & Data Isolation

### How Do Multiple Clients Only See Their Specific Data?

1. **Unique Client Identity (Tenancy Partitioning)**:
   - Each client registers through Firebase Authentication or Portal Sign-Up and receives a unique cryptographic user ID (`uid`) and Client Reference (e.g. `Client #105` or custom company name).
2. **Database Row Ownership**:
   - In Supabase (PostgreSQL), the `domains` table includes a `user_id` foreign key referencing `users(id)`, alongside `client_ref` and `user_email`.
3. **Partitioned Scoped Queries**:
   - Whenever Client A queries the portal (`GET /api/domains`), the backend server executes:
     ```sql
     SELECT * FROM domains WHERE user_id = :authenticated_client_id ORDER BY date_added DESC;
     ```
   - Client A **never** receives Client B's domains over the network.
   - Client metrics (Total Domains, Total Asking Value, Available, Pending, Sold) are computed solely from the client's own isolated dataset.
4. **Administrator Multi-Tenant Oversight**:
   - Only accounts with `role = 'admin'` (or designated in `ADMIN_EMAILS`) can access the Admin Dashboard (`/api/admin/*`).
   - Administrators see the cross-tenant master table with client attribution badges, client-specific filter dropdowns, edit capabilities, and CSV export.

---

## 🗄️ Supabase Database (PostgreSQL) Integration

DomainPortal includes complete Supabase PostgreSQL database support with Row-Level Security (RLS).

### Setup Supabase:

1. Create a project at [supabase.com](https://supabase.com).
2. Open your Supabase project dashboard &rarr; click **SQL Editor** &rarr; **New Query**.
3. Copy and paste the contents of [`supabase-schema.sql`](./supabase-schema.sql) and click **Run**.
4. In Supabase **Project Settings** &rarr; **API**, copy your **Project URL** and **Service Role Key** (or Anon Key).
5. Add them to your `.env` file:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...your-service-role-key
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key
   ```
6. *Resilience Note:* If Supabase credentials are not yet entered, DomainPortal automatically operates on its fast local SQLite engine so you can test immediately offline!

---

## 🔥 Firebase Authentication Integration

Supports Email/Password Sign Up, Sign In, and Google OAuth popup.

### Setup Firebase:

1. In the [Firebase Console](https://console.firebase.google.com), create or open your Firebase project.
2. Under **Authentication** &rarr; **Sign-in method**, enable:
   - **Email/Password**
   - **Google**
3. Under **Project Settings** &rarr; **General** &rarr; **Your apps**, create a Web App (`</>`) and copy the config values.
4. Add them to your `.env` file:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSy...your-firebase-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
   VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
   ```

---

## 🚀 How to Run

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```

3. **Create Master Administrator Account (First Time Setup)**:
   ```bash
   npm run create-admin
   ```

4. **Run Security & Multi-Tenancy Automated Tests**:
   ```bash
   npm test
   ```
   Runs 20 security tests + 20 multi-tenant isolation tests verifying that multiple clients can never see each other's data.

5. **Start Application**:
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:3001`
