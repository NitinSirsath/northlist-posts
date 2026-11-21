/** One draft on its own page (phone): the back button, the source link and the draft editor. */
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { DraftEditor } from '../components/DraftEditor';
import { LoadError, Loading } from '../components/ui';
import { useToday } from '../queries';

export function PostPage({ id }: { id: string }) {
  const today = useToday();
  const navigate = useNavigate();
  const idea = today.data?.find((item) => item.id === id);
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-[calc(env(safe-area-inset-bottom)+120px)] md:pt-8">
      <div className="sticky top-0 z-10 flex h-[calc(env(safe-area-inset-top)+54px)] items-end justify-between pb-1">
        <Link to="/" className="glass inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-2 text-[17px]">
          <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
          Today
        </Link>
        {idea?.sourceUrl && (
          <a
            href={idea.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the source"
            className="glass inline-flex size-10 items-center justify-center rounded-full"
          >
            <ExternalLink size={19} aria-hidden />
          </a>
        )}
      </div>
      {today.isPending ? (
        <div className="mt-4">
          <Loading />
        </div>
      ) : today.isError && !today.data ? (
        <div className="mt-4">
          <LoadError error={today.error} onRetry={() => void today.refetch()} />
        </div>
      ) : idea && idea.kind !== 'REPLY' ? (
        <div className="mt-1">
          <DraftEditor idea={idea} phone onSkipped={() => void navigate({ to: '/' })} />
        </div>
      ) : (
        <div className="panel mt-4 flex flex-col items-center gap-2 px-6 py-10 text-center text-text-secondary">
          <b className="text-text-primary">This draft is not on Today any more.</b>
          <Link to="/" className="text-link">
            Back to Today
          </Link>
        </div>
      )}
    </div>
  );
}
