(() => {
  const video = document.querySelector('#hero-video');
  const toggle = document.querySelector('#motion-toggle');
  if (!video || !toggle) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smallScreen = window.matchMedia('(max-width: 700px)');
  const connection = navigator.connection;
  let userPaused = false;
  let manuallyStarted = false;

  function updateControl() {
    const playing = !video.paused && !video.ended;
    toggle.textContent = playing ? 'Pause background' : 'Play background';
  }
  async function play() {
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    video.muted = true;
    try { await video.play(); } catch { /* The still image remains when autoplay is unavailable. */ }
    updateControl();
  }
  function prefersStill() {
    return reducedMotion.matches || smallScreen.matches || connection?.saveData;
  }
  function syncPlayback() {
    if (document.hidden || userPaused || (prefersStill() && !manuallyStarted)) {
      video.pause();
      updateControl();
    } else {
      void play();
    }
  }
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    if (video.paused) {
      userPaused = false;
      manuallyStarted = true;
      void play();
    } else {
      userPaused = true;
      video.pause();
      updateControl();
    }
  });
  video.addEventListener('playing', () => {
    video.classList.add('is-playing');
    video.parentElement.classList.add('has-video');
    updateControl();
  });
  video.addEventListener('pause', updateControl);
  video.addEventListener('error', () => {
    video.pause();
    video.classList.remove('is-playing');
    video.parentElement.classList.remove('has-video');
    updateControl();
  });
  function preferenceChanged() {
    manuallyStarted = false;
    syncPlayback();
  }
  reducedMotion.addEventListener('change', preferenceChanged);
  smallScreen.addEventListener('change', preferenceChanged);
  connection?.addEventListener('change', preferenceChanged);
  document.addEventListener('visibilitychange', syncPlayback);
  syncPlayback();
})();
