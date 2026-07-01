/**
 * Inject an admin-authored HTML/JS blob into the live DOM so that embedded
 * <script> tags actually execute.
 *
 * Browsers will NOT run scripts that arrive via innerHTML / a parsed fragment
 * (their "already started" flag is set). The reliable cross-browser pattern is:
 * parse the markup inertly inside a <template>, then rebuild each <script> as a
 * fresh element (fresh scripts run when inserted). Non-script nodes are cloned
 * as-is; the tree is walked recursively so scripts nested in wrappers also run.
 *
 * SECURITY: the HTML is executed verbatim. Callers must only pass content
 * authored by trusted admins (Site Settings / Ads), never visitor input.
 *
 * Returns the inserted top-level nodes so callers can remove them on cleanup.
 */
function reanimate(node: Node): Node {
  if (node.nodeName === 'SCRIPT') {
    const old = node as HTMLScriptElement
    const fresh = document.createElement('script')
    for (const attr of Array.from(old.attributes)) fresh.setAttribute(attr.name, attr.value)
    fresh.text = old.textContent ?? ''
    return fresh
  }
  const clone = node.cloneNode(false)
  node.childNodes.forEach((child) => clone.appendChild(reanimate(child)))
  return clone
}

export function injectHtml(target: HTMLElement, html: string, atStart = false): Node[] {
  const template = document.createElement('template')
  template.innerHTML = html
  const nodes = Array.from(template.content.childNodes).map(reanimate)
  const ref = atStart ? target.firstChild : null
  for (const node of nodes) {
    if (atStart) target.insertBefore(node, ref)
    else target.appendChild(node)
  }
  return nodes
}
