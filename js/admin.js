/**
 * FormCraft Studio - Admin Management Dashboard Controller
 * Includes Admin Password Entity, Authentication Gate, Session Management & Password Modification
 */

import { store } from './store.js';

export class AdminManager {
  constructor() {
    // Auth elements
    this.authGate = document.getElementById('admin-auth-gate');
    this.dashboardContent = document.getElementById('admin-dashboard-content');
    this.passwordInput = document.getElementById('admin-password-input');
    this.togglePasswordBtn = document.getElementById('btn-toggle-admin-password');
    this.loginForm = document.getElementById('admin-login-form');
    this.authError = document.getElementById('admin-auth-error');
    this.authErrorText = document.getElementById('admin-auth-error-text');
    this.lockCard = document.getElementById('admin-lock-card');
    this.logoutBtn = document.getElementById('btn-admin-logout');

    // Change Password Modal elements
    this.changePasswordBtn = document.getElementById('btn-admin-change-password');
    this.changePasswordModal = document.getElementById('admin-change-password-modal');
    this.currPasswordInput = document.getElementById('admin-curr-pwd-input');
    this.newPasswordInput = document.getElementById('admin-new-pwd-input');
    this.confirmPasswordInput = document.getElementById('admin-confirm-pwd-input');
    this.changePasswordError = document.getElementById('admin-change-pwd-error');
    this.changePasswordErrorText = document.getElementById('admin-change-pwd-error-text');
    this.saveNewPasswordBtn = document.getElementById('btn-save-new-admin-password');

    // Table & KPI elements
    this.tableBody = document.getElementById('admin-forms-table-body');
    this.searchInput = document.getElementById('admin-search-input');
    this.statusTabs = document.querySelectorAll('.admin-tab-filter');
    this.currentFilter = 'all';

    // KPIs
    this.kpiTotalForms = document.getElementById('admin-kpi-total-forms');
    this.kpiActiveForms = document.getElementById('admin-kpi-active-forms');
    this.kpiClosedForms = document.getElementById('admin-kpi-closed-forms');
    this.kpiTotalResponses = document.getElementById('admin-kpi-total-responses');

    // Auth State
    this.isAuthenticated = false;
    this.token = localStorage.getItem('formcraft_admin_token') || '';

    this.bindEvents();
    this.bindAuthEvents();
    this.verifyExistingSession();

    store.subscribe((event) => {
      if (['activeFormChanged', 'formCreated', 'formUpdated', 'formDeleted', 'formsSynced', 'submissionAdded', 'submissionDeleted'].includes(event)) {
        if (this.isAuthenticated) {
          this.render();
        }
      }
    });
  }

  bindAuthEvents() {
    // 1. Password Visibility Toggle
    this.togglePasswordBtn?.addEventListener('click', () => {
      if (!this.passwordInput) return;
      const isPwd = this.passwordInput.type === 'password';
      this.passwordInput.type = isPwd ? 'text' : 'password';
      this.togglePasswordBtn.innerHTML = isPwd ? '<i class="ri-eye-off-line"></i>' : '<i class="ri-eye-line"></i>';
    });

    // 2. Submit Login Form
    this.loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // 3. Logout / Lock
    this.logoutBtn?.addEventListener('click', () => {
      this.logout();
    });

    // 4. Open Change Password Modal
    this.changePasswordBtn?.addEventListener('click', () => {
      this.openChangePasswordModal();
    });

    // 5. Save New Password
    this.saveNewPasswordBtn?.addEventListener('click', () => {
      this.handleSaveNewPassword();
    });
  }

  async verifyExistingSession() {
    if (!this.token) {
      this.lockDashboard();
      return;
    }

    try {
      const res = await fetch('/api/admin-auth?action=verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ token: this.token })
      });

      const data = await res.json();
      if (data.authenticated) {
        this.unlockDashboard();
      } else {
        this.token = '';
        localStorage.removeItem('formcraft_admin_token');
        this.lockDashboard();
      }
    } catch {
      // Offline fallback: if token exists, unlock
      if (this.token) {
        this.unlockDashboard();
      } else {
        this.lockDashboard();
      }
    }
  }

  async handleLogin() {
    const password = this.passwordInput?.value?.trim();
    if (!password) {
      this.showAuthError('Please enter the administrator password.');
      return;
    }

    this.clearAuthError();
    const submitBtn = document.getElementById('btn-admin-login-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Verifying...';
    }

    try {
      const res = await fetch('/api/admin-auth?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'login' })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        this.token = data.token;
        localStorage.setItem('formcraft_admin_token', data.token);
        this.unlockDashboard();
        if (window.formCraftApp) {
          window.formCraftApp.showToast('Administrator authentication successful!', 'success');
        }
      } else {
        this.showAuthError(data.error || 'Invalid administrator password.');
        this.triggerCardShake();
      }
    } catch (err) {
      // Local fallback for quick offline dev
      if (password === 'admin123') {
        this.token = 'offline_admin_token_' + Date.now();
        localStorage.setItem('formcraft_admin_token', this.token);
        this.unlockDashboard();
      } else {
        this.showAuthError('Failed to verify password: ' + err.message);
        this.triggerCardShake();
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ri-lock-unlock-line"></i> Unlock Admin Dashboard';
      }
    }
  }

  showAuthError(msg) {
    if (this.authError && this.authErrorText) {
      this.authErrorText.textContent = msg;
      this.authError.classList.add('visible');
    }
  }

  clearAuthError() {
    if (this.authError) {
      this.authError.classList.remove('visible');
    }
  }

  triggerCardShake() {
    if (this.lockCard) {
      this.lockCard.classList.remove('shake-animation');
      void this.lockCard.offsetWidth; // force reflow
      this.lockCard.classList.add('shake-animation');
      setTimeout(() => {
        this.lockCard?.classList.remove('shake-animation');
      }, 500);
    }
  }

  unlockDashboard() {
    this.isAuthenticated = true;
    if (this.authGate) this.authGate.style.display = 'none';
    if (this.dashboardContent) this.dashboardContent.style.display = 'flex';
    this.render();
  }

  lockDashboard() {
    this.isAuthenticated = false;
    if (this.authGate) this.authGate.style.display = 'flex';
    if (this.dashboardContent) this.dashboardContent.style.display = 'none';
    if (this.passwordInput) {
      this.passwordInput.value = '';
      this.passwordInput.focus();
    }
    this.clearAuthError();
  }

  logout() {
    this.token = '';
    localStorage.removeItem('formcraft_admin_token');
    this.lockDashboard();
    if (window.formCraftApp) {
      window.formCraftApp.showToast('Administrator session locked.', 'info');
    }
  }

  openChangePasswordModal() {
    if (!this.changePasswordModal) return;
    if (this.currPasswordInput) this.currPasswordInput.value = '';
    if (this.newPasswordInput) this.newPasswordInput.value = '';
    if (this.confirmPasswordInput) this.confirmPasswordInput.value = '';
    if (this.changePasswordError) this.changePasswordError.classList.remove('visible');

    this.changePasswordModal.classList.add('show');
    setTimeout(() => this.currPasswordInput?.focus(), 100);
  }

  async handleSaveNewPassword() {
    const currentPassword = this.currPasswordInput?.value?.trim();
    const newPassword = this.newPasswordInput?.value?.trim();
    const confirmPassword = this.confirmPasswordInput?.value?.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      this.showChangePasswordError('All fields are required.');
      return;
    }

    if (newPassword.length < 6) {
      this.showChangePasswordError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.showChangePasswordError('New password and confirmation do not match.');
      return;
    }

    if (this.saveNewPasswordBtn) {
      this.saveNewPasswordBtn.disabled = true;
      this.saveNewPasswordBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Saving...';
    }

    try {
      const res = await fetch('/api/admin-auth?action=change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          action: 'change-password',
          token: this.token,
          currentPassword,
          newPassword
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.token) {
          this.token = data.token;
          localStorage.setItem('formcraft_admin_token', data.token);
        }
        this.changePasswordModal?.classList.remove('show');
        if (window.formCraftApp) {
          window.formCraftApp.showToast('Administrator password updated successfully!', 'success');
        }
      } else {
        this.showChangePasswordError(data.error || 'Failed to update password.');
      }
    } catch (err) {
      this.showChangePasswordError('Error saving password: ' + err.message);
    } finally {
      if (this.saveNewPasswordBtn) {
        this.saveNewPasswordBtn.disabled = false;
        this.saveNewPasswordBtn.innerHTML = '<i class="ri-check-line"></i> Save Password';
      }
    }
  }

  showChangePasswordError(msg) {
    if (this.changePasswordError && this.changePasswordErrorText) {
      this.changePasswordErrorText.textContent = msg;
      this.changePasswordError.classList.add('visible');
    }
  }

  bindEvents() {
    this.searchInput?.addEventListener('input', () => {
      this.renderTable();
    });

    this.statusTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.statusTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentFilter = tab.getAttribute('data-status') || 'all';
        this.renderTable();
      });
    });

    document.getElementById('btn-admin-new-form')?.addEventListener('click', () => {
      const newForm = store.createNewForm();
      document.querySelector('.nav-tab-btn[data-view="builder"]')?.click();
    });

    document.getElementById('btn-admin-templates')?.addEventListener('click', () => {
      document.querySelector('.nav-tab-btn[data-view="templates"]')?.click();
    });
  }

  render() {
    if (!this.isAuthenticated) return;
    const forms = store.forms || [];
    const submissions = store.submissions || [];

    // Calculate metrics
    let activeCount = 0;
    let closedCount = 0;

    forms.forEach(f => {
      const status = store.isFormOpen(f);
      if (status.isOpen) {
        activeCount++;
      } else {
        closedCount++;
      }
    });

    if (this.kpiTotalForms) this.kpiTotalForms.textContent = forms.length;
    if (this.kpiActiveForms) this.kpiActiveForms.textContent = activeCount;
    if (this.kpiClosedForms) this.kpiClosedForms.textContent = closedCount;
    if (this.kpiTotalResponses) this.kpiTotalResponses.textContent = submissions.length;

    this.renderTable();
  }

  renderTable() {
    if (!this.tableBody || !this.isAuthenticated) return;
    const forms = store.forms || [];
    const query = (this.searchInput?.value || '').toLowerCase().trim();

    let filtered = forms.filter(f => {
      const titleMatch = f.title.toLowerCase().includes(query) || (f.description || '').toLowerCase().includes(query) || f.id.toLowerCase().includes(query);
      if (!titleMatch) return false;

      const status = store.isFormOpen(f);
      if (this.currentFilter === 'active') return status.isOpen;
      if (this.currentFilter === 'closed') return !status.isOpen;
      return true;
    });

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">
            <i class="ri-search-line" style="font-size:2rem;color:var(--text-light);display:block;margin-bottom:6px;"></i>
            No forms found matching the current criteria.
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = '';
    const origin = window.location.origin;

    filtered.forEach(form => {
      const tr = document.createElement('tr');
      const formSubs = store.submissions.filter(s => s.formId === form.id);
      const openStatus = store.isFormOpen(form);
      const settings = form.settings || {};
      const uniqueUrl = `${origin}/f/${form.id}`;

      // Format End Time Deadline
      let deadlineHTML = `<span style="color:var(--text-light);font-size:0.8rem;">No deadline</span>`;
      if (settings.hasEndTime && settings.endDateTime) {
        const d = new Date(settings.endDateTime);
        const formatted = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        if (openStatus.isOpen) {
          deadlineHTML = `<span class="deadline-pulse-badge"><i class="ri-timer-line"></i> Closes: ${formatted}</span>`;
        } else {
          deadlineHTML = `<span class="badge-tag" style="background:rgba(239, 68, 68, 0.12);color:var(--danger);"><i class="ri-time-line"></i> Ended: ${formatted}</span>`;
        }
      }

      tr.innerHTML = `
        <td>
          <div style="font-weight:700;font-size:0.95rem;color:var(--text-main);margin-bottom:2px;">${form.title}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);display:flex;gap:6px;align-items:center;">
            <span>${(form.fields || []).length} fields</span>
            <span>•</span>
            <span class="badge-tag" style="padding:1px 6px;font-size:0.7rem;">${form.isMultiStep ? 'Multi-Step' : 'Single-Page'}</span>
          </div>
        </td>

        <td>
          <label class="switch" title="${settings.acceptingResponses ? 'Accepting responses' : 'Closed - Not accepting'}">
            <input type="checkbox" class="admin-toggle-responses" data-id="${form.id}" ${settings.acceptingResponses ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </td>

        <td>${deadlineHTML}</td>

        <td>
          <span class="badge-tag" style="background:rgba(99, 102, 241, 0.12);color:var(--primary);font-weight:700;">
            ${formSubs.length} responses
          </span>
        </td>

        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <code style="font-family:var(--font-mono);font-size:0.75rem;background:var(--bg-subtle);padding:3px 6px;border-radius:4px;color:var(--primary);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              /f/${form.id}
            </code>
            <button class="field-action-btn btn-admin-copy-url" data-url="${uniqueUrl}" title="Copy Unique Public URL">
              <i class="ri-file-copy-line"></i>
            </button>
            <a href="${uniqueUrl}" target="_blank" class="field-action-btn" title="Open Public Form in New Tab">
              <i class="ri-external-link-line"></i>
            </a>
          </div>
        </td>

        <td style="text-align:right;">
          <div style="display:inline-flex;gap:4px;">
            <button class="btn btn-outline btn-admin-edit" data-id="${form.id}" style="padding:4px 10px;font-size:0.78rem;" title="Edit in Studio">
              <i class="ri-edit-line"></i> Edit
            </button>
            <button class="btn btn-ghost btn-admin-analytics" data-id="${form.id}" style="padding:4px 8px;font-size:0.78rem;" title="View Responses">
              <i class="ri-bar-chart-line"></i>
            </button>
            <button class="btn btn-ghost btn-admin-duplicate" data-id="${form.id}" style="padding:4px 8px;font-size:0.78rem;" title="Duplicate Form">
              <i class="ri-file-copy-2-line"></i>
            </button>
            <button class="btn btn-ghost btn-admin-delete" data-id="${form.id}" style="padding:4px 8px;font-size:0.78rem;color:var(--danger);" title="Delete Form">
              <i class="ri-delete-bin-line"></i>
            </button>
          </div>
        </td>
      `;

      // Event handlers
      tr.querySelector('.admin-toggle-responses')?.addEventListener('change', (e) => {
        store.toggleAcceptingResponses(form.id, e.target.checked);
        if (window.formCraftApp) {
          window.formCraftApp.showToast(e.target.checked ? `"${form.title}" is now accepting responses!` : `"${form.title}" closed. Responses disabled.`, e.target.checked ? 'success' : 'info');
        }
      });

      tr.querySelector('.btn-admin-copy-url')?.addEventListener('click', () => {
        navigator.clipboard.writeText(uniqueUrl).then(() => {
          if (window.formCraftApp) window.formCraftApp.showToast('Unique Form URL copied to clipboard!', 'success');
        });
      });

      tr.querySelector('.btn-admin-edit')?.addEventListener('click', () => {
        store.setActiveForm(form.id);
        document.querySelector('.nav-tab-btn[data-view="builder"]')?.click();
      });

      tr.querySelector('.btn-admin-analytics')?.addEventListener('click', () => {
        store.setActiveForm(form.id);
        document.querySelector('.nav-tab-btn[data-view="analytics"]')?.click();
      });

      tr.querySelector('.btn-admin-duplicate')?.addEventListener('click', () => {
        const dup = store.duplicateForm(form.id);
        if (dup && window.formCraftApp) {
          window.formCraftApp.showToast(`Duplicated "${form.title}"!`, 'success');
        }
      });

      tr.querySelector('.btn-admin-delete')?.addEventListener('click', () => {
        if (confirm(`Are you sure you want to permanently delete "${form.title}"?`)) {
          store.deleteForm(form.id);
          if (window.formCraftApp) window.formCraftApp.showToast(`Deleted "${form.title}"`, 'info');
        }
      });

      this.tableBody.appendChild(tr);
    });
  }
}
