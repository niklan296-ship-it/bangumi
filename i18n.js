'use strict';
/* Язык интерфейса. Русский — исходный: строки в коде написаны по-русски и проходят через T().
   Для английского T() берёт перевод из EN. Язык меняется в Профиле, приложение перезапускается. */

const LANG = (() => {
  try { const l = localStorage.getItem('bangumi-lang'); if (l === 'ru' || l === 'en') return l; } catch (e) { /* нет хранилища (service worker) */ }
  const n = String((self.navigator && navigator.language) || 'ru').toLowerCase();
  return /^(ru|uk|be|kk)/.test(n) ? 'ru' : 'en';
})();
const LOC = LANG === 'en' ? 'en-GB' : 'ru-RU';
/* Готовая пара, когда фразу нельзя собрать из кусков: L('Вышла 5 серия', 'Episode 5 is out') */
const L = (ru, en) => (LANG === 'en' ? en : ru);

const EN = {
  // Статусы, дни, справочники
  'Смотрю': 'Watching', 'В планах': 'Plan to watch', 'Отложено': 'On hold', 'Просмотрено': 'Completed', 'Брошено': 'Dropped',
  'Пн': 'Mon', 'Вт': 'Tue', 'Ср': 'Wed', 'Чт': 'Thu', 'Пт': 'Fri', 'Сб': 'Sat', 'Вс': 'Sun',
  'Понедельник': 'Monday', 'Вторник': 'Tuesday', 'Среда': 'Wednesday', 'Четверг': 'Thursday', 'Пятница': 'Friday', 'Суббота': 'Saturday', 'Воскресенье': 'Sunday',
  'понедельникам': 'Mondays', 'вторникам': 'Tuesdays', 'средам': 'Wednesdays', 'четвергам': 'Thursdays', 'пятницам': 'Fridays', 'субботам': 'Saturdays', 'воскресеньям': 'Sundays',
  'каждый понедельник': 'every Monday', 'каждый вторник': 'every Tuesday', 'каждую среду': 'every Wednesday', 'каждый четверг': 'every Thursday',
  'каждую пятницу': 'every Friday', 'каждую субботу': 'every Saturday', 'каждое воскресенье': 'every Sunday',
  'TV-короткий': 'TV short', 'Фильм': 'Movie', 'Спешл': 'Special', 'Клип': 'Music video',
  'Выходит': 'Airing', 'Завершён': 'Finished', 'Анонс': 'Upcoming', 'Отменён': 'Cancelled', 'Перерыв': 'On break',
  'Зима': 'Winter', 'Весна': 'Spring', 'Лето': 'Summer', 'Осень': 'Fall',
  'Оригинал': 'Original', 'Манга': 'Manga', 'Ранобэ': 'Light novel', 'Веб-новелла': 'Web novel', 'Роман': 'Novel',
  'Визуальная новелла': 'Visual novel', 'Игра': 'Game', 'Веб-манга': 'Web manga', 'Другое': 'Other',
  'Главная': 'Home', 'Расписание': 'Schedule', 'Поиск': 'Search', 'Мой список': 'My list', 'Профиль': 'Profile',
  'Экшен': 'Action', 'Фэнтези': 'Fantasy', 'Романтика': 'Romance', 'Комедия': 'Comedy', 'Повседневность': 'Slice of life',
  'Драма': 'Drama', 'Приключения': 'Adventure', 'Сверхъестественное': 'Supernatural', 'Детектив': 'Mystery',
  'Психология': 'Psychological', 'Фантастика': 'Sci-fi', 'Спорт': 'Sports', 'Триллер': 'Thriller', 'Ужасы': 'Horror',
  'Меха': 'Mecha', 'Музыка': 'Music', 'Махо-сёдзё': 'Magical girl', 'Этти': 'Ecchi',

  // Числа и время
  'серия': 'episode', 'серии': 'episodes', 'серий': 'episodes',
  'тайтл': 'title', 'тайтла': 'titles', 'тайтлов': 'titles',
  'час': 'hour', 'часа': 'hours', 'часов': 'hours',
  'день': 'day', 'дня': 'days', 'дней': 'days',
  'сегодня': 'today', 'завтра': 'tomorrow', 'д': 'd', 'ч': 'h', 'мин': 'min', '0 мин': '0 min',
  'сер.': 'ep.', 'эп.': 'eps', 'в': 'at', 'по': '×', 'из': 'of', '· из': '· of', 'через': 'in', 'вышла': 'aired',

  // Интерфейсы
  'Кинотеатр': 'Cinema', 'Постеры, свет и стекло': 'Posters, light and glass', 'Тушь, бумага и панели': 'Ink, paper and panels',
  'Квест': 'Quest', 'Пиксели, уровни и опыт': 'Pixels, levels and XP',

  // Уведомления и тосты
  'Сегодня по плану': 'On your plan today', 'Данные обновлены': 'Data updated', 'Нет связи с AniList. Попробуй позже': 'Can’t reach AniList. Try again later',
  '<p class="hint">Описание появится, когда будет интернет.</p>': '<p class="hint">The synopsis will appear once you’re online.</p>',
  'Новый уровень:': 'New level:', 'Последние 7 дней': 'Last 7 days', 'За всё время': 'All time',
  'Финал! Перенести в «Просмотрено»?': 'That’s the finale! Move it to “Completed”?', 'Да': 'Yes', '» — просмотрено': '” — completed',
  'Отменить': 'Undo', 'План на': 'Plan for', 'выполнен!': 'done!', 'ДОН!': 'DONE!',
  'Отметить серию': 'Mark episode', 'Поставь Бангуми на главный экран — откроется как обычное приложение.': 'Add Bangumi to your home screen — it will open like a regular app.',
  'Установить': 'Install', 'Доступно ещё': 'Available:', 'В твоих планах': 'In your plans', 'Продолжить просмотр': 'Continue watching',
  '+1 серия': '+1 episode', 'Подробнее': 'Details', 'В тренде': 'Trending', 'В список': 'Add to list',
  'Добро пожаловать': 'Welcome', 'Твоё аниме. Твоё расписание.': 'Your anime. Your schedule.',
  'Добавляй тайтлы, отмечай серии одним касанием и раскладывай просмотр по дням недели.': 'Add titles, mark episodes with one tap and spread your watching across the week.',
  'Найти аниме': 'Find anime', '· сегодня': '· today', 'запланировано': 'planned', 'выполнено': 'done',
  'Пока ничего не запланировано': 'Nothing planned yet', 'всё просмотрено': 'all watched', 'Отметить:': 'Mark:',
  '<span>готово</span>': '<span>done</span>', 'Изменить план по': 'Edit plan for', 'Запланировать по': 'Plan for',
  'Сегодня': 'Today', 'Вся неделя': 'Whole week', 'Все': 'All', 'Скоро выйдет': 'Coming soon', 'Ещё': 'More',
  'Собери свой список': 'Build your list',
  'Найди аниме, отметь «Смотрю» или «В планах», а потом разложи просмотр по дням — как чек-лист в заметках, только серии считаются сами.': 'Find anime, mark it “Watching” or “Plan to watch”, then spread it across the week — like a checklist in your notes, except episodes count themselves.',
  'Выход серий и твой план по дням': 'New episodes and your plan by day', 'В план': 'Plan',
  'Здесь будет твоя телепрограмма': 'Your TV guide will be here',
  'Добавь аниме — даты новых серий появятся сами, а дни просмотра ты отметишь галочками.': 'Add anime — air dates appear by themselves, and you tick off your watch days.',
  'Прошлая неделя': 'Previous week', 'Следующая неделя': 'Next week',
  '<span class="spinner" aria-label="Загрузка"></span>': '<span class="spinner" aria-label="Loading"></span>',
  '<button class="btn small" type="button" data-action="week-today">Сегодня</button>': '<button class="btn small" type="button" data-action="week-today">Today</button>',
  'Нет связи с AniList — показываю сохранённые даты.': 'Can’t reach AniList — showing saved dates.',
  'В этот день новых серий из твоего списка нет.': 'No new episodes from your list on this day.',
  'СЕЙЧАС': 'NOW', 'Мой план': 'My plan', 'Выход серий': 'Airing',
  'По-русски, по-английски или ромадзи': 'In English, romaji or Russian', 'Фрирен, Ван Пис, Chainsaw Man…': 'Frieren, One Piece, Chainsaw Man…',
  'Поиск аниме': 'Search anime', 'Очистить': 'Clear', 'Нет связи': 'No connection',
  'Не получилось достучаться до базы аниме. Проверь интернет и попробуй ещё раз.': 'Couldn’t reach the anime database. Check your connection and try again.',
  'Ничего не нашлось': 'Nothing found',
  'Попробуй другое написание: «Атака титанов», «Shingeki no Kyojin» или «Attack on Titan».': 'Try another spelling: “Attack on Titan” or “Shingeki no Kyojin”.',
  'Найдено:': 'Found:', 'Популярное': 'Popular',
  '<div class="empty soft"><p>Пусто.</p></div>': '<div class="empty soft"><p>Empty.</p></div>',
  '<div class="empty soft"><p>Нет связи.</p></div>': '<div class="empty soft"><p>No connection.</p></div>',
  'Топ недели': 'Top this week', 'Сезон': 'Season',
  'Без интернета сезон не загрузить. Список и расписание работают офлайн.': 'The season can’t load offline. Your list and schedule still work.',
  'Повторить': 'Retry', 'Нет нужного тайтла в базе? Добавь вручную — название и число серий.': 'Title not in the database? Add it by hand — name and episode count.',
  'Добавить вручную': 'Add manually', 'Ссылка на серию': 'Episode link',
  'Список пока пуст': 'Your list is empty', 'Найди аниме и добавь со статусом «Смотрю» или «В планах».': 'Find anime and add it as “Watching” or “Plan to watch”.',
  'Вид': 'View', 'Сетка': 'Grid', 'Список': 'List', 'Карта': 'Map', 'на карте': 'on the map',
  'В «': 'Nothing in “', '» пока пусто.': '” yet.', 'Статус': 'Status', 'Сортировка': 'Sort', 'Недавние': 'Recent', 'А–Я': 'A–Z', 'Оценка': 'Score',
  '<p class="hint">Добавь тайтлы, и здесь появится разбивка.</p>': '<p class="hint">Add titles and the breakdown will appear here.</p>',
  '<p class="hint">Жанры посчитаются по просмотренным сериям.</p>': '<p class="hint">Genres are counted from watched episodes.</p>',

  // Профиль
  'Разрешены': 'Allowed', 'Запрещены в настройках Android — включи их для Бангуми': 'Blocked in Android settings — turn them on for Bangumi',
  'Браузер не поддерживает уведомления': 'This browser doesn’t support notifications', 'Ещё не разрешены': 'Not allowed yet',
  'ещё не обновлялось': 'never', 'УР.': 'LV.', 'Новичок': 'Newbie', 'Зритель': 'Viewer', 'Знаток': 'Connoisseur', 'Отаку': 'Otaku', 'Сэнсэй': 'Sensei', 'Легенда': 'Legend',
  'Опыт': 'XP', '· до уровня': '· to level', 'Время за аниме': 'Time watching anime', 'завершено': 'completed', 'средняя оценка': 'average score',
  'Активность': 'Activity', '8 недель ·': '8 weeks ·', 'Любимые жанры': 'Favourite genres', 'Статусы': 'Statuses', 'Интерфейс': 'Interface',
  'Уведомления': 'Notifications', 'О новых сериях': 'New episodes', 'Когда выходит серия того, что смотришь или запланировал': 'When an episode of something you watch or plan comes out',
  'Уведомления о новых сериях': 'New episode notifications', 'План на день': 'Daily plan', 'Напоминание, что сегодня по расписанию': 'A reminder of what’s on today',
  'Напоминания о плане': 'Plan reminders', 'Статус:': 'Status:',
  'Уведомление придёт в минуту выхода серии, даже если Бангуми закрыт. Время берётся из AniList и уточняется каждый раз, когда открываешь приложение.': 'You’ll be notified the minute an episode airs, even if Bangumi is closed. Times come from AniList and are refreshed every time you open the app.',
  'Android проверяет серии в фоне раз в несколько часов, а при открытии приложения — сразу.': 'Android checks for episodes in the background every few hours, and right away when you open the app.',
  'Названия': 'Titles', 'Рус': 'Rus', 'Ромадзи': 'Romaji', 'Быстрый план': 'Quick plan',
  'Два свайпа вправо от левого края экрана открывают окошко «Быстро в расписание»': 'Two swipes right from the left edge open the “Quick add to schedule” panel',
  'Жест быстрого плана': 'Quick plan gesture', 'Карта — как ментальная карта в Заметках': 'Map — like a mind map in Notes', 'Строки': 'Rows',
  'Стеклянные кнопки': 'Glass buttons', 'Полупрозрачные кнопки с размытием и бликом': 'Translucent buttons with blur and a highlight',
  'Плавность': 'Smoothness', '«Быстро» убирает размытие и тяжёлые эффекты. «Авто» само решает по телефону': '“Fast” removes blur and heavy effects. “Auto” decides based on your phone',
  '— у тебя включится «Быстро»': '— you’ll get “Fast”', 'Авто': 'Auto', 'Красиво': 'Pretty', 'Быстро': 'Fast',
  'Тема': 'Theme', '<small>В «Квесте» всегда тёмная</small>': '<small>Quest is always dark</small>', 'Тёмная': 'Dark', 'Светлая': 'Light',
  'Данные': 'Data', 'Обновить': 'Refresh', 'Последний раз:': 'Last time:', 'Резервная копия': 'Backup', 'Список хранится только на этом телефоне': 'Your list is stored only on this phone',
  'Сохранить': 'Save', 'Загрузить': 'Load', 'Бангуми, версия': 'Bangumi, version', '. Тайтлы и расписание —': '. Titles and schedule —',
  ', русские названия и описания —': ', Russian titles and synopses —', '. Время серий — по твоему часовому поясу, рядом японское (JST).': '. Episode times are in your time zone, with Japan time (JST) next to them.',
  'Удалённый тайтл': 'Removed title', 'Время по тайтлам': 'Time by title', 'Период': 'Period', 'Неделя': 'Week', 'Месяц': 'Month', 'Прошлый': 'Last month', 'Всё время': 'All time',
  'В этот период ничего не отмечено': 'Nothing marked in this period', 'Свернуть': 'Collapse', 'Показать все': 'Show all',
  'Считается по всем отмеченным сериям и длительности серии.': 'Counted from every marked episode and its length.',
  'Учитываются серии, отмеченные в эти дни: «+1», галочки плана и сетка серий. Разовая отметка многих серий сразу (уже смотрел раньше) сюда не попадает.': 'Counts episodes marked on these days: “+1”, plan ticks and the episode grid. Marking many episodes at once (watched earlier) isn’t included.',

  // Страница тайтла
  'Назад': 'Back', 'Открыть на AniList': 'Open on AniList', 'О тайтле': 'About', 'Следующая серия': 'Next episode', 'Добавить в список': 'Add to list',
  'Моё': 'Mine', 'Своё название': 'Custom title', 'Например, как ты его называешь': 'E.g. what you call it', 'Заметки': 'Notes',
  'Где смотрю, с кем, любимые моменты…': 'Where I watch, with whom, favourite moments…', 'Студия': 'Studio', 'Серий': 'Episodes', 'Источник': 'Source', 'Старт': 'Start',
  '<button class="expand" type="button" data-action="expand">Читать полностью</button>': '<button class="expand" type="button" data-action="expand">Read more</button>',
  '<div class="loading"><span class="spinner"></span>Загружаю описание…</div>': '<div class="loading"><span class="spinner"></span>Loading synopsis…</div>',
  'Похожее': 'Similar', 'Всё просмотрено': 'All watched', 'Ты в курсе всех серий': 'You’re all caught up', 'просмотрено': 'watched',
  'Серии': 'Episodes', 'Серия': 'Episode', 'Нажми на номер, чтобы отметить всё до этой серии.': 'Tap a number to mark everything up to that episode.',
  'Обведены вышедшие, но не просмотренные.': 'Circled ones have aired but aren’t watched yet.', 'Минус серия': 'Minus one episode',
  'Все серии отмечены': 'All episodes marked', 'Отметить EP': 'Mark EP', 'Потрачено': 'Time spent', '· в этом месяце': '· this month',
  'Нажми, чтобы оценить': 'Tap to rate', 'Слабо': 'Weak', 'Так себе': 'Meh', 'Хорошо': 'Good', 'Отлично': 'Great', 'Шедевр': 'Masterpiece',
  'Моя оценка': 'My score', 'Когда смотрю': 'When I watch', 'в неделю': 'a week', 'Дни просмотра': 'Watch days', 'Время': 'Time',
  'Серий за раз': 'Episodes per sitting', 'Меньше': 'Fewer', 'Больше': 'More',
  'Отмеченные дни станут чек-листом во вкладке «Расписание»: галочка сама засчитает серии.': 'Selected days become a checklist in the Schedule tab: a tick counts the episodes for you.',
  'Удалить «': 'Remove “', '» из списка?': '” from your list?', 'Удалить': 'Remove', 'Оставить': 'Keep', 'Удалить из списка': 'Remove from list',

  // План и быстрая панель
  'Что смотрю по': 'What I watch on', 'Время и число серий за раз настраиваются в карточке тайтла.': 'Time and episodes per sitting are set on the title page.',
  'В списке нет тайтлов со статусом «Смотрю» или «В планах».': 'There are no “Watching” or “Plan to watch” titles in your list.',
  'Готово': 'Done', 'Название': 'Title', 'Название тайтла': 'Title name', 'Всего серий': 'Total episodes', 'Если не знаешь — оставь пустым': 'Leave empty if you don’t know',
  'Для таких тайтлов даты выхода не подтягиваются — только твой план и счётчик.': 'Air dates aren’t fetched for these — only your plan and counter.',
  'Быстро в расписание': 'Quick add to schedule', 'Закрыть': 'Close', 'День недели': 'Day of week', 'Найти в списке или в базе': 'Search your list or the database',
  'без времени': 'any time', 'Убрать из плана': 'Remove from plan', 'Добавить в план': 'Add to plan', 'из базы': 'from database',
  'Добавить в список и в план:': 'Add to list and plan:', 'Сегодня ·': 'Today ·', 'Любое': 'Any', 'Своё время': 'Custom time', 'В плане по': 'Planned on',
  '<p class="hint">Пока пусто. Нажми «+» у тайтла ниже.</p>': '<p class="hint">Empty for now. Tap “+” next to a title below.</p>',
  'Из моего списка': 'From my list',
  '<p class="hint">Найди аниме через поиск выше — оно сразу попадёт и в список, и в план.</p>': '<p class="hint">Find anime with the search above — it goes straight into your list and plan.</p>',
  'В моём списке': 'In my list', 'В базе': 'In the database',
  '<div class="loading"><span class="spinner"></span>Ищу…</div>': '<div class="loading"><span class="spinner"></span>Searching…</div>',
  '<p class="hint">Нет связи с базой. Можно выбрать из своего списка.</p>': '<p class="hint">Can’t reach the database. You can pick from your list.</p>',
  '<p class="hint">Ничего нового не нашлось.</p>': '<p class="hint">Nothing new found.</p>',
  'Ничего не запланировано': 'Nothing planned', '— по': '— on',

  // Тосты
  'Разреши уведомления: Настройки → Приложения → Бангуми → Уведомления': 'Allow notifications: Settings → Apps → Bangumi → Notifications',
  'Уведомления здесь не поддерживаются': 'Notifications aren’t supported here', 'Разреши уведомления: Настройки → Приложения → Бангуми': 'Allow notifications: Settings → Apps → Bangumi',
  'Уведомления включены': 'Notifications on', 'Уведомления выключены': 'Notifications off', 'Интерфейс:': 'Interface:',
  'Сохранено:': 'Saved:', 'Не получилось сохранить файл': 'Couldn’t save the file', 'Копия сохранена в «Загрузки»': 'Backup saved to Downloads',
  'Загружено тайтлов:': 'Titles loaded:', 'Это не файл копии Бангуми. Выбери bangumi-….json': 'That’s not a Bangumi backup. Pick bangumi-….json',
  'Добавлено в «В планах»': 'Added to “Plan to watch”', 'Открыть': 'Open', 'Добавлено в «': 'Added to “', 'Удалено:': 'Removed:', 'Вернуть': 'Undo',
  'Убрано из плана:': 'Removed from plan:', 'Впиши название': 'Enter a title',
  'Мой список: карта': 'My list: map', 'Мой список: строки': 'My list: rows', 'Мой список: сетка': 'My list: grid',
  'Плавность: быстро': 'Smoothness: fast', 'Плавность: красиво': 'Smoothness: pretty',
  'Жест включён: два свайпа от левого края': 'Gesture on: two swipes from the left edge', 'Жест выключен': 'Gesture off',
  'Бангуми установлен': 'Bangumi installed', 'Бангуми обновился': 'Bangumi updated', 'Перезапустить': 'Restart',

  // Карта
  'Без плана': 'No plan', 'Без жанра': 'No genre', 'Меню': 'Menu', 'Развернуть': 'Expand', 'Оформление': 'Style', 'По центру': 'Center',
  'Вернуть на место': 'Put back', 'Повернуть на 90°': 'Rotate 90°', 'Показать всё': 'Fit all', 'На весь экран': 'Full screen', 'Приблизить': 'Zoom in', 'Отдалить': 'Zoom out',
  'Вправо': 'Right', 'Влево': 'Left', 'В обе стороны': 'Both ways', 'Вниз': 'Down', 'Кругом': 'Radial',
  'Без групп': 'No groups', 'По статусу': 'By status', 'По дням плана': 'By plan day', 'По жанрам': 'By genre',
  'Текст на линии': 'Text on line', 'Плашки': 'Pills', 'С обложками': 'With covers', 'Плавные': 'Curved', 'Прямые': 'Straight', 'Углом': 'Elbow',
  'Радуга': 'Rainbow', 'Цвет обложки': 'Cover colour', 'Один цвет': 'One colour', 'Чистый': 'Plain', 'Точки': 'Dots', 'Клетка': 'Grid',
  'Градиент': 'Gradient', 'Звёзды': 'Stars', 'Сияние': 'Aurora', 'Обложка': 'Cover', 'Нет': 'None', 'Поток': 'Flow', 'Дыхание': 'Breathe',
  'Искры': 'Sparks', 'Неон': 'Neon', 'Неподвижный': 'Still', 'Живой': 'Live', 'Только текущие': 'Current only',
  'Оформление карты': 'Map style', 'Раскладка': 'Layout', 'Группы': 'Groups', 'Узлы': 'Nodes', 'Линии': 'Lines', 'Толщина': 'Thickness',
  'Толщина линий': 'Line thickness', 'Цвета': 'Colours', 'Цвет': 'Colour', 'Свой цвет': 'Custom colour', 'Фон': 'Background', 'Анимации': 'Animation',
  'Появление веток': 'Branches grow in', 'Ветки прорисовываются при открытии': 'Branches draw themselves when the map opens', 'Движение линий': 'Line motion',
  'Поворот': 'Rotation', 'Угол': 'Angle', 'Угол поворота': 'Rotation angle', 'Поворот двумя пальцами': 'Two-finger rotate', 'Крути карту, как фото': 'Rotate the map like a photo',
  'Текст всегда ровно': 'Keep text level', 'Надписи не наклоняются при повороте': 'Labels don’t tilt when you rotate', 'Текст': 'Text', 'Размер': 'Size',
  'Размер текста': 'Text size', 'Надпись в центре': 'Center label', 'Что показывать': 'What to show', 'Вернуть узлы на места': 'Reset node positions',
  'Сбросить оформление': 'Reset style', 'Узлы вернулись на места': 'Nodes reset', 'Оформление сброшено': 'Style reset',

  // Быстрое меню (долгое нажатие)
  'Снять отметку': 'Unmark', 'Посмотрел': 'Watched', '<div class="grab"></div><p class="hint">Тайтл не найден.</p>': '<div class="grab"></div><p class="hint">Title not found.</p>',
  'В расписание': 'To schedule', 'В планы': 'To plans', 'Открыть страницу': 'Open page',

  // Поделиться
  'В списке': 'In list', 'Из базы': 'From database', 'Уже отмечено до EP': 'Already marked up to EP',
  'уже засчитана. Если серия другая, поправь номер выше.': 'is already counted. If it’s a different episode, fix the number above.',
  'В этом тайтле': 'This title has', 'серий. Возможно, это другой сезон — выбери ниже или поправь номер.': 'episodes. It may be another season — pick it below or fix the number.',
  'В «Смотрю» и отметить EP': 'Add to “Watching” and mark EP', 'Добавить в «Смотрю»': 'Add to “Watching”',
  'Поделились с Бангуми': 'Shared to Bangumi', 'Вставь ссылку или название с номером серии': 'Paste a link or a title with the episode number', 'Без ссылки': 'No link',
  'Ссылка или текст': 'Link or text', 'https://… или «Магическая битва 5 серия»': 'https://… or “Jujutsu Kaisen episode 5”', 'Номер серии': 'Episode number',
  'Нашёл в тексте: сезон': 'Found in the text: season', '. Учитываю при подборе.': '. Taking it into account.', 'Это он?': 'Is this it?',
  '<div class="loading"><span class="spinner"></span>Ищу в базе…</div>': '<div class="loading"><span class="spinner"></span>Searching the database…</div>',
  'Нет связи с базой. Проверь интернет или поправь название.': 'Can’t reach the database. Check your connection or fix the title.',
  'Не нашёл такой тайтл. Поправь название — например, по-английски или ромадзи.': 'Couldn’t find that title. Try fixing the name, e.g. in romaji.',
  'Выбери тайтл': 'Pick a title', '» — в «Смотрю»': '” — now “Watching”',

  // Виджет, автокопия, продолжения
  'Сегодня ничего не запланировано': 'Nothing planned for today', 'Дальше': 'Next', 'отмечено': 'marked', 'С виджета отмечено:': 'Marked from the widget:',
  'Автокопия сохранена': 'Auto-backup saved', 'Автокопия выключена': 'Auto-backup off', 'Автокопия раз в неделю': 'Weekly auto-backup', 'Последняя:': 'Last:',
  'Файл появится в «Загрузки/Bangumi»': 'The file will appear in Downloads/Bangumi',
  'Выходит сейчас': 'Airing now', 'Уже вышло': 'Out now', 'Есть продолжение:': 'There’s a sequel:', 'Продолжения': 'Sequels', 'к тому, что ты смотрел': 'for what you’ve watched',
  'Скрыть': 'Hide', 'Предыдущее': 'Prequel', 'Продолжение': 'Sequel', 'Сезоны': 'Seasons',
  // Импорт
  'Импорт списка': 'Import list', 'Из AniList, Shikimori или MyAnimeList': 'From AniList, Shikimori or MyAnimeList', 'Импорт': 'Import',
  'Перенеси список из другого сервиса. Тайтлы, которые уже есть, не потеряются: прогресс возьмётся больший.': 'Bring your list over from another service. Titles you already have stay — the higher progress wins.',
  'MyAnimeList: myanimelist.net/panel.php?go=export → Export My Anime List.': 'MyAnimeList: myanimelist.net/panel.php?go=export → Export My Anime List.',
  'Shikimori: в настройках профиля — «Экспорт списка», формат XML. Или просто введи никнейм во вкладке Shikimori.': 'Shikimori: “Export list” in profile settings, XML format. Or just enter your nickname in the Shikimori tab.',
  'Выбрать файл .xml или .xml.gz': 'Choose an .xml or .xml.gz file', 'Имя на AniList': 'AniList username', 'Никнейм на Shikimori': 'Shikimori nickname', 'Найти': 'Find',
  'Список должен быть открыт для всех.': 'The list has to be public.', 'Загружаю список…': 'Loading the list…', 'Готово!': 'Done!', 'у': '·', 'в файле': 'in the file',
  'Новых': 'New', 'Обновится': 'Will update', 'Уже есть': 'Already there', 'Нет в базе AniList': 'Not on AniList', 'Добавить в мой список': 'Add to my list', 'Нечего добавлять': 'Nothing to add',
  'Сверяю с базой…': 'Matching with the database…', 'Список пустой — нечего переносить.': 'The list is empty — nothing to import.',
  'Не нашёл такого пользователя на Shikimori.': 'Couldn’t find that user on Shikimori.',
  'В файле нет аниме. Нужен файл экспорта MyAnimeList или Shikimori (.xml).': 'No anime in that file. It needs to be a MyAnimeList or Shikimori export (.xml).',
  'Не получилось распаковать .gz — распакуй файл и выбери .xml.': 'Couldn’t unpack the .gz — unzip it and pick the .xml.',
  'Нет связи. Проверь интернет и попробуй ещё раз.': 'No connection. Check your internet and try again.',
  'Не нашёл такого пользователя на AniList или его список скрыт.': 'Couldn’t find that AniList user, or their list is private.',
  'Не получилось загрузить список. Проверь имя и что список открыт.': 'Couldn’t load the list. Check the name and that the list is public.',
  'Добавлено:': 'Added:', 'обновлено:': 'updated:',
  // Итоги года
  'Итоги года': 'Year in review', 'Часы, топ тайтлов и жанр года — можно отправить друзьям': 'Hours, top titles and genre of the year — ready to share',
  'Твой год в аниме': 'Your year in anime', 'Касайся справа — дальше, слева — назад': 'Tap right for next, left to go back', 'Пока пусто': 'Nothing yet',
  'Отмечай серии — итоги соберутся сами.': 'Mark episodes and your recap builds itself.', 'В этом году ты смотрел аниме': 'This year you watched anime for',
  'Это': 'That’s', 'Жанр года': 'Genre of the year', 'времени — тайтлы этого жанра': 'of your time went to this genre', 'Топ года': 'Top of the year', 'Твой ритм': 'Your rhythm',
  'Самый активный месяц': 'Busiest month', 'Дней подряд': 'Day streak', 'лучшая серия дней': 'longest run', 'Дней с аниме': 'Days with anime', 'Рекорд за день': 'Best day',
  'аниме': 'of anime', 'дней подряд': 'day streak', 'Поделиться': 'Share', 'Сохранить картинку': 'Save image', 'Мой год в аниме': 'My year in anime',
  'Картинка сохранена': 'Image saved', 'Не получилось сделать картинку': 'Couldn’t make the image',

  // Смотреть, ачивки, рулетка, сезон свайпами
  'Смотреть': 'Watch', 'Где смотрю': 'Where I watch', 'Кнопка «Смотреть» откроет тайтл там': 'The Watch button opens the title there', 'Сайт сохранён': 'Site saved',
  'Первая серия': 'First episode', 'Отметь первую серию': 'Mark your first episode', 'Сотня': 'Century', '100 серий за всё время': '100 episodes in total',
  'Пятисотка': 'Five hundred', '500 серий за всё время': '500 episodes in total', 'Тысячник': 'Thousand club', '1000 серий за всё время': '1000 episodes in total',
  'Финал': 'Finale', 'Досмотри первый тайтл': 'Finish your first title', 'Коллекционер': 'Collector', 'Досмотри 10 тайтлов': 'Finish 10 titles',
  'Легенда списка': 'List legend', 'Досмотри 30 тайтлов': 'Finish 30 titles', 'Марафонец': 'Marathoner', '10 серий за один день': '10 episodes in one day',
  'Ночной марафон': 'Night marathon', '5 серий после полуночи за одну ночь': '5 episodes after midnight in one night',
  'Неделя без пропусков': 'Week streak', 'Смотри аниме 7 дней подряд': 'Watch anime 7 days in a row', 'Месяц без пропусков': 'Month streak', 'Смотри аниме 30 дней подряд': 'Watch anime 30 days in a row',
  'Долгострой': 'Long haul', 'Досмотри тайтл на 100+ серий': 'Finish a title with 100+ episodes', 'Всеядный': 'Omnivore', 'Тайтлы 8 разных жанров': 'Titles from 8 different genres',
  'В курсе сезона': 'On top of the season', 'Смотри 3 выходящих тайтла одновременно': 'Watch 3 airing titles at once', 'Планировщик': 'Planner', '20 галочек в плане': '20 ticks in your plan',
  'Критик': 'Critic', 'Оцени 10 тайтлов': 'Rate 10 titles', 'Летописец': 'Chronicler', 'Заметки к 5 тайтлам': 'Notes on 5 titles',
  'Судьба решила': 'Fate decided', 'Покрути рулетку «Что посмотреть»': 'Spin the “What to watch” wheel', 'Сезонный охотник': 'Season hunter',
  'Добавь 5 тайтлов, листая сезон': 'Add 5 titles while swiping a season', 'Подводим итоги': 'Recap time', 'Открой «Итоги года»': 'Open your Year in review',
  'Новая ачивка!': 'New achievement!', 'Ачивки': 'Achievements', 'Получена': 'Unlocked',
  'Что посмотреть?': 'What to watch?', 'Не можешь выбрать — покрути рулетку': 'Can’t decide? Spin the wheel', 'Добавь хотя бы 2 тайтла в «Смотрю» или «В планах»': 'Add at least 2 titles to “Watching” or “Plan to watch”',
  'Крути — выберет из того, что ты смотришь и планируешь.': 'Spin it — it picks from what you watch and plan.', 'Крутить': 'Spin', 'Ещё раз': 'Again',
  'Судьба говорит:': 'Fate says:', 'Начни с первой серии': 'Start from episode 1',
  'Листать': 'Swipe', 'Мимо': 'Skip', 'Буду смотреть': 'Will watch', 'Вправо — в планы, влево — мимо': 'Right — plan it, left — skip', 'БУДУ': 'YES', 'МИМО': 'NOPE',
  'Сезон пролистан!': 'Season done!', 'Здесь всё уже просмотрено': 'You’ve seen everything here', 'В планы:': 'Planned:', 'Ничего нового не добавлено': 'Nothing new added',
  'Листай новый сезон карточками — вправо в планы, влево мимо': 'Swipe through the new season — right to plan, left to skip',

  // Статичная разметка index.html и прочее
  'Бангуми': 'Bangumi', 'Бангуми, на главную': 'Bangumi, home', 'Разделы': 'Sections', 'Язык': 'Language',
  'Мой аниме-список, расписание серий и план просмотра': 'My anime list, episode schedule and watch plan'
};

function T(s) {
  if (LANG === 'ru' || s == null) return s;
  const str = String(s), k = str.trim();
  const v = EN[k];
  if (v == null) { (self.__i18nMissing || (self.__i18nMissing = new Set())).add(k); return str; }
  return str.slice(0, str.indexOf(k)) + v + str.slice(str.indexOf(k) + k.length);
}

/* Разметка index.html: data-t переводит текст, data-t-label — подпись для экранных читалок */
function i18nDom(root) {
  document.documentElement.lang = LANG;
  if (LANG === 'ru') return;
  (root || document).querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.textContent); });
  (root || document).querySelectorAll('[aria-label]').forEach(el => { el.setAttribute('aria-label', T(el.getAttribute('aria-label'))); });
  document.title = T(document.title);
}

if (self.document && document.body) i18nDom();
