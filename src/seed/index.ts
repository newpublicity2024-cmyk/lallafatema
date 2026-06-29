import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'
import { SEED_CATEGORIES, type SeedCategory } from '../lib/categories'

/** Build a minimal valid Lexical editor state from plain Arabic paragraphs. */
function lexical(paragraphs: string[]) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'rtl' as const,
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        version: 1,
        format: '' as const,
        indent: 0,
        direction: 'rtl' as const,
        textFormat: 0,
        children: [
          {
            type: 'text',
            version: 1,
            text,
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
          },
        ],
      })),
    },
  }
}

type SamplePost = {
  title: string
  categorySlug: string
  excerpt: string
  body: string[]
  isRecipe?: boolean
}

const SAMPLE_POSTS: SamplePost[] = [
  {
    title: 'إطلالات النجمات في حفل توزيع الجوائز تخطف الأنظار',
    categorySlug: 'celebrities',
    excerpt: 'تألقت النجمات بفساتين السهرة الفاخرة على السجادة الحمراء في أحدث الحفلات الفنية.',
    body: [
      'شهد حفل توزيع الجوائز هذا العام حضورًا لافتًا لنخبة من النجمات اللواتي اخترن إطلالات أنيقة جمعت بين الفخامة والبساطة.',
      'وتنوّعت الألوان بين الكلاسيكي والجريء، فيما لفتت بعض الإطلالات الأنظار بتفاصيلها المطرّزة يدويًا.',
    ],
  },
  {
    title: 'أبرز صيحات الموضة لموسم الصيف المقبل',
    categorySlug: 'fashion',
    excerpt: 'الألوان الزاهية والأقمشة الخفيفة تتصدّر صيحات الموضة لهذا الصيف.',
    body: [
      'يميل خبراء الموضة هذا الموسم إلى الألوان الزاهية والقصّات الواسعة المريحة التي تناسب أجواء الصيف الحارة.',
      'كما تعود التصاميم المستوحاة من الطابع المغربي الأصيل لتتصدّر واجهات دور الأزياء العالمية.',
    ],
  },
  {
    title: 'روتين العناية بالبشرة في المنزل بمكوّنات طبيعية',
    categorySlug: 'beauty',
    excerpt: 'وصفات طبيعية بسيطة للحصول على بشرة نضرة دون تكاليف باهظة.',
    body: [
      'تُعدّ المكوّنات الطبيعية المتوفّرة في المطبخ خيارًا اقتصاديًا وفعّالًا للعناية بالبشرة.',
      'ينصح الخبراء بالانتظام في الروتين اليومي مع الحرص على ترطيب البشرة وحمايتها من الشمس.',
    ],
  },
  {
    title: 'نصائح غذائية لتعزيز المناعة خلال تغيّر الفصول',
    categorySlug: 'health',
    excerpt: 'أطعمة غنية بالفيتامينات تساعد على تقوية جهاز المناعة.',
    body: [
      'يلعب النظام الغذائي المتوازن دورًا أساسيًا في دعم جهاز المناعة، خاصة خلال فترات تغيّر الطقس.',
      'ويوصي أخصائيو التغذية بالإكثار من الخضروات والفواكه الموسمية وشرب كميات كافية من الماء.',
    ],
  },
  {
    title: 'أفكار لتنظيم المنزل وإضفاء لمسة عصرية',
    categorySlug: 'lifestyle',
    excerpt: 'حلول ذكية لتنظيم المساحات الصغيرة بأناقة.',
    body: [
      'يمكن تحويل المساحات الصغيرة إلى أماكن عملية وأنيقة من خلال اختيار الأثاث متعدّد الاستخدامات.',
      'كما تساهم الإضاءة الدافئة والنباتات المنزلية في إضفاء أجواء مريحة ومنعشة.',
    ],
  },
  {
    title: 'طريقة تحضير الكسكس المغربي بالخضار واللحم',
    categorySlug: 'kitchen',
    excerpt: 'وصفة الكسكس التقليدية خطوة بخطوة لمائدة عائلية شهية.',
    isRecipe: true,
    body: [
      'يُعدّ الكسكس من أشهر الأطباق المغربية التي لا تغيب عن موائد يوم الجمعة.',
      'يُقدّم ساخنًا مع مرق الخضار واللحم الطري، ويُزيّن بالحمّص والزبيب حسب الرغبة.',
    ],
  },
  {
    title: 'تسريحات شعر أنيقة تناسب يوم الزفاف',
    categorySlug: 'bride',
    excerpt: 'أجمل تسريحات العرائس لإطلالة لا تُنسى في اليوم الكبير.',
    body: [
      'تبحث كل عروس عن تسريحة تجمع بين الأناقة والثبات طوال يوم الزفاف.',
      'وتتنوّع الخيارات بين التسريحات المرفوعة الكلاسيكية والإطلالات المنسدلة الناعمة.',
    ],
  },
  {
    title: 'حصري: كواليس تصوير العمل الدرامي الجديد',
    categorySlug: 'exclusive',
    excerpt: 'تفاصيل خاصة من كواليس أحد أبرز الأعمال الدرامية لهذا الموسم.',
    body: [
      'في جولة حصرية خلف الكواليس، نكشف تفاصيل التحضير للعمل الدرامي المنتظر.',
      'وأكّد فريق العمل أنّ المشاهد المصوّرة تحمل مفاجآت كثيرة للجمهور.',
    ],
  },
  {
    title: 'الفنانة المغربية تتحدث عن مشروعها الفني المقبل',
    categorySlug: 'celebrities',
    excerpt: 'حوار خاص حول التفاصيل والكواليس والطموحات الجديدة.',
    body: [
      'في حوار خاص، تحدّثت الفنانة عن مشروعها الفني الجديد الذي تستعدّ لإطلاقه قريبًا.',
      'وعبّرت عن سعادتها بالتعاون مع نخبة من المبدعين في هذا العمل.',
    ],
  },
  {
    title: 'دليلكِ لاختيار العطر المناسب لكل مناسبة',
    categorySlug: 'beauty',
    excerpt: 'كيف تختارين عطرك المثالي بحسب الوقت والمناسبة؟',
    body: [
      'يُعدّ العطر لمسة أخيرة تكمّل أناقة المرأة وتترك انطباعًا لا يُنسى.',
      'وينصح الخبراء باختيار العطور الخفيفة نهارًا والأكثر كثافة في المناسبات المسائية.',
    ],
  },
  {
    title: 'آخر الأخبار: فعاليات ثقافية وفنية هذا الأسبوع',
    categorySlug: 'news',
    excerpt: 'أبرز المواعيد الثقافية والفنية التي تنتظر الجمهور.',
    body: [
      'يشهد هذا الأسبوع سلسلة من الفعاليات الثقافية والفنية المتنوّعة في عدّة مدن.',
      'وتتضمّن البرامج معارض وحفلات وأمسيات مفتوحة أمام الجمهور.',
    ],
  },
  {
    title: 'تمارين رياضية بسيطة يمكن ممارستها في المنزل',
    categorySlug: 'health',
    excerpt: 'روتين رياضي خفيف للحفاظ على لياقتكِ دون الحاجة لمعدات.',
    body: [
      'لا تتطلّب ممارسة الرياضة بالضرورة الاشتراك في نادٍ، إذ يمكن البدء من المنزل.',
      'ويكفي تخصيص دقائق يوميًا لتمارين بسيطة تحافظ على نشاط الجسم وحيويته.',
    ],
  },
]

type SampleVideo = {
  title: string
  videoUrl: string
  description: string
  duration: string
}

const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    title: 'مقابلة حصرية مع نجمة الموسم حول كواليس أحدث أعمالها',
    videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    description: 'حديث خاص عن التحضيرات والطموحات الفنية المقبلة.',
    duration: '08:24',
  },
  {
    title: 'جولة في أسبوع الموضة: أبرز الإطلالات على المنصّة',
    videoUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
    description: 'تغطية مصوّرة لأهم صيحات العروض هذا الموسم.',
    duration: '05:11',
  },
  {
    title: 'وصفة الكسكس المغربي خطوة بخطوة',
    videoUrl: 'https://www.youtube.com/watch?v=ysz5S6PUM-U',
    description: 'طريقة تحضير الطبق التقليدي على طريقة لالة فاطمة.',
    duration: '12:47',
  },
  {
    title: 'روتين العناية بالبشرة في خمس دقائق',
    videoUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    description: 'خطوات بسيطة لبشرة نضرة بمكوّنات في متناول الجميع.',
    duration: '04:32',
  },
  {
    title: 'تسريحات زفاف أنيقة لإطلالة لا تُنسى',
    videoUrl: 'https://www.youtube.com/watch?v=L_jWHffIx5E',
    description: 'أفكار تسريحات للعروس بين الكلاسيكي والعصري.',
    duration: '06:58',
  },
]

async function run() {
  const payload = await getPayload({ config: await config })

  // 1) Categories (idempotent by slug, with parent/child).
  const idBySlug = new Map<string, number>()

  const upsertCategory = async (cat: SeedCategory, parentId?: number) => {
    const existing = await payload.find({
      collection: 'categories',
      where: { slug: { equals: cat.slug } },
      limit: 1,
    })
    let id: number
    if (existing.docs[0]) {
      id = existing.docs[0].id
    } else {
      const created = await payload.create({
        collection: 'categories',
        data: { name: cat.name, slug: cat.slug, ...(parentId ? { parent: parentId } : {}) },
      })
      id = created.id
      payload.logger.info(`Created category: ${cat.name}`)
    }
    idBySlug.set(cat.slug, id)
    for (const child of cat.children ?? []) await upsertCategory(child, id)
  }

  for (const cat of SEED_CATEGORIES) await upsertCategory(cat)

  // 2) An author to attribute sample posts to (first admin user).
  const admins = await payload.find({
    collection: 'users',
    where: { role: { equals: 'admin' } },
    limit: 1,
  })
  const authorId = admins.docs[0]?.id

  // 3) Sample posts (idempotent by title).
  let order = 0
  for (const sample of SAMPLE_POSTS) {
    const exists = await payload.find({
      collection: 'posts',
      where: { title: { equals: sample.title } },
      limit: 1,
    })
    if (exists.docs[0]) continue

    const categoryId = idBySlug.get(sample.categorySlug)
    if (!categoryId) continue

    // Stagger publish dates a few hours apart, most recent first.
    const publishedAt = new Date(Date.now() - order * 5 * 60 * 60 * 1000).toISOString()
    order += 1

    await payload.create({
      collection: 'posts',
      data: {
        title: sample.title,
        excerpt: sample.excerpt,
        category: categoryId,
        ...(authorId ? { authors: [authorId] } : {}),
        isRecipe: Boolean(sample.isRecipe),
        content: lexical(sample.body),
        publishedAt,
        _status: 'published',
      },
    })
    payload.logger.info(`Created post: ${sample.title}`)
  }

  // 4) Sample videos (idempotent by title; category = فيديو, no thumbnail → placeholder).
  const videoCategoryId = idBySlug.get('video')
  let videoOrder = 0
  for (const sample of SAMPLE_VIDEOS) {
    const exists = await payload.find({
      collection: 'videos',
      where: { title: { equals: sample.title } },
      limit: 1,
    })
    if (exists.docs[0]) continue

    const publishedAt = new Date(Date.now() - videoOrder * 6 * 60 * 60 * 1000).toISOString()
    videoOrder += 1

    await payload.create({
      collection: 'videos',
      data: {
        title: sample.title,
        videoUrl: sample.videoUrl,
        description: sample.description,
        duration: sample.duration,
        ...(videoCategoryId ? { category: videoCategoryId } : {}),
        publishedAt,
        _status: 'published',
      },
    })
    payload.logger.info(`Created video: ${sample.title}`)
  }

  payload.logger.info('Seed complete.')
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
