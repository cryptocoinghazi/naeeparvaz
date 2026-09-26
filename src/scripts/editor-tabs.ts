document.querySelectorAll<HTMLElement>('[data-editor-tabs]').forEach(group => {
  const list = group.querySelector<HTMLElement>('[data-editor-tab-list]');
  if (!list) return;
  const tabs = [...list.querySelectorAll<HTMLAnchorElement>('[data-editor-tab]')];
  const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
  if (panels.some(panel => !panel)) return;
  list.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index]!.id);
    panels[index]!.setAttribute('role', 'tabpanel');
    panels[index]!.setAttribute('aria-labelledby', tab.id);
    panels[index]!.tabIndex = 0;
  });
  const activate = (index: number, updateUrl = false) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i]!.hidden = i !== index;
    });
    if (updateUrl && location.hash !== tabs[index].hash) history.pushState(null, '', tabs[index].hash);
    document.dispatchEvent(new CustomEvent('editor:tabchange', { detail: panels[index]!.id }));
  };
  const reveal = () => {
    let target: HTMLElement | null = null;
    try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { /* Invalid fragments use the default tab. */ }
    const index = panels.findIndex(panel => !!target && panel!.contains(target));
    const fallback = panels.findIndex(panel => panel!.id === list.dataset.defaultTab);
    activate(index < 0 ? Math.max(0, fallback) : index);
    if (index >= 0 && target && target !== panels[index]) {
      for (let parent = target.parentElement; parent && parent !== group; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); activate(index, true);
    });
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); activate(next, true); tabs[next].focus();
    });
  });
  // Reveal advanced fields before native form validation focuses them.
  group.addEventListener('invalid', event => {
    const field = event.target as HTMLElement;
    const index = panels.findIndex(panel => panel!.contains(field));
    if (index >= 0) activate(index);
    for (let parent = field.parentElement; parent && parent !== group; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
  }, true);
  addEventListener('hashchange', reveal);
  addEventListener('popstate', reveal);
  queueMicrotask(reveal);
});
