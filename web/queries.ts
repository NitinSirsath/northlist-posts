/** TanStack Query hooks for every API call the app makes. */
import { QueryCache, QueryClient, MutationCache, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Channel,
  ConnectionView,
  IdeaView,
  IntegrationTokenView,
  MeView,
  PostView,
  PostedSummary,
  ProfileFields,
  ProfileView,
} from '../shared/contracts';
import { api, isApiError } from './api';
import { latestPost } from './lib/today';

export { latestPost };

export const keys = {
  me: ['me'] as const,
  today: ['ideas', 'today'] as const,
  posted: ['posted'] as const,
  profile: ['profile'] as const,
  connections: ['connections'] as const,
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

export const useToday = () =>
  useQuery({
    queryKey: keys.today,
    queryFn: () => api<IdeaView[]>('/api/ideas/today'),
    // Fast while a post is counting down or sending, so Undo and "Posted" show on time.
    refetchInterval: (query) => (hasMovingPost(query.state.data ?? []) ? 1_000 : 15_000),
  });

export const usePosted = () => useQuery({ queryKey: keys.posted, queryFn: () => api<PostedSummary>('/api/posted') });
export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: () => api<ProfileView>('/api/profile') });
export const useConnections = () =>
  useQuery({ queryKey: keys.connections, queryFn: () => api<ConnectionView[]>('/api/connections') });
export const useTokens = () =>
  useQuery({ queryKey: keys.tokens, queryFn: () => api<IntegrationTokenView[]>('/api/tokens') });

/** Puts one changed idea back into the Today list. */
function useSetIdea() {
  const client = useQueryClient();
  return (idea: IdeaView) =>
    client.setQueryData<IdeaView[]>(keys.today, (list) => list?.map((item) => (item.id === idea.id ? idea : item)));
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
      client.setQueryData<IdeaView[]>(keys.today, (list) =>
        list?.map((idea) => (idea.id === id ? { ...idea, posts: [...idea.posts, post] } : idea)),
      );
      void client.invalidateQueries({ queryKey: keys.today });
    },
  });
}

export function useUndoPost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api<{ ok: true }>(`/api/posts/${postId}/undo`, 'POST'),
    onSuccess: (_result, postId) =>
      client.setQueryData<IdeaView[]>(keys.today, (list) =>
        list?.map((idea) => ({
          ...idea,
          posts: idea.posts.map((p) => (p.id === postId ? { ...p, status: 'CANCELLED' as const } : p)),
        })),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: keys.today }),
  });
}

export function useSkipIdea(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>(`/api/ideas/${id}/skip`, 'POST'),
    onSuccess: () => {
      client.setQueryData<IdeaView[]>(keys.today, (list) => list?.filter((idea) => idea.id !== id));
      void client.invalidateQueries({ queryKey: keys.today });
    },
  });
}

export function useSaveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (fields: Partial<ProfileFields>) => api<ProfileView>('/api/profile', 'PUT', fields),
    onSuccess: (profile) => client.setQueryData(keys.profile, profile),
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

export function useDisconnect() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channel: Channel) => api<unknown>(`/api/connections/${channel === 'X' ? 'x' : 'linkedin'}`, 'DELETE'),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.connections }),
  });
}

export function useSignOut() {
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/api/auth/sign-out', 'POST'),
    // A full reload clears every cached page.
    onSuccess: () => window.location.assign('/sign-in'),
  });
}
