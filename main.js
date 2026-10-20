import * as XLSX from "xlsx";

/**
 * DomainPortal - Core Application Logic
 */

const STORAGE_KEY = "domain_portal_records_v5";
const USERS_KEY = "domain_portal_users_v5";
const CURRENT_USER_KEY = "domain_portal_active_user_v5";
const THEME_KEY = "domain_theme_pref";

// =============================================================================
// PRE-SEEDED ACCOUNTS (Includes required admin7@gmail.com)
// =============================================================================
const DEFAULT_USERS = [
  {
    id: "usr_admin",
    name: "Administrator",
    clientRef: "Admin",
    email: "admin7@gmail.com",
    password: "admin123",
    role: "admin"
  },
  {
    id: "usr_104",
    name: "Client Alpha",
    clientRef: "Client #104",
    email: "alex@vancemedia.com",
    password: "user123",
    role: "user"
  },
  {
    id: "usr_208",
    name: "Client Beta",
    clientRef: "Client #208",
    email: "sarah@matrixai.io",
    password: "user123",
    role: "user"
  }
];

// Initial domain submissions tagged with fixed clientRef (Zero email leak!)
const SAMPLE_DOMAINS = [
  {
    id: "dom-1",
    clientRef: "Client #104",
    userEmail: "alex@vancemedia.com",
    name: "swiftloan.net",
    category: "Personal Lending & Micro-Finance",
    price: 450,
    note: "Instant auth-code transfer, registered at Namecheap.",
    status: "Available",
    dateAdded: "2026-10-01"
  },
  {
    id: "dom-2",
    clientRef: "Client #208",
    userEmail: "sarah@matrixai.io",
    name: "botflow.dev",
    category: "Developer Tools & RPA Automation",
    price: 650,
    note: "HSTS preloaded extension, perfect for workflow bots.",
    status: "Available",
    dateAdded: "2026-10-03"
  },
  {
    id: "dom-3",
    clientRef: "Client #104",
    userEmail: "alex@vancemedia.com",
    name: "cloudforge.tech",
    category: "Cloud Infrastructure & DevOps",
    price: 890,
    note: "Clean history, trademark clearance check.",
    status: "Available",
    dateAdded: "2026-10-05"
  },
  {
    id: "dom-4",
    clientRef: "Client #208",
    userEmail: "sarah@matrixai.io",
    name: "codexai.io",
    category: "Generative AI & LLM Assistants",
    price: 1850,
    note: "Short developer AI brand with inbound interest.",
    status: "Pending",
    dateAdded: "2026-10-08"
  },
  {
    id: "dom-5",
    clientRef: "Client #104",
    userEmail: "alex@vancemedia.com",
    name: "biohealth.co",
    category: "Telehealth & Preventative Medicine",
    price: 2100,
    note: "Concise medical-ready brand for digital clinic.",
    status: "Available",
    dateAdded: "2026-10-10"
  },
  {
    id: "dom-6",
    clientRef: "Client #208",
    userEmail: "sarah@matrixai.io",
    name: "smartkart.com",
    category: "E-Commerce & Retail Marketplace",
    price: 6500,
    note: "", // Note is optional!
    status: "Available",
    dateAdded: "2026-10-12"
  },
  {
    id: "dom-7",
    clientRef: "Client #104",
    userEmail: "alex@vancemedia.com",
    name: "hyperneural.ai",
    category: "Deep Tech & Computer Vision AI",
    price: 14500,
    note: "Cloudflare Registrar, Escrow inspection ready.",
    status: "Available",
    dateAdded: "2026-10-15"
  },
  {
    id: "dom-8",
    clientRef: "Client #208",
    userEmail: "sarah@matrixai.io",
    name: "quantumleap.ai",
    category: "Quantum Computing & Frontier AI",
    price: 65000,
    note: "Category-defining breakthrough AI branding.",
    status: "Available",
    dateAdded: "2026-10-18"
  }
];

// =============================================================================
// USER & AUTHENTICATION MANAGER
// =============================================================================
class AuthManager {
  constructor() {
    this.users = this.loadUsers();
    this.currentUser = this.loadCurrentUser();
  }

  loadUsers() {
    try {
      const stored = localStorage.getItem(USERS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("User store load error", e);
    }
    this.saveUsers(DEFAULT_USERS);
    return [...DEFAULT_USERS];
  }

  saveUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      this.users = users;
    } catch (e) {
      console.error("Save users error", e);
    }
  }

  loadCurrentUser() {
    try {
      const stored = localStorage.getItem(CURRENT_USER_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Active user load error", e);
    }
    // MANDATORY AUTHENTICATION: Return null when app opens so sign in is required!
    return null;
  }

  saveCurrentUser(user) {
    try {
      if (user) {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(CURRENT_USER_KEY);
      }
      this.currentUser = user;
    } catch (e) {
      console.error("Save active user error", e);
    }
  }

  login(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    const user = this.users.find(
      (u) => u.email.toLowerCase() === cleanEmail && u.password === password
    );
    if (!user) {
      return { success: false, message: "Invalid email or password." };
    }
    this.saveCurrentUser(user);
    return { success: true, user };
  }

  createUserByAdmin(name, email, password) {
    const cleanEmail = email.trim().toLowerCase();
    const exists = this.users.some((u) => u.email.toLowerCase() === cleanEmail);
    if (exists) {
      return { success: false, message: "An account with this email already exists." };
    }
    const isSpecialAdmin = cleanEmail === "admin7@gmail.com";
    const refNum = Math.floor(100 + Math.random() * 900);
    const newUser = {
      id: "usr_" + Date.now().toString(36),
      name: name.trim() || `Client #${refNum}`,
      clientRef: isSpecialAdmin ? "Admin" : `Client #${refNum}`,
      email: cleanEmail,
      password,
      role: isSpecialAdmin ? "admin" : "user",
      createdAt: new Date().toISOString().split("T")[0]
    };

    const updated = [...this.users, newUser];
    this.saveUsers(updated);
    // Keep currently logged-in administrator active
    return { success: true, user: newUser };
  }

  deleteUserByAdmin(userId) {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return { success: false, message: "User not found." };
    if (user.email === "admin7@gmail.com") {
      return { success: false, message: "Cannot delete master administrator account." };
    }
    const updated = this.users.filter((u) => u.id !== userId);
    this.saveUsers(updated);
    return { success: true };
  }

  logout() {
    this.saveCurrentUser(null);
  }

  isAdmin() {
    return this.currentUser && (this.currentUser.role === "admin" || this.currentUser.email === "admin7@gmail.com");
  }
}

const auth = new AuthManager();

// =============================================================================
// DOMAIN DATA STORE
// =============================================================================
class DomainStore {
  constructor() {
    this.domains = this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Domain storage load error", e);
    }
    this.save(SAMPLE_DOMAINS);
    return [...SAMPLE_DOMAINS];
  }

  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      this.domains = data;
    } catch (e) {
      console.error("Storage save error", e);
    }
  }

  add(domainData) {
    const clientRef = auth.currentUser ? (auth.currentUser.clientRef || "Client") : "Client";
    const userEmail = auth.currentUser ? auth.currentUser.email : "";

    const newDomain = {
      id: "dom-" + Date.now().toString(36),
      clientRef, // Fixed anonymized client reference - no email leak!
      userEmail, // Kept internal for filtering client's own domains
      dateAdded: new Date().toISOString().split("T")[0],
      status: "Available",
      ...domainData
    };
    const updated = [newDomain, ...this.domains];
    this.save(updated);
    return newDomain;
  }

  addBatch(domainsList) {
    const clientRef = auth.currentUser ? (auth.currentUser.clientRef || "Client") : "Client";
    const userEmail = auth.currentUser ? auth.currentUser.email : "";
    const today = new Date().toISOString().split("T")[0];

    const newDomains = domainsList.map((domainData, idx) => ({
      id: "dom-" + Date.now().toString(36) + "-" + idx,
      clientRef,
      userEmail,
      dateAdded: today,
      status: "Available",
      ...domainData
    }));

    const updated = [...newDomains, ...this.domains];
    this.save(updated);
    return newDomains;
  }

  update(id, fields) {
    const updated = this.domains.map((d) => (d.id === id ? { ...d, ...fields } : d));
    this.save(updated);
    return updated.find((d) => d.id === id);
  }

  delete(id) {
    const updated = this.domains.filter((d) => d.id !== id);
    this.save(updated);
    return updated;
  }

  reset() {
    this.save([...SAMPLE_DOMAINS]);
    return this.domains;
  }
}

const store = new DomainStore();

// =============================================================================
// DOM ELEMENT REFERENCES
// =============================================================================
const elements = {
  // Mandatory Auth Screen (Sign-In Only)
  mandatoryAuthScreen: document.getElementById("mandatory-auth-screen"),
  formMandatoryLogin: document.getElementById("form-mandatory-login"),
  gateLoginEmail: document.getElementById("gate-login-email"),
  gateLoginPassword: document.getElementById("gate-login-password"),

  // Main App Wrapper
  mainAppWrapper: document.getElementById("main-app-wrapper"),

  // Navigation
  tabPortal: document.getElementById("tab-portal"),
  tabAdmin: document.getElementById("tab-admin"),
  viewPortal: document.getElementById("view-portal"),
  viewAdmin: document.getElementById("view-admin"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  badgeTotalDomains: document.getElementById("badge-total-domains"),

  // Header User Profile
  headerUserAvatar: document.getElementById("header-user-avatar"),
  headerUserLabel: document.getElementById("header-user-label"),
  btnLogout: document.getElementById("btn-logout"),

  // Submission Portal Form
  formSubmitDomain: document.getElementById("form-submit-domain"),
  inputDomain: document.getElementById("input-domain"),
  inputCategory: document.getElementById("input-category"),
  inputPrice: document.getElementById("input-price"),
  inputNote: document.getElementById("input-note"),

  // Bulk Excel Upload Elements
  modeSingleBtn: document.getElementById("mode-single-btn"),
  modeBulkBtn: document.getElementById("mode-bulk-btn"),
  cardSingleSubmission: document.getElementById("card-single-submission"),
  cardBulkSubmission: document.getElementById("card-bulk-submission"),
  btnDownloadDemoSheet: document.getElementById("btn-download-demo-sheet"),
  btnDownloadDemoCsv: document.getElementById("btn-download-demo-csv"),
  btnToggleDemoPreview: document.getElementById("btn-toggle-demo-preview"),
  demoFormatGuide: document.getElementById("demo-format-guide"),
  bulkDropzone: document.getElementById("bulk-dropzone"),
  bulkFileInput: document.getElementById("bulk-file-input"),
  btnTriggerFileSelect: document.getElementById("btn-trigger-file-select"),
  bulkPreviewSection: document.getElementById("bulk-preview-section"),
  bulkFileName: document.getElementById("bulk-file-name"),
  bulkExtractedCount: document.getElementById("bulk-extracted-count"),
  bulkPreviewTbody: document.getElementById("bulk-preview-tbody"),
  btnConfirmBulkSubmit: document.getElementById("btn-confirm-bulk-submit"),
  btnConfirmBulkText: document.getElementById("btn-confirm-bulk-text"),
  btnCancelBulk: document.getElementById("btn-cancel-bulk"),

  // Private Submissions (Client Data Privacy)
  mySubmissionsList: document.getElementById("my-submissions-list"),
  mySubmissionsEmpty: document.getElementById("my-submissions-empty"),
  mySubmissionsCount: document.getElementById("my-submissions-count"),

  // Admin Dashboard (Password Gate & Content)
  adminGate: document.getElementById("admin-gate"),
  adminContent: document.getElementById("admin-content"),
  formAdminAuth: document.getElementById("form-admin-auth"),
  adminEmailInput: document.getElementById("admin-email-input"),
  adminPassInput: document.getElementById("admin-pass-input"),
  btnLockAdmin: document.getElementById("btn-lock-admin"),

  // Admin User Provisioning (Only Admin can add new ID)
  btnOpenCreateId: document.getElementById("btn-open-create-id"),
  btnViewClientIds: document.getElementById("btn-view-client-ids"),
  countClientIds: document.getElementById("count-client-ids"),
  modalCreateId: document.getElementById("modal-create-id"),
  formAdminCreateId: document.getElementById("form-admin-create-id"),
  newClientEmail: document.getElementById("new-client-email"),
  newClientPassword: document.getElementById("new-client-password"),
  newClientName: document.getElementById("new-client-name"),
  modalClientIds: document.getElementById("modal-client-ids"),
  clientIdsTableBody: document.getElementById("client-ids-table-body"),
  btnQuickAddFromList: document.getElementById("btn-quick-add-from-list"),

  // Admin KPIs & Table
  kpiCount: document.getElementById("kpi-count"),
  kpiValue: document.getElementById("kpi-value"),
  kpiLowest: document.getElementById("kpi-lowest"),
  kpiAverage: document.getElementById("kpi-average"),
  adminSearch: document.getElementById("admin-search"),
  adminSortSelect: document.getElementById("admin-sort-select"),
  adminStatusFilter: document.getElementById("admin-status-filter"),
  adminTableBody: document.getElementById("admin-table-body"),
  adminCountLabel: document.getElementById("admin-count-label"),
  btnExportCsv: document.getElementById("btn-export-csv"),
  btnResetDemo: document.getElementById("btn-reset-demo"),

  // Edit Modal
  modalEdit: document.getElementById("modal-edit"),
  formEdit: document.getElementById("form-edit"),
  editId: document.getElementById("edit-id"),
  editDomain: document.getElementById("edit-domain"),
  editCategory: document.getElementById("edit-category"),
  editPrice: document.getElementById("edit-price"),
  editStatus: document.getElementById("edit-status"),
  editNote: document.getElementById("edit-note"),

  // Toast Container
  toastContainer: document.getElementById("toast-container")
};

// =============================================================================
// TOAST NOTIFICATIONS & HELPERS
// =============================================================================
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 2400);
}

function escapeHtml(str) {
  if (typeof str !== "string") return str ?? "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanDomainName(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "");
}

function getInitials(email) {
  if (!email) return "US";
  const namePart = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
  if (namePart.length >= 2) {
    return namePart.substring(0, 2).toUpperCase();
  }
  return (namePart[0] || "U").toUpperCase();
}

// =============================================================================
// MANDATORY AUTH SCREEN SYNC
// =============================================================================
function syncAppState() {
  const user = auth.currentUser;

  if (!user) {
    // MANDATORY AUTH GATE: Show sign in screen first on launch!
    elements.mandatoryAuthScreen.style.display = "flex";
    elements.mainAppWrapper.style.display = "none";
    return;
  }

  // User is authenticated: Hide gate, show app!
  elements.mandatoryAuthScreen.style.display = "none";
  elements.mainAppWrapper.style.display = "flex";

  // PRIVACY: Header displays anonymized Client Ref (NO raw personal email!)
  const isAdm = auth.isAdmin();
  elements.headerUserLabel.textContent = isAdm ? "Administrator" : user.email;
  elements.headerUserAvatar.textContent = isAdm ? "AD" : getInitials(user.email);

  // Check admin gate
  syncAdminGate();

  // Render current views
  renderClientSubmissions();
  updateMetrics();

  if (isAdm) {
    renderAdminTable();
  }
}

function syncAdminGate() {
  if (auth.isAdmin()) {
    elements.adminGate.style.display = "none";
    elements.adminContent.style.display = "block";
    renderAdminTable();
  } else {
    elements.adminGate.style.display = "block";
    elements.adminContent.style.display = "none";
  }
}

// =============================================================================
// SUBMISSION PORTAL (CLIENT PRIVACY: ONLY CURRENT USER'S DATA)
// =============================================================================
function renderClientSubmissions() {
  const user = auth.currentUser;
  const userEmail = user ? user.email.toLowerCase() : "";

  // STRICT PRIVACY: Clients only see domains submitted under their account!
  const myDomains = userEmail
    ? store.domains.filter((d) => (d.userEmail || "").toLowerCase() === userEmail)
    : [];

  elements.mySubmissionsCount.textContent = `${myDomains.length} domain${myDomains.length === 1 ? "" : "s"}`;

  if (myDomains.length === 0) {
    elements.mySubmissionsEmpty.style.display = "block";
    elements.mySubmissionsList.innerHTML = "";
    return;
  }

  elements.mySubmissionsEmpty.style.display = "none";
  elements.mySubmissionsList.innerHTML = myDomains
    .map((dom) => {
      const statusClass =
        dom.status === "Available"
          ? "status-available"
          : dom.status === "Pending"
          ? "status-pending"
          : "status-sold";

      return `
        <div class="submission-item" data-id="${dom.id}">
          <div class="sub-left">
            <span class="sub-domain">${escapeHtml(dom.name)}</span>
            <span class="sub-category">${escapeHtml(dom.category)}</span>
            ${dom.note ? `<span class="sub-note">${escapeHtml(dom.note)}</span>` : `<span class="sub-note" style="color: var(--text-faint); font-style: italic;">No note provided</span>`}
          </div>
          <div class="sub-right">
            <div>
              <div class="sub-price">$${Number(dom.price).toLocaleString()}</div>
              <span class="sub-status ${statusClass}">${dom.status}</span>
            </div>
            <button class="action-btn delete btn-delete-mine" data-id="${dom.id}" title="Delete submission">&times;</button>
          </div>
        </div>
      `;
    })
    .join("");

  // Delete handler for client's own domains
  elements.mySubmissionsList.querySelectorAll(".btn-delete-mine").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      store.delete(id);
      renderClientSubmissions();
      if (auth.isAdmin()) renderAdminTable();
      updateMetrics();
      showToast("Domain removed from your submissions");
    });
  });
}

// =============================================================================
// ADMIN DASHBOARD (ADMIN SEES ALL DATA WITH LOW-TO-HIGH PRICE FILTER)
// =============================================================================
function getFilteredAdminDomains() {
  const q = elements.adminSearch.value.trim().toLowerCase();
  const status = elements.adminStatusFilter.value;
  const sort = elements.adminSortSelect.value;

  // 1. Filter
  let list = store.domains.filter((item) => {
    if (q) {
      const matchName = item.name.toLowerCase().includes(q);
      const matchCat = (item.category || "").toLowerCase().includes(q);
      const matchNote = (item.note || "").toLowerCase().includes(q);
      const matchRef = (item.clientRef || "").toLowerCase().includes(q);
      const matchEmail = (item.userEmail || "").toLowerCase().includes(q);
      if (!matchName && !matchCat && !matchNote && !matchRef && !matchEmail) return false;
    }

    if (status !== "all" && item.status !== status) {
      return false;
    }

    return true;
  });

  // 2. Sort: Default & Highlight is Price: Low to High!
  switch (sort) {
    case "price-asc": // LOW TO HIGH PRICE
      list.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case "price-desc": // HIGH TO LOW PRICE
      list.sort((a, b) => Number(b.price) - Number(a.price));
      break;
    case "name-asc":
      list.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "date-newest":
      list.sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
      break;
    case "date-oldest":
      list.sort((a, b) => new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0));
      break;
    default:
      list.sort((a, b) => Number(a.price) - Number(b.price));
  }

  return list;
}

function renderAdminClientIds() {
  const users = auth.users.filter((u) => u.role !== "admin" && u.email !== "admin7@gmail.com");
  if (elements.countClientIds) {
    elements.countClientIds.textContent = users.length;
  }

  if (!elements.clientIdsTableBody) return;

  if (users.length === 0) {
    elements.clientIdsTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">
          No client accounts created yet. Click "+ Create ID" to add one.
        </td>
      </tr>
    `;
    return;
  }

  elements.clientIdsTableBody.innerHTML = users
    .map((u) => {
      const domCount = store.domains.filter(
        (d) => (d.userEmail || "").toLowerCase() === u.email.toLowerCase()
      ).length;

      return `
        <tr data-user-id="${u.id}">
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(u.email)}</div>
            ${u.name ? `<div style="font-size: 0.725rem; color: var(--text-muted);">${escapeHtml(u.name)}</div>` : ""}
          </td>
          <td>
            <span class="client-ref-badge">CLIENT</span>
          </td>
          <td>
            <span style="font-weight: 600;">${domCount} domain${domCount === 1 ? "" : "s"}</span>
          </td>
          <td class="text-right">
            <button class="action-btn delete btn-delete-user" data-id="${u.id}" data-email="${escapeHtml(u.email)}" title="Delete client account">
              Delete
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  elements.clientIdsTableBody.querySelectorAll(".btn-delete-user").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.id;
      const uemail = btn.dataset.email;
      if (confirm(`Revoke access and delete account for "${uemail}"?`)) {
        auth.deleteUserByAdmin(uid);
        renderAdminClientIds();
        renderAdminTable();
        showToast(`Account "${uemail}" deleted`);
      }
    });
  });
}

function renderAdminTable() {
  if (!auth.isAdmin()) return;

  renderAdminClientIds();

  const list = getFilteredAdminDomains();
  elements.adminCountLabel.textContent = `Showing ${list.length} of ${store.domains.length} domains`;

  if (list.length === 0) {
    elements.adminTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No domain submissions match your search or filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  // Displaying Fixed Anonymized Client Reference (Zero email sharing!)
  elements.adminTableBody.innerHTML = list
    .map((dom) => {
      const statusClass =
        dom.status === "Available"
          ? "status-available"
          : dom.status === "Pending"
          ? "status-pending"
          : "status-sold";

      return `
        <tr data-id="${dom.id}">
          <td>
            <span class="td-domain">${escapeHtml(dom.name)}</span>
          </td>
          <td>
            <div class="td-cat" title="${escapeHtml(dom.category)}">${escapeHtml(dom.category)}</div>
          </td>
          <td>
            <span class="td-price">$${Number(dom.price).toLocaleString()}</span>
          </td>
          <td>
            <span class="client-ref-badge">${escapeHtml(dom.userEmail || dom.clientRef || "user@example.com")}</span>
          </td>
          <td>
            <div class="td-note" title="${escapeHtml(dom.note || 'None')}">${escapeHtml(dom.note || '-')}</div>
          </td>
          <td>
            <span class="td-date">${dom.dateAdded || "Recent"}</span>
          </td>
          <td>
            <span class="sub-status ${statusClass}">${escapeHtml(dom.status)}</span>
          </td>
          <td class="text-right">
            <div class="td-actions">
              <button class="action-btn btn-edit" data-id="${dom.id}">Edit</button>
              <button class="action-btn delete btn-delete" data-id="${dom.id}" data-name="${escapeHtml(dom.name)}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  attachAdminRowActions();
}

function attachAdminRowActions() {
  elements.adminTableBody.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dom = store.domains.find((d) => d.id === btn.dataset.id);
      if (!dom) return;

      elements.editId.value = dom.id;
      elements.editDomain.value = dom.name;
      elements.editCategory.value = dom.category;
      elements.editPrice.value = dom.price;
      elements.editStatus.value = dom.status;
      elements.editNote.value = dom.note || "";

      elements.modalEdit.classList.add("show");
    });
  });

  elements.adminTableBody.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (confirm(`Delete "${name}" from database?`)) {
        store.delete(id);
        renderAdminTable();
        renderClientSubmissions();
        updateMetrics();
        showToast(`Deleted ${name}`);
      }
    });
  });
}

function updateMetrics() {
  const all = store.domains;
  const count = all.length;
  const totalVal = all.reduce((acc, curr) => acc + Number(curr.price || 0), 0);
  const avg = count > 0 ? Math.round(totalVal / count) : 0;
  const prices = all.map((d) => Number(d.price)).filter((p) => !isNaN(p));
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

  elements.badgeTotalDomains.textContent = count;
  elements.kpiCount.textContent = count;
  elements.kpiValue.textContent = "$" + totalVal.toLocaleString();
  elements.kpiLowest.textContent = "$" + minPrice.toLocaleString();
  elements.kpiAverage.textContent = "$" + avg.toLocaleString();
}

function exportCsv() {
  const domains = store.domains;
  const headers = ["Domain Name", "Category", "Price USD", "Client Email", "Status", "Note", "Submission Date"];
  const rows = domains.map((d) => [
    `"${d.name.replace(/"/g, '""')}"`,
    `"${d.category.replace(/"/g, '""')}"`,
    d.price,
    `"${(d.userEmail || d.clientRef || "").replace(/"/g, '""')}"`,
    `"${d.status.replace(/"/g, '""')}"`,
    `"${(d.note || "").replace(/"/g, '""')}"`,
    `"${d.dateAdded || ""}"`
  ]);

  const csvText = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, `domain_submissions_${new Date().toISOString().split("T")[0]}.csv`);

  showToast("Spreadsheet exported");
}

// =============================================================================
// BULK EXCEL UPLOAD & DEMO SHEET LOGIC
// =============================================================================
let extractedBulkDomains = [];

const TEMPLATE_HEADERS = [["Domain Name", "Category", "Price", "Note"]];

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const tempLink = document.createElement("a");
  tempLink.style.display = "none";
  tempLink.href = url;
  tempLink.setAttribute("download", filename);
  document.body.appendChild(tempLink);
  tempLink.click();
  setTimeout(() => {
    if (tempLink.parentNode) {
      tempLink.parentNode.removeChild(tempLink);
    }
    URL.revokeObjectURL(url);
  }, 1200);
}

function fallbackFileDownload(url, filename) {
  const tempLink = document.createElement("a");
  tempLink.style.display = "none";
  tempLink.href = url;
  tempLink.setAttribute("download", filename);
  document.body.appendChild(tempLink);
  tempLink.click();
  setTimeout(() => {
    if (tempLink.parentNode) {
      tempLink.parentNode.removeChild(tempLink);
    }
  }, 500);
}

function downloadDemoExcelSheet(e) {
  if (e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }
  showToast("Generating Template Excel Sheet (.xlsx)...");

  try {
    const worksheet = XLSX.utils.aoa_to_sheet(TEMPLATE_HEADERS);
    worksheet["!cols"] = [
      { wch: 25 }, // Domain Name
      { wch: 32 }, // Category
      { wch: 15 }, // Price
      { wch: 40 }  // Note
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Domains");

    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    triggerBlobDownload(blob, "demo_domains_template.xlsx");
    showToast("Template Excel Sheet (.xlsx) downloaded successfully!");
  } catch (err) {
    console.warn("Direct XLSX generation error, attempting fallback download:", err);
    fallbackFileDownload("./demo_domains_template.xlsx", "demo_domains_template.xlsx");
  }
}

function downloadDemoCsvSheet(e) {
  if (e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }
  showToast("Generating Template CSV Sheet (.csv)...");

  try {
    const headers = ["Domain Name", "Category", "Price", "Note"];
    const csvText = "\uFEFF" + headers.join(",") + "\r\n";
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });

    triggerBlobDownload(blob, "demo_domains_template.csv");
    showToast("Template CSV Sheet (.csv) downloaded successfully!");
  } catch (err) {
    console.warn("Direct CSV generation error, attempting fallback download:", err);
    fallbackFileDownload("./demo_domains_template.csv", "demo_domains_template.csv");
  }
}

function extractDomainRow(row) {
  let name = "";
  let category = "";
  let price = 0;
  let note = "";

  for (const [key, val] of Object.entries(row)) {
    const k = key.trim().toLowerCase();
    const strVal = String(val ?? "").trim();

    if (/domain|name|website|url|item/.test(k) && !name) {
      name = cleanDomainName(strVal);
    } else if (/cat|niche|sector|industry|type|topic|tag|genre|vertical/.test(k) && !category) {
      category = strVal;
    } else if (/price|cost|usd|amount|val|fee|rate|ask|quote|\$/.test(k) && !price) {
      const num = parseFloat(strVal.replace(/[^0-9.-]+/g, ""));
      if (!isNaN(num) && num > 0) price = num;
    } else if (/note|detail|desc|comment|registrar|remark|info|memo|message/.test(k) && !note) {
      note = strVal;
    }
  }

  // Fallback 1: If name not found by header, inspect values for a domain-like string (has dot, no spaces)
  if (!name) {
    for (const [key, val] of Object.entries(row)) {
      const strVal = String(val ?? "").trim();
      if (strVal.includes(".") && !strVal.includes(" ") && strVal.length >= 4) {
        name = cleanDomainName(strVal);
        break;
      }
    }
  }

  // Fallback 2: If price not found by header, inspect values for any valid positive number
  if (!price || price <= 0) {
    for (const [key, val] of Object.entries(row)) {
      const strVal = String(val ?? "").trim();
      // Skip if this value is the domain name
      if (cleanDomainName(strVal) === name) continue;
      const num = parseFloat(strVal.replace(/[^0-9.-]+/g, ""));
      if (!isNaN(num) && num > 0) {
        price = num;
        break;
      }
    }
  }

  // Fallback 3: Positional keys for un-headered or __EMPTY sheets
  if (!name) {
    const keys = Object.keys(row);
    if (keys.length >= 2) {
      const maybeName = cleanDomainName(String(row[keys[0]] || ""));
      if (maybeName && maybeName.includes(".")) {
        name = maybeName;
        category = String(row[keys[1]] || "General");
        if (keys[2]) {
          const num = parseFloat(String(row[keys[2]] || "").replace(/[^0-9.-]+/g, ""));
          if (!isNaN(num) && num > 0) price = num;
        }
        if (keys[3]) {
          note = String(row[keys[3]] || "");
        }
      }
    }
  }

  // Validation: Must have a valid name with a dot/extension and price > 0
  if (name && name.includes(".") && price > 0) {
    if (!category) category = "General";
    return { name, category, price, note };
  }
  return null;
}

function handleExcelFile(file) {
  if (!file) return;

  const validExts = [".xlsx", ".xls", ".csv"];
  const fileNameLower = file.name.toLowerCase();
  const isValidExt = validExts.some((ext) => fileNameLower.endsWith(ext));

  if (!isValidExt) {
    alert("Please upload a valid spreadsheet file (.xlsx, .xls, or .csv).");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!rawRows || rawRows.length === 0) {
        alert("The uploaded spreadsheet contains no data rows. Check the Demo Sheet for the proper format.");
        return;
      }

      const extracted = [];
      for (const row of rawRows) {
        const parsed = extractDomainRow(row);
        if (parsed) {
          extracted.push(parsed);
        }
      }

      if (extracted.length === 0) {
        alert(
          "Could not extract any valid domains from this file.\n\nPlease make sure your sheet has columns: Domain Name, Category, Price, and Note.\n\nYou can click 'Download Demo Sheet' to see the exact structure."
        );
        return;
      }

      extractedBulkDomains = extracted;
      renderExtractedBulkPreview(extracted, file.name);
    } catch (err) {
      console.error("Error parsing Excel file:", err);
      alert("Failed to parse the file. Please ensure it is a valid .xlsx or .csv file.");
    }
  };

  reader.readAsArrayBuffer(file);
}

function renderExtractedBulkPreview(domains, filename) {
  if (!elements.bulkPreviewSection || !elements.bulkPreviewTbody) return;

  elements.bulkFileName.textContent = filename;
  elements.bulkExtractedCount.textContent = `${domains.length} valid domain${domains.length === 1 ? "" : "s"}`;
  elements.btnConfirmBulkText.textContent = `Submit All ${domains.length} Domains`;

  elements.bulkPreviewTbody.innerHTML = domains
    .map(
      (d, idx) => `
      <tr>
        <td style="color: var(--text-muted); font-size: 0.75rem;">${idx + 1}</td>
        <td><code style="font-family: var(--font-mono); font-weight: 600; color: var(--primary);">${escapeHtml(d.name)}</code></td>
        <td><span style="font-weight: 500;">${escapeHtml(d.category)}</span></td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: #10b981;">$${Number(d.price).toLocaleString()}</td>
        <td style="color: var(--text-muted); font-size: 0.8rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(d.note || "—")}</td>
        <td><span class="status-pill status-available">Ready to Add</span></td>
      </tr>
    `
    )
    .join("");

  elements.bulkPreviewSection.style.display = "block";
  showToast(`Extracted ${domains.length} domains from ${filename}`);
}

function clearBulkUpload() {
  extractedBulkDomains = [];
  if (elements.bulkFileInput) elements.bulkFileInput.value = "";
  if (elements.bulkPreviewSection) elements.bulkPreviewSection.style.display = "none";
  if (elements.bulkPreviewTbody) elements.bulkPreviewTbody.innerHTML = "";
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================
function setupEvents() {
  // Mandatory Login Form Submit (Only Sign In is public)
  elements.formMandatoryLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = elements.gateLoginEmail.value.trim();
    const pass = elements.gateLoginPassword.value;

    const res = auth.login(email, pass);
    if (!res.success) {
      alert(res.message);
      return;
    }

    elements.formMandatoryLogin.reset();
    syncAppState();

    if (auth.isAdmin()) {
      elements.tabAdmin.click();
      showToast("Signed in as Administrator");
    } else {
      elements.tabPortal.click();
      showToast(`Signed in successfully!`);
    }
  });

  // Admin User Provisioning Events (Only Admin can add new ID)
  if (elements.btnOpenCreateId) {
    elements.btnOpenCreateId.addEventListener("click", () => {
      elements.formAdminCreateId.reset();
      elements.modalCreateId.classList.add("show");
    });
  }

  if (elements.btnViewClientIds) {
    elements.btnViewClientIds.addEventListener("click", () => {
      renderAdminClientIds();
      elements.modalClientIds.classList.add("show");
    });
  }

  if (elements.btnQuickAddFromList) {
    elements.btnQuickAddFromList.addEventListener("click", () => {
      elements.modalClientIds.classList.remove("show");
      elements.formAdminCreateId.reset();
      elements.modalCreateId.classList.add("show");
    });
  }

  // Admin Create ID Form Submit
  if (elements.formAdminCreateId) {
    elements.formAdminCreateId.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = elements.newClientEmail.value.trim();
      const password = elements.newClientPassword.value;
      const name = elements.newClientName.value.trim();

      if (!email || !password) {
        alert("Please provide both an email and password.");
        return;
      }

      const res = auth.createUserByAdmin(name, email, password);
      if (!res.success) {
        alert(res.message);
        return;
      }

      elements.formAdminCreateId.reset();
      elements.modalCreateId.classList.remove("show");
      renderAdminClientIds();
      showToast(`Client ID created for ${email}`);
    });
  }

  // Sign Out Button in Header
  elements.btnLogout.addEventListener("click", () => {
    auth.logout();
    syncAppState();
    showToast("Signed out. App locked.");
  });

  // Navigation Tabs: Submission Portal vs Admin Dashboard
  elements.tabPortal.addEventListener("click", () => {
    elements.tabPortal.classList.add("active");
    elements.tabPortal.setAttribute("aria-selected", "true");
    elements.tabAdmin.classList.remove("active");
    elements.tabAdmin.setAttribute("aria-selected", "false");
    elements.viewPortal.classList.add("active");
    elements.viewAdmin.classList.remove("active");
    renderClientSubmissions();
  });

  elements.tabAdmin.addEventListener("click", () => {
    elements.tabAdmin.classList.add("active");
    elements.tabAdmin.setAttribute("aria-selected", "true");
    elements.tabPortal.classList.remove("active");
    elements.tabPortal.setAttribute("aria-selected", "false");
    elements.viewAdmin.classList.add("active");
    elements.viewPortal.classList.remove("active");

    syncAdminGate();
  });

  // Admin In-View Gate Form (If client attempts to authenticate into Admin)
  elements.formAdminAuth.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = elements.adminEmailInput.value.trim();
    const pass = elements.adminPassInput.value;

    const res = auth.login(email, pass);
    if (!res.success || (res.user.email !== "admin7@gmail.com" && res.user.role !== "admin")) {
      alert("Access Denied: Incorrect administrator email or password.");
      elements.adminPassInput.value = "";
      return;
    }

    elements.formAdminAuth.reset();
    syncAppState();
    showToast("Admin Dashboard Unlocked");
  });

  elements.btnLockAdmin.addEventListener("click", () => {
    auth.logout();
    syncAppState();
    showToast("Admin session locked");
  });

  // Submission Portal Form Submit (NOTE IS OPTIONAL!)
  elements.formSubmitDomain.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = cleanDomainName(elements.inputDomain.value);
    const category = elements.inputCategory.value.trim();
    const price = Number(elements.inputPrice.value);
    const note = elements.inputNote.value.trim(); // OPTIONAL

    if (!name) {
      alert("Please enter a domain name.");
      elements.inputDomain.focus();
      return;
    }
    if (!category) {
      alert("Please write a category.");
      elements.inputCategory.focus();
      return;
    }
    if (isNaN(price) || price <= 0) {
      alert("Please enter a valid price.");
      elements.inputPrice.focus();
      return;
    }

    store.add({
      name,
      category,
      price,
      note
    });

    elements.formSubmitDomain.reset();
    renderClientSubmissions();
    if (auth.isAdmin()) renderAdminTable();
    updateMetrics();
    showToast(`Domain "${name}" submitted successfully`);
  });

  // Portal Mode Switching (Single vs Bulk)
  if (elements.modeSingleBtn && elements.modeBulkBtn) {
    elements.modeSingleBtn.addEventListener("click", () => {
      elements.modeSingleBtn.classList.add("active");
      elements.modeBulkBtn.classList.remove("active");
      elements.cardSingleSubmission.style.display = "block";
      elements.cardBulkSubmission.style.display = "none";
    });

    elements.modeBulkBtn.addEventListener("click", () => {
      elements.modeBulkBtn.classList.add("active");
      elements.modeSingleBtn.classList.remove("active");
      elements.cardBulkSubmission.style.display = "block";
      elements.cardSingleSubmission.style.display = "none";
    });
  }

  // Demo Excel & CSV Sheet Downloads
  if (elements.btnDownloadDemoSheet) {
    elements.btnDownloadDemoSheet.addEventListener("click", downloadDemoExcelSheet);
  }
  if (elements.btnDownloadDemoCsv) {
    elements.btnDownloadDemoCsv.addEventListener("click", downloadDemoCsvSheet);
  }

  // Toggle Format Guide
  if (elements.btnToggleDemoPreview && elements.demoFormatGuide) {
    elements.btnToggleDemoPreview.addEventListener("click", () => {
      const isHidden = elements.demoFormatGuide.style.display === "none";
      elements.demoFormatGuide.style.display = isHidden ? "block" : "none";
      const span = elements.btnToggleDemoPreview.querySelector("span");
      if (span) {
        span.textContent = isHidden ? "Hide Format Guide" : "View Format Guide";
      }
    });
  }

  // File Selection via Button or Dropzone Click
  if (elements.btnTriggerFileSelect && elements.bulkFileInput) {
    elements.btnTriggerFileSelect.addEventListener("click", (e) => {
      e.stopPropagation();
      elements.bulkFileInput.click();
    });
  }

  if (elements.bulkDropzone && elements.bulkFileInput) {
    elements.bulkDropzone.addEventListener("click", (e) => {
      if (
        elements.btnTriggerFileSelect &&
        e.target !== elements.btnTriggerFileSelect &&
        !elements.btnTriggerFileSelect.contains(e.target)
      ) {
        elements.bulkFileInput.click();
      }
    });

    // Drag and drop listeners
    ["dragenter", "dragover"].forEach((eventName) => {
      elements.bulkDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.bulkDropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      elements.bulkDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.bulkDropzone.classList.remove("dragover");
      });
    });

    elements.bulkDropzone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      const file = dt && dt.files && dt.files[0];
      if (file) handleExcelFile(file);
    });
  }

  if (elements.bulkFileInput) {
    elements.bulkFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleExcelFile(file);
    });
  }

  // Clear Bulk Upload
  if (elements.btnCancelBulk) {
    elements.btnCancelBulk.addEventListener("click", () => {
      clearBulkUpload();
      showToast("Cleared uploaded file");
    });
  }

  // Confirm and Submit Extracted Bulk Domains
  if (elements.btnConfirmBulkSubmit) {
    elements.btnConfirmBulkSubmit.addEventListener("click", () => {
      if (!extractedBulkDomains || extractedBulkDomains.length === 0) {
        alert("No valid extracted domains to submit. Please upload an Excel sheet first.");
        return;
      }

      const totalToAdd = extractedBulkDomains.length;
      store.addBatch(extractedBulkDomains);
      clearBulkUpload();
      renderClientSubmissions();
      if (auth.isAdmin()) renderAdminTable();
      updateMetrics();
      showToast(`Successfully added ${totalToAdd} domains from Excel!`);
    });
  }

  // Admin Controls (Sort & Filter)
  elements.adminSortSelect.addEventListener("change", () => {
    renderAdminTable();
  });

  elements.adminStatusFilter.addEventListener("change", () => {
    renderAdminTable();
  });

  elements.adminSearch.addEventListener("input", () => {
    renderAdminTable();
  });

  elements.btnExportCsv.addEventListener("click", exportCsv);

  elements.btnResetDemo.addEventListener("click", () => {
    if (confirm("Restore sample domains?")) {
      store.reset();
      renderClientSubmissions();
      renderAdminTable();
      updateMetrics();
      showToast("Sample data restored");
    }
  });

  // Edit Modal Submit
  elements.formEdit.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = elements.editId.value;
    const name = cleanDomainName(elements.editDomain.value);
    const category = elements.editCategory.value.trim();
    const price = Number(elements.editPrice.value);
    const status = elements.editStatus.value;
    const note = elements.editNote.value.trim();

    store.update(id, {
      name,
      category,
      price,
      status,
      note
    });

    elements.modalEdit.classList.remove("show");
    renderAdminTable();
    renderClientSubmissions();
    updateMetrics();
    showToast("Listing updated");
  });

  // Modal Close
  document.querySelectorAll("[data-close-modal]").forEach((b) => {
    b.addEventListener("click", () => {
      elements.modalEdit.classList.remove("show");
      if (elements.modalCreateId) elements.modalCreateId.classList.remove("show");
      if (elements.modalClientIds) elements.modalClientIds.classList.remove("show");
    });
  });

  [elements.modalEdit, elements.modalCreateId, elements.modalClientIds].forEach((modal) => {
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("show");
        }
      });
    }
  });

  // Theme Toggle
  elements.themeToggleBtn.addEventListener("click", () => {
    const current = document.body.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  });

  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) {
    document.body.setAttribute("data-theme", savedTheme);
  }
}

// =============================================================================
// INITIALIZE
// =============================================================================
function init() {
  setupEvents();
  syncAppState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
