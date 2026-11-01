// 분야 필터 + 테마 전환 (JS가 없어도 페이지는 모두 보입니다)
(function () {
  var chips = document.querySelectorAll('.chip[data-filter]');
  var cards = document.querySelectorAll('.card[data-cat]');
  function apply(f) {
    chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.filter === f)); });
    cards.forEach(function (c) { c.hidden = !(f === 'all' || c.dataset.cat === f); });
  }
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      apply(c.dataset.filter);
      try { history.replaceState(null, '', c.dataset.filter === 'all' ? location.pathname : '#' + c.dataset.filter); } catch (e) {}
    });
  });
  var h = location.hash.slice(1);
  if (h && document.querySelector('.chip[data-filter="' + h + '"]')) apply(h);

  var btn = document.querySelector('.theme-btn');
  if (btn) btn.addEventListener('click', function () {
    var root = document.documentElement;
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });
})();
