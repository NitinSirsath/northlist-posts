/** Posted: what went out this week, and how many people clicked your links. */
import type { PostView } from '../../shared/contracts';
import { LoadError, Loading, Page, SectionHeading } from '../components/ui';
import { channelName, dayLabel, plural } from '../lib/format';
import { usePosted } from '../queries';

function Tile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 pt-3 pb-3.5 md:gap-1.5 md:px-6 md:pt-[18px] md:pb-5">
      <span className="order-2 text-[15px] text-text-secondary md:order-none md:text-xs">{label}</span>
      <span className="order-1 text-[28px] leading-[34px] font-bold tracking-[-0.02em] tabular-nums md:order-none md:font-semibold">
        {value.toLocaleString('en-US')}
      </span>
      <span className="order-3 text-xs text-text-tertiary">{note}</span>
    </div>
  );
}

/** Laptop: one grid row. Phone: the text first, then date, channel, clicks and Open on one line. */
function PostRow({ post, title }: { post: PostView; title?: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 md:grid md:grid-cols-[110px_80px_1fr_90px_60px] md:gap-4 md:px-6">
      <span className="text-[13px] text-text-secondary">{dayLabel(post.postedAt ?? post.sendAt)}</span>
      <span>
        <span className="tag tag-gray">{channelName(post.channel)}</span>
      </span>
      <span className="order-first basis-full truncate text-[17px] md:order-none md:basis-auto md:text-sm">
        {post.text || title}
      </span>
      <span className="text-[13px] text-text-secondary tabular-nums md:text-right">
        {post.status === 'FAILED' ? (
          <span className="tag tag-red">Failed</span>
        ) : (
          post.clicks !== null && plural(post.clicks, 'click')
        )}
      </span>
      <span className="ml-auto md:ml-0 md:text-right">
        {post.url && (
          <a className="text-link hover:underline" href={post.url} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        )}
      </span>
    </li>
  );
}

export function PostedPage() {
  const posted = usePosted();
  const data = posted.data;
  return (
    <Page title="Posted" subtitle="What went out, and who clicked your NorthList links.">
      {posted.isPending ? (
        <Loading />
      ) : !data ? (
        <LoadError error={posted.error} onRetry={() => void posted.refetch()} />
      ) : (
        <>
          <div className="panel grid grid-cols-2 md:[&>*+*]:border-l md:[&>*+*]:border-border-subtle">
            <Tile
              label="Posts this week"
              value={data.postsThisWeek}
              note={`${data.postsByChannel.X} on X, ${data.postsByChannel.LINKEDIN} on LinkedIn`}
            />
            <Tile
              label="Clicks on your links"
              value={data.clicksThisWeek}
              note={`${data.clicksByChannel.LINKEDIN} from LinkedIn, ${data.clicksByChannel.X} from X`}
            />
          </div>
          <SectionHeading title="This week" />
          {data.posts.length ? (
            <ul className="panel rows overflow-hidden">
              {data.posts.map((post) => (
                <PostRow key={post.id} post={post} title={data.ideaTitles[post.ideaId]} />
              ))}
            </ul>
          ) : (
            <div className="panel px-6 py-10 text-center text-text-secondary">Nothing posted this week yet.</div>
          )}
          <p className="px-1 text-xs leading-[18px] text-text-tertiary md:px-0">
            Clicks are counted when someone opens a NorthList link from your post. Sign-ups are not counted yet.
          </p>
        </>
      )}
    </Page>
  );
}
