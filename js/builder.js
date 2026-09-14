/**
 * FormCraft Studio - Form Builder & Visual Studio Controller
 */

import { store } from './store.js';
import { FIELD_DEFINITIONS } from './templates.js';

export class FormBuilder {
  constructor() {
    this.canvasFieldsContainer = document.getElementById('canvas-fields');
    this.formTitleInput = document.getElementById('form-title-input');
    this.formDescInput = document.getElementById('form-desc-input');
    this.stepNavContainer = document.getElementById('studio-step-nav');
    this.canvasStepBar = document.getElementById('canvas-step-bar');
    this.paletteContainer = document.getElementById('field-palette-items');
    
    // Inspector elements
    this.fieldInspectorPane = document.getElementById('inspector-field-pane');
    this.themeInspectorPane = document.getElementById('inspector-theme-pane');
    this.settingsInspectorPane = document.getElementById('inspector-settings-pane');
    this.activeInspectorPane = 'inspector-field-pane';

    this.initPalette();
    this.bindEvents();
    this.render();

    // Listen to store changes
    store.subscribe((event) => {
      if (['activeFormChanged', 'formCreated', 'formImported', 'formUpdated', 'fieldAdded', 'fieldUpdated', 'fieldDuplicated', 'fieldDeleted', 'fieldsReordered', 'stepAdded', 'stepDeleted', 'themeUpdated'].includes(event)) {
        this.render();
      }
    });
  }

  initPalette() {
    if (!this.paletteContainer) return;
    this.paletteContainer.innerHTML = '';
    
    FIELD_DEFINITIONS.forEach(def => {
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.setAttribute('data-type', def.type);
      item.innerHTML = `
        <i class="${def.icon}"></i>
        <span>${def.label}</span>
      `;
      item.addEventListener('click', () => {
        const activeForm = store.getActiveForm();
        const stepId = activeForm?.steps?.[store.activeStepIndex]?.id || null;
        store.addField(def.type, stepId);
      });
      this.paletteContainer.appendChild(item);
    });
  }

  bindEvents() {
    // Form title & description
    this.formTitleInput?.addEventListener('input', (e) => {
      store.updateFormMeta({ title: e.target.value });
    });

    this.formDescInput?.addEventListener('input', (e) => {
      store.updateFormMeta({ description: e.target.value });
    });

    // Inspector tab switching
    document.querySelectorAll('.inspector-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-pane');
        this.activeInspectorPane = targetId;
        document.querySelectorAll('.inspector-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.inspector-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetId)?.classList.add('active');
      });
    });

    // Add Step button
    document.getElementById('btn-add-step')?.addEventListener('click', () => {
      store.addStep();
    });

    // Multi-step toggle
    document.getElementById('toggle-multi-step')?.addEventListener('change', (e) => {
      const form = store.getActiveForm();
      if (!form) return;
      if (e.target.checked && (!form.steps || form.steps.length === 0)) {
        store.addStep();
      } else if (!e.target.checked && form.steps && form.steps.length > 1) {
        if (confirm('Convert to single-page form? All fields will be merged into one step.')) {
          const primaryStepId = form.steps[0].id;
          form.fields.forEach(f => { f.stepId = primaryStepId; });
          form.steps = [form.steps[0]];
          form.isMultiStep = false;
          store.activeStepIndex = 0;
          store.notify('formUpdated', form);
        } else {
          e.target.checked = true;
        }
      } else {
        form.isMultiStep = e.target.checked;
        store.notify('formUpdated', form);
      }
    });

    // Color Swatches
    document.querySelectorAll('.color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const color = btn.getAttribute('data-color');
        store.updateTheme({ accentColor: color });
      });
    });

    // Font family change
    document.getElementById('theme-font-select')?.addEventListener('change', (e) => {
      store.updateTheme({ fontFamily: e.target.value });
    });

    // Border radius change
    document.getElementById('theme-radius-select')?.addEventListener('change', (e) => {
      store.updateTheme({ borderRadius: e.target.value });
    });
  }

  render() {
    const form = store.getActiveForm();
    if (!form) return;

    // Header inputs
    if (this.formTitleInput && document.activeElement !== this.formTitleInput) {
      this.formTitleInput.value = form.title || '';
    }
    if (this.formDescInput && document.activeElement !== this.formDescInput) {
      this.formDescInput.value = form.description || '';
    }

    // Step toggle checkbox state
    const multiStepToggle = document.getElementById('toggle-multi-step');
    if (multiStepToggle) {
      multiStepToggle.checked = !!form.isMultiStep;
    }

    // Render Steps in left sidebar
    this.renderStepNav(form);

    // Render step bar on canvas
    this.renderCanvasStepBar(form);

    // Render Fields on canvas
    this.renderCanvasFields(form);

    // Render Inspector
    this.renderInspector(form);
    this.renderSettingsPane(form);

    // Maintain active inspector tab pane
    document.querySelectorAll('.inspector-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-pane') === this.activeInspectorPane);
    });
    document.querySelectorAll('.inspector-pane').forEach(p => {
      p.classList.toggle('active', p.id === this.activeInspectorPane);
    });

    // Update canvas banner color
    const banner = document.querySelector('.canvas-header-banner');
    if (banner && form.theme?.accentColor) {
      banner.style.background = `linear-gradient(90deg, ${form.theme.accentColor}, #8b5cf6, #ec4899)`;
    }
  }

  renderStepNav(form) {
    if (!this.stepNavContainer) return;
    this.stepNavContainer.innerHTML = '';

    const isMulti = form.isMultiStep && form.steps && form.steps.length > 0;
    const steps = isMulti ? form.steps : [{ id: 'single', title: 'All Questions' }];

    steps.forEach((step, idx) => {
      const item = document.createElement('div');
      item.className = `step-nav-item ${idx === store.activeStepIndex ? 'active' : ''}`;
      item.innerHTML = `
        <div style="display:flex;align-items:center;overflow:hidden;">
          <div class="step-badge">${idx + 1}</div>
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${step.title || 'Step ' + (idx + 1)}</span>
        </div>
        ${isMulti && steps.length > 1 ? `<button class="field-action-btn btn-delete-step" title="Delete Step"><i class="ri-close-line"></i></button>` : ''}
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-step')) {
          e.stopPropagation();
          if (confirm(`Delete "${step.title}" and shift questions?`)) {
            store.deleteStep(idx);
          }
          return;
        }
        store.activeStepIndex = idx;
        this.render();
      });

      this.stepNavContainer.appendChild(item);
    });
  }

  renderCanvasStepBar(form) {
    if (!this.canvasStepBar) return;
    if (!form.isMultiStep || !form.steps || form.steps.length <= 1) {
      this.canvasStepBar.style.display = 'none';
      return;
    }

    this.canvasStepBar.style.display = 'flex';
    const currentStep = form.steps[store.activeStepIndex] || form.steps[0];

    this.canvasStepBar.innerHTML = `
      <div class="step-info-badge">
        <i class="ri-folder-open-line"></i>
        <span>Step ${store.activeStepIndex + 1} of ${form.steps.length}: ${currentStep.title}</span>
      </div>
      <div class="step-pagination-dots">
        ${form.steps.map((_, i) => `<div class="step-dot ${i === store.activeStepIndex ? 'active' : ''}" data-index="${i}"></div>`).join('')}
      </div>
    `;

    this.canvasStepBar.querySelectorAll('.step-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        store.activeStepIndex = parseInt(dot.getAttribute('data-index'), 10);
        this.render();
      });
    });
  }

  renderCanvasFields(form) {
    if (!this.canvasFieldsContainer) return;
    this.canvasFieldsContainer.innerHTML = '';

    // Filter fields belonging to current step if multi-step
    let visibleFields = form.fields;
    if (form.isMultiStep && form.steps && form.steps[store.activeStepIndex]) {
      const activeStepId = form.steps[store.activeStepIndex].id;
      visibleFields = form.fields.filter(f => !f.stepId || f.stepId === activeStepId);
    }

    if (!visibleFields || visibleFields.length === 0) {
      this.canvasFieldsContainer.innerHTML = `
        <div class="empty-canvas-prompt">
          <i class="ri-drag-drop-line"></i>
          <h4 style="font-weight:700;margin-bottom:6px;">This section has no fields yet</h4>
          <p style="font-size:0.85rem;">Click on any field type in the left palette to add questions to this section.</p>
        </div>
      `;
      return;
    }

    visibleFields.forEach((field, index) => {
      const fieldCard = document.createElement('div');
      fieldCard.className = `canvas-field-item ${field.id === store.selectedFieldId ? 'selected' : ''}`;
      fieldCard.setAttribute('data-id', field.id);

      fieldCard.innerHTML = `
        <div class="field-drag-handle"><i class="ri-more-fill"></i></div>
        
        <div class="field-actions-toolbar">
          <button class="field-action-btn btn-move-up" title="Move Up" ${index === 0 ? 'disabled style="opacity:0.3"' : ''}><i class="ri-arrow-up-s-line"></i></button>
          <button class="field-action-btn btn-move-down" title="Move Down" ${index === visibleFields.length - 1 ? 'disabled style="opacity:0.3"' : ''}><i class="ri-arrow-down-s-line"></i></button>
          <button class="field-action-btn btn-duplicate" title="Duplicate"><i class="ri-file-copy-line"></i></button>
          <button class="field-action-btn btn-delete" title="Delete"><i class="ri-delete-bin-line"></i></button>
        </div>

        <div class="field-label-container">
          <span class="field-label-text">${field.label || 'Untitled Question'}</span>
          ${field.required ? '<span class="required-asterisk">*</span>' : ''}
        </div>

        ${field.helpText ? `<div class="field-help-text">${field.helpText}</div>` : ''}

        <div class="field-preview-slot">
          ${this.getFieldPreviewHTML(field)}
        </div>
      `;

      // Select field on card click
      fieldCard.addEventListener('click', (e) => {
        if (e.target.closest('.field-action-btn')) return;
        store.selectedFieldId = field.id;
        this.render();
      });

      // Actions
      fieldCard.querySelector('.btn-move-up')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.moveField(field.id, -1);
      });
      fieldCard.querySelector('.btn-move-down')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.moveField(field.id, 1);
      });
      fieldCard.querySelector('.btn-duplicate')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.duplicateField(field.id);
      });
      fieldCard.querySelector('.btn-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.deleteField(field.id);
      });

      this.canvasFieldsContainer.appendChild(fieldCard);
    });
  }

  getFieldPreviewHTML(field) {
    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'url':
      case 'number':
        return `<input type="text" class="field-input-mock" placeholder="${field.placeholder || 'Your response...'}" readonly />`;
      
      case 'date':
        return `<input type="text" class="field-input-mock" placeholder="YYYY-MM-DD" readonly />`;

      case 'textarea':
        return `<textarea class="field-input-mock textarea-mock" placeholder="${field.placeholder || 'Type long answer here...'}" readonly></textarea>`;

      case 'select':
        return `
          <select class="field-input-mock" disabled>
            <option>Select an option...</option>
            ${(field.options || []).map(opt => `<option>${opt}</option>`).join('')}
          </select>
        `;

      case 'radio':
        return `
          <div class="options-preview-list">
            ${(field.options || ['Option 1', 'Option 2']).map(opt => `
              <div class="option-preview-row">
                <div class="mock-radio-dot"></div>
                <span>${opt}</span>
              </div>
            `).join('')}
          </div>
        `;

      case 'checkbox':
        return `
          <div class="options-preview-list">
            ${(field.options || ['Option 1', 'Option 2']).map(opt => `
              <div class="option-preview-row">
                <div class="mock-check-box"></div>
                <span>${opt}</span>
              </div>
            `).join('')}
          </div>
        `;

      case 'rating':
        return `
          <div class="mock-stars-row">
            ${'<i class="ri-star-fill"></i>'.repeat(field.max || 5)}
          </div>
        `;

      case 'scale':
        return `
          <div class="mock-scale-row">
            ${Array.from({ length: 11 }, (_, i) => `<div class="mock-scale-item">${i}</div>`).join('')}
          </div>
        `;

      case 'file':
        return `
          <div class="mock-upload-box">
            <i class="ri-upload-cloud-2-line"></i>
            <span style="font-weight:600;font-size:0.85rem;">Click or drag documents to upload</span>
            <span style="font-size:0.75rem;">PDF, DOCX, PNG (Up to 15MB)</span>
          </div>
        `;

      case 'signature':
        return `
          <div class="mock-signature-pad">
            <i class="ri-quill-pen-line"></i>
            <span>Interactive Signature Pad</span>
          </div>
        `;

      case 'section':
        return `<div style="border-top:2px solid var(--border-color);margin:8px 0;"></div>`;

      default:
        return `<input type="text" class="field-input-mock" placeholder="Input field" readonly />`;
    }
  }

  renderInspector(form) {
    if (!this.fieldInspectorPane) return;

    const selectedField = form.fields.find(f => f.id === store.selectedFieldId);

    if (!selectedField) {
      this.fieldInspectorPane.innerHTML = `
        <div style="text-align:center;padding:40px 10px;color:var(--text-muted);">
          <i class="ri-cursor-line" style="font-size:2rem;color:var(--primary);margin-bottom:8px;display:block;"></i>
          <p style="font-weight:600;">No Question Selected</p>
          <p style="font-size:0.8rem;margin-top:4px;">Click any question on the canvas to configure its properties.</p>
        </div>
      `;
      return;
    }

    const hasOptions = ['select', 'radio', 'checkbox'].includes(selectedField.type);

    this.fieldInspectorPane.innerHTML = `
      <div class="form-group">
        <label>Field Type</label>
        <select id="insp-type-select" class="form-control">
          ${FIELD_DEFINITIONS.map(d => `<option value="${d.type}" ${d.type === selectedField.type ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Question Label</label>
        <input type="text" id="insp-label" class="form-control" value="${selectedField.label || ''}" placeholder="Enter question..." />
      </div>

      <div class="form-group">
        <label>Help Text / Subtitle</label>
        <input type="text" id="insp-help" class="form-control" value="${selectedField.helpText || ''}" placeholder="Instructions for respondent..." />
      </div>

      ${!['rating', 'scale', 'signature', 'file', 'section'].includes(selectedField.type) ? `
        <div class="form-group">
          <label>Placeholder</label>
          <input type="text" id="insp-placeholder" class="form-control" value="${selectedField.placeholder || ''}" placeholder="e.g. Type here..." />
        </div>
      ` : ''}

      <div class="toggle-switch-row">
        <span class="toggle-label">Required Field</span>
        <label class="switch">
          <input type="checkbox" id="insp-required" ${selectedField.required ? 'checked' : ''} />
          <span class="slider"></span>
        </label>
      </div>

      ${hasOptions ? `
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <label style="margin:0;">Choices / Options</label>
            <button class="btn btn-outline" id="btn-add-option" style="padding:2px 8px;font-size:0.75rem;">+ Add</button>
          </div>
          <div class="options-editor-list" id="options-editor-list">
            ${(selectedField.options || []).map((opt, i) => `
              <div class="option-edit-row">
                <input type="text" class="form-control insp-option-input" data-index="${i}" value="${opt}" />
                <button class="field-action-btn btn-delete insp-remove-opt" data-index="${i}"><i class="ri-close-line"></i></button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-color);display:flex;gap:8px;">
        <button class="btn btn-outline" id="btn-insp-duplicate" style="flex:1;"><i class="ri-file-copy-line"></i> Duplicate</button>
        <button class="btn btn-danger" id="btn-insp-delete" style="flex:1;"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    `;

    // Bind Inspector input events
    document.getElementById('insp-type-select')?.addEventListener('change', (e) => {
      const newType = e.target.value;
      const updates = { type: newType };
      if (['select', 'radio', 'checkbox'].includes(newType) && !selectedField.options) {
        updates.options = ['Option 1', 'Option 2', 'Option 3'];
      }
      store.updateField(selectedField.id, updates);
    });

    document.getElementById('insp-label')?.addEventListener('input', (e) => {
      store.updateField(selectedField.id, { label: e.target.value });
    });

    document.getElementById('insp-help')?.addEventListener('input', (e) => {
      store.updateField(selectedField.id, { helpText: e.target.value });
    });

    document.getElementById('insp-placeholder')?.addEventListener('input', (e) => {
      store.updateField(selectedField.id, { placeholder: e.target.value });
    });

    document.getElementById('insp-required')?.addEventListener('change', (e) => {
      store.updateField(selectedField.id, { required: e.target.checked });
    });

    // Options management
    document.getElementById('btn-add-option')?.addEventListener('click', () => {
      const opts = [...(selectedField.options || [])];
      opts.push(`Option ${opts.length + 1}`);
      store.updateField(selectedField.id, { options: opts });
    });

    document.querySelectorAll('.insp-option-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        const opts = [...(selectedField.options || [])];
        opts[idx] = e.target.value;
        store.updateField(selectedField.id, { options: opts });
      });
    });

    document.querySelectorAll('.insp-remove-opt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const opts = [...(selectedField.options || [])];
        if (opts.length > 1) {
          opts.splice(idx, 1);
          store.updateField(selectedField.id, { options: opts });
        }
      });
    });

    // Inspector action buttons
    document.getElementById('btn-insp-duplicate')?.addEventListener('click', () => {
      store.duplicateField(selectedField.id);
    });

    document.getElementById('btn-insp-delete')?.addEventListener('click', () => {
      store.deleteField(selectedField.id);
    });
  }

  renderSettingsPane(form) {
    const pane = document.getElementById('inspector-settings-pane');
    if (!pane) return;

    // If user is actively typing in the datetime input or textarea, don't overwrite DOM
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.id === 'insp-end-datetime' || activeEl.id === 'insp-closed-msg')) {
      return;
    }

    const settings = form.settings || {};
    const uniqueUrl = `${window.location.origin}/f/${form.id}`;

    // Format ISO string to datetime-local input value (YYYY-MM-DDTHH:MM)
    let localDatetimeVal = '';
    if (settings.endDateTime) {
      const d = new Date(settings.endDateTime);
      if (!isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        localDatetimeVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }

    pane.innerHTML = `
      <!-- Unique Public Link Card -->
      <div style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-md);border:1px solid var(--border-light);display:flex;flex-direction:column;gap:8px;">
        <label style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Unique Public URL</label>
        <code style="font-family:var(--font-mono);font-size:0.8rem;color:var(--primary);word-break:break-all;">${uniqueUrl}</code>
        <div style="display:flex;gap:6px;margin-top:4px;">
          <button type="button" class="btn btn-primary" id="btn-insp-copy-url" style="flex:1;padding:5px 10px;font-size:0.78rem;">
            <i class="ri-file-copy-line"></i> Copy Link
          </button>
          <a href="${uniqueUrl}" target="_blank" class="btn btn-outline" style="padding:5px 10px;font-size:0.78rem;" title="Test Public Link">
            <i class="ri-external-link-line"></i> Open
          </a>
        </div>
      </div>

      <!-- Google Forms Style: Accepting Responses Toggle -->
      <div class="toggle-switch-row" style="padding:10px 0;border-bottom:1px solid var(--border-light);">
        <div>
          <div class="toggle-label">Accepting Responses</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">Master switch to open or close form</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="insp-accepting-toggle" ${settings.acceptingResponses ? 'checked' : ''} />
          <span class="slider"></span>
        </label>
      </div>

      <!-- Google Forms Style: End Time / Deadline -->
      <div class="toggle-switch-row" style="padding:10px 0;">
        <div>
          <div class="toggle-label">Form End Time / Deadline</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">Automatically close at a specific time</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="insp-endtime-toggle" ${settings.hasEndTime ? 'checked' : ''} />
          <span class="slider"></span>
        </label>
      </div>

      <div id="insp-endtime-container" style="display:${settings.hasEndTime ? 'flex' : 'none'};flex-direction:column;gap:6px;background:var(--bg-subtle);padding:12px;border-radius:var(--radius-md);border:1px solid var(--border-light);">
        <label style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">End Date & Time</label>
        <input type="datetime-local" id="insp-end-datetime" class="form-control" value="${localDatetimeVal}" />
        <span style="font-size:0.73rem;color:var(--text-muted);">Submissions will be rejected once this deadline passes.</span>
      </div>

      <!-- Custom Closed Message -->
      <div class="form-group" style="margin-top:10px;">
        <label>Closed Form Message</label>
        <textarea id="insp-closed-msg" class="form-control" rows="3" placeholder="Message shown to respondents when closed...">${settings.closedMessage || ''}</textarea>
      </div>
    `;

    // Bind Settings Events
    document.getElementById('btn-insp-copy-url')?.addEventListener('click', () => {
      navigator.clipboard.writeText(uniqueUrl).then(() => {
        if (window.formCraftApp) window.formCraftApp.showToast('Copied unique link to clipboard!', 'success');
      });
    });

    document.getElementById('insp-accepting-toggle')?.addEventListener('change', (e) => {
      store.updateFormSettings(form.id, { acceptingResponses: e.target.checked });
      if (window.formCraftApp) {
        window.formCraftApp.showToast(e.target.checked ? 'Form is now accepting responses' : 'Form closed to new responses', e.target.checked ? 'success' : 'info');
      }
    });

    const endTimeToggle = document.getElementById('insp-endtime-toggle');
    const endTimeContainer = document.getElementById('insp-endtime-container');
    endTimeToggle?.addEventListener('change', (e) => {
      endTimeContainer.style.display = e.target.checked ? 'flex' : 'none';
      store.updateFormSettings(form.id, { hasEndTime: e.target.checked });
    });

    document.getElementById('insp-end-datetime')?.addEventListener('change', (e) => {
      const isoVal = e.target.value ? new Date(e.target.value).toISOString() : null;
      store.updateFormSettings(form.id, { endDateTime: isoVal });
    });

    document.getElementById('insp-closed-msg')?.addEventListener('input', (e) => {
      store.updateFormSettings(form.id, { closedMessage: e.target.value });
    });
  }
}

