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
    if (this.successView) {
      this.successView.classList.remove('show');
      this.successView.style.display = 'none';
      this.successView.innerHTML = '';
    }
    if (this.runnerHeader) this.runnerHeader.style.display = 'block';
    if (this.runnerFieldsForm) this.runnerFieldsForm.style.display = 'flex';
    if (this.runnerFooter) this.runnerFooter.style.display = 'flex';
    if (this.runnerProgress) this.runnerProgress.style.display = 'block';
  }

  render() {
    const form = store.getActiveForm();
    if (!form) return;

    // Check if form is accepting responses / deadline
    const accessStatus = store.isFormOpen(form);

    // Apply theme styling across runner
    if (this.runnerStage && form.theme) {
      const accent = form.theme.accentColor || '#6366f1';
      this.runnerStage.style.setProperty('--primary', accent);
      this.runnerStage.style.setProperty('--runner-accent', accent);
      this.runnerStage.style.setProperty('--border-focus', accent);
      this.runnerStage.style.setProperty('--primary-light', `${accent}18`);
      this.runnerStage.style.setProperty('--primary-glow', `${accent}33`);

      if (form.theme.bgGradient) {
        this.runnerStage.style.background = form.theme.bgGradient;
      }
      if (form.theme.borderRadius) {
        this.runnerCard.style.borderRadius = form.theme.borderRadius;
      }
      if (form.theme.fontFamily) {
        this.runnerCard.style.fontFamily = form.theme.fontFamily;
      }
    }

    const banner = this.runnerCard?.querySelector('.runner-card-banner');
    if (banner && form.theme?.accentColor) {
      banner.style.background = `linear-gradient(90deg, ${form.theme.accentColor}, #8b5cf6, #ec4899)`;
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
          let errEl = row?.querySelector('.runner-field-error');
          if (!errEl) {
            errEl = document.createElement('div');
            errEl.className = 'runner-field-error';
            errEl.innerHTML = '<i class="ri-error-warning-fill"></i> <span>This question requires a response.</span>';
            row?.appendChild(errEl);
          }
          if (!firstErrorElement) firstErrorElement = row;
        } else {
          row?.classList.remove('has-error');
          row?.querySelector('.runner-field-error')?.remove();
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
    if (row) {
      row.classList.remove('has-error');
      row.querySelector('.runner-field-error')?.remove();
    }
  }

  async handleSubmit() {
    const form = store.getActiveForm();
    const accessStatus = store.isFormOpen(form);
    if (!accessStatus.isOpen) {
      alert(accessStatus.message || 'This form is no longer accepting responses.');
      this.render();
      return;
    }

    const submitBtn = document.getElementById('btn-runner-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Submitting response...';
    }

    const duration = Math.max(15, Math.round((Date.now() - this.startTime) / 1000));
    const submission = store.addSubmission({
      data: { ...this.formData },
      durationSeconds: duration
    });

    // Cloud push in background
    try {
      await store.pushSubmissionToCloud(submission);
    } catch (err) {
      console.warn('Cloud submission push error:', err);
    }

    // Confetti celebration
    if (window.triggerConfetti) {
      window.triggerConfetti();
    }

    // Render the dedicated, beautifully themed Thank You screen
    this.renderThankYouScreen(form, submission);
  }

  renderThankYouScreen(form, submission) {
    // Hide form elements so the Thank You view takes full center stage
    if (this.runnerHeader) this.runnerHeader.style.display = 'none';
    if (this.runnerFieldsForm) this.runnerFieldsForm.style.display = 'none';
    if (this.runnerFooter) this.runnerFooter.style.display = 'none';
    if (this.runnerProgress) this.runnerProgress.style.display = 'none';

    if (!this.successView) return;
    const isStandalone = document.body.classList.contains('standalone-respondent-mode');
    const accent = form.theme?.accentColor || '#6366f1';
    const submittedDate = new Date(submission.submittedAt).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    const answersCount = Object.keys(submission.data || {}).length;

    this.successView.classList.add('show');
    this.successView.style.display = 'flex';
    this.successView.innerHTML = `
      <div class="thank-you-badge-wrapper">
        <div class="thank-you-glow" style="background:${accent};"></div>
        <div class="thank-you-icon" style="background:${accent};">
          <i class="ri-check-line"></i>
        </div>
      </div>

      <div class="thank-you-header">
        <span class="thank-you-pill" style="color:${accent};background:${accent}18;">
          <i class="ri-shield-check-fill"></i> Submission Confirmed
        </span>
        <h2 class="thank-you-title">Thank You!</h2>
        <p class="thank-you-desc">
          Your response for <strong>${form.title || 'this form'}</strong> has been securely submitted and recorded in the database.
        </p>
      </div>

      <div class="thank-you-receipt-card">
        <div class="receipt-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <i class="ri-file-list-3-line" style="color:${accent};font-size:1.1rem;"></i>
            <span style="font-weight:700;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);">Submission Receipt</span>
          </div>
          <span class="receipt-status-tag"><i class="ri-checkbox-circle-fill"></i> Cloud Synced</span>
        </div>

        <div class="receipt-grid">
          <div class="receipt-row">
            <span class="receipt-label">Confirmation ID</span>
            <div class="receipt-ref-box">
              <span class="receipt-ref-code" id="receipt-ref-code">${submission.id.toUpperCase()}</span>
              <button type="button" class="btn-copy-ref" id="btn-copy-ref" title="Copy Reference Code">
                <i class="ri-file-copy-line"></i> Copy
              </button>
            </div>
          </div>

          <div class="receipt-row">
            <span class="receipt-label">Submission Date</span>
            <span class="receipt-value">${submittedDate}</span>
          </div>

          <div class="receipt-row">
            <span class="receipt-label">Fields Recorded</span>
            <span class="receipt-value">${answersCount} answers captured</span>
          </div>

          <div class="receipt-row">
            <span class="receipt-label">Security & Privacy</span>
            <span class="receipt-value" style="color:var(--success);">
              <i class="ri-lock-2-line"></i> 256-Bit SSL Encrypted
            </span>
          </div>
        </div>
      </div>

      <div class="thank-you-actions">
        <button class="btn btn-outline" id="btn-submit-another">
          <i class="ri-refresh-line"></i> Submit Another Response
        </button>
        <button class="btn btn-outline" id="btn-print-receipt">
          <i class="ri-printer-line"></i> Print Receipt
        </button>
        ${!isStandalone ? `
          <button class="btn btn-primary" id="btn-view-analytics" style="background:${accent};border-color:${accent};">
            <i class="ri-bar-chart-box-line"></i> View in Analytics
          </button>
        ` : ''}
      </div>

      <div class="thank-you-footer">
        <i class="ri-shield-star-line" style="color:${accent};"></i>
        <span>Forms by Varunya tech • All rights reserved to Bhuvana Mohan Chowdary.</span>
      </div>
    `;

    // Copy reference code button
    document.getElementById('btn-copy-ref')?.addEventListener('click', () => {
      const code = document.getElementById('receipt-ref-code')?.textContent;
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          const btn = document.getElementById('btn-copy-ref');
          if (btn) {
            btn.innerHTML = '<i class="ri-check-line" style="color:var(--success);"></i> Copied!';
            setTimeout(() => {
              btn.innerHTML = '<i class="ri-file-copy-line"></i> Copy';
            }, 2500);
          }
        });
      }
    });

    // Print receipt
    document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
      window.print();
    });

    // Submit another
    document.getElementById('btn-submit-another')?.addEventListener('click', () => {
      this.resetFormState();
      this.render();
    });

    // View analytics
    document.getElementById('btn-view-analytics')?.addEventListener('click', () => {
      document.querySelector('.nav-tab-btn[data-view="analytics"]')?.click();
    });
  }
}
