(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const notes = byId('notes');
  const views = byId('views-menu');
  const viewButton = byId('views-toggle');
  const options = [...views.querySelectorAll('[data-view]')];
  const api = window.exhibit;
  function showMenu(open, focus = false) {
    views.hidden = !open;
    viewButton.setAttribute('aria-expanded',String(open));
    if(open && focus) (options.find(item=>item.getAttribute('aria-checked')==='true') || options[0]).focus();
  }
  function selectView(name) {
    for(const item of options) item.setAttribute('aria-checked', String(item.dataset.view===name));
  }
  viewButton.addEventListener('click',() => showMenu(views.hidden,true));
  viewButton.addEventListener('keydown',e => {
    if(e.key==='ArrowDown') { e.preventDefault(); showMenu(true,true); }
  });
  views.addEventListener('click',event => {
    const item=event.target.closest('[data-view]');
    if(!item) return;
    api.preset(item.dataset.view);
    selectView(item.dataset.view);
    showMenu(false);
    viewButton.focus();
  });
  views.addEventListener('keydown',e => {
    const index=options.indexOf(document.activeElement);
    if(e.key==='ArrowDown' || e.key==='ArrowUp') {
      e.preventDefault();
      options[(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();
    }
    if(e.key==='Home' || e.key==='End') { e.preventDefault(); options[e.key==='Home'?0:options.length-1].focus(); }
  });
  document.addEventListener('keydown',e => {
    if(e.key==='Escape' && !views.hidden) { showMenu(false); viewButton.focus(); }
  });
  document.addEventListener('pointerdown',e => {
    if(!views.contains(e.target) && !viewButton.contains(e.target)) showMenu(false);
  });
  document.addEventListener('focusin',e => {
    if(!views.contains(e.target) && e.target!==viewButton) showMenu(false);
  });
  window.addEventListener('manual-orbit',() => selectView(null));
  window.addEventListener('reset-view',() => selectView('standard'));
  byId('zoom-out').addEventListener('click',() => api.zoom(1/1.2));
  byId('zoom-in').addEventListener('click',() => api.zoom(1.2));
  byId('reset').addEventListener('click',() => { api.preset('standard'); selectView('standard'); });
  byId('auto-orbit').addEventListener('click',() => { api.toggleAuto(); selectView(null); });
  byId('notes-open').addEventListener('click',() => notes.showModal());
  byId('notes-close').addEventListener('click',() => notes.close());
  notes.addEventListener('click',e=>{
    if(e.target!==notes) return;
    const r=notes.getBoundingClientRect();
    if(e.clientX<r.left || e.clientY<r.top || e.clientX>r.right || e.clientY>r.bottom) notes.close();
  });
  const fullButton=byId('fullscreen');
  const fullTarget=document.documentElement;
  const syncFullscreen=() => {
    const on=!!document.fullscreenElement || !!document.webkitFullscreenElement || document.body.classList.contains('immersive');
    fullButton.setAttribute('aria-pressed',String(on));
    fullButton.setAttribute('aria-label',on?'Exit fullscreen':'Fullscreen');
    fullButton.title=on?'Exit fullscreen':'Fullscreen';
  };
  fullButton.addEventListener('click',async() => {
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(document.webkitFullscreenElement) document.webkitExitFullscreen();
      else if(fullTarget.requestFullscreen && document.fullscreenEnabled) await fullTarget.requestFullscreen();
      else if(fullTarget.webkitRequestFullscreen) fullTarget.webkitRequestFullscreen();
      else document.body.classList.toggle('immersive');
    } catch { document.body.classList.toggle('immersive'); }
    syncFullscreen();
  });
  document.addEventListener('fullscreenchange',syncFullscreen);
  document.addEventListener('webkitfullscreenchange',syncFullscreen);
  syncFullscreen();
})();
