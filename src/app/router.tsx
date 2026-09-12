import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppLayout } from './layout';
import { useProgress } from '../store/progress';
import { SkeletonBlock } from '../components/ui/Skeleton';

const TodayPage = lazy(() => import('../features/today/TodayPage'));
const SessionPage = lazy(() => import('../features/session/SessionPage'));
const ReviewPage = lazy(() => import('../features/review/ReviewPage'));
const RoadmapPage = lazy(() => import('../features/roadmap/RoadmapPage'));
const LibraryPage = lazy(() => import('../features/library/LibraryPage'));
const WordDetailPage = lazy(() => import('../features/library/WordDetailPage'));
const LabsPage = lazy(() => import('../features/labs/LabsPage'));
const ListeningPage = lazy(() => import('../features/labs/ListeningPage'));
const SpellingPage = lazy(() => import('../features/labs/SpellingPage'));
const DiscriminationPage = lazy(() => import('../features/labs/DiscriminationPage'));
const WritingPage = lazy(() => import('../features/writing/WritingPage'));
const InsightsPage = lazy(() => import('../features/insights/InsightsPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const AboutPage = lazy(() => import('../features/about/AboutPage'));
const OnboardingPage = lazy(() => import('../features/onboarding/OnboardingPage'));

function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <SkeletonBlock lines={4} />
    </div>
  );
}

/** First-run gate: onboarding before anything else (skippable, ≤90s).
 *  Waits for hydration — a pre-hydration redirect would send refreshing users
 *  with completed onboarding back to setup forever. */
function OnboardingGuard() {
  const hydrated = useProgress((s) => s.hydrated);
  const done = useProgress((s) => s.onboardingDone);
  const location = useLocation();
  if (!hydrated) return <Loading />;
  if (!done && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <OnboardingGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: (<Suspense fallback={<Loading />}><TodayPage /></Suspense>) },
          { path: '/learn', element: (<Suspense fallback={<Loading />}><SessionPage /></Suspense>) },
          { path: '/review', element: (<Suspense fallback={<Loading />}><ReviewPage /></Suspense>) },
          { path: '/roadmap', element: (<Suspense fallback={<Loading />}><RoadmapPage /></Suspense>) },
          { path: '/library', element: (<Suspense fallback={<Loading />}><LibraryPage /></Suspense>) },
          { path: '/word/:id', element: (<Suspense fallback={<Loading />}><WordDetailPage /></Suspense>) },
          { path: '/labs', element: (<Suspense fallback={<Loading />}><LabsPage /></Suspense>) },
          { path: '/labs/listening', element: (<Suspense fallback={<Loading />}><ListeningPage /></Suspense>) },
          { path: '/labs/spelling', element: (<Suspense fallback={<Loading />}><SpellingPage /></Suspense>) },
          { path: '/labs/discrimination', element: (<Suspense fallback={<Loading />}><DiscriminationPage /></Suspense>) },
          { path: '/writing', element: (<Suspense fallback={<Loading />}><WritingPage /></Suspense>) },
          { path: '/insights', element: (<Suspense fallback={<Loading />}><InsightsPage /></Suspense>) },
          { path: '/settings', element: (<Suspense fallback={<Loading />}><SettingsPage /></Suspense>) },
          { path: '/about', element: (<Suspense fallback={<Loading />}><AboutPage /></Suspense>) },
        ],
      },
      { path: '/onboarding', element: (<Suspense fallback={<Loading />}><OnboardingPage /></Suspense>) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
