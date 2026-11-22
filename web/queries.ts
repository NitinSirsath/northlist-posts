/** TanStack Query hooks for every API call the app makes. */
import { QueryCache, QueryClient, MutationCache, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Channel,
  Goal,
  IdeaView,
  IntegrationTokenView,
  MeView,
  PostView,
  PostedSummary,
  SourceLinkView,
  SpaceFields,
  SpaceView,
} from '../shared/contracts';
import { api, isApiError } from './api';
import { pickSpace, useSavedSpaceId } from './lib/space';
import { latestPost } from './lib/today';

export { latestPost };

export const keys = {
  me: ['me'] as const,
  today: (space: string) => ['ideas', 'today', space] as const,
  allToday: ['ideas', 'today'] as const,
  posted: (space: string) => ['posted', space] as const,
  spaces: ['spaces'] as const,
  tokens: ['tokens'] as const,
};

export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    // A 401 anywhere means the session ended: check /api/me again so the sign-in page shows.
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (isApiError(err) && err.status === 401 && query.queryKey[0] !== 'me')
          void client.invalidateQueries({ queryKey: keys.me });
      },
    }),
    mutationCache: new MutationCache({
      onError: (err) => {
        if (isApiError(err) && err.status === 401) void client.invalidateQueries({ queryKey: keys.me });
      },
    }),
    defaultOptions: {
      queries: {
        retry: (count, err) => !(isApiError(err) && err.status > 0 && err.status < 500) && count < 2,
        refetchOnWindowFocus: true,
        staleTime: 5_000,
      },
      mutations: { retry: false },
    },
  });
  return client;
}

const isMoving = (post: PostView | undefined) => post?.status === 'WAITING' || post?.status === 'SENDING';
export const hasMovingPost = (ideas: IdeaView[]) =>
  ideas.some((idea) => isMoving(latestPost(idea, 'X')) || isMoving(latestPost(idea, 'LINKEDIN')));

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<MeView>('/api/me') });

export const useSpaces = () =>
  useQuery({ queryKey: keys.spaces, queryFn: () => api<SpaceView[]>('/api/spaces'), refetchInterval: 30_000 });

/** The space the app shows now (switcher), with the list it came from. */
export function useCurrentSpace() {
  const spaces = useSpaces();
  const saved = useSavedSpaceId();
  return { space: pickSpace(spaces.data, saved), spaces };
}

export function useToday() {
  const { space } = useCurrentSpace();
  const id = space?.id ?? '';
  return useQuery({
    queryKey: keys.today(id),
    queryFn: () => api<IdeaView[]>(`/api/ideas/today?space=${encodeURIComponent(id)}`),
    enabled: Boolean(id),
    // Fast while a post is counting down or sending, so Undo and "Posted" show on time.
    refetchInterval: (query) => (hasMovingPost(query.state.data ?? []) ? 1_000 : 15_000),
  });
}

export function usePosted() {
  const { space } = useCurrentSpace();
  const id = space?.id ?? '';
  return useQuery({
    queryKey: keys.posted(id),
    queryFn: () => api<PostedSummary>(`/api/posted?space=${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
}

export const useTokens = (poll = false) =>
  useQuery({
    queryKey: keys.tokens,
    queryFn: () => api<IntegrationTokenView[]>('/api/tokens'),
    refetchInterval: poll ? 3_000 : false,
  });

/** Puts one changed idea back into the Today list. */
function useSetIdea() {
  const client = useQueryClient();
  return (idea: IdeaView) =>
    client.setQueryData<IdeaView[]>(keys.today(idea.spaceId), (list) =>
      list?.map((item) => (item.id === idea.id ? idea : item)),
    );
}

export type IdeaPatch = Partial<Pick<IdeaView, 'take'> & { xText: string; linkedinText: string }>;

export function useEditIdea(id: string) {
  const setIdea = useSetIdea();
  return useMutation({
    mutationFn: (patch: IdeaPatch) => api<IdeaView>(`/api/ideas/${id}`, 'PATCH', patch),
    onSuccess: setIdea,
  });
}

export function usePostIdea(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channel: Channel) => api<PostView>(`/api/ideas/${id}/post`, 'POST', { channel }),
    onSuccess: (post) => {
      client.setQueriesData<IdeaView[]>({ queryKey: keys.allToday }, (list) =>
        list?.map((idea) => (idea.id === id ? { ...idea, posts: [...idea.posts, post] } : idea)),
      );
      void client.invalidateQueries({ queryKey: keys.allToday });
    },
  });
}

export function useUndoPost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api<{ ok: true }>(`/api/posts/${postId}/undo`, 'POST'),
    onSuccess: (_result, postId) =>
      client.setQueriesData<IdeaView[]>({ queryKey: keys.allToday }, (list) =>
        list?.map((idea) => ({
          ...idea,
          posts: idea.posts.map((p) => (p.id === postId ? { ...p, status: 'CANCELLED' as const } : p)),
        })),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: keys.allToday }),
  });
}

export function useSkipIdea(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>(`/api/ideas/${id}/skip`, 'POST'),
    onSuccess: () => {
      client.setQueriesData<IdeaView[]>({ queryKey: keys.allToday }, (list) => list?.filter((idea) => idea.id !== id));
      void client.invalidateQueries({ queryKey: keys.allToday });
      void client.invalidateQueries({ queryKey: keys.spaces });
    },
  });
}

/** Puts one changed space back into the list. */
function useSetSpace() {
  const client = useQueryClient();
  return (space: SpaceView) =>
    client.setQueryData<SpaceView[]>(keys.spaces, (list) =>
      list
        ? list.some((s) => s.id === space.id)
          ? list.map((s) => (s.id === space.id ? space : s))
          : [...list, space]
        : [space],
    );
}

export function useCreateSpace() {
  const setSpace = useSetSpace();
  return useMutation({
    mutationFn: (fields: { goal: Goal } & Partial<SpaceFields>) => api<SpaceView>('/api/spaces', 'POST', fields),
    onSuccess: setSpace,
  });
}

export function useUpdateSpace() {
  const setSpace = useSetSpace();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string } & Partial<SpaceFields>) =>
      api<SpaceView>(`/api/spaces/${id}`, 'PATCH', fields),
    onSuccess: setSpace,
  });
}

export function useDeleteSpace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/spaces/${id}`, 'DELETE'),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.spaces }),
  });
}

export function useAddLink(spaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api<SourceLinkView>(`/api/spaces/${spaceId}/links`, 'POST', { url }),
    // The first website may also name the product: read the whole space again.
    onSuccess: () => client.invalidateQueries({ queryKey: keys.spaces }),
  });
}

export function useRemoveLink(spaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => api<{ ok: true }>(`/api/spaces/${spaceId}/links/${linkId}`, 'DELETE'),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.spaces }),
  });
}

export function useSaveOnboarding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { step: number; done?: boolean }) =>
      api<{ onboardingStep: number; onboarded: boolean }>('/api/onboarding', 'PUT', body),
    onSuccess: (state) => client.setQueryData<MeView>(keys.me, (me) => (me ? { ...me, ...state } : me)),
  });
}

export function useCreateToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<{ token: IntegrationTokenView; plaintext: string }>('/api/tokens', 'POST', { name }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tokens }),
  });
}

export function useRevokeToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<IntegrationTokenView>(`/api/tokens/${id}/revoke`, 'POST'),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tokens }),
  });
}

export function useDisconnect(spaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channel: Channel) =>
      api<unknown>(`/api/spaces/${spaceId}/connections/${channel === 'X' ? 'x' : 'linkedin'}`, 'DELETE'),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.spaces }),
  });
}

export function useSignOut() {
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/api/auth/sign-out', 'POST'),
    // A full reload clears every cached page.
    onSuccess: () => window.location.assign('/sign-in'),
  });
}
