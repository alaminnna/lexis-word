import { RouterProvider } from 'react-router-dom';
import { router } from './router';
// Synchronous, pre-paint hydration: the onboarding guard reads real persisted
// state on the very first render (a layout effect never runs on /onboarding,
// so hydration there was unreachable and every refresh bounced to onboarding).
import { hydrateStores } from '../store/persist';

hydrateStores();

export function App() {
  return <RouterProvider router={router} />;
}
