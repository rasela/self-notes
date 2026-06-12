/* ============================================================
   shared.js — common page shell behaviour for all notes
   Reading progress bar, TOC drawer (open/close/Esc/overlay,
   smooth-scroll links), tap-to-toggle checklists, back-to-top.
   Every feature is guarded, so pages that lack an element
   (e.g. no #prog) can still use this file.
   ============================================================ */
(function () {
  // reading progress
  var prog = document.getElementById('prog');
  if (prog) {
    window.addEventListener('scroll', function () {
      var el = document.documentElement;
      var s = el.scrollTop || document.body.scrollTop;
      var h = el.scrollHeight - el.clientHeight;
      if (h > 0) prog.style.width = (s / h * 100) + '%';
    }, { passive: true });
  }

  // TOC drawer
  var hbtn = document.getElementById('hbtn');
  var overlay = document.getElementById('overlay');
  var drawer = document.getElementById('drawer');
  if (hbtn && overlay && drawer) {
    var open = function () { hbtn.classList.add('open'); overlay.classList.add('open'); drawer.classList.add('open'); hbtn.setAttribute('aria-expanded', 'true'); };
    var close = function () { hbtn.classList.remove('open'); overlay.classList.remove('open'); drawer.classList.remove('open'); hbtn.setAttribute('aria-expanded', 'false'); };
    hbtn.addEventListener('click', function () { hbtn.classList.contains('open') ? close() : open(); });
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    // smooth-scroll TOC links (offset clears the fixed nav)
    drawer.querySelectorAll('a[data-a]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var id = link.getAttribute('data-a');
        close();
        setTimeout(function () {
          var t = document.getElementById(id);
          if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 64, behavior: 'smooth' });
        }, 400);
      });
    });
  }

  // tap-to-toggle checklists (session only; .night is protocol's variant)
  document.querySelectorAll('.check, .night').forEach(function (c) {
    c.addEventListener('click', function () { c.classList.toggle('done'); });
  });

  // back to top
  var btt = document.getElementById('btt');
  if (btt) {
    window.addEventListener('scroll', function () {
      btt.classList.toggle('vis', window.scrollY > 280);
    }, { passive: true });
    btt.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
})();
