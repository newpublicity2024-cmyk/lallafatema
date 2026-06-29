import { RichText } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'

import type { Category, Post, User } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { authorUrl, categoryUrl, postUrl } from '@/lib/routes'
import { PostCard } from './PostCard'
import { PostImage } from './PostImage'
import { SectionHeading } from './SectionHeading'
import { ShareButtons } from './ShareButtons'

export function ArticleView({ post, related = [] }: { post: Post; related?: Post[] }) {
  const category = post.category && typeof post.category === 'object' ? (post.category as Category) : null
  const authors = (post.authors ?? []).filter((a): a is User => typeof a === 'object')
  const shareUrl = `${process.env.NEXT_PUBLIC_SERVER_URL ?? ''}${postUrl(post)}`

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <article>
        <nav className="mb-3 text-sm text-zinc-500">
          <Link href="/" className="hover:text-brand-600">الرئيسية</Link>
          {category && (
            <>
              <span className="px-1">/</span>
              <Link href={categoryUrl(category.slug ?? '')} className="font-bold text-brand-600 hover:underline">
                {category.name}
              </Link>
            </>
          )}
        </nav>

        <h1 className="text-3xl font-extrabold leading-tight text-zinc-900 sm:text-4xl">{post.title}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          {authors.length > 0 && (
            <span className="flex flex-wrap items-center gap-1">
              بقلم:
              {authors.map((a, i) => (
                <span key={a.id}>
                  <Link href={authorUrl(a.id)} className="font-bold text-zinc-700 hover:text-brand-600">
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

        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl">
          <PostImage image={post.featuredImage} alt={post.title} priority sizes="(max-width: 768px) 100vw, 768px" />
        </div>

        {post.excerpt && <p className="mt-6 text-lg font-medium text-zinc-600">{post.excerpt}</p>}

        {post.content && (
          <div className="mt-6">
            <RichText data={post.content} className="prose-ar" />
          </div>
        )}

        {post.isRecipe && post.recipe && <RecipeBlock recipe={post.recipe} />}

        <hr className="my-8 border-zinc-200" />
        <ShareButtons url={shareUrl} title={post.title} />
      </article>

      {related.length > 0 && (
        <section className="mt-12">
          <SectionHeading title="مقالات ذات صلة" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
            {related.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}
    </main>
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
