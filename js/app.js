/* Вкусно? — приложение выбора блюд. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const uid = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const plural = (n, forms) => {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return forms[2];
    if (last > 1 && last < 5) return forms[1];
    if (last === 1) return forms[0];
    return forms[2];
  };

  const reduceMotion = () =>
    !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const MEALS = [
    { id: 'breakfast', label: 'Завтрак', emoji: '☀️' },
    { id: 'lunch', label: 'Обед', emoji: '🌤' },
    { id: 'dinner', label: 'Ужин', emoji: '🌙' }
  ];

  const TYPES = [
    { id: 'meat', label: 'Мясо', emoji: '🍖' },
    { id: 'fish', label: 'Рыба', emoji: '🐟' },
    { id: 'soup', label: 'Суп', emoji: '🍲' },
    { id: 'salad', label: 'Салат', emoji: '🥗' },
    { id: 'side', label: 'Гарнир', emoji: '🍚' },
    { id: 'pasta', label: 'Паста', emoji: '🍝' },
    { id: 'bakery', label: 'Выпечка', emoji: '🥐' },
    { id: 'dessert', label: 'Десерт', emoji: '🍰' },
    { id: 'other', label: 'Другое', emoji: '🍽' }
  ];

  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4l-1.3-1.2C6 14.9 2.7 11.9 2.7 8.4 2.7 5.9 4.8 4 7.3 4c1.5 0 2.9.7 3.8 1.8l.9 1 .9-1C14 4.7 15.4 4 16.9 4c2.5 0 4.6 1.9 4.6 4.4 0 3.5-3.3 6.5-8 10.8z"/></svg>';

  const TYPE_GRAD = {
    meat: ['#5a2f24', '#8c4a32'],
    fish: ['#1f3d45', '#2f6470'],
    soup: ['#4a2f1c', '#7a4a26'],
    salad: ['#233a26', '#3f6242'],
    side: ['#3a3320', '#645632'],
    pasta: ['#4a3520', '#7d5a2f'],
    bakery: ['#4a3423', '#7e5a33'],
    dessert: ['#43253a', '#6d3a5c'],
    other: ['#2e2a26', '#4d463e']
  };

  const state = {
    dishes: [],
    view: 'wheel',
    filters: { meal: 'all', fast: false, fav: false },
    dishMeal: 'all',
    dishFav: false,
    search: '',
    sort: 'smart',
    editingId: null,
    resultId: null,
    spinning: false
  };

  let formPhoto = null;
  let formRating = 0;
  let formMeals = [];
  let formTypes = [];
  let firstRunToast = 0;

  /* ---------- Данные ---------- */
  function sanitizeDish(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim().slice(0, 60);
    if (!name) return null;
    const photo = typeof raw.photo === 'string' && raw.photo.indexOf('data:image/') === 0 ? raw.photo : null;
    const meals = Array.isArray(raw.meals) ? raw.meals.filter((m) => MEALS.some((x) => x.id === m)) : [];
    const types = Array.isArray(raw.types) ? raw.types.filter((t) => TYPES.some((x) => x.id === t)) : [];
    let lastCooked = null;
    if (raw.lastCooked) {
      const t = new Date(raw.lastCooked).getTime();
      if (!isNaN(t)) lastCooked = new Date(t).toISOString();
    }
    const created = raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now();
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      name,
      desc: String(raw.desc || '').trim().slice(0, 240),
      photo,
      rating: clamp(Math.round(Number(raw.rating) || 0), 0, 5),
      meals: meals.length ? meals : ['dinner'],
      types,
      time: clamp(Math.round(Number(raw.time) || 0), 0, 600),
      favorite: !!raw.favorite,
      lastCooked,
      timesCooked: clamp(Math.round(Number(raw.timesCooked) || 0), 0, 100000),
      emoji: typeof raw.emoji === 'string' && raw.emoji.length <= 8 ? raw.emoji : '',
      createdAt: isNaN(created) ? new Date().toISOString() : new Date(created).toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async function addSamples() {
    let added = 0;
    for (const sample of window.SEED_DISHES || []) {
      if (state.dishes.some((d) => d.id === sample.id || d.name.toLowerCase() === sample.name.toLowerCase())) continue;
      const { lastCookedDays, ...rest } = sample;
      const created = Date.now() - (lastCookedDays || 0) * 864e5 - Math.random() * 5 * 864e5;
      const dish = sanitizeDish({
        ...rest,
        photo: null,
        createdAt: new Date(created).toISOString(),
        lastCooked: lastCookedDays == null ? null : new Date(Date.now() - lastCookedDays * 864e5).toISOString()
      });
      if (!dish) continue;
      try {
        await DB.put(dish);
      } catch (e) {
        toast('Не хватает места для сохранения');
        break;
      }
      state.dishes.push(dish);
      added += 1;
    }
    try { await DB.setMeta('seeded', true); } catch (e) { /* не критично */ }
    return added;
  }

  /* ---------- Виды и подписи ---------- */
  const mealById = (id) => MEALS.find((m) => m.id === id);
  const typeById = (id) => TYPES.find((t) => t.id === id);

  function emojiFor(dish) {
    if (dish.emoji) return dish.emoji;
    const first = dish.types && dish.types[0];
    const type = first ? typeById(first) : null;
    return type ? type.emoji : '🍽';
  }

  function gradientFor(dish) {
    const first = dish.types && dish.types[0];
    const g = TYPE_GRAD[first] || TYPE_GRAD.other;
    return 'linear-gradient(145deg, ' + g[0] + ', ' + g[1] + ')';
  }

  function starsHTML(rating, size) {
    const px = size || 13;
    let out = '';
    for (let i = 1; i <= 5; i++) {
      out += '<svg class="' + (i <= rating ? 'on' : '') + '" width="' + px + '" height="' + px +
        '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.6 5.9 20.6l1.2-6.5L2.4 9.5l6.6-.9z"/></svg>';
    }
    return '<div class="stars" role="img" aria-label="Оценка ' + rating + ' из 5">' + out + '</div>';
  }

  function relDays(iso) {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return null;
    const days = Math.floor(diff / 864e5);
    if (days <= 0) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days < 7) return days + ' дн. назад';
    if (days < 31) {
      const w = Math.round(days / 7);
      return w + ' нед. назад';
    }
    if (days < 365) {
      const m = Math.round(days / 30);
      return m + ' мес. назад';
    }
    return 'давно';
  }

  function cookedText(dish) {
    if (!dish.lastCooked) return 'Ещё не готовили';
    return 'Готовили ' + relDays(dish.lastCooked);
  }

  /* ---------- Вес для колеса ---------- */
  function weightOf(dish) {
    let w = dish.rating ? 0.55 + dish.rating * 0.3 : 1;
    if (dish.favorite) w *= 1.45;
    if (!dish.lastCooked) {
      w *= 1.12;
    } else {
      const days = (Date.now() - new Date(dish.lastCooked).getTime()) / 864e5;
      if (days < 1) w *= 0.12;
      else if (days < 3) w *= 0.45;
      else if (days < 7) w *= 0.72;
      else if (days < 14) w *= 0.92;
      else if (days > 45) w *= 1.08;
    }
    return Math.max(0.05, w);
  }

  function wheelDishes() {
    return state.dishes.filter((d) => {
      if (state.filters.meal !== 'all' && !d.meals.includes(state.filters.meal)) return false;
      if (state.filters.fast && (d.time || 0) > 30) return false;
      if (state.filters.fav && !d.favorite) return false;
      return true;
    });
  }

  function buildSlices(list) {
    return list.map((d) => ({ id: d.id, label: d.name, weight: weightOf(d) }));
  }

  /* ---------- Отрисовка ---------- */
  function renderAll() {
    renderWheelView();
    renderDishesView();
  }

  function renderStats() {
    $('#statDishes').textContent = state.dishes.length;
    const rated = state.dishes.filter((d) => d.rating > 0);
    $('#statRating').textContent = rated.length
      ? (rated.reduce((sum, d) => sum + d.rating, 0) / rated.length).toFixed(1)
      : '—';
    $('#statCooks').textContent = state.dishes.reduce((sum, d) => sum + (d.timesCooked || 0), 0);
  }

  function renderMealChips() {
    const items = [{ id: 'all', label: 'Любой', emoji: '🍽' }].concat(MEALS);
    $('#mealChips').innerHTML = items.map((m) =>
      '<button type="button" class="chip ' + (state.filters.meal === m.id ? 'is-active' : '') +
      '" data-meal="' + m.id + '">' + m.emoji + ' ' + m.label + '</button>'
    ).join('');
  }

  function renderWheelView() {
    const list = wheelDishes();
    const count = list.length;
    $('#wheelCount').textContent = count
      ? count + ' ' + plural(count, ['блюдо', 'блюда', 'блюд']) + ' в колесе — крутите и выбирайте'
      : 'Пока нечего выбирать — добавьте блюда';

    const active = state.filters.meal !== 'all' || state.filters.fast || state.filters.fav;
    $('#resetFilters').hidden = !active;
    $('#fastToggle').checked = state.filters.fast;
    $('#favToggle').checked = state.filters.fav;
    renderMealChips();

    const enough = count >= 2;
    $('#wheelEmpty').hidden = enough;
    $('#spinBtn').hidden = !enough;
    $('#spinBtn').disabled = !enough;
    Wheel.setSlices(enough ? buildSlices(list) : []);
    renderStats();
  }

  function sortDishes(list) {
    const arr = list.slice();
    switch (state.sort) {
      case 'name':
        return arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      case 'new':
        return arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      case 'recent':
        return arr.sort((a, b) =>
          (b.lastCooked ? new Date(b.lastCooked).getTime() : 0) -
          (a.lastCooked ? new Date(a.lastCooked).getTime() : 0));
      default:
        return arr.sort((a, b) =>
          (b.rating - a.rating) ||
          (Number(b.favorite) - Number(a.favorite)) ||
          a.name.localeCompare(b.name, 'ru'));
    }
  }

  function dishCardHTML(dish, index) {
    const photo = dish.photo
      ? '<img src="' + dish.photo + '" alt="" loading="lazy" />'
      : '<div class="ph" style="background:' + gradientFor(dish) + '">' +
        '<span class="ph-emoji">' + esc(emojiFor(dish)) + '</span></div>';

    const tags = [];
    if (dish.meals.length) {
      const meal = mealById(dish.meals[0]);
      if (meal) tags.push('<span class="tag accent">' + meal.label + '</span>');
    }
    dish.types.slice(0, 2).forEach((id) => {
      const type = typeById(id);
      if (type) tags.push('<span class="tag">' + type.emoji + ' ' + type.label + '</span>');
    });

    const time = dish.time ? '<span class="time-badge">⏱ ' + dish.time + ' мин</span>' : '';
    const times = dish.timesCooked ? '<span>' + dish.timesCooked + '×</span>' : '';

    return '<article class="dish-card" data-id="' + dish.id + '" tabindex="0" role="button" ' +
      'aria-label="' + esc(dish.name) + '" style="animation-delay:' + Math.min(index * 22, 220) + 'ms">' +
      '<div class="thumb">' + photo +
      '<button type="button" class="fav-btn ' + (dish.favorite ? 'is-on' : '') + '" data-fav="' + dish.id + '" ' +
      'aria-label="' + (dish.favorite ? 'Убрать из избранного' : 'В избранное') + '" ' +
      'aria-pressed="' + (dish.favorite ? 'true' : 'false') + '">' + HEART + '</button>' +
      time + '</div>' +
      '<div class="card-body">' +
      '<h3>' + esc(dish.name) + '</h3>' +
      '<div class="card-stars">' + starsHTML(dish.rating) + '</div>' +
      (dish.desc ? '<p class="card-desc">' + esc(dish.desc) + '</p>' : '') +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') +
      '<div class="card-meta"><span class="cooked">' + cookedText(dish) + '</span>' + times + '</div>' +
      '</div></article>';
  }

  function renderDishFilters() {
    const items = [
      { id: 'all', label: 'Все', emoji: '🍽' },
      { id: 'breakfast', label: 'Завтрак', emoji: '☀️' },
      { id: 'lunch', label: 'Обед', emoji: '🌤' },
      { id: 'dinner', label: 'Ужин', emoji: '🌙' }
    ];
    let html = items.map((m) =>
      '<button type="button" class="chip ' + (state.dishMeal === m.id ? 'is-active' : '') +
      '" data-dish-meal="' + m.id + '">' + m.emoji + ' ' + m.label + '</button>'
    ).join('');
    html += '<button type="button" class="chip ' + (state.dishFav ? 'is-active' : '') +
      '" data-dish-fav="1">♥ Избранное</button>';
    $('#dishFilters').innerHTML = html;
  }

  function renderDishesView() {
    const total = state.dishes.length;
    const favCount = state.dishes.filter((d) => d.favorite).length;
    $('#dishesCount').textContent = total
      ? total + ' ' + plural(total, ['блюдо', 'блюда', 'блюд']) +
        (favCount ? ' · ' + favCount + ' в избранном' : '')
      : 'Здесь появятся ваши блюда';

    renderDishFilters();

    const q = state.search.trim().toLowerCase();
    let list = state.dishes.filter((d) => {
      if (state.dishMeal !== 'all' && !d.meals.includes(state.dishMeal)) return false;
      if (state.dishFav && !d.favorite) return false;
      if (!q) return true;
      const haystack = [d.name, d.desc].concat(
        d.meals.map((m) => { const x = mealById(m); return x ? x.label : ''; }),
        d.types.map((t) => { const x = typeById(t); return x ? x.label : ''; })
      ).join(' ').toLowerCase();
      return haystack.indexOf(q) !== -1;
    });

    list = sortDishes(list);
    const grid = $('#dishGrid');
    const empty = $('#dishesEmpty');

    if (!list.length) {
      if (!total) {
        grid.innerHTML = '';
        empty.hidden = false;
      } else {
        empty.hidden = true;
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1">' +
          '<div class="empty-art small">🔍</div>' +
          '<h3>Ничего не нашлось</h3>' +
          '<p class="muted">Попробуйте изменить запрос или сбросить фильтры.</p>' +
          '<button type="button" class="btn btn-ghost" data-reset-dish-filters>Сбросить фильтры</button></div>';
      }
      return;
    }

    empty.hidden = true;
    grid.innerHTML = list.map(dishCardHTML).join('');
  }

  /* ---------- Модальные окна ---------- */
  function openModal(modal) {
    if (!modal) return;
    modal._prevFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => {
      const first = modal.querySelector('input:not([type=file]), textarea, select, button:not([disabled])');
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
      }
    }, 80);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.open')) document.body.classList.remove('modal-open');
    if (modal._prevFocus && document.contains(modal._prevFocus)) {
      try { modal._prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function closeAllModals() {
    $$('.modal.open').forEach(closeModal);
  }

  /* ---------- Колесо: запуск и результат ---------- */
  async function spinWheel() {
    if (state.spinning) return;
    if (wheelDishes().length < 2) {
      toast('Для колеса нужно минимум два блюда');
      return;
    }
    state.spinning = true;
    const hub = $('#spinBtn');
    hub.classList.add('is-spinning');
    try {
      const result = await Wheel.spin();
      const dish = result ? state.dishes.find((d) => d.id === result.id) : null;
      if (dish) openResult(dish);
    } finally {
      state.spinning = false;
      hub.classList.remove('is-spinning');
    }
  }

  function tagsHTML(dish, limit) {
    const out = [];
    dish.meals.forEach((id) => {
      const m = mealById(id);
      if (m) out.push('<span class="tag accent">' + m.emoji + ' ' + m.label + '</span>');
    });
    dish.types.forEach((id) => {
      const t = typeById(id);
      if (t) out.push('<span class="tag">' + t.emoji + ' ' + t.label + '</span>');
    });
    if (dish.time) out.push('<span class="tag">⏱ ' + dish.time + ' мин</span>');
    return out.slice(0, limit || 8).join('');
  }

  function openResult(dish) {
    state.resultId = dish.id;
    const media = $('#resultMedia');
    media.classList.toggle('no-photo', !dish.photo);
    if (dish.photo) {
      media.innerHTML = '<img src="' + dish.photo + '" alt="' + esc(dish.name) + '" />';
    } else {
      media.innerHTML = '<div class="ph" style="background:' + gradientFor(dish) +
        '"><span class="ph-emoji">' + esc(emojiFor(dish)) + '</span></div>';
    }
    $('#resultName').textContent = dish.name;
    $('#resultStars').innerHTML = starsHTML(dish.rating, 16);
    $('#resultTags').innerHTML = tagsHTML(dish);
    $('#resultDesc').textContent = dish.desc || 'Без описания — но звучит вкусно.';
    openModal($('#resultModal'));
  }

  async function markCooked(id) {
    const dish = state.dishes.find((d) => d.id === id);
    if (!dish) return;
    dish.lastCooked = new Date().toISOString();
    dish.timesCooked = (dish.timesCooked || 0) + 1;
    dish.updatedAt = new Date().toISOString();
    try {
      await DB.put(dish);
      toast('Приятного аппетита! 🍽');
      burstConfetti();
    } catch (e) {
      toast('Не удалось сохранить — проверьте место');
    }
    renderAll();
  }

  /* ---------- Карточка блюда ---------- */
  function openDish(id) {
    const dish = state.dishes.find((d) => d.id === id);
    if (!dish) return;
    const media = dish.photo
      ? '<div class="detail-media"><img src="' + dish.photo + '" alt="' + esc(dish.name) + '" /></div>'
      : '<div class="detail-media no-photo"><div class="ph" style="background:' + gradientFor(dish) + '">' +
        '<span class="ph-emoji">' + esc(emojiFor(dish)) + '</span></div></div>';

    $('#dishDetail').innerHTML = media +
      '<div class="detail-body">' +
      '<div class="detail-top"><h2 id="detailName">' + esc(dish.name) + '</h2>' +
      '<button type="button" class="fav-btn ' + (dish.favorite ? 'is-on' : '') + '" data-fav="' + dish.id + '" ' +
      'aria-label="' + (dish.favorite ? 'Убрать из избранного' : 'В избранное') + '">' + HEART + '</button></div>' +
      starsHTML(dish.rating, 17) +
      '<div class="tags" style="margin-top:12px">' + tagsHTML(dish) + '</div>' +
      (dish.desc ? '<p class="detail-desc">' + esc(dish.desc) + '</p>' : '') +
      '<div class="detail-meta">' +
      '<div><span>Готовили</span><strong>' + (dish.timesCooked || 0) + ' раз</strong></div>' +
      '<div><span>Последний раз</span><strong>' + (dish.lastCooked ? relDays(dish.lastCooked) : '—') + '</strong></div>' +
      '<div><span>Время</span><strong>' + (dish.time ? dish.time + ' мин' : '—') + '</strong></div>' +
      '</div>' +
      '<div class="detail-actions">' +
      '<button type="button" class="btn btn-primary" data-cook="' + dish.id + '">Готовлю!</button>' +
      '<button type="button" class="btn btn-ghost" data-edit="' + dish.id + '">Изменить</button>' +
      '<button type="button" class="btn btn-danger" data-delete="' + dish.id + '">Удалить</button>' +
      '</div></div>';

    openModal($('#dishModal'));
  }

  async function toggleFavorite(id) {
    const dish = state.dishes.find((d) => d.id === id);
    if (!dish) return;
    dish.favorite = !dish.favorite;
    dish.updatedAt = new Date().toISOString();
    try { await DB.put(dish); } catch (e) { /* ignore */ }
    renderAll();
    if ($('#dishModal').classList.contains('open')) openDish(id);
  }

  /* ---------- Форма ---------- */
  let confirmResolve = null;

  function askConfirm(title, text, okLabel) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = okLabel || 'Удалить';
    openModal($('#confirmModal'));
    return new Promise((resolve) => { confirmResolve = resolve; });
  }

  function resolveConfirm(value) {
    closeModal($('#confirmModal'));
    if (confirmResolve) {
      const resolve = confirmResolve;
      confirmResolve = null;
      resolve(value);
    }
  }

  function renderFormRating() {
    const box = $('#fRating');
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += '<button type="button" data-star="' + i + '" class="' + (i <= formRating ? 'on' : '') +
        '" aria-label="' + i + ' из 5" aria-pressed="' + (i <= formRating ? 'true' : 'false') + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.6 5.9 20.6l1.2-6.5L2.4 9.5l6.6-.9z"/></svg></button>';
    }
    html += '<span class="rating-hint">' + (formRating ? formRating + ' из 5' : 'без оценки') + '</span>';
    box.innerHTML = html;
  }

  function renderFormChips() {
    $('#fMeals').innerHTML = MEALS.map((m) =>
      '<button type="button" class="chip ' + (formMeals.includes(m.id) ? 'is-active' : '') +
      '" data-form-meal="' + m.id + '">' + m.emoji + ' ' + m.label + '</button>'
    ).join('');

    $('#fTypes').innerHTML = TYPES.map((t) =>
      '<button type="button" class="chip ' + (formTypes.includes(t.id) ? 'is-active' : '') +
      '" data-form-type="' + t.id + '">' + t.emoji + ' ' + t.label + '</button>'
    ).join('');

    const current = parseInt($('#fTime').value, 10) || 0;
    $('#fTimeQuick').innerHTML = [15, 30, 45, 60, 90].map((t) =>
      '<button type="button" class="chip ' + (current === t ? 'is-active' : '') +
      '" data-time="' + t + '">' + t + ' мин</button>'
    ).join('');
  }

  function renderFormPhoto() {
    const img = $('#photoPreview');
    const placeholder = $('#photoPlaceholder');
    const actions = $('#photoActions');
    if (formPhoto) {
      img.src = formPhoto;
      img.hidden = false;
      placeholder.hidden = true;
      actions.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      placeholder.hidden = false;
      actions.hidden = true;
    }
  }

  function openForm(id) {
    const dish = id ? state.dishes.find((d) => d.id === id) : null;
    state.editingId = dish ? dish.id : null;
    formPhoto = dish ? dish.photo : null;
    formRating = dish ? dish.rating : 0;
    formMeals = dish ? dish.meals.slice() : ['dinner'];
    formTypes = dish ? dish.types.slice() : [];

    $('#formTitle').textContent = dish ? 'Изменить блюдо' : 'Новое блюдо';
    $('#fName').value = dish ? dish.name : '';
    $('#fDesc').value = dish ? dish.desc : '';
    $('#fTime').value = dish && dish.time ? dish.time : 30;
    $('#fFav').checked = dish ? !!dish.favorite : false;
    $('#fDelete').hidden = !dish;

    renderFormRating();
    renderFormChips();
    renderFormPhoto();
    openModal($('#formModal'));
  }

  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        return reject(new Error('NOT_IMAGE'));
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const max = 1100;
            const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const cx = canvas.getContext('2d');
            cx.imageSmoothingQuality = 'high';
            cx.drawImage(img, 0, 0, w, h);
            let quality = 0.82;
            let out = canvas.toDataURL('image/jpeg', quality);
            while (out.length > 420000 && quality > 0.45) {
              quality -= 0.12;
              out = canvas.toDataURL('image/jpeg', quality);
            }
            resolve(out);
          } catch (e) {
            reject(new Error('ENCODE'));
          }
        };
        img.onerror = () => reject(new Error('DECODE'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('READ'));
      reader.readAsDataURL(file);
    });
  }

  async function saveForm(event) {
    event.preventDefault();
    const name = $('#fName').value.trim();
    if (!name) {
      $('#fName').focus();
      toast('Введите название блюда');
      return;
    }
    const existing = state.editingId ? state.dishes.find((d) => d.id === state.editingId) : null;
    const now = new Date().toISOString();
    const clean = sanitizeDish({
      id: existing ? existing.id : uid(),
      name,
      desc: $('#fDesc').value,
      photo: formPhoto,
      rating: formRating,
      meals: formMeals.length ? formMeals : ['dinner'],
      types: formTypes,
      time: $('#fTime').value,
      favorite: $('#fFav').checked,
      lastCooked: existing ? existing.lastCooked : null,
      timesCooked: existing ? existing.timesCooked : 0,
      emoji: existing ? existing.emoji : '',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    });
    if (!clean) return;

    try {
      await DB.put(clean);
    } catch (e) {
      toast('Не удалось сохранить: возможно, закончилось место');
      return;
    }

    if (existing) {
      const i = state.dishes.findIndex((d) => d.id === existing.id);
      if (i >= 0) state.dishes[i] = clean;
    } else {
      state.dishes.push(clean);
    }

    closeModal($('#formModal'));
    renderAll();
    toast(existing ? 'Блюдо обновлено' : '«' + clean.name + '» добавлено');
    if (!existing) switchView('dishes');
  }

  async function deleteDish(id) {
    const dish = state.dishes.find((d) => d.id === id);
    if (!dish) return;
    const ok = await askConfirm(
      'Удалить блюдо?',
      '«' + dish.name + '» исчезнет из списка и с колеса. Это нельзя отменить.',
      'Удалить'
    );
    if (!ok) return;
    try {
      await DB.remove(id);
    } catch (e) {
      toast('Не удалось удалить');
      return;
    }
    state.dishes = state.dishes.filter((d) => d.id !== id);
    closeAllModals();
    renderAll();
    toast('Блюдо удалено');
  }

  /* ---------- Настройки и данные ---------- */
  function switchView(view) {
    state.view = view;
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
    $$('[data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    if (view === 'wheel') requestAnimationFrame(() => Wheel.refresh());
  }

  function openSettings() {
    const total = state.dishes.length;
    const photos = state.dishes.filter((d) => d.photo).length;
    $('#settingsStats').textContent = total
      ? total + ' ' + plural(total, ['блюдо', 'блюда', 'блюд']) + ' · ' + photos + ' с фото · ' +
        (DB.mode === 'idb' ? 'IndexedDB' : 'локальное хранилище')
      : 'Список пока пуст — добавьте блюда или загрузите примеры';
    openModal($('#settingsModal'));
  }

  function exportBackup() {
    const payload = {
      app: 'vkusno',
      version: 1,
      exportedAt: new Date().toISOString(),
      dishes: state.dishes
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vkusno-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Бэкап сохранён в Загрузки');
    } catch (e) {
      toast('Не удалось создать файл');
    }
  }

  async function importBackup(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      toast('Файл не похож на бэкап');
      return;
    }
    const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.dishes) ? data.dishes : null);
    if (!incoming) {
      toast('В файле нет списка блюд');
      return;
    }
    let added = 0;
    let updated = 0;
    let failed = false;
    for (const raw of incoming) {
      const dish = sanitizeDish(raw);
      if (!dish) continue;
      const existing = state.dishes.find((d) => d.id === dish.id) ||
        state.dishes.find((d) => d.name.trim().toLowerCase() === dish.name.trim().toLowerCase());
      try {
        if (existing) {
          const merged = Object.assign({}, dish, { id: existing.id });
          await DB.put(merged);
          Object.assign(existing, merged);
          updated += 1;
        } else {
          await DB.put(dish);
          state.dishes.push(dish);
          added += 1;
        }
      } catch (e) {
        failed = true;
        break;
      }
    }
    renderAll();
    if (failed) toast('Импорт прерван: не хватило места');
    else if (!added && !updated) toast('Новых блюд не найдено');
    else toast('Импорт: добавлено ' + added + ', обновлено ' + updated);
  }

  async function clearAll() {
    const ok = await askConfirm(
      'Очистить весь список?',
      'Все блюда и фото будут удалены с этого устройства. На всякий случай скачайте бэкап.',
      'Очистить всё'
    );
    if (!ok) return;
    try {
      await DB.clear();
    } catch (e) {
      toast('Не удалось очистить');
      return;
    }
    state.dishes = [];
    closeAllModals();
    renderAll();
    toast('Список очищен');
  }

  /* ---------- Уведомления и конфетти ---------- */
  function toast(message) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  function burstConfetti() {
    if (reduceMotion()) return;
    const canvas = $('#confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    canvas.style.display = 'block';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ['#ffb865', '#ff8a3d', '#ffe0b0', '#8ed49a', '#a58ad6', '#ff8a7a'];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.4;
    const parts = [];
    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.5,
        size: 4 + Math.random() * 7,
        color: colors[i % colors.length],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.32
      });
    }
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / 1700);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      parts.forEach((pt) => {
        pt.vy += 0.17;
        pt.vx *= 0.992;
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.rot += pt.vr;
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot);
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = pt.color;
        ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size * 0.6);
        ctx.restore();
      });
      if (p < 1) requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        canvas.style.display = 'none';
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- События ---------- */
  function bindEvents() {
    $('#spinBtn').addEventListener('click', spinWheel);
    $('#addBtn').addEventListener('click', () => openForm());
    $('#addBtnMobile').addEventListener('click', () => openForm());
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsBtnMobile').addEventListener('click', openSettings);

    $('#mealChips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-meal]');
      if (!btn || state.spinning) return;
      state.filters.meal = btn.dataset.meal;
      renderWheelView();
    });

    $('#fastToggle').addEventListener('change', (e) => {
      if (state.spinning) { e.target.checked = state.filters.fast; return; }
      state.filters.fast = e.target.checked;
      renderWheelView();
    });

    $('#favToggle').addEventListener('change', (e) => {
      if (state.spinning) { e.target.checked = state.filters.fav; return; }
      state.filters.fav = e.target.checked;
      renderWheelView();
    });

    $('#resetFilters').addEventListener('click', () => {
      if (state.spinning) return;
      state.filters = { meal: 'all', fast: false, fav: false };
      renderWheelView();
    });

    $('#dishFilters').addEventListener('click', (e) => {
      const meal = e.target.closest('[data-dish-meal]');
      if (meal) {
        state.dishMeal = meal.dataset.dishMeal;
        renderDishesView();
        return;
      }
      if (e.target.closest('[data-dish-fav]')) {
        state.dishFav = !state.dishFav;
        renderDishesView();
      }
    });

    $('#searchInput').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderDishesView();
    });

    $('#sortSelect').addEventListener('change', (e) => {
      state.sort = e.target.value;
      renderDishesView();
    });

    $('#dishGrid').addEventListener('click', (e) => {
      const fav = e.target.closest('[data-fav]');
      if (fav) {
        e.stopPropagation();
        toggleFavorite(fav.dataset.fav);
        return;
      }
      if (e.target.closest('[data-reset-dish-filters]')) {
        state.search = '';
        state.dishMeal = 'all';
        state.dishFav = false;
        $('#searchInput').value = '';
        renderDishesView();
        return;
      }
      const card = e.target.closest('.dish-card');
      if (card) openDish(card.dataset.id);
    });

    $('#dishGrid').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.dish-card');
      if (!card) return;
      e.preventDefault();
      openDish(card.dataset.id);
    });

    $('#cookBtn').addEventListener('click', () => {
      const id = state.resultId;
      closeModal($('#resultModal'));
      if (id) markCooked(id);
    });

    $('#againBtn').addEventListener('click', () => {
      closeModal($('#resultModal'));
      setTimeout(spinWheel, 300);
    });

    $('#dishModal').addEventListener('click', (e) => {
      const fav = e.target.closest('[data-fav]');
      if (fav) { toggleFavorite(fav.dataset.fav); return; }
      const cook = e.target.closest('[data-cook]');
      if (cook) { closeModal($('#dishModal')); markCooked(cook.dataset.cook); return; }
      const edit = e.target.closest('[data-edit]');
      if (edit) { closeModal($('#dishModal')); openForm(edit.dataset.edit); return; }
      const del = e.target.closest('[data-delete]');
      if (del) deleteDish(del.dataset.delete);
    });

    $('#dishForm').addEventListener('submit', saveForm);

    $('#fRating').addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (!star) return;
      const value = Number(star.dataset.star);
      formRating = value === formRating ? 0 : value;
      renderFormRating();
    });

    $('#fMeals').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-form-meal]');
      if (!chip) return;
      const id = chip.dataset.formMeal;
      const i = formMeals.indexOf(id);
      if (i >= 0) {
        if (formMeals.length > 1) formMeals.splice(i, 1);
      } else {
        formMeals.push(id);
      }
      renderFormChips();
    });

    $('#fTypes').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-form-type]');
      if (!chip) return;
      const id = chip.dataset.formType;
      const i = formTypes.indexOf(id);
      if (i >= 0) formTypes.splice(i, 1); else formTypes.push(id);
      renderFormChips();
    });

    $('#fTimeQuick').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-time]');
      if (!chip) return;
      $('#fTime').value = chip.dataset.time;
      renderFormChips();
    });

    $('#fTime').addEventListener('input', renderFormChips);

    $('#photoPicker').addEventListener('click', (e) => {
      if (e.target.closest('.photo-actions')) return;
      $('#photoInput').click();
    });

    $('#photoChange').addEventListener('click', (e) => {
      e.stopPropagation();
      $('#photoInput').click();
    });

    $('#photoRemove').addEventListener('click', (e) => {
      e.stopPropagation();
      formPhoto = null;
      renderFormPhoto();
    });

    $('#photoInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        formPhoto = await compressPhoto(file);
        renderFormPhoto();
      } catch (err) {
        toast('Не удалось открыть фото. Подойдёт JPG, PNG или HEIC.');
      }
    });

    $('#fDelete').addEventListener('click', () => {
      if (state.editingId) deleteDish(state.editingId);
    });

    $('#exportBtn').addEventListener('click', exportBackup);
    $('#importBtn').addEventListener('click', () => $('#importInput').click());
    $('#importInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) await importBackup(file);
    });
    $('#samplesBtn').addEventListener('click', async () => {
      const n = await addSamples();
      renderAll();
      toast(n ? 'Добавлено примеров: ' + n : 'Примеры уже есть в списке');
    });
    $('#clearBtn').addEventListener('click', clearAll);

    $('#confirmYes').addEventListener('click', () => resolveConfirm(true));
    $('#confirmNo').addEventListener('click', () => resolveConfirm(false));

    $$('.modal').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target !== modal) return;
        if (modal.id === 'confirmModal') resolveConfirm(false);
        else closeModal(modal);
      });
    });

    document.addEventListener('click', (e) => {
      const closer = e.target.closest('[data-close]');
      if (closer) {
        closeModal(closer.closest('.modal'));
        return;
      }
      if (e.target.closest('[data-action="add"]')) {
        openForm();
        return;
      }
      const nav = e.target.closest('[data-view]');
      if (nav) {
        e.preventDefault();
        switchView(nav.dataset.view);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = $$('.modal.open');
      if (!open.length) return;
      const top = open[open.length - 1];
      if (top.id === 'confirmModal') resolveConfirm(false);
      else closeModal(top);
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* офлайн-режим недоступен */ });
    });
  }

  async function init() {
    Wheel.init($('#wheel'), $('#wheelStage'));
    bindEvents();
    renderAll();

    try {
      await DB.init();
    } catch (e) { /* работаем в памяти */ }

    try {
      const rows = await DB.getAll();
      state.dishes = (rows || []).map(sanitizeDish).filter(Boolean);
    } catch (e) {
      toast('Не удалось загрузить список блюд');
    }

    let added = 0;
    if (!state.dishes.length) {
      try {
        if (!(await DB.getMeta('seeded'))) added = await addSamples();
      } catch (e) { /* не критично */ }
    }

    renderAll();

    if (added) {
      setTimeout(() => toast('Добавили ' + added + ' примеров — замените их своими блюдами'), 900);
    }

    registerSW();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
