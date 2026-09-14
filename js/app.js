import { store } from './store.js';
import { DEFAULT_TEMPLATES } from './templates.js';
import { FormBuilder } from './builder.js';
import { FormRunner } from './runner.js';
import { FormAnalytics } from './analytics.js';
import { AdminManager } from './admin.js';

class App {
  constructor() {
    this.builder = null;
    this.runner = null;
    this.analytics = null;
    this.admin = null;

    this.init();
  }

  init() {
    this.setupTheme();
    this.setupNavigation();
    this.setupModals();
    this.setupTemplatesGallery();
    this.setupFormSwitcher();
    this.setupConfetti();

    // Initialize modules
    this.builder = new FormBuilder();
    this.runner = new FormRunner();
    this.analytics = new FormAnalytics();
    this.admin = new AdminManager();

    // Handle deep URL routes (/f/:id, /admin, ?f=)
    this.handleUrlRouting();

    // Listen to store updates
    store.subscribe((event) => {
      if (['activeFormChanged', 'formCreated', 'formImported', 'formUpdated'].includes(event)) {
        this.updateActiveFormLabel();
      }
      if (event === 'supabaseStatusUpdated') {
        this.updateSupabaseModalUI();
      }
    });

    this.updateActiveFormLabel();
    this.updateSupabaseModalUI();
  }

  handleUrlRouting() {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const formParam = searchParams.get('f') || searchParams.get('form');

    // 1. Direct form route (/f/:id or /form/:id or ?f=:id)
    let targetFormId = null;
    if (pathname.startsWith('/f/')) {
      targetFormId = pathname.substring(3).replace(/\/$/, '');
    } else if (pathname.startsWith('/form/')) {
      targetFormId = pathname.substring(6).replace(/\/$/, '');
    } else if (formParam) {
      targetFormId = formParam;
    }

    if (targetFormId) {
      const exists = store.forms.some(f => f.id === targetFormId);
      if (exists) {
        store.setActiveForm(targetFormId);
      }
      // Enable standalone respondent view (hides studio builder controls)
      document.body.classList.add('standalone-respondent-mode');
      document.querySelector('.nav-tab-btn[data-view="runner"]')?.click();
      return;
    }

    // 2. Admin route (/admin)
    if (pathname === '/admin' || pathname === '/admin/') {
      document.querySelector('.nav-tab-btn[data-view="admin"]')?.click();
    }
  }

  setupTheme() {
    const themeToggleBtn = document.getElementById('btn-theme-toggle');
    const savedTheme = localStorage.getItem('formcraft_dark_theme') || 'light';

    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (themeToggleBtn) themeToggleBtn.innerHTML = '<i class="ri-sun-line"></i>';
    }

    themeToggleBtn?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('formcraft_dark_theme', next);
      themeToggleBtn.innerHTML = next === 'dark' ? '<i class="ri-sun-line"></i>' : '<i class="ri-moon-line"></i>';
      this.showToast(`Switched to ${next} mode`, 'info');
    });
  }

  setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const viewName = tab.getAttribute('data-view');
        document.querySelectorAll('.view-panel').forEach(panel => {
          panel.classList.remove('active');
        });

        const targetPanel = document.getElementById(`view-${viewName}`);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }

        // Trigger refreshes on specific tabs
        if (viewName === 'runner' && this.runner) {
          this.runner.resetFormState();
          this.runner.render();
        } else if (viewName === 'analytics' && this.analytics) {
          this.analytics.render();
        } else if (viewName === 'builder' && this.builder) {
          this.builder.render();
        } else if (viewName === 'admin' && this.admin) {
          this.admin.render();
        }
      });
    });
  }

  setupFormSwitcher() {
    const switcherBtn = document.getElementById('active-form-selector-btn');
    const modal = document.getElementById('forms-manager-modal');
    const formsList = document.getElementById('forms-manager-list');

    switcherBtn?.addEventListener('click', () => {
      if (!formsList || !modal) return;
      formsList.innerHTML = '';

      store.forms.forEach(form => {
        const item = document.createElement('div');
        item.style.cssText = `
          display:flex;align-items:center;justify-content:space-between;padding:12px 16px;
          border-radius:var(--radius-md);border:1px solid var(--border-color);background:var(--bg-surface);
          cursor:pointer;transition:all var(--transition-normal);
        `;
        const isActive = form.id === store.activeFormId;
        if (isActive) {
          item.style.borderColor = 'var(--primary)';
          item.style.background = 'var(--primary-light)';
        }

        item.innerHTML = `
          <div>
            <div style="font-weight:700;font-size:0.92rem;color:var(--text-main);">${form.title}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${(form.fields || []).length} questions • ${form.isMultiStep ? 'Multi-Step' : 'Single-Page'}</div>
          </div>
          ${isActive ? '<span class="badge-tag">Current</span>' : ''}
        `;

        item.addEventListener('click', () => {
          store.setActiveForm(form.id);
          modal.classList.remove('show');
          this.showToast(`Switched to "${form.title}"`, 'info');
        });

        formsList.appendChild(item);
      });

      modal.classList.add('show');
    });

    document.getElementById('btn-create-blank-form')?.addEventListener('click', () => {
      const newForm = store.createNewForm();
      modal.classList.remove('show');
      this.showToast(`Created new form!`, 'success');
      document.querySelector('.nav-tab-btn[data-view="builder"]')?.click();
    });
  }

  updateActiveFormLabel() {
    const form = store.getActiveForm();
    const label = document.getElementById('active-form-name-label');
    if (label && form) {
      label.textContent = form.title || 'Untitled Form';
    }
  }

  setupModals() {
    // Share / Embed Modal
    const shareBtn = document.getElementById('btn-share-form');
    const shareModal = document.getElementById('share-modal');
    const shareUrlInput = document.getElementById('share-link-input');
    const embedCodeArea = document.getElementById('embed-code-area');

    shareBtn?.addEventListener('click', () => {
      const form = store.getActiveForm();
      if (!form || !shareModal) return;

      const shareUrl = `${window.location.origin}/f/${form.id}`;

      if (shareUrlInput) shareUrlInput.value = shareUrl;
      if (embedCodeArea) {
        embedCodeArea.value = `<iframe src="${shareUrl}" width="100%" height="700" frameborder="0" style="border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.1);"></iframe>`;
      }

      shareModal.classList.add('show');
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      if (shareUrlInput) {
        navigator.clipboard.writeText(shareUrlInput.value).then(() => {
          this.showToast('Shareable link copied to clipboard!', 'success');
        });
      }
    });

    document.getElementById('btn-copy-embed')?.addEventListener('click', () => {
      if (embedCodeArea) {
        navigator.clipboard.writeText(embedCodeArea.value).then(() => {
          this.showToast('Embed code copied!', 'success');
        });
      }
    });

    // Schema JSON Modal
    const schemaModal = document.getElementById('schema-modal');
    const schemaJsonArea = document.getElementById('schema-json-area');
    
    document.getElementById('btn-open-schema')?.addEventListener('click', () => {
      if (schemaJsonArea) {
        schemaJsonArea.value = store.exportFormJSON();
      }
      schemaModal?.classList.add('show');
    });

    document.getElementById('btn-import-schema')?.addEventListener('click', () => {
      if (!schemaJsonArea) return;
      const res = store.importFormJSON(schemaJsonArea.value);
      if (res.success) {
        schemaModal?.classList.remove('show');
        this.showToast('Form schema imported successfully!', 'success');
      } else {
        alert('Error parsing JSON: ' + res.error);
      }
    });

    // Supabase Cloud Integration Modal
    const supabaseBtn = document.getElementById('btn-supabase-modal');
    const supabaseModal = document.getElementById('supabase-modal');
    const supabaseSqlPreview = document.getElementById('supabase-sql-preview');
    const btnCopySql = document.getElementById('btn-copy-sql');
    const btnCheckSync = document.getElementById('btn-check-supabase-sync');

    // Preload SQL schema
    fetch('/supabase_schema.sql')
      .then(r => r.text())
      .then(sql => {
        if (supabaseSqlPreview) supabaseSqlPreview.value = sql;
      })
      .catch(() => {});

    supabaseBtn?.addEventListener('click', () => {
      supabaseModal?.classList.add('show');
      this.updateSupabaseModalUI();
    });

    btnCopySql?.addEventListener('click', () => {
      if (supabaseSqlPreview) {
        navigator.clipboard.writeText(supabaseSqlPreview.value).then(() => {
          this.showToast('SQL Schema copied to clipboard!', 'success');
        });
      }
    });

    btnCheckSync?.addEventListener('click', async () => {
      btnCheckSync.disabled = true;
      btnCheckSync.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Checking...';
      await store.initSupabase();
      btnCheckSync.disabled = false;
      btnCheckSync.innerHTML = '<i class="ri-refresh-line"></i> Test & Sync Now';
      this.updateSupabaseModalUI();
      if (store.supabaseStatus.tablesReady) {
        this.showToast('Connected & Cloud Sync Active!', 'success');
      } else {
        this.showToast('Connected to Supabase! Please run SQL in Dashboard.', 'info');
      }
    });

    // Generic modal closers
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('show');
      });
    });
  }

  updateSupabaseModalUI() {
    const badge = document.getElementById('supabase-modal-badge');
    const navLabel = document.getElementById('supabase-nav-label');
    const navIcon = document.getElementById('supabase-status-icon');
    const alertBox = document.getElementById('supabase-schema-alert');

    if (store.supabaseStatus?.connected) {
      if (store.supabaseStatus.tablesReady) {
        if (badge) {
          badge.textContent = 'Cloud Sync Active';
          badge.style.background = 'rgba(16, 185, 129, 0.15)';
          badge.style.color = 'var(--success)';
        }
        if (navLabel) navLabel.textContent = 'Cloud Synced';
        if (navIcon) navIcon.style.color = 'var(--success)';
        if (alertBox) {
          alertBox.style.background = 'rgba(16, 185, 129, 0.08)';
          alertBox.style.borderColor = 'rgba(16, 185, 129, 0.2)';
          alertBox.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--success);margin-bottom:4px;">
              <i class="ri-checkbox-circle-fill"></i>
              <span>PostgreSQL Tables Ready & Synced</span>
            </div>
            <p style="font-size:0.83rem;color:var(--text-muted);">
              Your forms and application responses are now stored in Supabase PostgreSQL in real-time.
            </p>
          `;
        }
      } else {
        if (badge) {
          badge.textContent = 'Setup Needed';
          badge.style.background = 'rgba(245, 158, 11, 0.15)';
          badge.style.color = 'var(--warning)';
        }
        if (navLabel) navLabel.textContent = 'Supabase Setup';
        if (navIcon) navIcon.style.color = 'var(--warning)';
      }
    }
  }

  setupTemplatesGallery() {
    const galleryGrid = document.getElementById('templates-grid');
    if (!galleryGrid) return;
    galleryGrid.innerHTML = '';

    DEFAULT_TEMPLATES.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'template-card';

      card.innerHTML = `
        <div class="template-banner" style="background: ${tpl.theme.bgGradient};">
          <span class="template-badge">${tpl.badge}</span>
        </div>
        <div class="template-card-content">
          <h3>${tpl.title}</h3>
          <p>${tpl.description}</p>
          <div class="template-card-footer">
            <span style="font-size:0.78rem;font-weight:700;color:var(--text-light);">${(tpl.fields || []).length} Fields</span>
            <button class="btn btn-primary btn-use-template" style="padding:6px 14px;font-size:0.8rem;">
              Use Template <i class="ri-arrow-right-line"></i>
            </button>
          </div>
        </div>
      `;

      card.querySelector('.btn-use-template')?.addEventListener('click', () => {
        const created = store.createNewForm(tpl);
        this.showToast(`Loaded "${tpl.title}"!`, 'success');
        document.querySelector('.nav-tab-btn[data-view="builder"]')?.click();
      });

      galleryGrid.appendChild(card);
    });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'ri-checkbox-circle-fill' : type === 'error' ? 'ri-error-warning-fill' : 'ri-information-fill';

    toast.innerHTML = `
      <i class="${icon}"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  setupConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId = null;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    window.triggerConfetti = () => {
      particles = [];
      const colors = ['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#fbbf24'];

      for (let i = 0; i < 140; i++) {
        particles.push({
          x: canvas.width / 2,
          y: canvas.height * 0.4,
          vx: (Math.random() - 0.5) * 22,
          vy: (Math.random() - 0.8) * 20,
          size: Math.random() * 8 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 12,
          gravity: 0.35,
          drag: 0.96,
          opacity: 1
        });
      }

      if (animationId) cancelAnimationFrame(animationId);

      const update = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;

        particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.vx *= p.drag;
          p.vy *= p.drag;
          p.rotation += p.rotationSpeed;
          p.opacity -= 0.007;

          if (p.opacity > 0 && p.y < canvas.height) {
            alive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.opacity);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
          }
        });

        if (alive) {
          animationId = requestAnimationFrame(update);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      };

      animationId = requestAnimationFrame(update);
    };
  }
}

// Bootstrap once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.formCraftApp = new App();
});
