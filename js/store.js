/**
 * FormCraft Studio - Reactive State Store & Persistence Layer
 */

import { DEFAULT_TEMPLATES, DEFAULT_FORM_SETTINGS } from './templates.js';

const STORAGE_KEYS = {
  FORMS: 'formcraft_forms_v1',
  ACTIVE_FORM_ID: 'formcraft_active_id_v1',
  SUBMISSIONS: 'formcraft_submissions_v1'
};

class FormStore {
  constructor() {
    this.listeners = new Set();
    this.forms = this.loadForms();
    this.submissions = this.loadSubmissions();
    this.activeFormId = localStorage.getItem(STORAGE_KEYS.ACTIVE_FORM_ID) || this.forms[0]?.id || null;

    if (!this.activeFormId && this.forms.length > 0) {
      this.activeFormId = this.forms[0].id;
    }

    this.selectedFieldId = null;
    this.activeStepIndex = 0;
    this.canonicalOrigin = window.location.origin;
    this.initConfig();
    this.pullRemoteForms();
  }

  async initConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        if (config.canonicalOrigin) {
          this.canonicalOrigin = config.canonicalOrigin;
          this.notify('configLoaded', config);
        }
      }
    } catch {}
  }

  getFormUrl(formId) {
    if (!formId) return '';
    return `${this.canonicalOrigin}/f/${formId}`;
  }

  async pullRemoteForms() {
    try {
      const res = await fetch('/api/forms');
      if (res.ok) {
        const remoteForms = await res.json();
        if (Array.isArray(remoteForms)) {
          const remoteMapped = remoteForms.filter(rf => !rf.id?.startsWith('__system_')).map(rf => ({
            id: rf.id,
            title: rf.title || 'Untitled Form',
            description: rf.description || '',
            category: rf.category || 'Custom',
            badge: rf.badge || 'Single Page Form',
            isMultiStep: !!rf.is_multi_step,
            theme: rf.theme || {},
            settings: rf.settings || { ...DEFAULT_FORM_SETTINGS },
            steps: rf.steps || [],
            fields: rf.fields || []
          }));

          // Merge preserving all local and remote forms
          const formMap = new Map();
          // 1. Add current local forms
          this.forms.forEach(f => formMap.set(f.id, f));
          // 2. Merge / add remote forms
          remoteMapped.forEach(rf => {
            const existing = formMap.get(rf.id);
            if (existing) {
              formMap.set(rf.id, { ...existing, ...rf, settings: { ...DEFAULT_FORM_SETTINGS, ...(existing.settings || {}), ...(rf.settings || {}) } });
            } else {
              formMap.set(rf.id, rf);
            }
          });

          this.forms = Array.from(formMap.values());

          // Push any local forms that weren't on server
          for (const localForm of this.forms) {
            if (!remoteMapped.some(rf => rf.id === localForm.id)) {
              this.pushFormToCloud(localForm).catch(() => {});
            }
          }

          // Maintain activeFormId if valid
          if (this.activeFormId && !this.forms.some(f => f.id === this.activeFormId)) {
            this.activeFormId = this.forms[0]?.id || null;
          }

          this.saveForms(false);
          this.notify('formsSynced', this.forms);
        }
      }

      // Pull or seed submissions
      const subRes = await fetch('/api/submissions');
      if (subRes.ok) {
        const remoteSubs = await subRes.json();
        if (Array.isArray(remoteSubs) && remoteSubs.length > 0) {
          const subMap = new Map();
          this.submissions.forEach(s => subMap.set(s.id, s));
          remoteSubs.forEach(rs => {
            subMap.set(rs.id, {
              id: rs.id,
              formId: rs.form_id || rs.formId,
              submittedAt: rs.submitted_at || rs.submittedAt,
              durationSeconds: rs.duration_seconds || rs.durationSeconds || 60,
              data: rs.data || {}
            });
          });
          this.submissions = Array.from(subMap.values());
          localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(this.submissions));
          this.notify('submissionAdded', null);
        }
      }
    } catch (e) {
      console.warn('Could not pull remote forms/submissions:', e);
    }
  }

  async pushFormToCloud(form) {
    if (!form || !form.id) return;
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      return res.ok;
    } catch (e) {
      console.warn('Failed to push form to backend:', e);
      return false;
    }
  }

  async pushSubmissionToCloud(submission) {
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission)
      });
      return res.ok;
    } catch (e) {
      console.warn('Failed to push submission to backend:', e);
      return false;
    }
  }

  async loadRemoteFormIfNeeded(formId) {
    if (!formId) return null;
    let form = this.forms.find(f => f.id === formId);
    if (form) return form;

    try {
      // 1. Try single form endpoint
      let res = await fetch(`/api/forms?id=${encodeURIComponent(formId)}`);
      if (res.ok) {
        const found = await res.json();
        if (found && found.id === formId) {
          form = {
            id: found.id,
            title: found.title || 'Untitled Form',
            description: found.description || '',
            category: found.category || 'Custom',
            badge: found.badge || 'Single Page Form',
            isMultiStep: !!found.is_multi_step,
            theme: found.theme || {},
            settings: found.settings || { ...DEFAULT_FORM_SETTINGS },
            steps: found.steps || [],
            fields: found.fields || []
          };
          const existingIdx = this.forms.findIndex(f => f.id === form.id);
          if (existingIdx >= 0) {
            this.forms[existingIdx] = form;
          } else {
            this.forms.push(form);
          }
          this.saveForms(false);
          this.setActiveForm(form.id);
          this.notify('formsSynced', this.forms);
          return form;
        }
      }

      // 2. Try fetching all forms
      res = await fetch(`/api/forms`);
      if (res.ok) {
        const remoteForms = await res.json();
        if (Array.isArray(remoteForms)) {
          const found = remoteForms.find(rf => rf.id === formId);
          if (found) {
            form = {
              id: found.id,
              title: found.title || 'Untitled Form',
              description: found.description || '',
              category: found.category || 'Custom',
              badge: found.badge || 'Single Page Form',
              isMultiStep: !!found.is_multi_step,
              theme: found.theme || {},
              settings: found.settings || { ...DEFAULT_FORM_SETTINGS },
              steps: found.steps || [],
              fields: found.fields || []
            };
            const existingIdx = this.forms.findIndex(f => f.id === form.id);
            if (existingIdx >= 0) {
              this.forms[existingIdx] = form;
            } else {
              this.forms.push(form);
            }
            this.saveForms(false);
            this.setActiveForm(form.id);
            this.notify('formsSynced', this.forms);
            return form;
          }
        }
      }
    } catch (e) {
      console.warn('Could not load remote form:', e);
    }
    return null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, payload) {
    this.saveForms();
    this.saveSubmissions();
    for (const listener of this.listeners) {
      listener(event, payload);
    }
  }

  loadForms() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.FORMS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(f => ({
            ...f,
            settings: { ...DEFAULT_FORM_SETTINGS, ...(f.settings || {}) }
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to parse stored forms, restoring defaults', e);
    }
    // Seed with DEFAULT_TEMPLATES
    const initial = DEFAULT_TEMPLATES.map(tpl => ({
      ...JSON.parse(JSON.stringify(tpl)),
      settings: { ...DEFAULT_FORM_SETTINGS }
    }));
    localStorage.setItem(STORAGE_KEYS.FORMS, JSON.stringify(initial));
    return initial;
  }

  debouncePushFormToCloud(form, delayMs = 1000) {
    if (this.cloudSyncTimer) {
      clearTimeout(this.cloudSyncTimer);
    }
    this.cloudSyncTimer = setTimeout(() => {
      this.pushFormToCloud(form);
    }, delayMs);
  }

  saveForms(syncCloud = true, immediate = false) {
    try {
      localStorage.setItem(STORAGE_KEYS.FORMS, JSON.stringify(this.forms));
      if (this.activeFormId) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_FORM_ID, this.activeFormId);
      }
      if (syncCloud) {
        const active = this.getActiveForm();
        if (active) {
          if (immediate) {
            if (this.cloudSyncTimer) clearTimeout(this.cloudSyncTimer);
            this.pushFormToCloud(active);
          } else {
            this.debouncePushFormToCloud(active, 1000);
          }
        }
      }
    } catch (e) {
      console.error('Error saving forms to localStorage', e);
    }
  }

  loadSubmissions() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse submissions', e);
    }
    // Seed initial mock submissions for the job application so analytics look alive immediately
    const mock = [
      {
        id: 'sub-001',
        formId: 'template-job-application',
        submittedAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
        durationSeconds: 185,
        data: {
          'f-101': 'Elena Rostova',
          'f-102': 'elena.rostova@devmail.org',
          'f-103': '+1 (415) 890-1234',
          'f-104': 'Citizen / Permanent Resident',
          'f-201': 'https://github.com/erostova',
          'f-202': 'https://linkedin.com/in/elena-rostova',
          'f-203': 7,
          'f-204': 'Led migration of microservices architecture serving 15M monthly active users. Reduced p99 latency by 38%.',
          'f-301': ['TypeScript / JavaScript (Node, React, Vue)', 'Go / Rust', 'Distributed Systems & Databases (PostgreSQL, Redis, Kafka)'],
          'f-302': '100% Remote (Global / Anywhere)',
          'f-303': '2 Weeks standard notice',
          'f-401': { fileName: 'Elena_Rostova_Staff_Engineer_CV.pdf', fileSize: '420 KB' },
          'f-402': ['I certify that all statements made in this application are true and complete to the best of my knowledge.'],
          'f-403': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="10" y="40" font-family="cursive" font-size="28" fill="#1e293b">Elena Rostova</text></svg>'
        }
      },
      {
        id: 'sub-002',
        formId: 'template-job-application',
        submittedAt: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
        durationSeconds: 240,
        data: {
          'f-101': 'Marcus Vance',
          'f-102': 'marcus.vance@techcorp.io',
          'f-103': '+1 (206) 555-0199',
          'f-104': 'Valid Work Permit (EAD / TN)',
          'f-201': 'https://github.com/mvance-eng',
          'f-202': 'https://linkedin.com/in/marcus-vance',
          'f-203': 5,
          'f-204': 'Engineered high-throughput event ingestion pipelines handling 50k events/sec using Kafka & Go.',
          'f-301': ['Go / Rust', 'Python (FastAPI, PyTorch, Django)', 'Cloud Native (AWS, GCP, Kubernetes, Docker)'],
          'f-302': 'Hybrid (2-3 days in office)',
          'f-303': 'Immediate (Available within 1 week)',
          'f-401': { fileName: 'Marcus_Vance_Resume_2026.pdf', fileSize: '280 KB' },
          'f-402': ['I certify that all statements made in this application are true and complete to the best of my knowledge.'],
          'f-403': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="10" y="40" font-family="cursive" font-size="26" fill="#1e293b">M. Vance</text></svg>'
        }
      },
      {
        id: 'sub-003',
        formId: 'template-customer-feedback',
        submittedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
        durationSeconds: 65,
        data: {
          'f-c1': 5,
          'f-c2': 10,
          'f-c3': 'Multi-step application workflows',
          'f-c4': 'The digital signature feature and step transitions are super smooth and look high-end!',
          'f-c5': 'clara.design@studio.co'
        }
      }
    ];
    localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(mock));
    return mock;
  }

  saveSubmissions() {
    try {
      localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(this.submissions));
    } catch (e) {
      console.error('Error saving submissions to localStorage', e);
    }
  }

  getActiveForm() {
    if (this.activeFormId) {
      const found = this.forms.find(f => f.id === this.activeFormId);
      if (found) return found;
    }
    return this.forms[0] || null;
  }

  setActiveForm(id) {
    if (!id) return;
    this.activeFormId = id;
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_FORM_ID, id);
    } catch {}
    this.selectedFieldId = null;
    this.activeStepIndex = 0;
    this.notify('activeFormChanged', this.getActiveForm());
  }

  createNewForm(template = null) {
    const newId = 'form-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    let newForm;

    if (template) {
      newForm = JSON.parse(JSON.stringify(template));
      newForm.id = newId;
      newForm.title = `${template.title} (Copy)`;
      newForm.settings = { ...DEFAULT_FORM_SETTINGS, ...(template.settings || {}) };
    } else {
      newForm = {
        id: newId,
        title: 'Untitled Form or Application',
        description: 'Provide a clear description for your respondents.',
        category: 'Custom',
        badge: 'Single Page Form',
        isMultiStep: false,
        settings: { ...DEFAULT_FORM_SETTINGS },
        theme: {
          accentColor: '#6366f1',
          bgGradient: 'radial-gradient(circle at top center, rgba(99, 102, 241, 0.08) 0%, rgba(248, 250, 252, 1) 85%)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          cardStyle: 'glass',
          borderRadius: '16px'
        },
        steps: [
          {
            id: 'step-1',
            title: 'Section 1',
            description: 'Fill in the information below.'
          }
        ],
        fields: [
          {
            id: 'field-' + Math.random().toString(36).substring(2, 9),
            stepId: 'step-1',
            type: 'text',
            label: 'Full Name',
            placeholder: 'e.g. Jane Doe',
            required: true
          },
          {
            id: 'field-' + Math.random().toString(36).substring(2, 9),
            stepId: 'step-1',
            type: 'email',
            label: 'Email Address',
            placeholder: 'jane@example.com',
            required: true
          }
        ]
      };
    }

    this.forms.unshift(newForm);
    this.activeFormId = newId;
    this.selectedFieldId = newForm.fields[0]?.id || null;
    this.activeStepIndex = 0;
    this.saveForms(true, true);
    this.pushFormToCloud(newForm).catch(() => {});
    this.notify('formCreated', newForm);
    return newForm;
  }

  isFormOpen(form) {
    if (!form) return { isOpen: false, reason: 'NOT_FOUND', message: 'Form not found.' };
    const settings = { ...DEFAULT_FORM_SETTINGS, ...(form.settings || {}) };

    // 1. Check manual master switch
    if (settings.acceptingResponses === false) {
      return {
        isOpen: false,
        reason: 'MANUAL_CLOSED',
        message: settings.closedMessage || 'This form is no longer accepting responses.'
      };
    }

    // 2. Check end time / deadline
    if (settings.hasEndTime && settings.endDateTime) {
      const deadline = new Date(settings.endDateTime).getTime();
      const now = Date.now();
      if (now >= deadline) {
        return {
          isOpen: false,
          reason: 'DEADLINE_PASSED',
          endDateTime: settings.endDateTime,
          message: settings.closedMessage || 'This form is no longer accepting responses. The deadline for submission has passed.'
        };
      }
      return {
        isOpen: true,
        hasDeadline: true,
        endDateTime: settings.endDateTime,
        remainingMs: deadline - now
      };
    }

    return { isOpen: true, hasDeadline: false };
  }

  toggleAcceptingResponses(formId, isAccepting) {
    const form = this.forms.find(f => f.id === formId);
    if (!form) return;
    form.settings = form.settings || { ...DEFAULT_FORM_SETTINGS };
    form.settings.acceptingResponses = isAccepting;
    this.notify('formUpdated', form);
  }

  updateFormSettings(formId, updates) {
    const form = this.forms.find(f => f.id === formId);
    if (!form) return;
    form.settings = { ...DEFAULT_FORM_SETTINGS, ...(form.settings || {}), ...updates };
    this.notify('formUpdated', form);
  }

  duplicateForm(formId) {
    const source = this.forms.find(f => f.id === formId);
    if (!source) return null;
    return this.createNewForm(source);
  }

  deleteForm(formId) {
    const index = this.forms.findIndex(f => f.id === formId);
    if (index === -1) return;

    this.forms.splice(index, 1);
    if (this.activeFormId === formId) {
      this.activeFormId = this.forms[0]?.id || null;
    }

    // Delete in backend
    fetch(`/api/forms?id=${encodeURIComponent(formId)}`, { method: 'DELETE' }).catch(() => {});

    this.notify('formDeleted', formId);
  }

  updateFormMeta(updates) {
    const form = this.getActiveForm();
    if (!form) return;
    Object.assign(form, updates);
    this.notify('formUpdated', form);
  }

  updateTheme(themeUpdates) {
    const form = this.getActiveForm();
    if (!form) return;
    form.theme = { ...form.theme, ...themeUpdates };
    this.notify('themeUpdated', form.theme);
  }

  // Field operations
  addField(type, targetStepId = null) {
    const form = this.getActiveForm();
    if (!form) return null;

    let stepId = targetStepId;
    if (!stepId) {
      if (form.steps && form.steps[this.activeStepIndex]) {
        stepId = form.steps[this.activeStepIndex].id;
      } else {
        stepId = form.steps[0]?.id || 'step-1';
      }
    }

    const fieldId = 'f-' + Math.random().toString(36).substring(2, 9);
    const newField = {
      id: fieldId,
      stepId: stepId,
      type: type,
      label: this.getDefaultLabel(type),
      placeholder: '',
      helpText: '',
      required: false
    };

    if (['select', 'radio', 'checkbox'].includes(type)) {
      newField.options = ['Option 1', 'Option 2', 'Option 3'];
    } else if (type === 'scale') {
      newField.min = 0;
      newField.max = 10;
    } else if (type === 'rating') {
      newField.max = 5;
    }

    form.fields.push(newField);
    this.selectedFieldId = fieldId;
    this.notify('fieldAdded', newField);
    return newField;
  }

  getDefaultLabel(type) {
    switch (type) {
      case 'text': return 'Short Answer';
      case 'textarea': return 'Detailed Response';
      case 'email': return 'Email Address';
      case 'phone': return 'Phone Number';
      case 'number': return 'Numerical Value';
      case 'date': return 'Select Date';
      case 'select': return 'Select an Option';
      case 'radio': return 'Single Choice Question';
      case 'checkbox': return 'Multiple Choice Selection';
      case 'rating': return 'Rating';
      case 'scale': return 'Rate on a Scale of 0 to 10';
      case 'file': return 'Upload Supporting Document';
      case 'signature': return 'Digital Signature & Declaration';
      case 'section': return 'Section Header';
      default: return 'New Field';
    }
  }

  updateField(fieldId, updates) {
    const form = this.getActiveForm();
    if (!form) return;
    const field = form.fields.find(f => f.id === fieldId);
    if (field) {
      Object.assign(field, updates);
      this.notify('fieldUpdated', field);
    }
  }

  updateFieldQuiet(fieldId, updates, immediate = false) {
    const form = this.getActiveForm();
    if (!form) return;
    const field = form.fields.find(f => f.id === fieldId);
    if (field) {
      Object.assign(field, updates);
      this.saveForms(true, immediate);
    }
  }

  duplicateField(fieldId) {
    const form = this.getActiveForm();
    if (!form) return;
    const index = form.fields.findIndex(f => f.id === fieldId);
    if (index === -1) return;

    const source = form.fields[index];
    const clone = JSON.parse(JSON.stringify(source));
    clone.id = 'f-' + Math.random().toString(36).substring(2, 9);
    clone.label = `${clone.label} (Copy)`;

    form.fields.splice(index + 1, 0, clone);
    this.selectedFieldId = clone.id;
    this.notify('fieldDuplicated', clone);
  }

  deleteField(fieldId) {
    const form = this.getActiveForm();
    if (!form) return;
    const index = form.fields.findIndex(f => f.id === fieldId);
    if (index !== -1) {
      form.fields.splice(index, 1);
      if (this.selectedFieldId === fieldId) {
        this.selectedFieldId = form.fields[Math.max(0, index - 1)]?.id || null;
      }
      this.notify('fieldDeleted', fieldId);
    }
  }

  moveField(fieldId, direction) {
    const form = this.getActiveForm();
    if (!form) return;
    const index = form.fields.findIndex(f => f.id === fieldId);
    if (index === -1) return;

    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < form.fields.length) {
      const temp = form.fields[index];
      form.fields[index] = form.fields[targetIndex];
      form.fields[targetIndex] = temp;
      this.notify('fieldsReordered', form.fields);
    }
  }

  // Step operations for multi-step applications
  addStep() {
    const form = this.getActiveForm();
    if (!form) return;
    const stepCount = (form.steps ? form.steps.length : 0) + 1;
    const newStep = {
      id: 'step-' + Date.now(),
      title: `Step ${stepCount}: Details`,
      description: 'Fill in the information for this stage of your application.'
    };
    if (!form.steps) form.steps = [];
    form.steps.push(newStep);
    form.isMultiStep = true;
    this.activeStepIndex = form.steps.length - 1;
    this.notify('stepAdded', newStep);
  }

  deleteStep(stepIndex) {
    const form = this.getActiveForm();
    if (!form || !form.steps || form.steps.length <= 1) return;

    const stepId = form.steps[stepIndex].id;
    // Remove fields attached to this step or move them to previous step
    const targetStepId = form.steps[stepIndex > 0 ? stepIndex - 1 : 1]?.id;
    form.fields.forEach(f => {
      if (f.stepId === stepId) f.stepId = targetStepId;
    });

    form.steps.splice(stepIndex, 1);
    if (form.steps.length === 1) {
      form.isMultiStep = false;
    }
    this.activeStepIndex = Math.min(this.activeStepIndex, form.steps.length - 1);
    this.notify('stepDeleted', stepId);
  }

  // Submissions
  addSubmission(submissionData) {
    const form = this.getActiveForm();
    const newSubmission = {
      id: 'sub-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      formId: form ? form.id : 'unknown',
      submittedAt: new Date().toISOString(),
      durationSeconds: submissionData.durationSeconds || 60,
      data: submissionData.data || {}
    };

    this.submissions.unshift(newSubmission);
    this.notify('submissionAdded', newSubmission);
    this.pushSubmissionToCloud(newSubmission);
    return newSubmission;
  }

  getSubmissionsForActiveForm() {
    const form = this.getActiveForm();
    if (!form) return [];
    return this.submissions.filter(s => s.formId === form.id);
  }

  deleteSubmission(submissionId) {
    const index = this.submissions.findIndex(s => s.id === submissionId);
    if (index !== -1) {
      this.submissions.splice(index, 1);
      this.notify('submissionDeleted', submissionId);
    }
  }

  // Export / Import
  exportFormJSON() {
    const form = this.getActiveForm();
    return JSON.stringify(form, null, 2);
  }

  importFormJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.title || !Array.isArray(parsed.fields)) {
        throw new Error('Invalid form schema: missing title or fields.');
      }
      parsed.id = 'imported-' + Date.now();
      parsed.title = `${parsed.title} (Imported)`;
      this.forms.unshift(parsed);
      this.activeFormId = parsed.id;
      this.notify('formImported', parsed);
      return { success: true, form: parsed };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

export const store = new FormStore();

