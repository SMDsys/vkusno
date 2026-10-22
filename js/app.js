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
    dishPhoto: false,
    dishLongAgo: false,
    search: '',
    sort: 'smart',
    editingId: null,
    resultId: null,
    spinning: false,
    today: null,
    history: [],
    plan: null,
    theme: 'dark',
    autoBackup: null,
    installPrompt: null,
    lastBackupAt: null,
    lastAutoBackupAt: null
  };

  let formPhoto = null;
  let formPhotoPreviewURL = null;
  let formPhotoPreviewRef = null;
  let formRating = 0;
  let formMeals = [];
  let formTypes = [];
  let firstRunToast = 0;
  let swRegistration = null;
  let updateShown = false;
  let autoBackupTimer = null;
  const AUTO_BACKUP_INTERVAL = 7 * 864e5;

  const photoURLs = new Map();

  /* ---------- Даты ---------- */
  function localDateKey(date) {
    const d = date ? new Date(date) : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function parseDateKey(key) {
    const parts = String(key || '').split('-').map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function shortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 КБ';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' КБ';
    return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ';
  }

  function daysSince(iso) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 864e5);
  }

  /* ---------- Фото ---------- */
  function photoSrc(photo, key) {
    if (!photo) return '';
    if (typeof photo === 'string') return photo;
    if (!(photo instanceof Blob)) return '';
    const k = key || ('blob-' + photo.size + '-' + (photo.name || ''));
    if (!photoURLs.has(k)) photoURLs.set(k, URL.createObjectURL(photo));
    return photoURLs.get(k);
  }

  function dishPhotoSrc(dish) {
    return photoSrc(dish.photo, dish.id + '|' + (dish.updatedAt || ''));
  }

  function dropPhotoURL(key) {
    const url = photoURLs.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      photoURLs.delete(key);
    }
  }

  function dataURLToBlob(dataURL) {
    const comma = dataURL.indexOf(',');
    if (comma < 0) throw new Error('BAD_DATA_URL');
    const head = dataURL.slice(0, comma);
    const body = dataURL.slice(comma + 1);
    const mime = (/data:([^;]+)/.exec(head) || [])[1] || 'image/jpeg';
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('READ'));
      reader.readAsDataURL(blob);
    });
  }

  async function normalizePhoto(photo) {
    if (!photo || DB.mode !== 'idb' || typeof photo !== 'string') return photo;
    if (photo.indexOf('data:image/') !== 0) return null;
    try { return dataURLToBlob(photo); } catch (e) { return null; }
  }

  async function photoToDataURL(photo) {
    if (!photo) return null;
    if (typeof photo === 'string') return photo;
    if (photo instanceof Blob) {
      try { return await blobToDataURL(photo); } catch (e) { return null; }
    }
    return null;
  }

  /* ---------- Данные ---------- */
  function sanitizeDish(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim().slice(0, 60);
    if (!name) return null;
    const photo = raw.photo instanceof Blob && raw.photo.type.indexOf('image/') === 0
      ? raw.photo
      : (typeof raw.photo === 'string' && raw.photo.indexOf('data:image/') === 0 ? raw.photo : null);
    const meals = Array.isArray(raw.meals) ? raw.meals.filter((m) => MEALS.some((x) => x.id === m)) : [];
    const types = Array.isArray(raw.types) ? raw.types.filter((t) => TYPES.some((x) => x.id === t)) : [];
    let lastCooked = null;
    if (raw.lastCooked) {
      const t = new Date(raw.lastCooked).getTime();
      if (!isNaN(t)) lastCooked = new Date(t).toISOString();
    }
    const created = raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now();
    const updated = raw.updatedAt ? new Date(raw.updatedAt).getTime() : NaN;
    const ingredientList = Array.isArray(raw.ingredients)
      ? raw.ingredients
      : String(raw.ingredients || '').split('\n');
    const ingredients = Array.from(new Set(ingredientList
      .map((item) => String(item || '').trim().slice(0, 120))
      .filter(Boolean))).slice(0, 40);
    let url = String(raw.url || '').trim().slice(0, 500);
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (url) {
      try {
        const parsed = new URL(url);
        if (!/^https?:$/.test(parsed.protocol)) url = '';
      } catch (e) { url = ''; }
    }
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
      ingredients,
      url,
      notes: String(raw.notes || '').trim().slice(0, 1000),
      emoji: typeof raw.emoji === 'string' && raw.emoji.length <= 8 ? raw.emoji : '',
      createdAt: isNaN(created) ? new Date().toISOString() : new Date(created).toISOString(),
      updatedAt: isNaN(updated) ? new Date().toISOString() : new Date(updated).toISOString()
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
    renderToday();
  }

  function todayDish() {
    if (!state.today || state.today.date !== localDateKey()) return null;
    return state.dishes.find((d) => d.id === state.today.id) || null;
  }

  async function setToday(dish) {
    if (!dish) return;
    state.today = { date: localDateKey(), id: dish.id };
    try { await DB.setMeta('todayPick', state.today); } catch (e) { /* не критично */ }
    renderToday();
  }

  async function clearToday() {
    if (!state.today) return;
    state.today = null;
    try { await DB.setMeta('todayPick', null); } catch (e) { /* ignore */ }
    renderToday();
  }

  function renderToday() {
    const card = $('#todayCard');
    if (!card) return;
    const dish = todayDish();
    if (!dish) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    $('#todayName').textContent = dish.name;
    $('#todayCook').dataset.id = dish.id;
    $('#todayOpen').dataset.id = dish.id;
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
      ? '<img src="' + esc(dishPhotoSrc(dish)) + '" alt="" loading="lazy" />'
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

    return '<article class="dish-card" data-id="' + esc(dish.id) + '" tabindex="0" role="button" ' +
      'aria-label="' + esc(dish.name) + '" style="animation-delay:' + Math.min(index * 22, 220) + 'ms">' +
      '<div class="thumb">' + photo +
      '<button type="button" class="fav-btn ' + (dish.favorite ? 'is-on' : '') + '" data-fav="' + esc(dish.id) + '" ' +
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
    html += '<button type="button" class="chip ' + (state.dishPhoto ? 'is-active' : '') +
      '" data-dish-photo="1">📷 С фото</button>';
    html += '<button type="button" class="chip ' + (state.dishLongAgo ? 'is-active' : '') +
      '" data-dish-long="1">🕰 Давно не готовили</button>';
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
      if (state.dishPhoto && !d.photo) return false;
      if (state.dishLongAgo) {
        const days = d.lastCooked ? daysSince(d.lastCooked) : null;
        if (days !== null && days < 30) return false;
      }
      if (!q) return true;
      const haystack = [d.name, d.desc, d.notes, d.ingredients.join(' ')].concat(
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
    const card = modal.querySelector('.modal-card');
    if (card) card.scrollTop = 0;
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
  async function spinWheel(excludeId) {
    if (state.spinning) return;
    if (wheelDishes().length < 2) {
      toast('Для колеса нужно минимум два блюда');
      return;
    }
    state.spinning = true;
    const hub = $('#spinBtn');
    hub.classList.add('is-spinning');
    try {
      const result = await Wheel.spin(excludeId);
      const dish = result ? state.dishes.find((d) => d.id === result.id) : null;
      if (dish) {
        await setToday(dish);
        openResult(dish);
      }
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
      media.innerHTML = '<img src="' + esc(dishPhotoSrc(dish)) + '" alt="' + esc(dish.name) + '" />';
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
    const at = new Date().toISOString();
    const previous = {
      lastCooked: dish.lastCooked,
      timesCooked: dish.timesCooked || 0,
      updatedAt: dish.updatedAt
    };
    const next = Object.assign({}, dish, {
      lastCooked: at,
      timesCooked: (dish.timesCooked || 0) + 1,
      updatedAt: at
    });
    try {
      await DB.put(next);
      dropPhotoURL(id + '|' + (previous.updatedAt || ''));
      Object.assign(dish, next);
    } catch (e) {
      toast('Не удалось сохранить — проверьте место');
      return;
    }

    const entry = { id, at };
    const wasToday = !!(state.today && state.today.id === id && state.today.date === localDateKey());
    if (wasToday) await clearToday();
    state.history.push(entry);
    if (state.history.length > 1000) state.history = state.history.slice(-1000);
    try { await DB.setMeta('cookLog', state.history); } catch (e) { /* история не критична */ }
    renderAll();
    burstConfetti();
    toast('Приятного аппетита! 🍽', {
      action: 'Отменить',
      onAction: () => undoCook(id, previous, entry, wasToday)
    });
    scheduleAutoBackup();
  }

  async function undoCook(id, previous, entry, wasToday) {
    const dish = state.dishes.find((d) => d.id === id);
    if (!dish) return;
    const currentUpdated = dish.updatedAt;
    Object.assign(dish, previous);
    try {
      await DB.put(dish);
    } catch (e) {
      toast('Не удалось отменить');
      return;
    }
    dropPhotoURL(id + '|' + (currentUpdated || ''));
    const at = state.history.lastIndexOf(entry);
    if (at >= 0) state.history.splice(at, 1);
    try { await DB.setMeta('cookLog', state.history); } catch (e) { /* ignore */ }
    if (wasToday) await setToday(dish);
    renderAll();
    toast('Отменено');
    scheduleAutoBackup();
  }

  /* ---------- Карточка блюда ---------- */
  function openDish(id) {
    const dish = state.dishes.find((d) => d.id === id);
    if (!dish) return;
    const media = dish.photo
      ? '<div class="detail-media"><img src="' + esc(dishPhotoSrc(dish)) + '" alt="' + esc(dish.name) + '" /></div>'
      : '<div class="detail-media no-photo"><div class="ph" style="background:' + gradientFor(dish) + '">' +
        '<span class="ph-emoji">' + esc(emojiFor(dish)) + '</span></div></div>';

    const ingredients = dish.ingredients && dish.ingredients.length
      ? '<div class="detail-section"><h4>Ингредиенты</h4><ul class="ingredients">' +
        dish.ingredients.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul></div>'
      : '';
    const recipe = dish.url
      ? '<a class="btn btn-ghost detail-link" href="' + esc(dish.url) + '" target="_blank" rel="noopener noreferrer">Открыть рецепт ↗</a>'
      : '';
    const notes = dish.notes
      ? '<div class="detail-section"><h4>Заметка</h4><p>' + esc(dish.notes) + '</p></div>'
      : '';

    $('#dishDetail').innerHTML = media +
      '<div class="detail-body">' +
      '<div class="detail-top"><h2 id="detailName">' + esc(dish.name) + '</h2>' +
      '<button type="button" class="fav-btn ' + (dish.favorite ? 'is-on' : '') + '" data-fav="' + esc(dish.id) + '" ' +
      'aria-label="' + (dish.favorite ? 'Убрать из избранного' : 'В избранное') + '">' + HEART + '</button></div>' +
      starsHTML(dish.rating, 17) +
      '<div class="tags" style="margin-top:12px">' + tagsHTML(dish) + '</div>' +
      (dish.desc ? '<p class="detail-desc">' + esc(dish.desc) + '</p>' : '') +
      '<div class="detail-meta">' +
      '<div><span>Готовили</span><strong>' + (dish.timesCooked || 0) + ' раз</strong></div>' +
      '<div><span>Последний раз</span><strong>' + (dish.lastCooked ? relDays(dish.lastCooked) : '—') + '</strong></div>' +
      '<div><span>Время</span><strong>' + (dish.time ? dish.time + ' мин' : '—') + '</strong></div>' +
      '</div>' +
      ingredients + notes + recipe +
      '<div class="detail-actions">' +
      '<button type="button" class="btn btn-primary" data-cook="' + esc(dish.id) + '">Готовлю!</button>' +
      '<button type="button" class="btn btn-ghost" data-edit="' + esc(dish.id) + '">Изменить</button>' +
      '<button type="button" class="btn btn-danger" data-delete="' + esc(dish.id) + '">Удалить</button>' +
      '</div></div>';

    openModal($('#dishModal'));
  }

  async function toggleFavorite(id) {
    const dish = state.dishes.find((d) => d.id === id);
    if (!dish) return;
    const oldUpdated = dish.updatedAt;
    const next = Object.assign({}, dish, {
      favorite: !dish.favorite,
      updatedAt: new Date().toISOString()
    });
    try {
      await DB.put(next);
    } catch (e) {
      toast('Не удалось сохранить — проверьте место');
      return;
    }
    Object.assign(dish, next);
    dropPhotoURL(id + '|' + (oldUpdated || ''));
    renderAll();
    if ($('#dishModal').classList.contains('open')) openDish(id);
    scheduleAutoBackup();
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
      let src;
      if (typeof formPhoto === 'string') {
        src = formPhoto;
      } else if (formPhoto instanceof Blob) {
        if (formPhotoPreviewRef !== formPhoto) {
          if (formPhotoPreviewURL) URL.revokeObjectURL(formPhotoPreviewURL);
          formPhotoPreviewRef = formPhoto;
          formPhotoPreviewURL = URL.createObjectURL(formPhoto);
        }
        src = formPhotoPreviewURL;
      }
      if (src) {
        img.src = src;
        img.hidden = false;
        placeholder.hidden = true;
        actions.hidden = false;
      }
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      placeholder.hidden = false;
      actions.hidden = true;
    }
  }

  function resetFormPhotoPreview() {
    if (formPhotoPreviewURL) URL.revokeObjectURL(formPhotoPreviewURL);
    formPhotoPreviewURL = null;
    formPhotoPreviewRef = null;
  }

  function openForm(id) {
    const dish = id ? state.dishes.find((d) => d.id === id) : null;
    state.editingId = dish ? dish.id : null;
    resetFormPhotoPreview();
    formPhoto = dish ? dish.photo : null;
    formRating = dish ? dish.rating : 0;
    formMeals = dish ? dish.meals.slice() : ['dinner'];
    formTypes = dish ? dish.types.slice() : [];

    $('#formTitle').textContent = dish ? 'Изменить блюдо' : 'Новое блюдо';
    $('#fName').value = dish ? dish.name : '';
    $('#fDesc').value = dish ? dish.desc : '';
    $('#fIngredients').value = dish && dish.ingredients ? dish.ingredients.join('\n') : '';
    $('#fUrl').value = dish ? (dish.url || '') : '';
    $('#fNotes').value = dish ? (dish.notes || '') : '';
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
      ingredients: $('#fIngredients').value,
      url: $('#fUrl').value,
      notes: $('#fNotes').value,
      lastCooked: existing ? existing.lastCooked : null,
      timesCooked: existing ? existing.timesCooked : 0,
      emoji: existing ? existing.emoji : '',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    });
    if (!clean) return;
    clean.photo = await normalizePhoto(clean.photo);

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

    if (existing) dropPhotoURL(existing.id + '|' + (existing.updatedAt || ''));
    closeModal($('#formModal'));
    renderAll();
    toast(existing ? 'Блюдо обновлено' : '«' + clean.name + '» добавлено');
    if (!existing) switchView('dishes');
    scheduleAutoBackup();
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
    dropPhotoURL(id + '|' + (dish.updatedAt || ''));
    state.dishes = state.dishes.filter((d) => d.id !== id);
    if (state.today && state.today.id === id) await clearToday();
    if (state.plan) {
      state.plan.days.forEach((day) => { if (day.dishId === id) day.dishId = null; });
      try { await DB.setMeta('weekPlan', state.plan); } catch (e) { /* ignore */ }
    }
    closeAllModals();
    renderAll();
    toast('Блюдо удалено');
    scheduleAutoBackup();
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
    refreshSettings();
    openModal($('#settingsModal'));
    refreshStorageInfo();
    requestPersistence().then(refreshStorageInfo).catch(() => {});
  }

  function refreshSettings() {
    const total = state.dishes.length;
    const photos = state.dishes.filter((d) => d.photo).length;
    $('#settingsStats').textContent = total
      ? total + ' ' + plural(total, ['блюдо', 'блюда', 'блюд']) + ' · ' + photos + ' с фото · ' +
        (DB.mode === 'idb' ? 'IndexedDB' : 'локальное хранилище')
      : 'Список пока пуст — добавьте блюда или загрузите примеры';
    renderBackupStatus();
    renderAutoBackupSettings();
    renderThemeChoices();
    renderInstallState();
  }

  async function refreshStorageInfo() {
    const el = $('#settingsStorage');
    if (!el) return;
    const parts = [];
    try {
      if (navigator.storage && navigator.storage.persisted) {
        const persisted = await navigator.storage.persisted();
        parts.push(persisted ? 'хранилище защищено от очистки' : 'браузер может очистить данные при нехватке места');
      }
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate && estimate.usage != null) parts.push('занято ' + formatBytes(estimate.usage));
      }
    } catch (e) { /* информация не критична */ }
    el.textContent = parts.join(' · ');
  }

  function renderBackupStatus() {
    const el = $('#settingsBackup');
    if (!el) return;
    const days = daysSince(state.lastBackupAt);
    if (days === null) {
      el.textContent = 'Резервная копия ещё не создавалась. Сохраните её, чтобы не потерять блюда.';
    } else if (days <= 0) {
      el.textContent = 'Последняя резервная копия — сегодня.';
    } else {
      el.textContent = 'Последняя резервная копия — ' + days + ' ' + plural(days, ['день', 'дня', 'дней']) + ' назад.' +
        (days > 30 ? ' Пора сохранить новую.' : '');
    }
  }

  async function markBackupDone() {
    state.lastBackupAt = new Date().toISOString();
    try { await DB.setMeta('lastBackupAt', state.lastBackupAt); } catch (e) { /* ignore */ }
    renderBackupStatus();
  }

  function backupName() {
    return 'vkusno-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  }

  async function backupPayload() {
    const dishes = [];
    for (const dish of state.dishes) {
      dishes.push(Object.assign({}, dish, { photo: await photoToDataURL(dish.photo) }));
    }
    return {
      app: 'vkusno',
      version: 2,
      exportedAt: new Date().toISOString(),
      dishes
    };
  }

  async function backupBlob() {
    const payload = await backupPayload();
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportBackup() {
    try {
      const blob = await backupBlob();
      downloadBlob(blob, backupName());
      await markBackupDone();
      toast('Бэкап сохранён в Загрузки');
    } catch (e) {
      toast('Не удалось создать файл');
    }
  }

  async function shareBackup() {
    try {
      const blob = await backupBlob();
      const file = new File([blob], backupName(), { type: 'application/json' });
      await navigator.share({
        files: [file],
        title: 'Вкусно? — бэкап',
        text: 'Список блюд и фото из приложения «Вкусно?»'
      });
      await markBackupDone();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      try {
        const blob = await backupBlob();
        downloadBlob(blob, backupName());
        await markBackupDone();
        toast('Меню недоступно — файл скачан');
      } catch (err) {
        toast('Не удалось создать файл');
      }
    }
  }

  async function saveBackupToFolder() {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: backupName(),
        types: [{ description: 'Резервная копия', accept: { 'application/json': ['.json'] } }]
      });
      const blob = await backupBlob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      await markBackupDone();
      toast('Бэкап сохранён в выбранную папку');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast('Не удалось сохранить файл');
    }
  }

  /* ---------- Автобэкап в папку ---------- */
  async function renderAutoBackupSettings() {
    const section = $('#autoBackupSection');
    if (!section) return;
    if (typeof window.showDirectoryPicker !== 'function' || DB.mode !== 'idb') {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const status = $('#autoBackupStatus');
    const pick = $('#autoBackupPick');
    const now = $('#autoBackupNow');
    const off = $('#autoBackupOff');
    const handle = state.autoBackup && state.autoBackup.handle;
    if (!handle) {
      status.textContent = 'Выберите папку — приложение будет сохранять копию раз в неделю.';
      pick.hidden = false;
      now.hidden = true;
      off.hidden = true;
      return;
    }
    let permission = 'prompt';
    try {
      if (handle.queryPermission) permission = await handle.queryPermission({ mode: 'readwrite' });
    } catch (e) { /* ignore */ }
    const autoDays = daysSince(state.lastAutoBackupAt ? new Date(state.lastAutoBackupAt).toISOString() : null);
    status.textContent = 'Папка «' + handle.name + '» · ' +
      (permission === 'granted' ? 'доступ разрешён' : 'нужно снова разрешить доступ') +
      (autoDays === null ? ' · автобэкапов ещё не было' : ' · последний ' + (autoDays ? autoDays + ' дн. назад' : 'сегодня'));
    pick.hidden = permission === 'granted';
    now.hidden = permission === 'denied';
    off.hidden = false;
  }

  async function chooseAutoBackupFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      toast('Браузер не поддерживает автобэкап');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'vkusno-backup' });
      state.autoBackup = { handle };
      await DB.setMeta('backupDir', handle);
      state.lastAutoBackupAt = null;
      await DB.setMeta('lastAutoBackupAt', null);
      await writeAutoBackup(true);
      refreshSettings();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast('Не удалось выбрать папку');
    }
  }

  async function writeAutoBackup(force) {
    const handle = state.autoBackup && state.autoBackup.handle;
    if (!handle) return false;
    if (!force && state.lastAutoBackupAt && Date.now() - state.lastAutoBackupAt < AUTO_BACKUP_INTERVAL) {
      return false;
    }
    try {
      let permission = 'prompt';
      if (handle.queryPermission) permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted' && force && handle.requestPermission) {
        permission = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (permission !== 'granted') {
        if (force) toast('Нужно разрешение на запись в папку');
        return false;
      }
      const blob = await backupBlob();
      const file = await handle.getFileHandle('vkusno-backup.json', { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
      state.lastAutoBackupAt = Date.now();
      await DB.setMeta('lastAutoBackupAt', state.lastAutoBackupAt);
      await markBackupDone();
      renderAutoBackupSettings();
      if (force) toast('Копия сохранена в папку «' + handle.name + '»');
      return true;
    } catch (e) {
      if (force) toast('Не удалось сохранить в папку');
      return false;
    }
  }

  function scheduleAutoBackup() {
    const handle = state.autoBackup && state.autoBackup.handle;
    if (!handle || !state.lastAutoBackupAt || Date.now() - state.lastAutoBackupAt < AUTO_BACKUP_INTERVAL) return;
    clearTimeout(autoBackupTimer);
    autoBackupTimer = setTimeout(() => writeAutoBackup(false), 5000);
  }

  async function disableAutoBackup() {
    state.autoBackup = null;
    state.lastAutoBackupAt = null;
    try {
      await DB.setMeta('backupDir', null);
      await DB.setMeta('lastAutoBackupAt', null);
    } catch (e) { /* ignore */ }
    refreshSettings();
    toast('Автобэкап отключён');
  }

  function csvCell(value) {
    const s = value == null ? '' : String(value);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csvDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU');
  }

  function buildCsv() {
    const rows = [[
      'Название', 'Описание', 'Оценка', 'Приёмы пищи', 'Типы',
      'Время, мин', 'Избранное', 'Последнее приготовление', 'Приготовлений', 'Добавлено'
    ]];
    state.dishes.slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .forEach((d) => {
        rows.push([
          d.name,
          d.desc || '',
          d.rating || '',
          d.meals.map((id) => { const m = mealById(id); return m ? m.label : ''; }).filter(Boolean).join(', '),
          d.types.map((id) => { const t = typeById(id); return t ? t.label : ''; }).filter(Boolean).join(', '),
          d.time || '',
          d.favorite ? 'да' : 'нет',
          csvDate(d.lastCooked),
          d.timesCooked || 0,
          csvDate(d.createdAt)
        ]);
      });
    return rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
  }

  function csvName() {
    return 'vkusno-spisok-' + new Date().toISOString().slice(0, 10) + '.csv';
  }

  function csvBlob() {
    return new Blob(['\ufeff' + buildCsv()], { type: 'text/csv;charset=utf-8' });
  }

  function exportCsv() {
    if (!state.dishes.length) {
      toast('Список пока пуст');
      return;
    }
    try {
      downloadBlob(csvBlob(), csvName());
      toast('Список сохранён в Загрузки');
    } catch (e) {
      toast('Не удалось создать файл');
    }
  }

  async function shareCsv() {
    if (!state.dishes.length) {
      toast('Список пока пуст');
      return;
    }
    const blob = csvBlob();
    const file = new File([blob], csvName(), { type: 'text/csv' });
    try {
      await navigator.share({
        files: [file],
        title: 'Вкусно? — список блюд',
        text: 'Список блюд без фото'
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      downloadBlob(blob, csvName());
      toast('Меню недоступно — файл скачан');
    }
  }

  function setupShareButtons() {
    const probe = new File(['{}'], 'backup.json', { type: 'application/json' });
    let canShareFiles = false;
    try {
      canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (e) { /* браузер не умеет делиться файлами */ }
    const shareBtn = $('#shareBtn');
    if (shareBtn && canShareFiles && navigator.share) {
      shareBtn.hidden = false;
      shareBtn.addEventListener('click', shareBackup);
    }
    const saveBtn = $('#saveAsBtn');
    if (saveBtn && typeof window.showSaveFilePicker === 'function') {
      saveBtn.hidden = false;
      saveBtn.addEventListener('click', saveBackupToFolder);
    }
    const csvProbe = new File(['a;b'], 'spisok.csv', { type: 'text/csv' });
    let canShareCsv = false;
    try {
      canShareCsv = !!(navigator.canShare && navigator.canShare({ files: [csvProbe] }));
    } catch (e) { /* останется только скачивание */ }
    const csvShareBtn = $('#csvShareBtn');
    if (csvShareBtn && canShareCsv && navigator.share) {
      csvShareBtn.hidden = false;
      csvShareBtn.addEventListener('click', shareCsv);
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
    const exportedAt = !Array.isArray(data) && data && data.exportedAt ? data.exportedAt : null;
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let failed = false;
    for (const source of incoming) {
      let raw = source;
      if (raw && typeof raw === 'object' && !raw.updatedAt && exportedAt) {
        raw = Object.assign({}, raw, { updatedAt: exportedAt });
      }
      const dish = sanitizeDish(raw);
      if (!dish) continue;
      dish.photo = await normalizePhoto(dish.photo);
      const existing = state.dishes.find((d) => d.id === dish.id) ||
        state.dishes.find((d) => d.name.trim().toLowerCase() === dish.name.trim().toLowerCase());
      try {
        if (existing) {
          const existingTime = new Date(existing.updatedAt || 0).getTime() || 0;
          const incomingTime = new Date(dish.updatedAt || 0).getTime() || 0;
          if (incomingTime <= existingTime) {
            skipped += 1;
            continue;
          }
          dropPhotoURL(existing.id + '|' + (existing.updatedAt || ''));
          const merged = Object.assign({}, dish, {
            id: existing.id,
            createdAt: existing.createdAt
          });
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
    else if (!added && !updated && skipped) toast('Все блюда в файле старше текущих — пропущено ' + skipped);
    else if (!added && !updated) toast('Новых блюд не найдено');
    else toast('Импорт: добавлено ' + added + ', обновлено ' + updated +
      (skipped ? ', пропущено ' + skipped : ''));
    if (added || updated) scheduleAutoBackup();
  }

  async function clearAll() {
    const ok = await askConfirm(
      'Очистить весь список?',
      'Все блюда, фото, история готовки и меню на неделю будут удалены с этого устройства. На всякий случай скачайте бэкап.',
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
    state.history = [];
    state.today = null;
    state.plan = null;
    photoURLs.forEach((url) => URL.revokeObjectURL(url));
    photoURLs.clear();
    try {
      await DB.setMeta('cookLog', []);
      await DB.setMeta('todayPick', null);
      await DB.setMeta('weekPlan', null);
    } catch (e) { /* ignore */ }
    closeAllModals();
    renderAll();
    toast('Список очищен');
  }

  /* ---------- Уведомления и конфетти ---------- */
  function toast(message, options) {
    const box = $('#toasts');
    const opts = options || {};
    const el = document.createElement('div');
    el.className = 'toast';
    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);
    let timer = null;
    const dismiss = () => {
      if (timer) clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    };
    if (opts.action) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast-action';
      action.textContent = opts.action;
      action.addEventListener('click', () => {
        dismiss();
        if (typeof opts.onAction === 'function') opts.onAction();
      });
      el.appendChild(action);
    }
    box.appendChild(el);
    timer = setTimeout(dismiss, opts.duration || (opts.action ? 5200 : 2600));
    return dismiss;
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

  /* ---------- Тема ---------- */
  function applyTheme(theme, save) {
    const next = ['dark', 'light', 'auto'].indexOf(theme) >= 0 ? theme : 'dark';
    state.theme = next;
    const effective = next === 'auto'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : next;
    document.documentElement.dataset.theme = effective;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = effective === 'light' ? '#f5efe5' : '#0f0d0b';
    try { localStorage.setItem('vkusno.theme', next); } catch (e) { /* ignore */ }
    renderThemeChoices();
    if (save) DB.setMeta('theme', next).catch(() => {});
  }

  function renderThemeChoices() {
    $$('[data-theme-choice]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themeChoice === state.theme);
    });
  }

  function watchSystemTheme() {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const listener = () => { if (state.theme === 'auto') applyTheme('auto', false); };
    if (media.addEventListener) media.addEventListener('change', listener);
    else if (media.addListener) media.addListener(listener);
  }

  /* ---------- Установка ---------- */
  function isStandalone() {
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      !!navigator.standalone;
  }

  function isIOS() {
    return (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function renderInstallState() {
    const status = $('#installStatus');
    const btn = $('#installBtn');
    const hint = $('#iosHint');
    if (!status || !btn || !hint) return;
    if (isStandalone()) {
      status.textContent = 'Приложение открыто с домашнего экрана. Данные хранятся на устройстве.';
      btn.hidden = true;
      hint.hidden = true;
      return;
    }
    if (state.installPrompt) {
      status.textContent = 'Установите «Вкусно?» на домашний экран — быстрый доступ и защита данных.';
      btn.hidden = false;
      hint.hidden = true;
      return;
    }
    btn.hidden = true;
    if (isIOS()) {
      status.textContent = 'Установите приложение через Safari — оно будет открываться с иконки.';
      hint.hidden = false;
    } else {
      status.textContent = 'Установка доступна из меню браузера: «Установить приложение» или «Добавить на главный экран».';
      hint.hidden = true;
    }
  }

  async function installApp() {
    if (!state.installPrompt) return;
    const prompt = state.installPrompt;
    state.installPrompt = null;
    try {
      prompt.prompt();
      await prompt.userChoice;
    } catch (e) { /* пользователь отменил */ }
    renderInstallState();
  }

  /* ---------- Офлайн и обновления ---------- */
  function renderOnlineState() {
    const bar = $('#offlineBar');
    if (bar) bar.hidden = navigator.onLine;
  }

  function showUpdateBar() {
    if (updateShown) return;
    updateShown = true;
    const bar = $('#updateBar');
    if (bar) bar.hidden = false;
  }

  async function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    const hadController = !!navigator.serviceWorker.controller;
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      swRegistration = reg;
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && hadController && navigator.serviceWorker.controller) showUpdateBar();
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && navigator.serviceWorker.controller) showUpdateBar();
      });
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    } catch (e) { /* офлайн-режим недоступен */ }
  }

  /* ---------- История ---------- */
  async function loadHistory() {
    try {
      const log = await DB.getMeta('cookLog');
      state.history = Array.isArray(log)
        ? log.filter((entry) => entry && typeof entry.id === 'string' && entry.at)
          .filter((entry) => !isNaN(new Date(entry.at).getTime()))
          .map((entry) => ({ id: entry.id, at: new Date(entry.at).toISOString() }))
        : [];
    } catch (e) {
      state.history = [];
    }
  }

  function dishName(id) {
    const dish = state.dishes.find((d) => d.id === id);
    return dish ? dish.name : 'Удалённое блюдо';
  }

  function openHistory() {
    renderHistory();
    openModal($('#historyModal'));
  }

  function renderHistory() {
    const body = $('#historyBody');
    if (!body) return;
    const entries = state.history.slice().sort((a, b) => new Date(b.at) - new Date(a.at));
    if (!entries.length) {
      body.innerHTML = '<div class="history-empty">Пока нет записей.<br>Нажмите «Готовлю!» — и здесь появится история.</div>';
      return;
    }
    const month = entries.filter((entry) => Date.now() - new Date(entry.at).getTime() < 30 * 864e5);
    const unique = new Set(month.map((entry) => entry.id));
    const counts = new Map();
    entries.forEach((entry) => counts.set(entry.id, (counts.get(entry.id) || 0) + 1));
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => '<li><b>' + esc(dishName(id)) + '</b><span>' + count + '×</span></li>')
      .join('');
    const list = entries.slice(0, 20).map((entry) => {
      const date = new Date(entry.at);
      const label = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return '<li><span class="history-name">' + esc(dishName(entry.id)) + '</span><span>' + label + ', ' + time + '</span></li>';
    }).join('');
    body.innerHTML =
      '<div class="history-stats">' +
      '<div class="history-stat"><strong>' + entries.length + '</strong><span>всего готовили</span></div>' +
      '<div class="history-stat"><strong>' + month.length + '</strong><span>за 30 дней</span></div>' +
      '<div class="history-stat"><strong>' + unique.size + '</strong><span>блюд за месяц</span></div>' +
      '</div>' +
      '<div class="history-sub">Чаще всего</div>' +
      '<ul class="history-list history-top">' + top + '</ul>' +
      '<div class="history-sub">Последние приготовления</div>' +
      '<ul class="history-list">' + list + '</ul>';
  }

  /* ---------- Меню на неделю ---------- */
  function weightedPick(list, excludeId) {
    let pool = list.slice();
    if (excludeId && pool.length > 1) {
      const filtered = pool.filter((dish) => dish.id !== excludeId);
      if (filtered.length) pool = filtered;
    }
    if (!pool.length) return null;
    const total = pool.reduce((sum, dish) => sum + weightOf(dish), 0);
    let point = Math.random() * total;
    for (const dish of pool) {
      point -= weightOf(dish);
      if (point <= 0) return dish;
    }
    return pool[pool.length - 1];
  }

  function buildPlan() {
    if (!state.dishes.length) return null;
    const dinner = state.dishes.filter((dish) => dish.meals.includes('dinner'));
    const pool = dinner.length ? dinner : state.dishes.slice();
    const days = [];
    let used = [];
    for (let i = 0; i < 7; i++) {
      let available = pool.filter((dish) => used.indexOf(dish.id) < 0);
      if (!available.length) {
        available = pool.slice();
        used = [];
      }
      const previous = days.length ? days[days.length - 1].dishId : null;
      const dish = weightedPick(available, previous);
      if (!dish) break;
      used.push(dish.id);
      days.push({ date: localDateKey(addDays(new Date(), i)), dishId: dish.id, cooked: false });
    }
    return { start: localDateKey(new Date()), days };
  }

  async function savePlan() {
    try { await DB.setMeta('weekPlan', state.plan); } catch (e) { /* ignore */ }
  }

  async function openPlan() {
    if (!state.dishes.length) {
      toast('Сначала добавьте блюда');
      return;
    }
    let expired = false;
    if (state.plan && state.plan.start) {
      const start = parseDateKey(state.plan.start);
      const today = parseDateKey(localDateKey());
      const age = Math.round((today - start) / 864e5);
      expired = isNaN(age) || age < 0 || age > 6;
    }
    if (!state.plan || !Array.isArray(state.plan.days) || state.plan.days.length !== 7 || expired) {
      state.plan = buildPlan();
      await savePlan();
    }
    renderPlan();
    openModal($('#planModal'));
  }

  function planDayLabel(key) {
    const today = localDateKey();
    const tomorrow = localDateKey(addDays(new Date(), 1));
    if (key === today) return { day: 'Сегодня', date: shortDate(parseDateKey(key)) };
    if (key === tomorrow) return { day: 'Завтра', date: shortDate(parseDateKey(key)) };
    const date = parseDateKey(key);
    return {
      day: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
      date: shortDate(date)
    };
  }

  function planDishFor(day) {
    return state.dishes.find((dish) => dish.id === day.dishId) || null;
  }

  function renderPlan() {
    const body = $('#planBody');
    if (!body) return;
    if (!state.plan || !state.plan.days || !state.plan.days.length) {
      body.innerHTML = '<div class="plan-empty"><div class="empty-art small">🍲</div>' +
        '<p>Соберите меню — приложение подберёт семь блюд с учётом рейтинга и давности.</p></div>';
      return;
    }
    const intro = '<p class="plan-intro">Семь дней с ' + shortDate(parseDateKey(state.plan.start)) +
      ' — нажмите ↻, чтобы заменить блюдо, и ✓ — когда приготовили.</p>';
    const rows = state.plan.days.map((day, index) => {
      const dish = planDishFor(day);
      const label = planDayLabel(day.date);
      const meta = dish
        ? [dish.time ? dish.time + ' мин' : '', dish.types.length ? (typeById(dish.types[0]) || {}).label || '' : '']
          .filter(Boolean).join(' · ')
        : 'Свободный день';
      return '<div class="plan-row ' + (day.cooked ? 'is-cooked' : '') + '">' +
        '<div class="plan-day"><strong>' + esc(label.day) + '</strong><span>' + esc(label.date) + '</span></div>' +
        '<div class="plan-dish">' +
        (dish
          ? '<button type="button" data-plan-open="' + index + '">' + esc(dish.name) + '</button>'
          : '<button type="button" data-plan-swap="' + index + '">Выбрать блюдо</button>') +
        '<small>' + esc(meta) + '</small></div>' +
        '<div class="plan-row-actions">' +
        '<button type="button" class="plan-mini" data-plan-swap="' + index + '" aria-label="Заменить блюдо" title="Заменить">↻</button>' +
        (dish ? '<button type="button" class="plan-mini ' + (day.cooked ? 'done' : '') + '" data-plan-cook="' + index + '" aria-label="Отметить приготовленным" title="Готово">✓</button>' : '') +
        '</div></div>';
    }).join('');
    body.innerHTML = intro + rows;
  }

  async function rebuildPlan() {
    state.plan = buildPlan();
    await savePlan();
    renderPlan();
    toast('Меню собрано заново');
  }

  async function swapPlanDay(index) {
    if (!state.plan || !state.plan.days[index]) return;
    const day = state.plan.days[index];
    const used = state.plan.days.map((item) => item.dishId).filter((id) => id && id !== day.dishId);
    let candidates = state.dishes.filter((dish) => used.indexOf(dish.id) < 0 && dish.id !== day.dishId);
    if (!candidates.length) candidates = state.dishes.filter((dish) => dish.id !== day.dishId);
    if (!candidates.length) candidates = state.dishes.slice();
    const dish = weightedPick(candidates, day.dishId);
    if (!dish) return;
    day.dishId = dish.id;
    day.cooked = false;
    await savePlan();
    renderPlan();
    scheduleAutoBackup();
  }

  async function cookPlanDay(index) {
    if (!state.plan || !state.plan.days[index]) return;
    const day = state.plan.days[index];
    if (!day.dishId) return;
    await markCooked(day.dishId);
    day.cooked = true;
    await savePlan();
    renderPlan();
  }

  /* ---------- Список покупок ---------- */
  function planDishList() {
    if (!state.plan || !state.plan.days) return [];
    const ids = [];
    state.plan.days.forEach((day) => {
      if (day.dishId && ids.indexOf(day.dishId) < 0) ids.push(day.dishId);
    });
    return ids.map((id) => state.dishes.find((dish) => dish.id === id)).filter(Boolean);
  }

  function shoppingItems() {
    const seen = new Set();
    const items = [];
    planDishList().forEach((dish) => {
      (dish.ingredients || []).forEach((item) => {
        const key = item.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          items.push(item);
        }
      });
    });
    return items.sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function shoppingPlainText() {
    const items = shoppingItems();
    return 'Список покупок на неделю\n\n' + items.map((item) => '— ' + item).join('\n');
  }

  function openShopping() {
    const items = shoppingItems();
    const dishes = planDishList();
    const body = $('#shoppingBody');
    if (!body) return;
    if (!dishes.length) {
      toast('Сначала соберите меню на неделю');
      return;
    }
    if (!items.length) {
      body.innerHTML = '<p class="shopping-note">У блюд из меню пока нет ингредиентов. Добавьте их в карточках блюд — список соберётся сам.</p>' +
        '<p class="shopping-note">В меню: ' + esc(dishes.map((dish) => dish.name).join(', ')) + '</p>';
    } else {
      body.innerHTML = '<p class="shopping-note">' + dishes.length + ' ' +
        plural(dishes.length, ['блюдо', 'блюда', 'блюд']) + ' · ' + items.length + ' ' +
        plural(items.length, ['продукт', 'продукта', 'продуктов']) + '</p>' +
        '<ul class="shopping-list">' + items.map((item, index) =>
          '<li><input type="checkbox" id="shop-' + index + '"><label for="shop-' + index + '">' + esc(item) + '</label></li>'
        ).join('') + '</ul>';
    }
    openModal($('#shoppingModal'));
  }

  async function copyShopping() {
    const text = shoppingPlainText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      toast('Список скопирован');
    } catch (e) {
      toast('Не удалось скопировать');
    }
  }

  async function shareShopping() {
    const text = shoppingPlainText();
    try {
      await navigator.share({ title: 'Список покупок', text });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      await copyShopping();
    }
  }

  function downloadShopping() {
    const blob = new Blob(['\ufeff' + shoppingPlainText()], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, 'vkusno-pokupki-' + localDateKey() + '.txt');
    toast('Список сохранён в Загрузки');
  }

  /* ---------- Настройки при запуске ---------- */
  async function requestPersistence() {
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch (e) { /* ignore */ }
  }

  async function loadExtras() {
    try { state.lastBackupAt = await DB.getMeta('lastBackupAt') || null; } catch (e) { state.lastBackupAt = null; }
    try {
      const theme = (await DB.getMeta('theme')) || (function () {
        try { return localStorage.getItem('vkusno.theme'); } catch (e) { return null; }
      })();
      if (theme) applyTheme(theme, false);
    } catch (e) { /* ignore */ }
    await loadHistory();
    try {
      const today = await DB.getMeta('todayPick');
      if (today && today.date === localDateKey()) state.today = today;
    } catch (e) { /* ignore */ }
    try {
      const plan = await DB.getMeta('weekPlan');
      if (plan && Array.isArray(plan.days)) state.plan = plan;
    } catch (e) { /* ignore */ }
    if (DB.mode === 'idb') {
      try {
        const handle = await DB.getMeta('backupDir');
        if (handle && handle.name) state.autoBackup = { handle };
        state.lastAutoBackupAt = await DB.getMeta('lastAutoBackupAt') || null;
      } catch (e) { /* ignore */ }
    }
    renderThemeChoices();
    renderAutoBackupSettings();
  }

  function maybeRemindBackup() {
    if (!state.dishes.length) return;
    const days = daysSince(state.lastBackupAt);
    if (days !== null && days <= 30) return;
    try {
      const lastReminder = localStorage.getItem('vkusno.backupReminder');
      if (lastReminder && daysSince(lastReminder) !== null && daysSince(lastReminder) < 7) return;
      localStorage.setItem('vkusno.backupReminder', localDateKey());
    } catch (e) { /* ignore */ }
    setTimeout(() => toast('Давно не делали бэкап. Настройки → «Скачать файл».', { duration: 5000 }), 2200);
  }

  async function migratePhotosToBlobs() {
    if (DB.mode !== 'idb') return;
    const candidates = state.dishes
      .filter((dish) => typeof dish.photo === 'string' && dish.photo.indexOf('data:image/') === 0)
      .map((dish) => ({ id: dish.id, photo: dish.photo }));
    for (const item of candidates) {
      const dish = state.dishes.find((d) => d.id === item.id);
      if (!dish || dish.photo !== item.photo) continue;
      try {
        const blob = dataURLToBlob(item.photo);
        /* Блюдо могли изменить или удалить, пока читали фото. */
        const current = state.dishes.find((d) => d.id === item.id);
        if (!current || current.photo !== item.photo) continue;
        current.photo = blob;
        await DB.put(current);
      } catch (e) { /* оставляем data URL */ }
    }
  }

  /* ---------- События ---------- */
  function bindEvents() {
    $('#spinBtn').addEventListener('click', () => spinWheel());
    $('#addBtn').addEventListener('click', () => openForm());
    $('#addBtnMobile').addEventListener('click', () => openForm());
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsBtnMobile').addEventListener('click', openSettings);
    $('#planBtn').addEventListener('click', openPlan);
    $('#historyBtn').addEventListener('click', openHistory);

    $('#todayCook').addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      if (id) markCooked(id);
    });
    $('#todayOpen').addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      if (id) openDish(id);
    });

    $('#themeChoices').addEventListener('click', (e) => {
      const choice = e.target.closest('[data-theme-choice]');
      if (choice) applyTheme(choice.dataset.themeChoice, true);
    });

    $('#autoBackupPick').addEventListener('click', chooseAutoBackupFolder);
    $('#autoBackupNow').addEventListener('click', () => writeAutoBackup(true));
    $('#autoBackupOff').addEventListener('click', disableAutoBackup);
    $('#installBtn').addEventListener('click', installApp);
    $('#updateBtn').addEventListener('click', () => location.reload());

    $('#planRebuild').addEventListener('click', rebuildPlan);
    $('#planShopping').addEventListener('click', openShopping);
    $('#planBody').addEventListener('click', (e) => {
      const swap = e.target.closest('[data-plan-swap]');
      if (swap) { swapPlanDay(Number(swap.dataset.planSwap)); return; }
      const cook = e.target.closest('[data-plan-cook]');
      if (cook) { cookPlanDay(Number(cook.dataset.planCook)); return; }
      const open = e.target.closest('[data-plan-open]');
      if (open) {
        const day = state.plan && state.plan.days[Number(open.dataset.planOpen)];
        if (day && day.dishId) openDish(day.dishId);
      }
    });

    $('#shoppingCopy').addEventListener('click', copyShopping);
    $('#shoppingDownload').addEventListener('click', downloadShopping);
    if (navigator.share) {
      $('#shoppingShare').hidden = false;
      $('#shoppingShare').addEventListener('click', shareShopping);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.installPrompt = e;
      renderInstallState();
    });
    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      renderInstallState();
      toast('Приложение установлено');
    });

    window.addEventListener('online', () => {
      renderOnlineState();
      toast('Снова онлайн');
    });
    window.addEventListener('offline', () => {
      renderOnlineState();
      toast('Нет сети — данные сохранятся на устройстве');
    });

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
        return;
      }
      if (e.target.closest('[data-dish-photo]')) {
        state.dishPhoto = !state.dishPhoto;
        renderDishesView();
        return;
      }
      if (e.target.closest('[data-dish-long]')) {
        state.dishLongAgo = !state.dishLongAgo;
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
        state.dishPhoto = false;
        state.dishLongAgo = false;
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
      const current = state.resultId;
      closeModal($('#resultModal'));
      setTimeout(() => spinWheel(current), 300);
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
      resetFormPhotoPreview();
      formPhoto = null;
      renderFormPhoto();
    });

    $('#photoInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        resetFormPhotoPreview();
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
    $('#csvBtn').addEventListener('click', exportCsv);
    setupShareButtons();
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
      if (n) scheduleAutoBackup();
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
      const open = $$('.modal.open');
      const top = open.length ? open[open.length - 1] : null;

      if (e.key === 'Escape' && top) {
        if (top.id === 'confirmModal') resolveConfirm(false);
        else closeModal(top);
        return;
      }

      if (e.key === 'Tab' && top) {
        const items = $$('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', top)
          .filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !top.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !top.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      if (top) return;
      const target = e.target;
      const typing = target && (target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
      if (e.key === '/' && !typing) {
        e.preventDefault();
        switchView('dishes');
        setTimeout(() => { const field = $('#searchInput'); if (field) field.focus(); }, 60);
        return;
      }
      if (typing) return;
      const interactive = target && target.closest && target.closest('button, a');
      if (interactive) return;
      if (e.key === ' ' && state.view === 'wheel') {
        e.preventDefault();
        spinWheel();
      } else if ((e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        openForm();
      }
    });
  }

  async function init() {
    Wheel.init($('#wheel'), $('#wheelStage'));
    bindEvents();
    renderOnlineState();
    watchSystemTheme();
    renderInstallState();
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

    await loadExtras();
    renderAll();

    if (added) {
      setTimeout(() => toast('Добавили ' + added + ' примеров — замените их своими блюдами'), 900);
    } else {
      maybeRemindBackup();
    }

    /* Старые фото хранились как data URL — переводим в Blob в фоне. */
    if (DB.mode === 'idb') {
      migratePhotosToBlobs().then(() => renderAll()).catch(() => {});
    }

    requestPersistence();
    refreshStorageInfo();
    setupServiceWorker();

    /* Если автобэкап настроен давно, обновляем копию при запуске. */
    if (state.autoBackup && state.lastAutoBackupAt &&
      Date.now() - state.lastAutoBackupAt > AUTO_BACKUP_INTERVAL) {
      setTimeout(() => writeAutoBackup(false), 3500);
    }

    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action) {
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
      if (action === 'add') setTimeout(() => openForm(), 400);
      else if (action === 'spin') setTimeout(() => spinWheel(), 700);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
