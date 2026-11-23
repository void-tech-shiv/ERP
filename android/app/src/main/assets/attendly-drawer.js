(function(){
  if(window.__attendlyMobileDrawer)return;
  window.__attendlyMobileDrawer=true;
  var button=document.createElement('button');
  button.id='at-mobile-menu-trigger';
  button.type='button';button.setAttribute('aria-label','Open Attendly navigation');
  button.setAttribute('aria-expanded','false');
  button.textContent='☰';
  var overlay=document.createElement('button');
  overlay.id='at-mobile-drawer-backdrop';overlay.type='button';
  overlay.setAttribute('aria-label','Close navigation');
  document.body.appendChild(overlay);document.body.appendChild(button);
  function close(){
    document.body.classList.remove('at-mobile-open');
    button.setAttribute('aria-expanded','false');
  }
  function refresh(){
    var app=document.querySelector('.at-app .at-sidebar');
    document.body.classList.toggle('at-mobile-shell',!!app);
    if(!app)close();
  }
  button.addEventListener('click',function(){
    var isOpen=document.body.classList.toggle('at-mobile-open');
    button.setAttribute('aria-expanded',String(isOpen));
  });
  overlay.addEventListener('click',close);
  document.addEventListener('click',function(event){
    if(event.target.closest('.at-app .at-nav-item')||
      event.target.closest('.at-app button[title="Sign out"]'))close();
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape')close();
  });
  window.__attendlyCloseDrawer=function(){
    var open=document.body.classList.contains('at-mobile-open');
    if(open)close();
    return open;
  };
  var observer=new MutationObserver(refresh);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  refresh();
})();
