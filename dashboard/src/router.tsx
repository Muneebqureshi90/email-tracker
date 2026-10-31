import type { RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { Empty, TextLink } from './components/ui';
import { AccountPage } from './pages/AccountPage';
import { ActivityPage } from './pages/ActivityPage';
import { AlertsPage } from './pages/AlertsPage';
import { AuthPage } from './pages/AuthPage';
import { ContactDetailPage, ContactsPage } from './pages/ContactsPage';
import { DocumentDetailPage, DocumentsPage } from './pages/DocumentsPage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { EmailsPage } from './pages/EmailsPage';
import { OverviewPage } from './pages/OverviewPage';
import { PipelinePage } from './pages/PipelinePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TokensPage } from './pages/TokensPage';

function NotFoundPage() {
  return (
    <Empty title="Page not found">
      <TextLink to="/">Go to the overview</TextLink>
    </Empty>
  );
}

/** Keep the paths in sync with DashboardController.ROUTES in the backend. */
export const routes: RouteObject[] = [
  { path: '/login', element: <AuthPage /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'emails', element: <EmailsPage /> },
      { path: 'emails/:id', element: <EmailDetailPage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'contacts/:address', element: <ContactDetailPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'documents/:id', element: <DocumentDetailPage /> },
      { path: 'pipeline', element: <PipelinePage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'tokens', element: <TokensPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
