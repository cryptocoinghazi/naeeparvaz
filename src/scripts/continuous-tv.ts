import type { TvVideo } from '../lib/tv';
interface Player { loadVideoById(id:string):void; playVideo():void; pauseVideo():void; mute():void; unMute():void; isMuted():boolean; getPlayerState():number }
interface YtAPI { Player: new (element:HTMLElement, options:object) => Player }
declare global { interface Window { YT?: YtAPI; onYouTubeIframeAPIReady?: () => void } }
const root = document.querySelector<HTMLElement>('[data-tv]');
if (root) {
  const original: TvVideo[] = JSON.parse(root.dataset.queue || '[]');
  let queue = [...original], index = 0, failures = 0, userPaused = false;
  let player: Player;
  const hi = root.dataset.locale === 'hi';
  const status = root.querySelector<HTMLElement>('[data-tv-status]')!;
  const title = root.querySelector<HTMLElement>('[data-tv-title]')!;
  function updateTitle() { title.textContent = queue[index]?.title || ''; }
  function next() {
    if (!queue.length || userPaused) return;
    index = (index + 1) % queue.length; updateTitle(); player.loadVideoById(queue[index].video_id);
  }
  function init() {
    if (!window.YT || !original.length) return;
    updateTitle();
    player = new window.YT.Player(root!.querySelector<HTMLElement>('[data-tv-player]')!, {
      videoId:queue[0].video_id,
      playerVars:{autoplay:1,mute:1,playsinline:1,controls:1,origin:location.origin},
      events:{
        onReady:() => { player.mute(); status.textContent = hi ? 'आवाज़ चालू करने के लिए बटन दबाएँ।' : 'Use Sound on to listen.'; },
        onAutoplayBlocked:() => { userPaused = true; status.textContent = hi ? 'शुरू करने के लिए चलाएँ दबाएँ।' : 'Press Play to start playback.'; },
        onStateChange:(event:{data:number}) => {
          if (event.data === 0) next();
          if (event.data === 1) { failures = 0; userPaused = false; }
          if (event.data === 2) userPaused = true;
        },
        onError:() => {
          failures++;
          if (failures >= queue.length) { userPaused = true; status.textContent = hi ? 'वीडियो नहीं चल सके। बाद में पुनः प्रयास करें।' : 'Videos could not play. Please try again later.'; return; }
          status.textContent = hi ? 'अनुपलब्ध वीडियो छोड़ रहे हैं।' : 'Skipping an unavailable video.';
          if (!userPaused) next();
        }
      }
    });
    root!.querySelector('[data-tv-play]')?.addEventListener('click', () => {
      if (player.getPlayerState() === 1) { userPaused = true; player.pauseVideo(); }
      else { userPaused = false; failures = 0; player.playVideo(); }
    });
    root!.querySelector('[data-tv-next]')?.addEventListener('click', () => { userPaused = false; failures = 0; next(); });
    root!.querySelector('[data-tv-sound]')?.addEventListener('click', () => player.isMuted() ? player.unMute() : player.mute());
    root!.querySelector<HTMLInputElement>('[data-tv-shuffle]')?.addEventListener('change', (event) => {
      const current = queue[index].video_id;
      queue = [...original];
      if ((event.target as HTMLInputElement).checked) for (let i=queue.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [queue[i],queue[j]]=[queue[j],queue[i]]; }
      index = Math.max(0,queue.findIndex((v) => v.video_id === current));
    });
    document.addEventListener('np-library-play', () => { userPaused = true; player.pauseVideo(); });
  }
  if (original.length) {
    if (window.YT?.Player) init();
    else { const previous = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { previous?.(); init(); }; const script=document.createElement('script'); script.src='https://www.youtube.com/iframe_api'; script.onerror=() => status.textContent=hi ? 'वीडियो सेवा उपलब्ध नहीं है।' : 'Video service unavailable.'; document.head.append(script); }
  }
}
