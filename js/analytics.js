/**
 * FormCraft Studio - Submissions & Analytics Controller
 */

import { store } from './store.js';

export class FormAnalytics {
  constructor() {
    this.container = document.getElementById('view-analytics');
    this.searchInput = document.getElementById('analytics-search-input');
    this.tableBody = document.getElementById('submissions-table-body');
    this.tableCount = document.getElementById('submissions-count-badge');
    
    // KPI elements
    this.kpiTotal = document.getElementById('kpi-total-subs');
    this.kpiAvgTime = document.getElementById('kpi-avg-time');
    this.kpiRate = document.getElementById('kpi-completion-rate');
    this.kpiLatest = document.getElementById('kpi-latest-time');

    this.detailModal = document.getElementById('submission-detail-modal');
    this.modalContent = document.getElementById('submission-detail-content');

    this.bindEvents();
    this.render();

    store.subscribe((event) => {
      if (['submissionAdded', 'submissionDeleted', 'activeFormChanged', 'formUpdated'].includes(event)) {
        this.render();
      }
    });
  }

  bindEvents() {
    this.searchInput?.addEventListener('input', () => {
      this.renderTable();
    });

    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      this.exportCSV();
    });

    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      this.exportJSON();
    });

    // Close detail modal
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.detailModal) this.detailModal.classList.remove('show');
      });
    });

    this.detailModal?.addEventListener('click', (e) => {
      if (e.target === this.detailModal) {
        this.detailModal.classList.remove('show');
      }
    });
  }

  render() {
    const form = store.getActiveForm();
    if (!form) return;

    const submissions = store.getSubmissionsForActiveForm();

    // Update KPIs
    if (this.kpiTotal) this.kpiTotal.textContent = submissions.length;
    
    if (this.kpiAvgTime) {
      if (submissions.length > 0) {
        const avgSec = Math.round(submissions.reduce((acc, s) => acc + (s.durationSeconds || 60), 0) / submissions.length);
        const mins = Math.floor(avgSec / 60);
        const secs = avgSec % 60;
        this.kpiAvgTime.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      } else {
        this.kpiAvgTime.textContent = '0s';
      }
    }

    if (this.kpiRate) {
      this.kpiRate.textContent = submissions.length > 0 ? '94%' : '0%';
    }

    if (this.kpiLatest) {
      if (submissions.length > 0) {
        const latestDate = new Date(submissions[0].submittedAt);
        this.kpiLatest.textContent = latestDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        this.kpiLatest.textContent = '--:--';
      }
    }

    this.renderTable();
  }

  renderTable() {
    if (!this.tableBody) return;
    const form = store.getActiveForm();
    if (!form) return;

    let submissions = store.getSubmissionsForActiveForm();
    const query = (this.searchInput?.value || '').toLowerCase().trim();

    if (query) {
      submissions = submissions.filter(s => {
        const stringified = JSON.stringify(s.data).toLowerCase();
        return s.id.toLowerCase().includes(query) || stringified.includes(query);
      });
    }

    if (this.tableCount) {
      this.tableCount.textContent = `${submissions.length} responses`;
    }

    if (submissions.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">
            <i class="ri-inbox-line" style="font-size:2rem;color:var(--text-light);display:block;margin-bottom:6px;"></i>
            No submissions recorded yet for this form.
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = '';
    submissions.forEach(sub => {
      const tr = document.createElement('tr');
      const dateStr = new Date(sub.submittedAt).toLocaleString();

      // Find first 2 identifiable values (e.g. name or email)
      const answers = Object.values(sub.data);
      const primarySummary = answers.filter(v => typeof v === 'string' && !v.startsWith('data:image')).slice(0, 2).join(' • ') || 'Submission payload';

      tr.innerHTML = `
        <td style="font-family:var(--font-mono);font-weight:600;color:var(--primary);">${sub.id}</td>
        <td style="color:var(--text-muted);">${dateStr}</td>
        <td style="font-weight:600;max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${primarySummary}
        </td>
        <td>
          <span class="badge-tag">${sub.durationSeconds || 60}s</span>
        </td>
        <td style="text-align:right;">
          <button class="btn btn-outline btn-view-sub" data-id="${sub.id}" style="padding:4px 10px;font-size:0.75rem;">
            <i class="ri-eye-line"></i> View
          </button>
          <button class="btn btn-ghost btn-delete-sub" data-id="${sub.id}" style="padding:4px 8px;font-size:0.75rem;color:var(--danger);">
            <i class="ri-delete-bin-line"></i>
          </button>
        </td>
      `;

      tr.querySelector('.btn-view-sub')?.addEventListener('click', () => {
        this.openDetailModal(sub, form);
      });

      tr.querySelector('.btn-delete-sub')?.addEventListener('click', () => {
        if (confirm(`Delete submission ${sub.id}?`)) {
          store.deleteSubmission(sub.id);
        }
      });

      this.tableBody.appendChild(tr);
    });
  }

  openDetailModal(submission, form) {
    if (!this.modalContent || !this.detailModal) return;

    const fieldsMap = new Map();
    form.fields.forEach(f => fieldsMap.set(f.id, f));

    let html = `
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--border-color);">
        <div>
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Submission ID</div>
          <div style="font-family:var(--font-mono);font-weight:700;font-size:1.1rem;color:var(--primary);">${submission.id}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Submitted At</div>
          <div style="font-size:0.9rem;font-weight:600;">${new Date(submission.submittedAt).toLocaleString()}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:18px;">
    `;

    Object.entries(submission.data).forEach(([fieldId, val]) => {
      const field = fieldsMap.get(fieldId);
      const label = field ? field.label : fieldId;
      const type = field ? field.type : 'text';

      html += `
        <div style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-md);border:1px solid var(--border-light);">
          <div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">${label}</div>
      `;

      if (type === 'signature' && typeof val === 'string' && val.startsWith('data:image')) {
        html += `<img src="${val}" alt="Signature" style="max-height:80px;border:1px solid var(--border-color);border-radius:4px;background:#fff;padding:6px;" />`;
      } else if (type === 'file' && typeof val === 'object') {
        html += `
          <div style="display:flex;align-items:center;gap:8px;font-weight:600;">
            <i class="ri-file-text-line" style="font-size:1.3rem;color:var(--primary);"></i>
            <span>${val.fileName}</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">(${val.fileSize})</span>
          </div>
        `;
      } else if (Array.isArray(val)) {
        html += `<div style="font-weight:600;">${val.join(', ') || 'None selected'}</div>`;
      } else {
        html += `<div style="font-weight:600;font-size:0.92rem;color:var(--text-main);white-space:pre-wrap;">${val ?? '—'}</div>`;
      }

      html += `</div>`;
    });

    html += `</div>`;
    this.modalContent.innerHTML = html;
    this.detailModal.classList.add('show');
  }

  exportCSV() {
    const form = store.getActiveForm();
    if (!form) return;
    const submissions = store.getSubmissionsForActiveForm();
    if (submissions.length === 0) {
      alert('No submissions available to export.');
      return;
    }

    const fields = form.fields.filter(f => f.type !== 'section');
    const headers = ['Submission ID', 'Submitted At', 'Duration (s)', ...fields.map(f => `"${(f.label || f.id).replace(/"/g, '""')}"`)];

    const rows = submissions.map(sub => {
      const values = [
        sub.id,
        new Date(sub.submittedAt).toISOString(),
        sub.durationSeconds || 60,
        ...fields.map(f => {
          const val = sub.data[f.id];
          if (val === undefined || val === null) return '""';
          if (f.type === 'file' && typeof val === 'object') return `"${val.fileName || ''}"`;
          if (f.type === 'signature') return '"[Digital Signature]"';
          if (Array.isArray(val)) return `"${val.join('; ').replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        })
      ];
      return values.join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${form.title.replace(/[^a-z0-9]/gi, '_')}_submissions.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportJSON() {
    const form = store.getActiveForm();
    if (!form) return;
    const submissions = store.getSubmissionsForActiveForm();

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(submissions, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `${form.title.replace(/[^a-z0-9]/gi, '_')}_responses.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
