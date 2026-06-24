document.addEventListener('click',function(e){
  var a=e.target.closest('a[href]');
  if(!a)return;
  var href=a.getAttribute('href');
  if(!href||href[0]==='#'||href.startsWith('http')||href.startsWith('mailto:')||a.target==='_blank'||a.hasAttribute('download'))return;
  e.preventDefault();
  document.body.classList.add('page-out');
  setTimeout(function(){window.location.href=href;},220);
});
