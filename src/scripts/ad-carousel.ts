import type { ResolvedAdvertisement } from '../types/content';
document.querySelectorAll<HTMLElement>('[data-ad-carousel]').forEach((root) => {
  let ads: ResolvedAdvertisement[] = JSON.parse(root.dataset.ads || '[]');
  let index = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  let hover = false;
  let lastAdvance = Date.now();
  const hi = root.dataset.locale === 'hi';
  const slides = root.querySelector<HTMLElement>('[data-ad-slides]')!;
  const pause = root.querySelector<HTMLButtonElement>('[data-ad-pause]')!;
  const position = root.querySelector<HTMLElement>('[data-ad-position]')!;
  function show() {
    index = ads.length ? (index + ads.length) % ads.length : 0;
    root.hidden = !ads.length;
    Array.from(slides.children).forEach((slide, i) => (slide as HTMLElement).hidden = i !== index);
    root.querySelector<HTMLElement>('[data-ad-controls]')!.hidden = ads.length < 2;
    pause.textContent = paused ? (hi ? 'चलाएँ' : 'Resume') : (hi ? 'रोकें' : 'Pause');
    pause.setAttribute('aria-pressed', String(paused));
    position.textContent = `${index + 1} / ${ads.length}`;
  }
  function rebuild(next: ResolvedAdvertisement[]) {
    const previousId = ads[index]?.id;
    ads = next;
    index = Math.max(0, ads.findIndex((ad) => ad.id === previousId));
    slides.replaceChildren(...ads.map((ad) => {
      const slide = document.createElement('div');
      const content = document.createElement(ad.destinationUrl ? 'a' : 'div');
      content.className = 'advertisement-content';
      if (content instanceof HTMLAnchorElement && ad.destinationUrl) {
        content.href = ad.destinationUrl; content.target = '_blank'; content.rel = 'sponsored noopener';
      }
      if (ad.creativeDriveId) {
        const img = document.createElement('img'); img.src = `/media/drive/${encodeURIComponent(ad.creativeDriveId)}/`;
        img.alt = ad.creativeAlt || ad.clientName; img.width = 1200; img.height = 400; img.loading = 'lazy'; content.append(img);
      }
      const copy = document.createElement('span'); copy.className = 'advertisement-copy';
      for (const [tag, text] of [['strong', ad.headline], ['span', ad.body]]) {
        if (text) { const node = document.createElement(tag!); node.textContent = text; copy.append(node); }
      }
      content.append(copy); slide.append(content); return slide;
    }));
    show();
  }
  function move(delta: number) { index += delta; lastAdvance = Date.now(); show(); }
  root.querySelector('[data-ad-prev]')!.addEventListener('click', () => move(-1));
  root.querySelector('[data-ad-next]')!.addEventListener('click', () => move(1));
  pause.addEventListener('click', () => { paused = !paused; lastAdvance = Date.now(); show(); });
  root.addEventListener('mouseenter', () => hover = true);
  root.addEventListener('mouseleave', () => { hover = false; lastAdvance = Date.now(); });
  reduced.addEventListener('change', () => { paused = reduced.matches; show(); });
  async function refresh() {
    if (document.hidden) return;
    try {
      const response = await fetch(`/api/advertisements/?locale=${hi ? 'hi' : 'en'}`);
      if (response.ok) rebuild(await response.json());
    } catch { /* Keep the last valid pool; local expiry still applies. */ }
  }
  document.addEventListener('visibilitychange', () => { lastAdvance = Date.now(); if (!document.hidden) void refresh(); });
  setInterval(() => {
    const active = ads.filter((ad) => !ad.endsAt || Date.parse(ad.endsAt) > Date.now());
    if (active.length !== ads.length) rebuild(active);
    if (!paused && !hover && !document.hidden && !root.contains(document.activeElement) && Date.now() - lastAdvance >= 8000) move(1);
  }, 500);
  setInterval(() => void refresh(), 60000);
  show();
});
