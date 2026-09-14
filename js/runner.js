/**
 * FormCraft Studio - Live Form Runner & Interactive Preview
 */

import { store } from './store.js';

export class FormRunner {
  constructor() {
    this.runnerStage = document.getElementById('runner-stage');
    this.runnerCard = document.getElementById('runner-card');
    this.runnerFieldsForm = document.getElementById('runner-fields-form');
    this.runnerHeader = document.getElementById('runner-header');
    this.runnerProgress = document.getElementById('runner-progress');
    this.runnerFooter = document.getElementById('runner-footer');
    this.successView = document.getElementById('submission-success-view');

    this.currentStepIndex = 0;
    this.formData = {};
    this.signaturePads = new Map();
    this.startTime = Date.now();

    this.initDeviceSwitcher();
    this.render();

    store.subscribe((event) => {
      if (['activeFormChanged', 'formUpdated', 'fieldAdded', 'fieldUpdated', 'fieldDeleted', 'themeUpdated'].includes(event)) {
        this.render();
      }
    });
  }

  initDeviceSwitcher() {
    document.querySelectorAll('.device-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const device = btn.getAttribute('data-device');
        
        if (this.runnerCard) {
          this.runnerCard.className = 'runner-card';
          if (device === 'tablet') {
            this.runnerCard.classList.add('device-tablet');
          } else if (device === 'mobile') {
            this.runnerCard.classList.add('device-mobile');
          }
        }
      });
    });
  }

  resetFormState() {
    this.currentStepIndex = 0;
    this.formData = {};
    this.startTime = Date.now();
    this.signaturePads.clear();
    if (this.successView) this.successView.classList.remove('show');
    if (this.runnerFieldsForm) this.runnerFieldsForm.style.display = 'flex';
    if (this.runnerFooter) this.runnerFooter.style.display = 'flex';
    if (this.runnerProgress) this.runnerProgress.style.display = 'block';
  }

  render() {
    const form = store.getActiveForm();
    if (!form) return;

    // Check if form is accepting responses / deadline
    const accessStatus = store.isFormOpen(form);

    // Apply theme styling
    if (this.runnerStage && form.theme) {
      if (form.theme.bgGradient) {
        this.runnerStage.style.background = form.theme.bgGradient;
      }
      if (form.theme.accentColor) {
        this.runnerStage.style.setProperty('--runner-accent', form.theme.accentColor);
      }
      if (form.theme.borderRadius) {
        this.runnerCard.style.borderRadius = form.theme.borderRadius;
      }
      if (form.theme.fontFamily) {
        this.runnerCard.style.fontFamily = form.theme.fontFamily;
      }
    }

    // Google Forms Style Closed Screen Check
    if (!accessStatus.isOpen) {
      if (this.runnerProgress) this.runnerProgress.style.display = 'none';
      if (this.runnerFooter) this.runnerFooter.style.display = 'none';
      if (this.runnerHeader) this.runnerHeader.innerHTML = '';
      
      let closureDetail = accessStatus.message;
      if (accessStatus.reason === 'DEADLINE_PASSED' && accessStatus.endDateTime) {
        const d = new Date(accessStatus.endDateTime).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
        closureDetail += `<br><br><span style="font-size:0.85rem;color:var(--text-light);">The deadline for this form was <strong>${d}</strong>.</span>`;
      }

      if (this.runnerFieldsForm) {
        this.runnerFieldsForm.style.display = 'flex';
        this.runnerFieldsForm.innerHTML = `
          <div class="form-closed-view">
            <div class="closed-icon-badge">
              <i class="ri-lock-2-line"></i>
            </div>
            <h2 class="closed-title">This form is no longer accepting responses</h2>
            <p class="closed-desc">${closureDetail}</p>
            <div style="margin-top:10px;">
              <span style="font-size:0.8rem;color:var(--text-light);">If you believe this is a mistake, please reach out to the form owner or organization.</span>
            </div>
          </div>
        `;
      }
      return;
    }

    // Render Deadline Banner if closing deadline is configured
    let deadlineBannerHTML = '';
    if (accessStatus.hasDeadline && accessStatus.endDateTime) {
      const d = new Date(accessStatus.endDateTime);
      const formattedDate = d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      // Calculate remaining time
      const diffMs = accessStatus.remainingMs;
      let timeRemainingText = '';
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHrs / 24);
      if (diffDays > 0) {
        timeRemainingText = `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
      } else if (diffHrs > 0) {
        timeRemainingText = `in ${diffHrs} hour${diffHrs > 1 ? 's' : ''}`;
      } else {
        const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
        timeRemainingText = `in ${diffMins} min${diffMins > 1 ? 's' : ''}`;
      }

      deadlineBannerHTML = `
        <div class="form-deadline-banner">
          <div style="display:flex;align-items:center;gap:8px;">
            <i class="ri-hourglass-2-line" style="font-size:1.1rem;"></i>
            <span>Submissions close on <strong>${formattedDate}</strong></span>
          </div>
          <span class="deadline-pulse-badge"><i class="ri-time-line"></i> Closes ${timeRemainingText}</span>
        </div>
      `;
    }

    // Render Header
    if (this.runnerHeader) {
      this.runnerHeader.innerHTML = `
        ${deadlineBannerHTML}
        <h1 class="runner-title">${form.title || 'Untitled Form'}</h1>
        ${form.description ? `<p class="runner-desc">${form.description}</p>` : ''}
      `;
    }

    // Handle steps
    const isMultiStep = form.isMultiStep && form.steps && form.steps.length > 1;
    const totalSteps = isMultiStep ? form.steps.length : 1;

    // Render Progress Bar
    if (this.runnerProgress) {
      if (isMultiStep) {
        this.runnerProgress.style.display = 'block';
        const progressPct = Math.round(((this.currentStepIndex + 1) / totalSteps) * 100);
        const currentStep = form.steps[this.currentStepIndex];
        this.runnerProgress.innerHTML = `
          <div class="runner-step-text">
            <span>STEP ${this.currentStepIndex + 1} OF ${totalSteps}: ${currentStep?.title || ''}</span>
            <span>${progressPct}% COMPLETED</span>
          </div>
          <div class="runner-stepper-track" style="margin-top:8px;">
            <div class="runner-stepper-fill" style="width: ${progressPct}%;"></div>
          </div>
        `;
      } else {
        this.runnerProgress.style.display = 'none';
      }
    }

    // Render Fields
    this.renderFields(form, isMultiStep);

    // Render Footer Controls
    this.renderFooter(isMultiStep, totalSteps);
  }

  renderFields(form, isMultiStep) {
    if (!this.runnerFieldsForm) return;
    this.runnerFieldsForm.innerHTML = '';

    let fieldsToRender = form.fields;
    if (isMultiStep && form.steps && form.steps[this.currentStepIndex]) {
      const stepId = form.steps[this.currentStepIndex].id;
      fieldsToRender = form.fields.filter(f => !f.stepId || f.stepId === stepId);
    }

    fieldsToRender.forEach(field => {
      const row = document.createElement('div');
      row.className = 'runner-field-row';
      row.setAttribute('data-id', field.id);

      if (field.type === 'section') {
        row.innerHTML = `
          <div style="margin: 16px 0 8px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main);">${field.label || 'Section'}</h3>
            ${field.helpText ? `<p style="font-size: 0.85rem; color: var(--text-muted);">${field.helpText}</p>` : ''}
          </div>
        `;
        this.runnerFieldsForm.appendChild(row);
        return;
      }

      row.innerHTML = `
        <label class="runner-field-label">
          ${field.label}
          ${field.required ? '<span class="required-asterisk">*</span>' : ''}
        </label>
        ${field.helpText ? `<div class="runner-field-help">${field.helpText}</div>` : ''}
        <div class="runner-field-input-slot"></div>
        <div class="runner-field-error"><i class="ri-error-warning-fill"></i> This question is required</div>
      `;

      const inputSlot = row.querySelector('.runner-field-input-slot');
      this.mountFieldControl(inputSlot, field);
      this.runnerFieldsForm.appendChild(row);
    });
  }

  mountFieldControl(container, field) {
    const value = this.formData[field.id];

    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'url':
      case 'number': {
        const input = document.createElement('input');
        input.type = field.type === 'phone' ? 'tel' : field.type;
        input.className = 'runner-input';
        input.placeholder = field.placeholder || 'Enter here...';
        input.value = value || '';
        input.addEventListener('input', (e) => {
          this.formData[field.id] = e.target.value;
          this.clearError(field.id);
        });
        container.appendChild(input);
        break;
      }

      case 'date': {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'runner-input';
        input.value = value || '';
        input.addEventListener('change', (e) => {
          this.formData[field.id] = e.target.value;
          this.clearError(field.id);
        });
        container.appendChild(input);
        break;
      }

      case 'textarea': {
        const textarea = document.createElement('textarea');
        textarea.className = 'runner-input';
        textarea.placeholder = field.placeholder || 'Type your detailed answer...';
        textarea.value = value || '';
        textarea.addEventListener('input', (e) => {
          this.formData[field.id] = e.target.value;
          this.clearError(field.id);
        });
        container.appendChild(textarea);
        break;
      }

      case 'select': {
        const select = document.createElement('select');
        select.className = 'runner-input';
        select.innerHTML = `
          <option value="">-- Please select an option --</option>
          ${(field.options || []).map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
        `;
        select.addEventListener('change', (e) => {
          this.formData[field.id] = e.target.value;
          this.clearError(field.id);
        });
        container.appendChild(select);
        break;
      }

      case 'radio': {
        const group = document.createElement('div');
        group.className = 'runner-options-group';
        (field.options || []).forEach(opt => {
          const card = document.createElement('label');
          card.className = `runner-option-card ${value === opt ? 'selected' : ''}`;
          card.innerHTML = `
            <input type="radio" name="${field.id}" value="${opt}" ${value === opt ? 'checked' : ''} />
            <span>${opt}</span>
          `;
          card.querySelector('input').addEventListener('change', () => {
            this.formData[field.id] = opt;
            group.querySelectorAll('.runner-option-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            this.clearError(field.id);
          });
          group.appendChild(card);
        });
        container.appendChild(group);
        break;
      }

      case 'checkbox': {
        const group = document.createElement('div');
        group.className = 'runner-options-group';
        const selectedValues = Array.isArray(value) ? value : [];

        (field.options || []).forEach(opt => {
          const isChecked = selectedValues.includes(opt);
          const card = document.createElement('label');
          card.className = `runner-option-card ${isChecked ? 'selected' : ''}`;
          card.innerHTML = `
            <input type="checkbox" value="${opt}" ${isChecked ? 'checked' : ''} />
            <span>${opt}</span>
          `;
          card.querySelector('input').addEventListener('change', (e) => {
            let cur = this.formData[field.id] || [];
            if (e.target.checked) {
              cur = [...cur, opt];
            } else {
              cur = cur.filter(x => x !== opt);
            }
            this.formData[field.id] = cur;
            card.classList.toggle('selected', e.target.checked);
            this.clearError(field.id);
          });
          group.appendChild(card);
        });
        container.appendChild(group);
        break;
      }

      case 'rating': {
        const ratingBox = document.createElement('div');
        ratingBox.className = 'runner-star-rating';
        const curRating = value || 0;
        const maxStars = field.max || 5;

        for (let i = 1; i <= maxStars; i++) {
          const star = document.createElement('i');
          star.className = `ri-star-fill ${i <= curRating ? 'filled' : ''}`;
          star.setAttribute('data-rating', i);

          star.addEventListener('click', () => {
            this.formData[field.id] = i;
            ratingBox.querySelectorAll('i').forEach((s, idx) => {
              s.classList.toggle('filled', idx < i);
            });
            this.clearError(field.id);
          });

          ratingBox.appendChild(star);
        }
        container.appendChild(ratingBox);
        break;
      }

      case 'scale': {
        const scaleBox = document.createElement('div');
        scaleBox.className = 'runner-scale-group';
        const min = field.min ?? 0;
        const max = field.max ?? 10;
        const curScale = value;

        for (let i = min; i <= max; i++) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `runner-scale-btn ${curScale === i ? 'selected' : ''}`;
          btn.textContent = i;

          btn.addEventListener('click', () => {
            this.formData[field.id] = i;
            scaleBox.querySelectorAll('.runner-scale-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            this.clearError(field.id);
          });

          scaleBox.appendChild(btn);
        }
        container.appendChild(scaleBox);
        break;
      }

      case 'file': {
        const dropzone = document.createElement('div');
        dropzone.className = 'runner-file-dropzone';
        dropzone.innerHTML = `
          <i class="ri-upload-cloud-2-line" style="font-size:2rem;color:var(--primary);margin-bottom:6px;display:block;"></i>
          <p style="font-weight:700;font-size:0.9rem;">Choose a file or drag & drop here</p>
          <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Supports PDF, DOCX, PNG (Simulated upload)</p>
          <input type="file" style="display:none;" />
        `;

        const previewContainer = document.createElement('div');
        if (value && value.fileName) {
          previewContainer.innerHTML = `
            <div class="runner-file-preview">
              <div style="display:flex;align-items:center;gap:8px;">
                <i class="ri-file-text-line" style="font-size:1.4rem;color:var(--primary);"></i>
                <div>
                  <div style="font-weight:700;font-size:0.85rem;">${value.fileName}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">${value.fileSize}</div>
                </div>
              </div>
              <button type="button" class="btn btn-ghost btn-icon-only btn-remove-file" style="width:28px;height:28px;"><i class="ri-delete-bin-line"></i></button>
            </div>
          `;
          previewContainer.querySelector('.btn-remove-file')?.addEventListener('click', () => {
            delete this.formData[field.id];
            previewContainer.innerHTML = '';
          });
        }

        const fileInput = dropzone.querySelector('input');
        dropzone.addEventListener('click', (e) => {
          if (!e.target.closest('.btn-remove-file')) fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const fileObj = {
              fileName: file.name,
              fileSize: (file.size / 1024).toFixed(1) + ' KB'
            };
            this.formData[field.id] = fileObj;
            this.clearError(field.id);
            previewContainer.innerHTML = `
              <div class="runner-file-preview">
                <div style="display:flex;align-items:center;gap:8px;">
                  <i class="ri-file-text-line" style="font-size:1.4rem;color:var(--primary);"></i>
                  <div>
                    <div style="font-weight:700;font-size:0.85rem;">${fileObj.fileName}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${fileObj.fileSize}</div>
                  </div>
                </div>
                <button type="button" class="btn btn-ghost btn-icon-only btn-remove-file" style="width:28px;height:28px;"><i class="ri-delete-bin-line"></i></button>
              </div>
            `;
            previewContainer.querySelector('.btn-remove-file')?.addEventListener('click', () => {
              delete this.formData[field.id];
              previewContainer.innerHTML = '';
            });
          }
        });

        container.appendChild(dropzone);
        container.appendChild(previewContainer);
        break;
      }

      case 'signature': {
        const sigContainer = document.createElement('div');
        sigContainer.className = 'signature-canvas-container';
        
        const canvas = document.createElement('canvas');
        canvas.className = 'signature-canvas';
        canvas.width = 600;
        canvas.height = 140;

        const toolbar = document.createElement('div');
        toolbar.className = 'signature-toolbar';
        toolbar.innerHTML = `
          <button type="button" class="btn btn-outline" style="padding:4px 10px;font-size:0.75rem;"><i class="ri-eraser-line"></i> Clear</button>
        `;

        sigContainer.appendChild(canvas);
        sigContainer.appendChild(toolbar);
        container.appendChild(sigContainer);

        // Setup Canvas Drawing
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let isDrawing = false;
        let hasSigned = false;

        const getPos = (e) => {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
          };
        };

        const startDrawing = (e) => {
          isDrawing = true;
          const { x, y } = getPos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          e.preventDefault();
        };

        const draw = (e) => {
          if (!isDrawing) return;
          const { x, y } = getPos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          hasSigned = true;
          this.formData[field.id] = canvas.toDataURL();
          this.clearError(field.id);
          e.preventDefault();
        };

        const stopDrawing = () => {
          isDrawing = false;
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', stopDrawing);

        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);

        toolbar.querySelector('button')?.addEventListener('click', () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          delete this.formData[field.id];
          hasSigned = false;
        });

        // Restore if previously signed
        if (value) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0);
          img.src = value;
        }

        break;
      }
    }
  }

  renderFooter(isMultiStep, totalSteps) {
    if (!this.runnerFooter) return;
    this.runnerFooter.innerHTML = '';

    const isFirst = this.currentStepIndex === 0;
    const isLast = !isMultiStep || this.currentStepIndex === totalSteps - 1;

    if (isMultiStep && !isFirst) {
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'btn btn-outline';
      prevBtn.innerHTML = '<i class="ri-arrow-left-line"></i> Previous Step';
      prevBtn.addEventListener('click', () => {
        this.currentStepIndex--;
        this.render();
      });
      this.runnerFooter.appendChild(prevBtn);
    } else {
      // Empty spacer
      this.runnerFooter.appendChild(document.createElement('div'));
    }

    if (!isLast) {
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'btn btn-primary';
      nextBtn.innerHTML = 'Next Step <i class="ri-arrow-right-line"></i>';
      nextBtn.addEventListener('click', () => {
        if (this.validateCurrentStep()) {
          this.currentStepIndex++;
          this.render();
          this.runnerStage.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
      this.runnerFooter.appendChild(nextBtn);
    } else {
      const submitBtn = document.createElement('button');
      submitBtn.type = 'button';
      submitBtn.className = 'btn btn-primary';
      submitBtn.id = 'btn-runner-submit';
      submitBtn.style.padding = '10px 24px';
      submitBtn.innerHTML = '<i class="ri-check-double-line"></i> Submit Application';
      submitBtn.addEventListener('click', () => {
        if (this.validateCurrentStep()) {
          this.handleSubmit();
        }
      });
      this.runnerFooter.appendChild(submitBtn);
    }
  }

  validateCurrentStep() {
    const form = store.getActiveForm();
    if (!form) return false;

    let fieldsToCheck = form.fields;
    if (form.isMultiStep && form.steps && form.steps[this.currentStepIndex]) {
      const stepId = form.steps[this.currentStepIndex].id;
      fieldsToCheck = form.fields.filter(f => !f.stepId || f.stepId === stepId);
    }

    let isValid = true;
    let firstErrorElement = null;

    fieldsToCheck.forEach(field => {
      if (field.type === 'section') return;
      if (field.required) {
        const val = this.formData[field.id];
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);

        const row = this.runnerFieldsForm.querySelector(`.runner-field-row[data-id="${field.id}"]`);
        if (isEmpty) {
          isValid = false;
          row?.classList.add('has-error');
          if (!firstErrorElement) firstErrorElement = row;
        } else {
          row?.classList.remove('has-error');
        }
      }
    });

    if (!isValid && firstErrorElement) {
      firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return isValid;
  }

  clearError(fieldId) {
    const row = this.runnerFieldsForm.querySelector(`.runner-field-row[data-id="${fieldId}"]`);
    row?.classList.remove('has-error');
  }

  handleSubmit() {
    const form = store.getActiveForm();
    const accessStatus = store.isFormOpen(form);
    if (!accessStatus.isOpen) {
      alert(accessStatus.message || 'This form is no longer accepting responses.');
      this.render();
      return;
    }

    const duration = Math.max(15, Math.round((Date.now() - this.startTime) / 1000));
    const submission = store.addSubmission({
      data: { ...this.formData },
      durationSeconds: duration
    });

    // Confetti celebration
    if (window.triggerConfetti) {
      window.triggerConfetti();
    }

    // Switch to success view
    if (this.runnerFieldsForm) this.runnerFieldsForm.style.display = 'none';
    if (this.runnerFooter) this.runnerFooter.style.display = 'none';
    if (this.runnerProgress) this.runnerProgress.style.display = 'none';

    if (this.successView) {
      this.successView.classList.add('show');
      this.successView.innerHTML = `
        <div class="success-icon-badge">
          <i class="ri-checkbox-circle-fill"></i>
        </div>
        <h2 style="font-size:1.75rem;font-weight:800;color:var(--text-main);">Application Submitted!</h2>
        <p style="font-size:0.95rem;color:var(--text-muted);max-width:460px;">
          Thank you for completing this submission. Your responses and digital signature have been recorded successfully.
        </p>
        <div style="margin:10px 0;">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-light);margin-bottom:6px;text-transform:uppercase;">Submission Reference ID</div>
          <div class="reference-code-box">${submission.id.toUpperCase()}</div>
        </div>
        <div style="display:flex;gap:12px;margin-top:10px;">
          <button class="btn btn-outline" id="btn-submit-another"><i class="ri-refresh-line"></i> Submit Another</button>
          <button class="btn btn-primary" id="btn-view-analytics"><i class="ri-bar-chart-box-line"></i> View in Analytics</button>
        </div>
      `;

      document.getElementById('btn-submit-another')?.addEventListener('click', () => {
        this.resetFormState();
        this.render();
      });

      document.getElementById('btn-view-analytics')?.addEventListener('click', () => {
        document.querySelector('.nav-tab-btn[data-view="analytics"]')?.click();
      });
    }
  }
}
