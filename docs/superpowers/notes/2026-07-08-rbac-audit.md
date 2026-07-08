# RBAC Audit — Phase 8.2 (2026-07-08)

Access-control review of every collection/global. Verdict: the posture is sound;
no rewrite. One regression test added (`tests/int/rbac.int.spec.ts`).

| Collection/Global | create | read | update | delete | Verdict |
|---|---|---|---|---|---|
| Posts / Categories / Tags / Videos / MagazineIssues / Pages | role-gated | public (published) | role-gated | role-gated | OK |
| Ads | admin/editor | public (windowed via query) | admin/editor | admin/editor | OK |
| Redirects | admin/editor | public map only | admin/editor | admin/editor | OK |
| Media | authenticated | anyone | authenticated | admin/editor | OK — see note 1 |
| Users | admin | `Boolean(user)` | admin-or-self | admin | OK — see note 2 |
| Globals (Homepage/MainMenu/SiteSettings) | — | anyone/appropriate | admin | — | OK |

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
