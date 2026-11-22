/** Code-based routes. Everything except /sign-in needs a session; a 401 shows the sign-in page in place. */
import {
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { isApiError } from './api';
import { Shell } from './components/Shell';
import { LoadError } from './components/ui';
import { ConnectPage, type ConnectSearch } from './pages/Connect';
import { PostPage } from './pages/PostPage';
import { PostedPage } from './pages/Posted';
import { ProfilePage } from './pages/Profile';
import { SignInPage } from './pages/SignIn';
import { SpacePage, type SpaceSearch } from './pages/Space';
import { TodayPage } from './pages/Today';
import { WelcomePage, type WelcomeSearch } from './pages/Welcome';
import { useMe } from './queries';

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <Navigate to="/" replace />,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({ error: text(search.error) }),
  component: function SignInRoute() {
    const { error } = signInRoute.useSearch();
    const me = useMe();
    if (me.data) return <Navigate to="/" replace />;
    return <SignInPage error={error} />;
  },
});

const one = (value: unknown) => (value === 1 || value === '1' ? 1 : undefined);

/** The first-run steps: full screen, no side menu. Also "New space" (?new=1). */
const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  validateSearch: (search: Record<string, unknown>): WelcomeSearch => ({
    channel: text(search.channel),
    connected: one(search.connected),
    error: text(search.error),
    new: one(search.new),
  }),
  component: function WelcomeRoute() {
    const search = welcomeRoute.useSearch();
    const me = useMe();
    if (me.isPending) return <div role="status" aria-label="Loading" className="min-h-dvh" />;
    if (!me.data) return <SignInPage />;
    const making = search.new === 1 || Boolean(sessionStorage.getItem('nlp.newSpace'));
    if (me.data.onboarded && !making) return <Navigate to="/" replace />;
    return <WelcomePage me={me.data} search={search} />;
  },
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: function AppLayout() {
    const me = useMe();
    if (me.data && !me.data.onboarded) return <Navigate to="/welcome" replace />;
    if (me.data) return <Shell me={me.data} />;
    if (me.isPending) return <div role="status" aria-label="Loading" className="min-h-dvh" />;
    if (isApiError(me.error) && me.error.status === 401) return <SignInPage />;
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <LoadError error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  },
});

const todayRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  // The open draft on the laptop, so a reload keeps it.
  validateSearch: (search: Record<string, unknown>): { draft?: string } => ({ draft: text(search.draft) }),
  component: function TodayRoute() {
    return <TodayPage draft={todayRoute.useSearch().draft} />;
  },
});

const postRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/post/$id',
  component: function PostRoute() {
    const { id } = postRoute.useParams();
    return <PostPage id={id} />;
  },
});

const postedRoute = createRoute({ getParentRoute: () => appRoute, path: '/posted', component: PostedPage });
const spaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/space',
  validateSearch: (search: Record<string, unknown>): SpaceSearch => ({
    channel: text(search.channel),
    connected: one(search.connected),
    error: text(search.error),
  }),
  component: function SpaceRoute() {
    return <SpacePage search={spaceRoute.useSearch()} />;
  },
});
/** The old Profile page's address. */
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile', component: ProfilePage });

const connectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/connect',
  validateSearch: (search: Record<string, unknown>): ConnectSearch => ({
    channel: text(search.channel),
    connected: search.connected === 1 || search.connected === '1' ? 1 : undefined,
    error: text(search.error),
  }),
  component: function ConnectRoute() {
    return <ConnectPage search={connectRoute.useSearch()} />;
  },
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  welcomeRoute,
  appRoute.addChildren([todayRoute, postRoute, postedRoute, spaceRoute, profileRoute, connectRoute]),
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history, defaultPreload: 'intent', scrollRestoration: true });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
