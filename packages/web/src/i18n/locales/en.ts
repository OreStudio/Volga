import type { SourceCatalogue } from '../translate.js';

/**
 * English, the source catalogue.
 *
 * This file is the key set. Every other language is checked against it, so a
 * message is added here first and then translated. Keys are grouped by area and
 * named for what the message is, not where it appears, so moving a control does
 * not move its key.
 */
export const en: SourceCatalogue = {
  app: {
    name: 'ORE Studio',
    tagline: 'Enterprise-grade risk analytics, in the browser.',
  },

  nav: {
    site: 'Site',
    accounts: 'Accounts',
    notifications: 'Notifications',
    alerts: 'Alerts',
    signOut: 'Sign out',
    signIn: 'Sign in',
    menu: 'Menu',
    closeMenu: 'Close menu',
    language: 'Language',
  },

  landing: {
    heading: 'Enterprise-grade risk analytics — but visual and open-source.',
    // Split around the two product links, because the links are markup rather
    // than text and a translator must be able to move them within the sentence.
    introBefore: 'ORE Studio wraps the',
    introBetween: '(ORE) and',
    introAfter:
      'in an intuitive graphical interface — no Python or C++ required — built on a PostgreSQL-native, C++-performance backend.',
    signUp: 'Sign up',
    signIn: 'Sign in',
  },

  signIn: {
    title: 'Sign in',
    username: 'Username',
    password: 'Password',
    show: 'Show',
    hide: 'Hide',
    submit: 'Sign in',
    submitting: 'Signing in...',
    noAccount: 'No account?',
    createOne: 'Sign up',
    failed: 'Sign in failed.',
    chooseParty: 'Choose a party',
    choosePartyHint: 'This account works in more than one party.',
    partyCategory: 'Category',
  },

  signUp: {
    title: 'Sign up',
    notAvailable:
      'Accounts are created by an administrator, or through the provisioning wizard in the desktop client. Self-service sign-up is not available yet.',
    haveAccount: 'Already have an account?',
  },

  accounts: {
    title: 'Accounts',
    description: 'Identities that can sign in or act as a service, scoped to this tenant.',
    search: 'Search',
    searchPlaceholder: 'Username, name, or email',
    filterByType: 'Type',
    allTypes: 'All types',
    count: '{shown} of {total}',
    refreshing: 'refreshing',
    loading: 'Loading...',
    empty: 'No accounts match the current filter.',
    failed: 'Could not load accounts.',
  },

  account: {
    singular: 'account',
    // Column headers.
    colUsername: 'Username',
    colFullName: 'Full name',
    colEmail: 'Email',
    colType: 'Type',
    colRecorded: 'Recorded',
    // Field labels.
    fldFullName: 'Full name',
    fldEmail: 'Email',
    fldJobTitle: 'Job title',
    fldType: 'Type',
    fldDefaultParty: 'Default party',
    fldReportsTo: 'Reports to',
    fldVersion: 'Version',
    fldModifiedBy: 'Modified by',
    fldPerformedBy: 'Performed by',
    fldRecordedAt: 'Recorded at',
    fldChangeReason: 'Change reason',
    fldCommentary: 'Commentary',
    notRecorded: 'not recorded',
    notSet: 'not set',
    nobody: 'nobody',
    unknown: 'unknown',
    none: 'none',
  },

  entity: {
    add: 'Add',
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    saving: 'Saving...',
    close: 'Close',
    cancel: 'Cancel',
    refresh: 'Refresh',
    history: 'History',
    search: 'Search',
    filter: 'Filter',
    page: 'Page {page} of {pages}',
    pageSize: 'Page size',
    loadAll: 'Load all',
    noRecords: 'No records',
    loading: 'Loading...',
    first: 'First',
    previous: 'Previous',
    next: 'Next',
    last: 'Last',
    provenance: 'Provenance',
    general: 'General',
    related: 'Related',
  },

  audit: {
    createTitle: 'New Record Reason',
    amendTitle: 'Change Reason Required',
    deleteTitle: 'Deletion Reason Required',
    createPrompt: 'Please select a reason for creating this record:',
    amendPrompt: 'Please select a reason for this change:',
    deletePrompt: 'Please select a reason for this deletion:',
    reason: 'Reason',
    commentary: 'Commentary',
    commentaryPlaceholder: 'Enter explanation for this change...',
    commentaryRequired: 'Commentary is required for this reason.',
    commentaryOptional: 'Commentary is optional for this reason.',
    required: 'Required',
    create: 'Create',
    confirmDelete: 'Confirm Delete',
  },

  confirmation: {
    deleteTitle: 'Delete {singular}',
    deleteBody: "Are you sure you want to delete {singular} '{name}'?",
    unsavedTitle: 'Unsaved Changes',
    unsavedBody: 'You have unsaved changes. Close anyway?',
    yes: 'Yes',
    no: 'No',
  },

  feedback: {
    saved: "{name} saved",
    deleted: "{name} deleted",
    saveFailed: 'Save failed',
    createFailed: 'Create failed',
    deleteFailed: 'Delete failed',
    invalidInput: 'Invalid Input',
    requiredFields: 'Please fill in all required fields.',
    notConnected: 'Not connected to server. Please login.',
    sessionExpired: 'Your session has ended. Sign in again.',
    unreachable: 'Cannot reach the server.',
    retry: 'Retry',
  },

  status: {
    environment: 'Environment',
    connected: 'Connected',
    disconnected: 'Disconnected',
    development: 'development',
    notSignedIn: 'Not signed in',
    copyright: '© 2026 ORE Studio contributors.',
  },

  deployment: {
    title: 'Deployment',
    description: 'Read-only. Everything here is decided when the process starts, not in the browser.',
    environment: 'This environment',
    name: 'Name',
    identifier: 'Identifier',
    kind: 'Kind',
    production: 'production',
    notProduction: 'not production',
    natsServer: 'NATS server',
    namespace: 'Subject namespace',
    httpServer: 'HTTP server',
    notConfigured: 'not configured',
    configuration: 'Configuration',
    configFile: 'File',
    everyEnvironment: 'Every environment declared',
    serving: 'serving',
    switchHint: 'Switch by restarting with a different --env.',
    unavailable: 'This deployment does not offer the developer surface.',
  },

  common: {
    loading: 'Loading...',
    all: 'All',
    close: 'Close',
    open: 'Open',
    revert: 'Revert',
    apply: 'Apply',
    back: 'Back',
  },
};
