const sidebar = document.querySelector<HTMLElement>('.editor-sidebar');
const toggle = document.querySelector<HTMLButtonElement>('.editor-menu-toggle');
const closeButton = document.querySelector<HTMLButtonElement>('.editor-menu-close');
const backdrop = document.querySelector<HTMLElement>('.editor-menu-backdrop');
if (sidebar && toggle && closeButton && backdrop) {
  const mobile = matchMedia('(max-width: 1023px)');
  const background = [...document.querySelectorAll<HTMLElement>('.editor-header, .admin-main, body > .skip-link')];
  let open = false;
  const setOpen = (value: boolean, restoreFocus = true) => {
    open = value && mobile.matches;
    sidebar.inert = mobile.matches && !open;
    sidebar.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
    document.body.classList.toggle('editor-menu-open', open);
    background.forEach(element => { element.inert = open; });
    if (open) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      sidebar.setAttribute('aria-labelledby', 'editor-menu-title');
      closeButton.focus();
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      sidebar.removeAttribute('aria-labelledby');
      if (restoreFocus && mobile.matches) toggle.focus();
    }
  };
  const resize = () => {
    toggle.hidden = !mobile.matches;
    closeButton.hidden = !mobile.matches;
    setOpen(false, false);
  };
  document.body.classList.add('editor-menu-ready');
  resize();
  mobile.addEventListener('change', resize);
  toggle.addEventListener('click', () => setOpen(!open));
  closeButton.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  sidebar.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  });
  sidebar.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab') {
      const items = [...sidebar.querySelectorAll<HTMLElement>('a[href], button:not([hidden])')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
}

// Keep both menu entries for the existing settings/video page accurate after tab changes.
const updateWebsiteMenu = (id: string) => {
  if (!['website-settings', 'website-videos'].includes(id)) return;
  document.querySelectorAll<HTMLAnchorElement>('[data-editor-nav]').forEach(link => {
    if (link.hash === `#${id}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll<HTMLElement>('[data-editor-title]').forEach(element => {
    element.textContent = id === 'website-videos' ? 'Website videos' : 'Website settings';
  });
};
document.addEventListener('editor:tabchange', event => updateWebsiteMenu((event as CustomEvent<string>).detail));
// This also handles either order of execution of Astro's page modules.
const selected = document.querySelector<HTMLAnchorElement>('[data-editor-tab][aria-selected="true"]');
if (selected) updateWebsiteMenu(selected.hash.slice(1));
