import Link from 'next/link'
import { Fragment } from 'react'

import { RichTextBody } from './RichTextBody'

import type { Category, Post, User } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { cutAfterParagraph, splitAtCuts } from '@/lib/lexical-split'
import type { LexicalRoot } from '@/lib/lexical-text'
import { authorUrl, categoryUrl, postUrl } from '@/lib/routes'
import { youtubeThumbnailUrl } from '@/lib/video'
import { AdSlot } from './AdSlot'
import { GamSlot } from './GamSlot'
import { PostCard } from './PostCard'
import { PostImage } from './PostImage'
import { SectionHeading } from './SectionHeading'
import { ShareButtons } from './ShareButtons'
import { VideoPlayer } from './VideoPlayer'

/**
 * Article page body. With `ads` (Site Settings › adsEnabled; never in the draft preview)
 * the page carries its Ad Manager positions:
 *   - desktop: a 300px rail beside the article — Halfpage_1, then Halfpage_2 sticky under
 *     the header — and Billboard_RG_PB between the article and the related posts;
 *   - every viewport: the in-read after the 2nd paragraph (after the body if it is shorter);
 *   - phone/tablet, where there is no rail: the same two halfpages inline, one after the
 *     6th paragraph of a long article and one at the end of the body.
 * The top billboard, skin and bottom banner come from the layout.
 */
export function ArticleView({
  post,
  related = [],
  ads = false,
}: {
  post: Post
  related?: Post[]
  ads?: boolean
}) {
  const category = post.category && typeof post.category === 'object' ? (post.category as Category) : null
  const authors = (post.authors ?? []).filter((a): a is User => typeof a === 'object')
  const shareUrl = `${process.env.NEXT_PUBLIC_SERVER_URL ?? ''}${postUrl(post)}`

  const content = post.content as LexicalRoot
  const inreadCut = ads ? cutAfterParagraph(content, 2) : null
  const inlineCut = ads ? cutAfterParagraph(content, 6) : null
  const cuts = [inreadCut, inlineCut].filter((c): c is number => c !== null)
  const bodyAds = [
    <GamSlot key="inread" unit="Inread" className="my-8" />,
    <GamSlot key="inline" unit="Halfpage_1" only={['phone', 'tablet']} className="my-8" />,
  ]
  const bodyParts = content ? splitAtCuts(content, cuts) : []

  return (
    <div
      className={
        ads
          ? 'mx-auto max-w-[1296px] px-4 py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10'
          : 'mx-auto max-w-[1000px] px-4 py-8'
      }
    >
      <article className="min-w-0">
        <nav className="mb-3 text-sm text-zinc-700">
          <Link href="/" className="hover:text-brand-700">الرئيسية</Link>
          {category && (
            <>
              <span className="px-1">/</span>
              <Link href={categoryUrl(category.slug ?? '')} className="font-bold text-brand-700 hover:underline">
                {category.name}
              </Link>
            </>
          )}
        </nav>

        <h1 className="text-3xl font-extrabold leading-tight text-zinc-900 sm:text-4xl">{post.title}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-700">
          {authors.length > 0 && (
            <span className="flex flex-wrap items-center gap-1">
              بقلم:
              {authors.map((a, i) => (
                <span key={a.id}>
                  <Link href={authorUrl(a.id)} className="font-bold text-zinc-700 hover:text-brand-700">
                    {a.name}
                  </Link>
                  {i < authors.length - 1 && '، '}
                </span>
              ))}
            </span>
          )}
          {post.publishedAt && (
            <>
              <span aria-hidden>•</span>
              <time dateTime={new Date(post.publishedAt).toISOString()}>{formatDate(post.publishedAt)}</time>
            </>
          )}
        </div>

        {post.featuredType === 'video' && post.featuredVideoUrl ? (
          <div className="mt-6">
            <VideoPlayer
              videoUrl={post.featuredVideoUrl}
              thumbnail={post.featuredImage}
              title={post.title}
              fallbackPosterUrl={youtubeThumbnailUrl(post.featuredVideoUrl) ?? undefined}
            />
          </div>
        ) : (
          <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl">
            <PostImage image={post.featuredImage} alt={post.title} priority sizes="(max-width: 1000px) 100vw, 1000px" />
          </div>
        )}

        {post.excerpt && <p className="mt-6 text-lg font-medium text-zinc-600">{post.excerpt}</p>}

        {post.content && (
          <div className="mt-6">
            {bodyParts.map((part, i) => (
              <Fragment key={i}>
                <RichTextBody data={part} className="prose-ar" />
                {i < cuts.length && bodyAds[i]}
              </Fragment>
            ))}
          </div>
        )}

        {/* Too short for a cut: the in-read follows the body instead. */}
        {ads && post.content && inreadCut === null && <GamSlot unit="Inread" className="my-8" />}

        {post.isRecipe && post.recipe && <RecipeBlock recipe={post.recipe} />}

        {ads && <GamSlot unit="Halfpage_2" only={['phone', 'tablet']} className="my-8" />}

        {/* In-article ad, targeted to this post's category — renders nothing when unscheduled. */}
        <AdSlot placement="in-article" categoryId={category?.id} className="my-8" />

        <hr className="my-8 border-zinc-200" />
        <ShareButtons url={shareUrl} title={post.title} />
      </article>

      {ads && (
        <div className="hidden lg:block">
          <div className="flex h-full flex-col gap-8">
            <GamSlot unit="Halfpage_1" only={['desktop']} reserve="max" />
            {/* Sticky just under the header (134px tall on desktop). */}
            <div className="sticky top-[9.5rem]">
              <GamSlot unit="Halfpage_2" only={['desktop']} reserve="max" />
            </div>
          </div>
        </div>
      )}

      {ads && <GamSlot unit="Billboard_RG_PB" only={['desktop']} className="mt-12 lg:col-span-2" />}

      {related.length > 0 && (
        <section className="mt-12 lg:col-span-2">
          <SectionHeading title="مقالات ذات صلة" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
            {related.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function RecipeBlock({ recipe }: { recipe: NonNullable<Post['recipe']> }) {
  const ingredients = recipe.ingredients ?? []
  const instructions = recipe.instructions ?? []
  return (
    <section className="mt-8 rounded-2xl bg-brand-50 p-6">
      <h2 className="text-xl font-extrabold text-brand-700">الوصفة</h2>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-600">
        {recipe.prepTime && <span>وقت التحضير: {recipe.prepTime}</span>}
        {recipe.cookTime && <span>وقت الطهي: {recipe.cookTime}</span>}
        {recipe.servings && <span>الحصص: {recipe.servings}</span>}
        {recipe.cuisine && <span>المطبخ: {recipe.cuisine}</span>}
      </div>
      {ingredients.length > 0 && (
        <>
          <h3 className="mt-5 font-bold text-zinc-900">المكوّنات</h3>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-zinc-700">
            {ingredients.map((ing, i) => (
              <li key={i}>{ing.item}</li>
            ))}
          </ul>
        </>
      )}
      {instructions.length > 0 && (
        <>
          <h3 className="mt-5 font-bold text-zinc-900">خطوات التحضير</h3>
          <ol className="mt-2 list-decimal space-y-2 ps-5 text-zinc-700">
            {instructions.map((ins, i) => (
              <li key={i}>{ins.step}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
