# RBAC Audit — Phase 8.2 (2026-07-08)

Access-control review of every collection/global. Verdict: the posture is sound;
no rewrite. One regression test added (`tests/int/rbac.int.spec.ts`).

| Collection/Global | create | read | update | delete | Verdict |
|---|---|---|---|---|---|
| Posts | authenticated (any logged-in user, incl. journalist) | published to public; authors also see their own drafts (`canReadPosts`) | own only (`canModifyOwnPosts`; admin/editor: all) | own only (`canModifyOwnPosts`) | OK — see note 3 |
| Tags | authenticated | anyone (public) | admin/editor | admin/editor | OK — see note 3 |
| Videos | authenticated | published only (`canReadPublished`) | admin/editor | admin/editor | OK — see note 3 |
| Categories | admin/editor | anyone (public) | admin/editor | admin/editor | OK |
| MagazineIssues | admin/editor | published only (`canReadPublished`) | admin/editor | admin/editor | OK |
| Pages | admin/editor | published only (`canReadPublished`) | admin/editor | admin/editor | OK |
| Ads | admin/editor | active window only (`canReadActiveAds`) | admin/editor | admin/editor | OK |
| Redirects | admin/editor | anyone (public map) | admin/editor | admin/editor | OK |
| Media | authenticated | anyone (public) | authenticated | admin/editor | OK — see note 1 |
| Users | admin | `Boolean(user)` (any logged-in user) | admin-or-self (`isAdminOrSelf`) | admin | OK — see note 2 |
| Global: SiteSettings | — | anyone (public) | admin | — | OK |
| Global: Homepage | — | anyone (public) | admin/editor | — | OK |
| Global: MainMenu | — | anyone (public) | admin/editor | — | OK |

"authenticated" = any logged-in user (`isAuthenticated`, includes journalists); it is NOT
role-gated. Where a role gate applies it is named explicitly (admin / admin+editor).

**Note 3 — least-privilege properties worth recording (all intended).** Journalists can
*create* Posts, Tags, and Videos, but on Posts they can only modify their OWN documents:
`canModifyOwnPosts` scopes update/delete to `{ authors: { in: [user.id] } }` for
non-admin/editor users, so a journalist cannot edit or delete another author's post. The
post `author` field's update is admin/editor-locked (`isAdminOrEditorFieldLevel`), so a
journalist cannot reassign authorship to hijack a post or offload their own. Tags/Videos
created by a journalist can only be *modified* by admin/editor (update/delete are role-
gated), so journalists also cannot publish taxonomy/video changes. This is a clean
"create-your-own vs. edit-everyone's" separation — exactly the intended posture.

**Privilege escalation:** `Users.role` is field-level locked to admins
(`isAdminFieldLevel` on create+update) — a non-admin cannot grant themselves a role. Good.

**Note 1 — Media create/update = any authenticated user.** A journalist can edit/replace
any media. Acceptable for a small trusted editorial team; not tightened. Revisit if the
team grows or external contributors are added.

**Note 2 — Users.read = any authenticated user.** Any logged-in user can read all user
records (names, emails, bios). Needed so admin relationship pickers can list authors, and
acceptable for a small trusted team. Anonymous read is already blocked (regression test).
Tighten to self-or-editor+ only if warranted later.

**Deferred (tracked separately):** `reserved-slug-guard` — an editor could create a page
slug colliding with a static route (soft-404 in sitemap). Not an access issue; own follow-up.
