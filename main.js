import * as XLSX from "xlsx";

/**
 * DomainPortal - Enterprise-Grade Secure Client Architecture
 * 
 * Security Implementation:
 * - ZERO hardcoded credentials or user accounts in source code.
 * - ZERO sensitive data or passwords in localStorage.
 * - Server-side authentication with salted bcrypt hashes and HttpOnly session cookies.
 * - Cryptographic JWT role verification on every API transaction.
 * - Strict server-side multi-tenancy isolation (clients only receive their own records).
 */

const THEME_KEY = "domain_theme_pref";

// =============================================================================
// API CLIENT
// =============================================================================
const api = {
  async request(endpoint, options = {}) {
    const defaultHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    const config = {
      ...options,
      credentials: "include", // Transmit HttpOnly authentication cookie
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(endpoint, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.warn(`[API Error] ${endpoint}:`, err.message);
      throw err;
    }
  },

  async checkStatus() {
    return this.request("/api/status");
  },

  async checkAuth() {
    try {
      const res = await this.request("/api/auth/me");
      return res.user;
    } catch {
      return null;
    }
  },

  async login(email, password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },

  async setupFirstAdmin(name, email, password) {
    return this.request("/api/auth/setup-first-admin", {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    });
  },

  async logout() {
    return this.request("/api/auth/logout", {
      method: "POST"
    });
  },

  // Client tenant domain operations
  async getMyDomains() {
    return this.request("/api/domains");
  },

  async submitDomain(data) {
    return this.request("/api/domains", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async submitBulkDomains(domains) {
    return this.request("/api/domains/bulk", {
      method: "POST",
      body: JSON.stringify({ domains })
    });
  },

  // Admin operations
  async getAdminDomains() {
    return this.request("/api/admin/domains");
  },

  async updateDomain(id, data) {
    return this.request(`/api/admin/domains/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  async deleteDomain(id) {
    return this.request(`/api/admin/domains/${id}`, {
      method: "DELETE"
    });
  },

  async getAdminClients() {
    return this.request("/api/admin/clients");
  },

  async createClientAccount(data) {
    return this.request("/api/admin/clients", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async deleteClientAccount(id) {
    return this.request(`/api/admin/clients/${id}`, {
      method: "DELETE"
    });
  }
};

// =============================================================================
// RUNTIME STATE (Purely in-memory, zero credentials or other tenants' data)
// =============================================================================
const state = {
  currentUser: null,
  myDomains: [],
  adminDomains: [],
  clients: []
};

// =============================================================================
// DOM ELEMENT REFERENCES
// =============================================================================
const elements = {
  // Mandatory Auth Screen (Sign-In Only)
  mandatoryAuthScreen: document.getElementById("mandatory-auth-screen"),
  formMandatoryLogin: document.getElementById("form-mandatory-login"),
  gateLoginEmail: document.getElementById("gate-login-email"),
  gateLoginPassword: document.getElementById("gate-login-password"),
  authSubText: document.getElementById("auth-sub-text"),

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

  // Admin User Provisioning
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
  if (!elements.toastContainer) return;
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

function isAdminUser() {
  return state.currentUser && state.currentUser.role === "admin";
}

// =============================================================================
// APP STATE SYNCHRONIZATION
// =============================================================================
async function syncAppState() {
  // Clear any legacy insecure localStorage data if present
  try {
    localStorage.removeItem("domain_portal_records_v5");
    localStorage.removeItem("domain_portal_users_v5");
    localStorage.removeItem("domain_portal_active_user_v5");
  } catch {
    // Ignore
  }

  // Check with server for authenticated session
  const user = await api.checkAuth();
  state.currentUser = user;

  if (!user) {
    // Check if initial admin setup is required
    try {
      const status = await api.checkStatus();
      if (!status.hasAdmin) {
        if (elements.authSubText) {
          elements.authSubText.innerHTML = `⚠️ <strong>Initial Setup Required:</strong> Run <code>npm run create-admin</code> in terminal to set up the master administrator.`;
        }
      } else {
        if (elements.authSubText) {
          elements.authSubText.textContent = "Sign in to your account";
        }
      }
    } catch {
      // Backend may be starting
    }

    elements.mandatoryAuthScreen.style.display = "flex";
    elements.mainAppWrapper.style.display = "none";
    return;
  }

  // User is authenticated by backend
  elements.mandatoryAuthScreen.style.display = "none";
  elements.mainAppWrapper.style.display = "flex";

  const isAdm = isAdminUser();
  elements.headerUserLabel.textContent = isAdm ? (user.name || "Administrator") : user.email;
  elements.headerUserAvatar.textContent = isAdm ? "AD" : getInitials(user.email);

  syncAdminGate();

  // Load client's own domains from server
  await loadClientSubmissions();

  if (isAdm) {
    await loadAdminData();
  }
}

function syncAdminGate() {
  if (isAdminUser()) {
    elements.adminGate.style.display = "none";
    elements.adminContent.style.display = "block";
  } else {
    elements.adminGate.style.display = "block";
    elements.adminContent.style.display = "none";
  }
}

// =============================================================================
// CLIENT SUBMISSIONS (Multi-Tenancy Protected)
// =============================================================================
async function loadClientSubmissions() {
  try {
    const list = await api.getMyDomains();
    state.myDomains = Array.isArray(list) ? list : [];
    renderClientSubmissions();
  } catch (err) {
    showToast("Failed to load your submissions: " + err.message);
  }
}

function renderClientSubmissions() {
  const myDomains = state.myDomains;
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
              <span class="sub-status ${statusClass}">${escapeHtml(dom.status)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

// =============================================================================
// ADMIN DASHBOARD (Server-Guarded Admin Only)
// =============================================================================
async function loadAdminData() {
  if (!isAdminUser()) return;

  try {
    const [domains, clients] = await Promise.all([
      api.getAdminDomains(),
      api.getAdminClients()
    ]);
    state.adminDomains = Array.isArray(domains) ? domains : [];
    state.clients = Array.isArray(clients) ? clients : [];

    updateMetrics();
    renderAdminTable();
    renderAdminClientIds();
  } catch (err) {
    console.error("Admin data load error:", err);
  }
}

function getFilteredAdminDomains() {
  const q = elements.adminSearch.value.trim().toLowerCase();
  const status = elements.adminStatusFilter.value;
  const sort = elements.adminSortSelect.value;

  let list = state.adminDomains.filter((item) => {
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

  // Sort: Default is Price: Low to High
  switch (sort) {
    case "price-asc":
      list.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case "price-desc":
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
  const clients = state.clients.filter((u) => u.role !== "admin");
  if (elements.countClientIds) {
    elements.countClientIds.textContent = clients.length;
  }

  if (!elements.clientIdsTableBody) return;

  if (clients.length === 0) {
    elements.clientIdsTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">
          No client accounts created yet. Click "+ Create ID" to add one.
        </td>
      </tr>
    `;
    return;
  }

  elements.clientIdsTableBody.innerHTML = clients
    .map((u) => {
      const domCount = u.domain_count || 0;

      return `
        <tr data-user-id="${u.id}">
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(u.email)}</div>
            ${u.name ? `<div style="font-size: 0.725rem; color: var(--text-muted);">${escapeHtml(u.name)}</div>` : ""}
          </td>
          <td>
            <span class="client-ref-badge">${escapeHtml(u.client_ref || "CLIENT")}</span>
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
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.id;
      const uemail = btn.dataset.email;
      if (confirm(`Revoke access and delete account for "${uemail}"?`)) {
        try {
          await api.deleteClientAccount(uid);
          await loadAdminData();
          showToast(`Account "${uemail}" deleted`);
        } catch (err) {
          alert("Error deleting account: " + err.message);
        }
      }
    });
  });
}

function renderAdminTable() {
  if (!isAdminUser()) return;

  const list = getFilteredAdminDomains();
  elements.adminCountLabel.textContent = `Showing ${list.length} of ${state.adminDomains.length} domains`;

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
            <span class="client-ref-badge">${escapeHtml(dom.clientRef || dom.userEmail || "Client")}</span>
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
      const dom = state.adminDomains.find((d) => d.id === btn.dataset.id);
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
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (confirm(`Delete "${name}" from database?`)) {
        try {
          await api.deleteDomain(id);
          await loadAdminData();
          await loadClientSubmissions();
          showToast(`Deleted ${name}`);
        } catch (err) {
          alert("Failed to delete domain: " + err.message);
        }
      }
    });
  });
}

function updateMetrics() {
  const all = state.adminDomains;
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
  const domains = state.adminDomains;
  const headers = ["Domain Name", "Category", "Price USD", "Client Reference", "Status", "Note", "Submission Date"];
  const rows = domains.map((d) => [
    `"${d.name.replace(/"/g, '""')}"`,
    `"${d.category.replace(/"/g, '""')}"`,
    d.price,
    `"${(d.clientRef || "").replace(/"/g, '""')}"`,
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
// BULK EXCEL UPLOAD LOGIC
// =============================================================================
let extractedBulkDomains = [];

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const tempLink = document.createElement("a");
  tempLink.style.display = "none";
  tempLink.href = url;
  tempLink.setAttribute("download", filename);
  document.body.appendChild(tempLink);
  tempLink.click();
  setTimeout(() => {
    document.body.removeChild(tempLink);
    window.URL.revokeObjectURL(url);
  }, 100);
}

function downloadDemoExcelSheet(e) {
  e.preventDefault();
  const demoRows = [
    { "Domain Name": "swiftloan.net", "Category": "Personal Lending & Micro-Finance", "Price": 450, "Note": "Instant auth-code transfer, registered at Namecheap." },
    { "Domain Name": "botflow.dev", "Category": "Developer Tools & RPA Automation", "Price": 650, "Note": "HSTS preloaded extension, perfect for workflow bots." },
    { "Domain Name": "cloudforge.tech", "Category": "Cloud Infrastructure & DevOps", "Price": 890, "Note": "Clean history, trademark clearance check." },
    { "Domain Name": "codexai.io", "Category": "Generative AI & LLM Assistants", "Price": 1850, "Note": "Short developer AI brand with inbound interest." },
    { "Domain Name": "biohealth.co", "Category": "Telehealth & Preventative Medicine", "Price": 2100, "Note": "Concise medical-ready brand for digital clinic." },
    { "Domain Name": "smartkart.com", "Category": "E-Commerce & Retail Marketplace", "Price": 6500, "Note": "" },
    { "Domain Name": "hyperneural.ai", "Category": "Deep Tech & Computer Vision AI", "Price": 14500, "Note": "Cloudflare Registrar, Escrow inspection ready." },
    { "Domain Name": "quantumleap.ai", "Category": "Quantum Computing & Frontier AI", "Price": 65000, "Note": "Category-defining breakthrough AI branding." }
  ];

  const ws = XLSX.utils.json_to_sheet(demoRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Domains");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerBlobDownload(blob, "demo_domains_template.xlsx");
  showToast("Downloaded demo Excel template");
}

function downloadDemoCsvSheet(e) {
  e.preventDefault();
  const headers = ["Domain Name", "Category", "Price", "Note"];
  const demoRows = [
    ["swiftloan.net", "Personal Lending & Micro-Finance", 450, "Instant auth-code transfer, registered at Namecheap."],
    ["botflow.dev", "Developer Tools & RPA Automation", 650, "HSTS preloaded extension, perfect for workflow bots."],
    ["cloudforge.tech", "Cloud Infrastructure & DevOps", 890, "Clean history, trademark clearance check."],
    ["codexai.io", "Generative AI & LLM Assistants", 1850, "Short developer AI brand with inbound interest."],
    ["biohealth.co", "Telehealth & Preventative Medicine", 2100, "Concise medical-ready brand for digital clinic."],
    ["smartkart.com", "E-Commerce & Retail Marketplace", 6500, ""],
    ["hyperneural.ai", "Deep Tech & Computer Vision AI", 14500, "Cloudflare Registrar, Escrow inspection ready."],
    ["quantumleap.ai", "Quantum Computing & Frontier AI", 65000, "Category-defining breakthrough AI branding."]
  ];

  const csvRows = [headers.join(",")];
  demoRows.forEach((r) => {
    csvRows.push(r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","));
  });

  const csvContent = "\uFEFF" + csvRows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, "demo_domains_template.csv");
  showToast("Downloaded demo CSV template");
}

function handleExcelFile(file) {
  if (!file) return;

  const validExts = [".xlsx", ".xls", ".csv"];
  const fileName = file.name.toLowerCase();
  const isValid = validExts.some((ext) => fileName.endsWith(ext));

  if (!isValid) {
    alert("Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      processExtractedRows(jsonRows, file.name);
    } catch (err) {
      console.error("Excel parse error:", err);
      alert("Failed to parse spreadsheet: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function processExtractedRows(rows, filename) {
  if (!rows || rows.length < 2) {
    alert("The uploaded spreadsheet is empty or has no data rows.");
    return;
  }

  const headerRow = rows[0].map((h) => String(h || "").trim().toLowerCase());
  let domainIdx = -1;
  let categoryIdx = -1;
  let priceIdx = -1;
  let noteIdx = -1;

  headerRow.forEach((col, idx) => {
    if (col.includes("domain") || col.includes("name") || col.includes("url")) domainIdx = idx;
    else if (col.includes("cat") || col.includes("niche") || col.includes("industry")) categoryIdx = idx;
    else if (col.includes("price") || col.includes("cost") || col.includes("ask") || col.includes("usd")) priceIdx = idx;
    else if (col.includes("note") || col.includes("desc") || col.includes("comment")) noteIdx = idx;
  });

  if (domainIdx === -1) domainIdx = 0;
  if (categoryIdx === -1) categoryIdx = 1;
  if (priceIdx === -1) priceIdx = 2;
  if (noteIdx === -1) noteIdx = 3;

  const validExtracted = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawDomain = row[domainIdx];
    const rawCategory = row[categoryIdx];
    const rawPrice = row[priceIdx];
    const rawNote = noteIdx !== -1 ? row[noteIdx] : "";

    if (!rawDomain) continue;

    const cleanedDomain = cleanDomainName(String(rawDomain));
    if (!cleanedDomain || !cleanedDomain.includes(".")) continue;

    let parsedPrice = 0;
    if (typeof rawPrice === "number") {
      parsedPrice = rawPrice;
    } else if (rawPrice) {
      const cleanedStr = String(rawPrice).replace(/[^0-9.]/g, "");
      parsedPrice = Number(cleanedStr);
    }

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      parsedPrice = 500;
    }

    const category = rawCategory && String(rawCategory).trim() ? String(rawCategory).trim() : "General";
    const note = rawNote ? String(rawNote).trim() : "";

    validExtracted.push({
      name: cleanedDomain,
      category,
      price: parsedPrice,
      note
    });
  }

  if (validExtracted.length === 0) {
    alert("Could not extract any valid domain listings from the file.");
    return;
  }

  extractedBulkDomains = validExtracted;
  renderBulkPreview(validExtracted, filename);
}

function renderBulkPreview(domains, filename) {
  elements.bulkFileName.textContent = filename;
  elements.bulkExtractedCount.textContent = `${domains.length} domain${domains.length === 1 ? "" : "s"} ready`;
  elements.btnConfirmBulkText.textContent = `Submit All ${domains.length} Domains`;

  elements.bulkPreviewTbody.innerHTML = domains
    .map(
      (d) => `
      <tr>
        <td style="font-weight: 600; color: var(--accent-light);">${escapeHtml(d.name)}</td>
        <td>${escapeHtml(d.category)}</td>
        <td style="font-weight: 600;">$${Number(d.price).toLocaleString()}</td>
        <td style="color: var(--text-muted);">${d.note ? escapeHtml(d.note) : `<em style="color: var(--text-faint)">None</em>`}</td>
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
  // Mandatory Login Form
  elements.formMandatoryLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = elements.gateLoginEmail.value.trim();
    const password = elements.gateLoginPassword.value;

    try {
      const res = await api.login(email, password);
      elements.formMandatoryLogin.reset();
      state.currentUser = res.user;
      await syncAppState();

      if (isAdminUser()) {
        elements.tabAdmin.click();
        showToast("Signed in as Administrator");
      } else {
        elements.tabPortal.click();
        showToast("Signed in successfully!");
      }
    } catch (err) {
      alert(err.message || "Invalid email or password.");
    }
  });

  // Admin User Provisioning Events
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

  // Admin Create Client Form
  if (elements.formAdminCreateId) {
    elements.formAdminCreateId.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = elements.newClientEmail.value.trim();
      const password = elements.newClientPassword.value;
      const name = elements.newClientName.value.trim();

      if (!email || !password || password.length < 6) {
        alert("Please provide a valid email and password (minimum 6 characters).");
        return;
      }

      try {
        await api.createClientAccount({ name, email, password });
        elements.formAdminCreateId.reset();
        elements.modalCreateId.classList.remove("show");
        await loadAdminData();
        showToast(`Client ID created for ${email}`);
      } catch (err) {
        alert(err.message || "Failed to create client account.");
      }
    });
  }

  // Sign Out
  elements.btnLogout.addEventListener("click", async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    state.currentUser = null;
    state.myDomains = [];
    state.adminDomains = [];
    state.clients = [];
    await syncAppState();
    showToast("Signed out. App locked.");
  });

  // Navigation Tabs
  elements.tabPortal.addEventListener("click", () => {
    elements.tabPortal.classList.add("active");
    elements.tabPortal.setAttribute("aria-selected", "true");
    elements.tabAdmin.classList.remove("active");
    elements.tabAdmin.setAttribute("aria-selected", "false");
    elements.viewPortal.classList.add("active");
    elements.viewAdmin.classList.remove("active");
    loadClientSubmissions();
  });

  elements.tabAdmin.addEventListener("click", () => {
    elements.tabAdmin.classList.add("active");
    elements.tabAdmin.setAttribute("aria-selected", "true");
    elements.tabPortal.classList.remove("active");
    elements.tabPortal.setAttribute("aria-selected", "false");
    elements.viewAdmin.classList.add("active");
    elements.viewPortal.classList.remove("active");
    syncAdminGate();
    if (isAdminUser()) {
      loadAdminData();
    }
  });

  // Admin Re-Auth Gate Form (if needed)
  elements.formAdminAuth.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = elements.adminEmailInput.value.trim();
    const pass = elements.adminPassInput.value;

    try {
      const res = await api.login(email, pass);
      if (res.user.role !== "admin") {
        alert("Access Denied: This account does not possess administrator privileges.");
        return;
      }
      elements.formAdminAuth.reset();
      state.currentUser = res.user;
      await syncAppState();
      showToast("Admin Dashboard Unlocked");
    } catch (err) {
      alert("Access Denied: " + (err.message || "Invalid credentials"));
      elements.adminPassInput.value = "";
    }
  });

  elements.btnLockAdmin.addEventListener("click", async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    state.currentUser = null;
    await syncAppState();
    showToast("Admin session locked");
  });

  // Domain Submission Form (Client)
  elements.formSubmitDomain.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = cleanDomainName(elements.inputDomain.value);
    const category = elements.inputCategory.value.trim();
    const price = Number(elements.inputPrice.value);
    const note = elements.inputNote.value.trim();

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

    try {
      await api.submitDomain({ name, category, price, note });
      elements.formSubmitDomain.reset();
      await loadClientSubmissions();
      if (isAdminUser()) {
        await loadAdminData();
      }
      showToast(`Domain "${name}" submitted successfully`);
    } catch (err) {
      alert("Failed to submit domain: " + err.message);
    }
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

  // Demo Excel & CSV Downloads
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

  // File Upload Handlers
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

  if (elements.btnCancelBulk) {
    elements.btnCancelBulk.addEventListener("click", () => {
      clearBulkUpload();
      showToast("Cleared uploaded file");
    });
  }

  // Confirm and Submit Bulk Domains
  if (elements.btnConfirmBulkSubmit) {
    elements.btnConfirmBulkSubmit.addEventListener("click", async () => {
      if (!extractedBulkDomains || extractedBulkDomains.length === 0) {
        alert("No valid extracted domains to submit. Please upload an Excel sheet first.");
        return;
      }

      try {
        const total = extractedBulkDomains.length;
        await api.submitBulkDomains(extractedBulkDomains);
        clearBulkUpload();
        await loadClientSubmissions();
        if (isAdminUser()) {
          await loadAdminData();
        }
        showToast(`Successfully added ${total} domains from Excel!`);
      } catch (err) {
        alert("Bulk submission failed: " + err.message);
      }
    });
  }

  // Admin Search & Sort
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

  if (elements.btnResetDemo) {
    elements.btnResetDemo.style.display = "none"; // Hide mock demo reset in production secure mode
  }

  // Edit Domain Modal Submit
  elements.formEdit.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = elements.editId.value;
    const name = cleanDomainName(elements.editDomain.value);
    const category = elements.editCategory.value.trim();
    const price = Number(elements.editPrice.value);
    const status = elements.editStatus.value;
    const note = elements.editNote.value.trim();

    try {
      await api.updateDomain(id, { name, category, price, status, note });
      elements.modalEdit.classList.remove("show");
      await loadAdminData();
      await loadClientSubmissions();
      showToast("Listing updated successfully");
    } catch (err) {
      alert("Failed to update domain: " + err.message);
    }
  });

  // Modal Close Handlers
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

  // Theme Toggle (Kept in localStorage as non-sensitive UI preference)
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
async function init() {
  setupEvents();
  await syncAppState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
