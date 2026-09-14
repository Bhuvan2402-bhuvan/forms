/**
 * FormCraft Studio - Built-in Application & Form Templates
 */

export const DEFAULT_FORM_SETTINGS = {
  acceptingResponses: true,
  hasEndTime: false,
  endDateTime: null,
  closedMessage: "This form is no longer accepting responses. The deadline for submission has passed."
};

export const DEFAULT_TEMPLATES = [
  {
    id: 'template-job-application',
    title: 'Senior Software Engineer Application',
    description: 'Comprehensive multi-step career intake form with portfolio links, experience assessment, and digital signature.',
    category: 'Application',
    badge: 'Multi-Step Application',
    isMultiStep: true,
    theme: {
      accentColor: '#6366f1',
      bgGradient: 'radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.08) 0%, rgba(244, 246, 254, 1) 90%)',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      cardStyle: 'glass',
      borderRadius: '16px'
    },
    steps: [
      {
        id: 'step-1',
        title: 'Personal Information',
        description: 'Please provide your legal name and primary contact coordinates.'
      },
      {
        id: 'step-2',
        title: 'Experience & Profiles',
        description: 'Tell us about your background, portfolio, and online presence.'
      },
      {
        id: 'step-3',
        title: 'Technical Assessment & Preferences',
        description: 'Help us match you with the right engineering team and role expectations.'
      },
      {
        id: 'step-4',
        title: 'Verification & Signature',
        description: 'Review your declaration and sign digitally to finalize submission.'
      }
    ],
    fields: [
      // Step 1
      {
        id: 'f-101',
        stepId: 'step-1',
        type: 'text',
        label: 'Full Legal Name',
        placeholder: 'e.g. Alex Morgan',
        helpText: 'As it appears on official government identification',
        required: true
      },
      {
        id: 'f-102',
        stepId: 'step-1',
        type: 'email',
        label: 'Email Address',
        placeholder: 'alex.morgan@example.com',
        helpText: 'We will send interview invitations here',
        required: true
      },
      {
        id: 'f-103',
        stepId: 'step-1',
        type: 'phone',
        label: 'Contact Phone Number',
        placeholder: '+1 (555) 234-5678',
        required: true
      },
      {
        id: 'f-104',
        stepId: 'step-1',
        type: 'select',
        label: 'Current Work Authorization',
        required: true,
        options: [
          'Citizen / Permanent Resident',
          'Require H-1B or Visa Sponsorship',
          'Valid Work Permit (EAD / TN)',
          'Independent Contractor (B2B)'
        ]
      },
      // Step 2
      {
        id: 'f-201',
        stepId: 'step-2',
        type: 'url',
        label: 'GitHub / GitLab Profile URL',
        placeholder: 'https://github.com/username',
        required: true
      },
      {
        id: 'f-202',
        stepId: 'step-2',
        type: 'url',
        label: 'LinkedIn Profile or Portfolio URL',
        placeholder: 'https://linkedin.com/in/alexmorgan',
        required: false
      },
      {
        id: 'f-203',
        stepId: 'step-2',
        type: 'number',
        label: 'Total Years of Professional Software Engineering Experience',
        placeholder: 'e.g. 6',
        min: 0,
        max: 40,
        required: true
      },
      {
        id: 'f-204',
        stepId: 'step-2',
        type: 'textarea',
        label: 'Summary of Recent Key Technical Accomplishments',
        placeholder: 'Highlight architectural decisions, scale handled, or leadership initiatives...',
        required: true
      },
      // Step 3
      {
        id: 'f-301',
        stepId: 'step-3',
        type: 'checkbox',
        label: 'Primary Tech Stack Proficiencies',
        required: true,
        options: [
          'TypeScript / JavaScript (Node, React, Vue)',
          'Go / Rust',
          'Python (FastAPI, PyTorch, Django)',
          'Cloud Native (AWS, GCP, Kubernetes, Docker)',
          'Distributed Systems & Databases (PostgreSQL, Redis, Kafka)'
        ]
      },
      {
        id: 'f-302',
        stepId: 'step-3',
        type: 'radio',
        label: 'Preferred Work Arrangement',
        required: true,
        options: [
          '100% Remote (Global / Anywhere)',
          'Hybrid (2-3 days in office)',
          'On-site Engineering Hub'
        ]
      },
      {
        id: 'f-303',
        stepId: 'step-3',
        type: 'select',
        label: 'Earliest Notice Period / Availability',
        required: true,
        options: [
          'Immediate (Available within 1 week)',
          '2 Weeks standard notice',
          '1 Month notice',
          'More than 1 month'
        ]
      },
      // Step 4
      {
        id: 'f-401',
        stepId: 'step-4',
        type: 'file',
        label: 'Upload Resume / Curriculum Vitae',
        helpText: 'Supported formats: PDF, DOCX (Max 15MB)',
        required: true
      },
      {
        id: 'f-402',
        stepId: 'step-4',
        type: 'checkbox',
        label: 'Declaration & Background Check Consent',
        required: true,
        options: [
          'I certify that all statements made in this application are true and complete to the best of my knowledge.'
        ]
      },
      {
        id: 'f-403',
        stepId: 'step-4',
        type: 'signature',
        label: 'Applicant Digital Signature',
        helpText: 'Draw your signature using mouse, stylus, or touch screen',
        required: true
      }
    ]
  },
  {
    id: 'template-scholarship-grant',
    title: 'Future Leaders Academic Fellowship Grant',
    description: 'Higher education merit-based scholarship application with statement of purpose, GPA verification, and references.',
    category: 'Grant',
    badge: 'Multi-Step Application',
    isMultiStep: true,
    theme: {
      accentColor: '#0d9488',
      bgGradient: 'radial-gradient(circle at 80% 20%, rgba(13, 148, 136, 0.08) 0%, rgba(240, 253, 250, 1) 90%)',
      fontFamily: "'Inter', sans-serif",
      cardStyle: 'elevated',
      borderRadius: '14px'
    },
    steps: [
      { id: 's-1', title: 'Applicant Details', description: 'Institutional background and contact info' },
      { id: 's-2', title: 'Academic Metrics', description: 'Major, GPA, and graduation timeline' },
      { id: 's-3', title: 'Statement & Vision', description: 'Your essay on community and academic impact' },
      { id: 's-4', title: 'Endorsement & Submit', description: 'Faculty sponsor and submission commitment' }
    ],
    fields: [
      {
        id: 'f-s101',
        stepId: 's-1',
        type: 'text',
        label: 'Candidate Full Name',
        placeholder: 'e.g. Jordan Rivera',
        required: true
      },
      {
        id: 'f-s102',
        stepId: 's-1',
        type: 'email',
        label: 'University Student Email (.edu)',
        placeholder: 'jordan@university.edu',
        required: true
      },
      {
        id: 'f-s103',
        stepId: 's-1',
        type: 'text',
        label: 'Current College or University',
        placeholder: 'e.g. Stanford University',
        required: true
      },
      {
        id: 'f-s201',
        stepId: 's-2',
        type: 'select',
        label: 'Degree Level Pursued',
        required: true,
        options: ['Undergraduate (Bachelor)', 'Master of Science / Arts', 'Doctorate (Ph.D.)', 'Postdoctoral Researcher']
      },
      {
        id: 'f-s202',
        stepId: 's-2',
        type: 'number',
        label: 'Cumulative GPA (out of 4.0)',
        placeholder: '3.85',
        min: 0,
        max: 4,
        required: true
      },
      {
        id: 'f-s203',
        stepId: 's-2',
        type: 'date',
        label: 'Anticipated Graduation Date',
        required: true
      },
      {
        id: 'f-s301',
        stepId: 's-3',
        type: 'textarea',
        label: 'Personal Statement & Academic Mission (Max 500 words)',
        placeholder: 'Describe your core research focus and how this fellowship empowers your goals...',
        required: true
      },
      {
        id: 'f-s302',
        stepId: 's-3',
        type: 'file',
        label: 'Official Transcript or Grade Sheet (PDF)',
        required: true
      },
      {
        id: 'f-s401',
        stepId: 's-4',
        type: 'text',
        label: 'Faculty Advisor or Sponsor Name & Department',
        placeholder: 'Dr. Evelyn Reed, Computer Science Dept',
        required: true
      },
      {
        id: 'f-s402',
        stepId: 's-4',
        type: 'signature',
        label: 'Applicant Signature & Pledge of Integrity',
        required: true
      }
    ]
  },
  {
    id: 'template-event-summit',
    title: 'Global Tech Summit 2026 Registration',
    description: 'Conference ticket booking with session preferences, networking interests, and badge credentials.',
    category: 'Registration',
    badge: 'Single Page Form',
    isMultiStep: false,
    theme: {
      accentColor: '#8b5cf6',
      bgGradient: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.12) 0%, rgba(248, 250, 252, 1) 70%)',
      fontFamily: "'Outfit', sans-serif",
      cardStyle: 'glass',
      borderRadius: '20px'
    },
    steps: [
      { id: 'step-all', title: 'Registration Form', description: 'Complete your summit badge & session pass' }
    ],
    fields: [
      {
        id: 'f-e1',
        stepId: 'step-all',
        type: 'text',
        label: 'Attendee Name',
        placeholder: 'e.g. Taylor Swift',
        required: true
      },
      {
        id: 'f-e2',
        stepId: 'step-all',
        type: 'email',
        label: 'Work Email Address',
        placeholder: 'taylor@innovate.co',
        required: true
      },
      {
        id: 'f-e3',
        stepId: 'step-all',
        type: 'text',
        label: 'Company / Organization & Job Title',
        placeholder: 'Acme Inc., VP of Product',
        required: true
      },
      {
        id: 'f-e4',
        stepId: 'step-all',
        type: 'radio',
        label: 'Pass Type',
        required: true,
        options: [
          'All-Access VIP Pass ($899) - Keynotes, Workshops, VIP Lounge',
          'Standard Conference Pass ($499) - Keynotes & Expo Hall',
          'Virtual Livestream Pass ($149) - Online Access & Recorded Talks'
        ]
      },
      {
        id: 'f-e5',
        stepId: 'step-all',
        type: 'checkbox',
        label: 'Breakout Session Tracks of Interest',
        required: false,
        options: [
          'Next-Gen Artificial Intelligence & LLMs',
          'Cloud Architecture & Edge Computing',
          'Security, Privacy & Zero Trust',
          'Design Systems & Human-Centered UX',
          'Startup Pitch Competition & Investor Networking'
        ]
      },
      {
        id: 'f-e6',
        stepId: 'step-all',
        type: 'select',
        label: 'Dietary Preferences for Catered Lunch',
        required: true,
        options: [
          'No specific restrictions',
          'Vegetarian',
          'Vegan',
          'Gluten-Free',
          'Halal / Kosher'
        ]
      }
    ]
  },
  {
    id: 'template-customer-feedback',
    title: 'Customer Satisfaction & Product NPS Survey',
    description: 'Quick feedback questionnaire with star ratings, Net Promoter Score scale, and qualitative insights.',
    category: 'Survey',
    badge: 'Single Page Form',
    isMultiStep: false,
    theme: {
      accentColor: '#f59e0b',
      bgGradient: 'radial-gradient(circle at 50% 10%, rgba(245, 158, 11, 0.1) 0%, rgba(255, 255, 255, 1) 80%)',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      cardStyle: 'glass',
      borderRadius: '18px'
    },
    steps: [
      { id: 'step-survey', title: 'Your Feedback', description: 'Help us build a product you love' }
    ],
    fields: [
      {
        id: 'f-c1',
        stepId: 'step-survey',
        type: 'rating',
        label: 'Overall Satisfaction with FormCraft',
        helpText: 'Select a 5-star rating based on your recent journey',
        required: true
      },
      {
        id: 'f-c2',
        stepId: 'step-survey',
        type: 'scale',
        label: 'Net Promoter Score (NPS): How likely are you to recommend us to a colleague? (0 to 10)',
        min: 0,
        max: 10,
        required: true
      },
      {
        id: 'f-c3',
        stepId: 'step-survey',
        type: 'radio',
        label: 'Which feature do you find most valuable?',
        required: true,
        options: [
          'Multi-step application workflows',
          'Digital signature canvas',
          'Instant responsive preview & live forms',
          'Analytics dashboard & data exports',
          'Visual theme customizer'
        ]
      },
      {
        id: 'f-c4',
        stepId: 'step-survey',
        type: 'textarea',
        label: 'What could we improve or add next?',
        placeholder: 'Any feature requests, friction points, or feedback...',
        required: false
      },
      {
        id: 'f-c5',
        stepId: 'step-survey',
        type: 'email',
        label: 'Optional: Leave your email if you would like us to follow up',
        placeholder: 'your.name@company.com',
        required: false
      }
    ]
  }
];

export const FIELD_DEFINITIONS = [
  { type: 'text', label: 'Short Text', icon: 'ri-text', defaultLabel: 'Short Answer' },
  { type: 'textarea', label: 'Long Text', icon: 'ri-paragraph', defaultLabel: 'Detailed Response' },
  { type: 'email', label: 'Email Address', icon: 'ri-mail-line', defaultLabel: 'Email Address' },
  { type: 'phone', label: 'Phone Number', icon: 'ri-phone-line', defaultLabel: 'Phone Number' },
  { type: 'number', label: 'Number Input', icon: 'ri-hashtag', defaultLabel: 'Numerical Value' },
  { type: 'date', label: 'Date Picker', icon: 'ri-calendar-line', defaultLabel: 'Select Date' },
  { type: 'select', label: 'Dropdown Select', icon: 'ri-arrow-down-s-line', defaultLabel: 'Choose an option', hasOptions: true },
  { type: 'radio', label: 'Single Choice', icon: 'ri-radio-button-line', defaultLabel: 'Select one choice', hasOptions: true },
  { type: 'checkbox', label: 'Multiple Choice', icon: 'ri-checkbox-line', defaultLabel: 'Select all that apply', hasOptions: true },
  { type: 'rating', label: 'Star Rating', icon: 'ri-star-line', defaultLabel: 'Rate your satisfaction' },
  { type: 'scale', label: 'Linear Scale / NPS', icon: 'ri-sound-module-line', defaultLabel: 'Scale from 0 to 10' },
  { type: 'file', label: 'File Upload', icon: 'ri-attachment-line', defaultLabel: 'Upload Document / Resume' },
  { type: 'signature', label: 'Digital Signature', icon: 'ri-quill-pen-line', defaultLabel: 'Signature Pad' },
  { type: 'section', label: 'Section Header', icon: 'ri-separator', defaultLabel: 'Section Title', isLayout: true }
];
