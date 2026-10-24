/* MostMed demo — vanilla JS SPA. Data: data/*.json (same shape as supabase/schema.sql) */
(() => {
'use strict';

// ===== 운영자 설정 — 실제 연락처로 바꾸세요 =====
const CONFIG = {
  agentName: { ru: 'Мария', ko: '마리야' },          // 통역사 이름
  agentInitials: 'М',
  telegram: 'mostmed_demo',                           // @ 없이 텔레그램 아이디
  whatsapp: '821000000000',                           // 국가번호 포함, 숫자만
  phone: '+82 10-0000-0000',
  hours: '9:00–22:00 KST',
};

const LS_PLAN = 'mostmed.plan', LS_LEADS = 'mostmed.leads', LS_LANG = 'mostmed.lang';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let LANG = store.get(LS_LANG, (navigator.language || 'ru').startsWith('ko') ? 'ko' : 'ru');
let DB = { categories: [], procedures: [], clinics: [] };
let plan = store.get(LS_PLAN, []);
let query = '';

// ===== 문구 =====
const T = {
  ru: {
    demo: 'Демо-версия: клиники и цены — примерные данные для показа',
    logoSub: 'лечение в Корее',
    nav_services: 'Направления', nav_how: 'Как это работает', nav_about: 'Обо мне',
    eyebrow: 'Медицинский переводчик · Сеул',
    h1: 'Лечение в Корее — <em>на вашем языке</em>',
    lead: 'Подберу клинику под вашу задачу, запрошу цены и буду рядом на каждом приёме — от первой консультации до выписки.',
    search_ph: 'Например: колено, нос, чекап',
    search_btn: 'Найти',
    chips: ['стволовые клетки', 'колено', 'грыжа диска', 'ринопластика', 'чекап', 'импланты'],
    stats: [['9', 'направлений лечения'], ['24–48 ч', 'предложение от клиник'], ['Бесплатно', 'первая консультация']],
    role: 'Медицинский переводчик корейский ↔ русский',
    perks: ['Подбор 2–3 клиник и сравнение цен', 'Перевод на всех приёмах и документов', 'Встреча в аэропорту, отель, трансфер', 'На связи во время всего лечения'],
    resp: `Обычно отвечаю в течение 15 минут · ${CONFIG.hours}`,
    cats_h: 'Направления лечения', cats_sub: 'Выберите направление — покажу процедуры, сроки и ориентировочные цены',
    pop_h: 'Чаще всего спрашивают', found: n => `Найдено: ${n}`, nothing: 'Ничего не нашлось. Опишите проблему своими словами — подскажу, какой врач нужен.',
    how_h: 'Как это работает',
    steps: [
      ['Заявка', 'Напишите в Telegram или WhatsApp, или соберите план прямо на сайте.'],
      ['Документы', 'Пришлите выписки, МРТ, анализы — переведу их для корейских врачей.'],
      ['Предложение', 'За 24–48 часов: 2–3 клиники, смета и сроки лечения.'],
      ['Поездка', 'Помогу с датами, отелем и трансфером из аэропорта.'],
      ['Лечение и после', 'Перевод на приёмах, выписка на русском, связь после возвращения домой.'],
    ],
    about_h: 'Обо мне',
    about_p: 'Я — носитель русского языка и профессиональный медицинский переводчик корейского. Вы общаетесь с одним человеком, который знает и вашу историю болезни, и корейскую больницу изнутри.',
    about_li: ['Устный перевод на консультациях, обследованиях и выписке', 'Письменный перевод медицинских документов', 'Университетские больницы и специализированные клиники', 'Прозрачно: смету выдаёт клиника на своём бланке'],
    faq_h: 'Частые вопросы',
    faq: [
      ['Сколько стоят ваши услуги?', 'Первичная консультация и подбор клиник — бесплатно. Условия сопровождения обсуждаем заранее, до поездки.'],
      ['Цены на сайте окончательные?', 'Нет, это ориентир. Точную смету клиника даёт после изучения ваших документов или осмотра.'],
      ['Можно ли получить консультацию до поездки?', 'Да. Врач изучит снимки и выписки удалённо, а я переведу заключение. Многие клиники проводят и онлайн-консультации.'],
      ['Нужна ли виза?', 'Правила въезда зависят от гражданства и срока лечения. Подскажу актуальные требования и помогу получить приглашение от клиники, если оно нужно.'],
      ['Как оплачивать лечение?', 'Оплата — напрямую в клинику. Доступные способы оплаты уточним заранее, до покупки билетов.'],
      ['Сколько дней нужно провести в Корее?', 'Указано в карточке каждой процедуры. Из Владивостока лететь около 3 часов — на чекап часто приезжают на 2–3 дня.'],
    ],
    band_h: 'Не знаете, какой врач нужен?', band_p: 'Опишите проблему своими словами — подберу специалиста и клинику.',
    procs: n => `${n} ${plural(n, 'процедура', 'процедуры', 'процедур')}`,
    home: 'Главная', popular: 'Популярно', from: 'от', approx: 'ориентировочно',
    stay: d => d === 0 ? 'Без поездки' : `В Корее от ${d} дн.`,
    add: '+ В план', added: '✓ В плане', ask: 'Узнать цену',
    price_note: 'Цены ориентировочные (USD) и зависят от клиники, врача и вашего случая. Точную смету клиника даёт после изучения документов.',
    clinics_h: 'Клиники по направлению', clinics_sub: 'Клиника-партнёр — с подробной страницей. Остальные карточки демонстрационные.',
    tags: { ru: 'Русскоязычный координатор', transfer: 'Трансфер', online: 'Онлайн-консультация', intl: 'Иностранные пациенты', partner: 'Партнёр', mri: 'Своё МРТ', rehab: 'Реабилитация' },
    on_request: 'Цена по запросу', after_mri: 'смета после МРТ и осмотра', req_note: 'Стоимость зависит от стадии и объёма лечения. Пришлите МРТ или выписку — клиника подготовит смету, я переведу.',
    partner: 'партнёр', partner_clinic: 'Клиника-партнёр', partner_h: 'Клиника-партнёр', partner_sub: 'Колено, позвоночник и спортивные травмы — с фото клиники',
    clinic_more: 'Подробнее о клинике', clinic_procs: 'Методы лечения в клинике', inside: 'Как выглядит клиника',
    doctor: 'Врач', website: 'Официальный сайт', ask_clinic: 'Записаться на консультацию', source: 'Источник', photo: 'Фото',
    plan_cnt: n => n ? `В плане: <b>${n}</b> ${plural(n, 'процедура', 'процедуры', 'процедур')}` : '',
    plan_open: 'Отправить', plan_h: 'Мой план лечения', plan_empty: 'План пуст — это нормально. Отправьте заявку на общую консультацию.',
    total: 'Ориентир по плану',
    f_name: 'Ваше имя', f_city: 'Откуда вы', f_city_ph: 'Владивосток, Хабаровск, Москва…', f_channel: 'Где удобно общаться',
    f_contact: { telegram: 'Telegram (@ник или телефон)', whatsapp: 'WhatsApp (номер)', phone: 'Телефон' },
    f_msg: 'Коротко о ситуации', f_msg_ph: 'Возраст, диагноз, желаемые даты поездки…',
    consent: 'Согласен(на) на обработку персональных и медицинских данных для подбора клиники',
    send: 'Отправить заявку', need: 'Заполните имя, контакт и согласие',
    ok_h: 'Заявка готова!', ok_tg: 'Текст скопирован. Откроется Telegram — вставьте его в чат.', ok_wa: 'Откроется WhatsApp с готовым сообщением.', ok_ph: 'Перезвоню в ближайшее время.',
    open_tg: 'Открыть Telegram', open_wa: 'Открыть WhatsApp', copied: 'Скопировано', close: 'Закрыть',
    detail_price: 'Цена', detail_stay: 'Пребывание', detail_rec: 'Восстановление', category: 'Направление',
    msg_head: 'Здравствуйте! Заявка с сайта MostMed', msg_proc: 'Интересует', msg_general: 'Общая консультация', msg_name: 'Имя', msg_city: 'Город', msg_contact: 'Контакт', msg_note: 'Комментарий',
    write: 'Написать',
  },
  ko: {
    demo: '데모 버전: 병원·가격은 시연용 예시 데이터입니다',
    logoSub: '러시아 환자 의료 코디',
    nav_services: '진료 분야', nav_how: '진행 절차', nav_about: '통역사 소개',
    eyebrow: '러시아어 의료통역 · 서울',
    h1: '한국에서의 치료, <em>모국어로</em>',
    lead: '목적에 맞는 병원을 고르고 견적을 받아, 첫 상담부터 퇴원까지 모든 진료에 동행 통역합니다.',
    search_ph: '무엇이 필요하세요? 예: 무릎, 코, 검진',
    search_btn: '찾기',
    chips: ['줄기세포', '무릎', '디스크', '코 성형', '종합검진', '임플란트'],
    stats: [['9', '진료 분야'], ['24–48시간', '병원 견적 회신'], ['무료', '첫 상담']],
    role: '한국어 ↔ 러시아어 의료통역사',
    perks: ['병원 2~3곳 추천과 가격 비교', '모든 진료·서류 통역 및 번역', '공항 픽업·숙소·이동 지원', '치료 기간 내내 연락 가능'],
    resp: `보통 15분 내 답변 · ${CONFIG.hours}`,
    cats_h: '진료 분야', cats_sub: '분야를 고르면 시술, 기간, 참고 가격을 보여 드립니다',
    pop_h: '많이 문의하는 시술', found: n => `검색 결과 ${n}건`, nothing: '결과가 없습니다. 증상을 편하게 적어 주시면 맞는 진료과를 안내해 드립니다.',
    how_h: '진행 절차',
    steps: [
      ['문의', '텔레그램·왓츠앱으로 연락하거나 사이트에서 플랜을 담아 보내세요.'],
      ['자료 전달', '소견서·MRI·검사 결과를 보내 주시면 한국 의료진용으로 번역합니다.'],
      ['견적 제안', '24~48시간 내 병원 2~3곳의 견적과 일정을 드립니다.'],
      ['방한 준비', '일정·숙소·공항 이동을 함께 준비합니다.'],
      ['치료와 사후관리', '진료 통역, 러시아어 퇴원 서류, 귀국 후 연락까지.'],
    ],
    about_h: '통역사 소개',
    about_p: '러시아어 원어민이자 한국어 전문 의료통역사입니다. 환자의 병력과 한국 병원 시스템을 모두 아는 한 사람이 처음부터 끝까지 함께합니다.',
    about_li: ['상담·검사·퇴원 시 순차통역', '의료 서류 번역', '대학병원 및 전문병원 협력', '투명한 견적: 병원 명의 견적서 제공'],
    faq_h: '자주 묻는 질문',
    faq: [
      ['서비스 비용은요?', '첫 상담과 병원 추천은 무료입니다. 동행 조건은 방한 전에 미리 안내합니다.'],
      ['사이트 가격이 최종 가격인가요?', '아니요, 참고용입니다. 최종 견적은 자료 검토나 진료 후 병원이 제시합니다.'],
      ['방한 전에 상담할 수 있나요?', '네. 의사가 영상·소견서를 원격으로 검토하고 결과를 통역해 드립니다.'],
      ['비자가 필요한가요?', '국적과 치료 기간에 따라 다릅니다. 최신 요건과 병원 초청장 발급을 안내합니다.'],
      ['결제는 어떻게 하나요?', '병원에 직접 결제합니다. 가능한 결제 수단은 항공권 구매 전에 확인합니다.'],
      ['한국에 며칠 머물러야 하나요?', '각 시술 카드에 표시되어 있습니다. 블라디보스토크에서 비행 약 3시간입니다.'],
    ],
    band_h: '어느 과에 가야 할지 모르겠다면', band_p: '증상을 편하게 적어 주세요. 맞는 전문의와 병원을 찾아 드립니다.',
    procs: n => `시술 ${n}개`,
    home: '홈', popular: '인기', from: '', approx: '참고 가격',
    stay: d => d === 0 ? '방한 불필요' : `체류 ${d}일~`,
    add: '+ 플랜에 담기', added: '✓ 담김', ask: '가격 문의',
    price_note: '가격은 참고용(USD)이며 병원·의료진·환자 상태에 따라 달라집니다. 최종 견적은 자료 검토 후 병원이 제시합니다.',
    clinics_h: '분야별 병원', clinics_sub: '협약 병원은 상세 페이지가 있고, 나머지는 데모 카드입니다.',
    on_request: '가격 문의', after_mri: 'MRI·진료 후 견적', req_note: '비용은 병기와 치료 범위에 따라 달라집니다. MRI나 소견서를 보내 주시면 병원 견적을 받아 번역해 드립니다.',
    partner: '협약', partner_clinic: '협약 병원', partner_h: '협약 병원', partner_sub: '무릎·척추·스포츠 손상 — 병원 사진 포함',
    clinic_more: '병원 자세히 보기', clinic_procs: '병원 치료 방법', inside: '병원 둘러보기',
    doctor: '의료진', website: '공식 홈페이지', ask_clinic: '상담 신청', source: '출처', photo: '사진',
    tags: { ru: '러시아어 코디네이터', transfer: '픽업', online: '원격 상담', intl: '외국인 환자', partner: '협약', mri: '원내 MRI', rehab: '재활' },
    plan_cnt: n => n ? `플랜에 <b>${n}</b>개 담김` : '',
    plan_open: '문의하기', plan_h: '나의 치료 플랜', plan_empty: '담은 시술이 없어도 괜찮습니다. 일반 상담으로 문의하세요.',
    total: '플랜 참고 금액',
    f_name: '이름', f_city: '거주 도시', f_city_ph: '블라디보스토크, 하바롭스크, 모스크바…', f_channel: '연락 방법',
    f_contact: { telegram: '텔레그램 (@아이디 또는 번호)', whatsapp: '왓츠앱 (번호)', phone: '전화번호' },
    f_msg: '상황 간단히', f_msg_ph: '나이, 진단명, 희망 방한 날짜…',
    consent: '병원 추천을 위한 개인정보·의료정보 처리에 동의합니다',
    send: '문의 보내기', need: '이름, 연락처, 동의를 입력해 주세요',
    ok_h: '문의가 준비됐습니다', ok_tg: '내용이 복사됐습니다. 텔레그램이 열리면 붙여넣어 주세요.', ok_wa: '메시지가 작성된 왓츠앱이 열립니다.', ok_ph: '곧 전화드리겠습니다.',
    open_tg: '텔레그램 열기', open_wa: '왓츠앱 열기', copied: '복사됨', close: '닫기',
    detail_price: '가격', detail_stay: '체류', detail_rec: '회복', category: '분야',
    msg_head: '안녕하세요! MostMed 사이트 문의', msg_proc: '관심 시술', msg_general: '일반 상담', msg_name: '이름', msg_city: '도시', msg_contact: '연락처', msg_note: '메모',
    write: '문의',
  },
};
const t = k => T[LANG][k];
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const L = o => (o && (o[LANG] ?? o.ru)) || '';
const money = n => '$' + new Intl.NumberFormat('ru-RU').format(n);
const hasPrice = p => p.price_from_usd != null;
const priceRange = p => !hasPrice(p) ? t('on_request') : p.price_to_usd && p.price_to_usd !== p.price_from_usd
  ? `${money(p.price_from_usd)}–${money(p.price_to_usd)}` : money(p.price_from_usd);
const priceShort = p => hasPrice(p) ? `${t('from') ? t('from') + ' ' : ''}${money(p.price_from_usd)}` : t('on_request');
// 외부(병원) 사진: 리퍼러 없이 불러오고, 실패하면 대체 배경으로
const pic = (src, alt) => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('img-fail');this.remove()">`;
const gallery = (imgs, credit) => imgs?.length ? `<div class="gallery">${imgs.map(i => `<figure data-zoom="${esc(i.src)}" data-cap="${esc(L(i.caption))}">${pic(i.src, L(i.caption))}<figcaption>${esc(L(i.caption))}</figcaption></figure>`).join('')}</div>${credit ? `<p class="credit">${t('photo')}: ${esc(credit)}</p>` : ''}` : '';

// ===== 아이콘 =====
const P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ICON = {
  plastic: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>`,
  derma: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/></svg>`,
  ortho: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><path d="M8.5 6.5l9 9"/><path d="M6 9a2.5 2.5 0 1 1 3-3 2.5 2.5 0 1 1 3-3"/><path d="M18 15a2.5 2.5 0 1 1-3 3 2.5 2.5 0 1 1-3 3"/></svg>`,
  checkup: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8 13h2l1.5-3 2 6 1.5-3h1"/></svg>`,
  onco: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><path d="M12 3c2.2 0 3.5 1.7 3.5 3.6 0 2.7-3.5 6.4-3.5 6.4S8.5 9.3 8.5 6.6C8.5 4.7 9.8 3 12 3z"/><path d="M10 11.5L6 21l3-1 1.5 2.5L13.5 15"/><path d="M14 11.5L18 21l-3-1-1.5 2.5"/></svg>`,
  cardio: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M7 12h2.5l1.5-2 2 4 1.5-2H17"/></svg>`,
  eye: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  dental: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><path d="M7.5 3.5c1.7 0 2.6.8 4.5.8s2.8-.8 4.5-.8C19 3.5 20 5.6 20 8c0 3-1.5 4.5-2 7.5-.4 2.6-1 5-2.4 5-1.6 0-1.6-4.5-3.6-4.5s-2 4.5-3.6 4.5C7 20.5 6.4 18.1 6 15.5 5.5 12.5 4 11 4 8c0-2.4 1-4.5 3.5-4.5z"/></svg>`,
  women: `<svg width="24" height="24" viewBox="0 0 24 24" ${P}><circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/></svg>`,
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8fc2b3" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  tg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M21.5 4.3L18.3 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.2-8.3c.4-.4-.1-.6-.6-.2L5.8 13l-4.9-1.5c-1-.3-1.1-1 .2-1.6L20.2 2.6c.9-.3 1.6.2 1.3 1.7z"/></svg>`,
  wa: `<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-5-4.3-5.1-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .7.5l1 2.3c.1.2.1.4 0 .6l-.3.5-.4.5c-.2.2-.3.3-.1.6s.8 1.4 1.8 2.2c1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2.2 1c.3.2.5.2.6.3.1.2.1.8-.1 1.4z"/></svg>`,
  clock: `<svg width="14" height="14" viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  cam: `<svg width="14" height="14" viewBox="0 0 24 24" ${P}><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  pin: `<svg width="14" height="14" viewBox="0 0 24 24" ${P}><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>`,
  ext: `<svg width="14" height="14" viewBox="0 0 24 24" ${P}><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>`,
  plane: `<svg width="14" height="14" viewBox="0 0 24 24" ${P}><path d="M10.5 13.5L3 11l1.5-1.5 7 1 4-4.5c1-1 2.6-1.6 3.4-.9.7.8.1 2.4-.9 3.4l-4.5 4 1 7L13 21l-2.5-7.5z"/></svg>`,
};

// ===== 렌더 =====
const app = $('#app');
const catById = id => DB.categories.find(c => c.id === id);
const procById = id => DB.procedures.find(p => p.id === id);
const clinicById = id => DB.clinics.find(c => c.id === id);
const inPlan = id => plan.includes(id);

function procCard(p) {
  const on = inPlan(p.id), cl = p.clinic && clinicById(p.clinic);
  return `<article class="proc${p.images?.length ? ' has-img' : ''}">
    ${p.images?.length ? `<a href="#" class="thumb" data-detail="${p.id}">${pic(p.images[0].src, L(p.images[0].caption))}<span class="ph-n">${ICON.cam} ${p.images.length}</span></a>` : ''}
    ${cl ? `<a class="by" href="#/clinic/${cl.id}">${ICON.pin} ${esc(cl.name)} · ${t('partner')}</a>` : ''}
    <div class="proc-top"><h3><a href="#" data-detail="${p.id}" style="text-decoration:none">${esc(L(p.name))}</a></h3>${p.popular ? `<span class="badge">${t('popular')}</span>` : ''}</div>
    <p>${esc(L(p.desc))}</p>
    <div class="meta"><span>${ICON.plane}${esc(t('stay')(p.stay_days))}</span><span>${ICON.clock}${esc(L(p.recovery))}</span></div>
    <div class="proc-foot">
      <div class="price${hasPrice(p) ? '' : ' req'}">${priceShort(p)}<small>${hasPrice(p) ? t('approx') : t('after_mri')}</small></div>
      <div class="acts"><button class="add ${on ? 'on' : ''}" data-add="${p.id}">${on ? t('added') : t('add')}</button><button class="btn btn-ink btn-sm" data-ask="${p.id}">${t('ask')}</button></div>
    </div>
  </article>`;
}

function catTile(c) {
  const n = DB.procedures.filter(p => p.category === c.id).length;
  return `<a class="cat" href="#/c/${c.id}"><span class="ic">${ICON[c.id] || ''}</span><span><b>${esc(L(c.name))}</b><span>${esc(L(c.short))}</span><i>${t('procs')(n)} →</i></span></a>`;
}

function messengerButtons(small) {
  const cls = small ? 'btn btn-sm' : 'btn';
  return `<a class="${cls} btn-tg" href="https://t.me/${CONFIG.telegram}" target="_blank" rel="noopener">${ICON.tg} Telegram</a>
          <a class="${cls} btn-wa" href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener">${ICON.wa} WhatsApp</a>`;
}

function searchResults() {
  const q = query.trim().toLowerCase();
  if (!q) return DB.procedures.filter(p => p.popular);
  return DB.procedures.filter(p => {
    const c = catById(p.category);
    const hay = [p.name.ru, p.name.ko, p.desc.ru, p.desc.ko, c.name.ru, c.name.ko, ...(p.keywords || [])].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  });
}

function renderResults() {
  const box = $('#results'); if (!box) return;
  const list = searchResults();
  $('#resultsH').textContent = query.trim() ? t('found')(list.length) : t('pop_h');
  box.innerHTML = list.length ? list.map(procCard).join('') : `<div class="empty" style="grid-column:1/-1">${t('nothing')}<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${messengerButtons(true)}</div></div>`;
}

function renderHome() {
  const name = L(CONFIG.agentName);
  app.innerHTML = `
  <section class="hero"><div class="wrap hero-grid">
    <div>
      <span class="eyebrow"><span class="dot"></span>${t('eyebrow')}</span>
      <h1>${t('h1')}</h1>
      <p class="lead">${t('lead')}</p>
      <form class="search" id="searchForm" role="search">
        <input id="q" type="search" autocomplete="off" placeholder="${esc(t('search_ph'))}" value="${esc(query)}" aria-label="${esc(t('search_ph'))}">
        <button class="btn btn-main btn-sm" type="submit">${t('search_btn')}</button>
      </form>
      <div class="chips">${t('chips').map(c => `<button class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="stats">${t('stats').map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('')}</div>
    </div>
    <aside class="hero-card">
      <div class="agent"><div class="avatar">${CONFIG.agentInitials}</div><div><b>${esc(name)}</b><span>${t('role')}</span></div></div>
      <ul>${t('perks').map(p => `<li>${ICON.check}<span>${p}</span></li>`).join('')}</ul>
      <div class="row">${messengerButtons()}</div>
      <div class="resp">${t('resp')}</div>
    </aside>
  </div></section>

  <section id="cats"><div class="wrap">
    <div class="sec-head"><div><h2>${t('cats_h')}</h2><p class="sub">${t('cats_sub')}</p></div></div>
    <div class="cats">${DB.categories.map(catTile).join('')}</div>
    ${DB.clinics.filter(x => x.partner).map(x => `<div class="sec-head" style="margin-top:32px"><div><h2>${t('partner_h')}</h2><p class="sub">${t('partner_sub')}</p></div></div><div class="clinics">${clinicCard(x)}</div>`).join('')}
  </div></section>

  <section id="popular" style="padding-top:8px"><div class="wrap">
    <div class="sec-head"><h2 id="resultsH"></h2></div>
    <div class="procs" id="results"></div>
    <p class="note">${t('price_note')}</p>
  </div></section>

  <section id="how"><div class="wrap">
    <div class="sec-head"><h2>${t('how_h')}</h2></div>
    <div class="steps">${t('steps').map(([b, s]) => `<div class="step"><b>${b}</b><span>${s}</span></div>`).join('')}</div>
  </div></section>

  <section id="about"><div class="wrap">
    <div class="about">
      <div class="big-av">${CONFIG.agentInitials}</div>
      <div><h2>${t('about_h')}</h2><p style="font-size:17px">${t('about_p')}</p><ul>${t('about_li').map(x => `<li>${x}</li>`).join('')}</ul>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${messengerButtons()}</div></div>
    </div>
  </div></section>

  <section id="faq"><div class="wrap" style="max-width:820px">
    <div class="sec-head"><h2>${t('faq_h')}</h2></div>
    ${t('faq').map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}
  </div></section>

  ${band()}
  ${footer()}`;
  renderResults();
}

function band() {
  return `<section><div class="wrap"><div class="band"><div><h2>${t('band_h')}</h2><p style="opacity:.8;margin:6px 0 0">${t('band_p')}</p></div><div class="row">${messengerButtons()}<button class="btn btn-main" data-openplan>${t('plan_open')}</button></div></div></div></section>`;
}
function footer() {
  return `<footer><div class="wrap">© ${new Date().getFullYear()} MostMed · ${esc(CONFIG.phone)} · <a href="#/admin">admin</a> · <a href="PLAN.md">PLAN</a><br>${t('demo')}</div></footer>`;
}

function renderCategory(id) {
  const c = catById(id);
  if (!c) { location.hash = '#/'; return; }
  const procs = DB.procedures.filter(p => p.category === id).sort((a, b) => (!!b.clinic - !!a.clinic) || (b.popular - a.popular) || (a.price_from_usd ?? 0) - (b.price_from_usd ?? 0));
  const clinics = DB.clinics.filter(x => x.categories.includes(id)).sort((a, b) => !!b.partner - !!a.partner);
  app.innerHTML = `
  <div class="wrap">
    <div class="crumbs"><a href="#/">${t('home')}</a> / ${esc(L(c.name))}</div>
    <nav class="cat-tabs">${DB.categories.map(x => `<a href="#/c/${x.id}" class="${x.id === id ? 'on' : ''}">${esc(L(x.name))}</a>`).join('')}</nav>
    <div class="sec-head"><div><h2>${esc(L(c.name))}</h2><p class="sub">${esc(L(c.short))} · ${t('procs')(procs.length)}</p></div></div>
    <div class="procs">${procs.map(procCard).join('')}</div>
    <p class="note">${t('price_note')}</p>
  </div>
  <section><div class="wrap">
    <div class="sec-head"><div><h2>${t('clinics_h')}</h2><p class="sub">${t('clinics_sub')}</p></div></div>
    <div class="clinics">${clinics.map(clinicCard).join('')}</div>
  </div></section>
  ${band()}${footer()}`;
  window.scrollTo(0, 0);
  $('.cat-tabs .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function clinicCard(x) {
  const tags = `<div class="tags">${x.tags.map(g => `<span class="tag${g === 'partner' ? ' tag-p' : ''}">${esc(t('tags')[g] || g)}</span>`).join('')}</div>`;
  if (!x.partner) return `<div class="clinic"><b>${esc(x.name)}</b><div class="ty">${esc(L(x.type))} · ${esc(L(x.city))}</div>${tags}</div>`;
  return `<a class="clinic clinic-p" href="#/clinic/${x.id}"><span class="cover">${pic(x.images[0].src, x.name)}</span>
    <span class="cbody"><b>${esc(x.name)} <small>${esc(x.name_local || '')}</small></b><span class="ty">${esc(L(x.type))} · ${esc(L(x.city))}</span>${tags}<i>${t('clinic_more')} →</i></span></a>`;
}

function renderClinic(id) {
  const x = clinicById(id);
  if (!x || !x.partner) { location.hash = '#/'; return; }
  const procs = DB.procedures.filter(p => p.clinic === id);
  const cat = catById(x.categories[0]);
  app.innerHTML = `
  <div class="wrap">
    <div class="crumbs"><a href="#/">${t('home')}</a> / <a href="#/c/${cat.id}">${esc(L(cat.name))}</a> / ${esc(x.name)}</div>
    <div class="clinic-hero">
      <figure class="ch-img" data-zoom="${esc(x.images[0].src)}" data-cap="${esc(L(x.images[0].caption))}">${pic(x.images[0].src, x.name)}</figure>
      <div class="ch-txt">
        <span class="eyebrow"><span class="dot"></span>${t('partner_clinic')}</span>
        <h1 style="font-size:clamp(28px,4vw,44px)">${esc(x.name)}<br><span style="font-size:.55em;color:var(--ink-2)">${esc(x.name_local || '')}</span></h1>
        <p class="lead" style="font-size:16px">${esc(L(x.about))}</p>
        <dl class="dl"><dt>${ICON.pin}</dt><dd>${esc(L(x.address))}</dd><dt>${ICON.clock}</dt><dd>${esc(L(x.hours))}</dd>
        ${x.doctors.map(d => `<dt>${t('doctor')}</dt><dd>${esc(L(d.name))} <span style="font-weight:400;color:var(--ink-2)">— ${esc(L(d.role))}</span></dd>`).join('')}</dl>
        <div class="row-btns"><button class="btn btn-main" data-openplan>${t('ask_clinic')}</button><a class="btn btn-ghost" href="${esc(x.website)}" target="_blank" rel="noopener">${ICON.ext} ${t('website')}</a></div>
      </div>
    </div>
    <ul class="hl">${x.highlights.map(h => `<li>${ICON.check}<span>${esc(L(h))}</span></li>`).join('')}</ul>
  </div>
  <section><div class="wrap">
    <div class="sec-head"><div><h2>${t('clinic_procs')}</h2><p class="sub">${t('procs')(procs.length)}</p></div></div>
    <div class="procs">${procs.map(procCard).join('')}</div>
    <p class="note">${t('req_note')}</p>
  </div></section>
  <section style="padding-top:0"><div class="wrap">
    <div class="sec-head"><h2>${t('inside')}</h2></div>
    ${gallery(x.images, x.photo_credit)}
  </div></section>
  ${band()}${footer()}`;
  window.scrollTo(0, 0);
}

function openZoom(src, cap) {
  const z = document.createElement('div');
  z.className = 'zoom';
  z.innerHTML = `<img src="${esc(src)}" alt="${esc(cap)}" referrerpolicy="no-referrer"><p>${esc(cap)}</p>`;
  z.onclick = () => z.remove();
  document.body.appendChild(z);
}

function renderAdmin() {
  const leads = store.get(LS_LEADS, []);
  const st = { new: '신규', in_progress: '상담중', offer_sent: '견적 발송', booked: '예약 확정', closed: '종료' };
  app.innerHTML = `<div class="wrap admin" style="padding-top:24px">
    <div class="crumbs"><a href="#/">${t('home')}</a> / admin</div>
    <div class="sec-head"><div><h2>문의 관리 (데모)</h2><p class="sub">지금은 이 브라우저에만 저장됩니다. v1에서 Supabase <code>leads</code> 테이블 + 텔레그램 봇 알림으로 바뀝니다.</p></div>
    <div style="display:flex;gap:8px">${leads.length ? `<button class="btn btn-ghost btn-sm" id="csv">CSV 내보내기</button>` : ''}</div></div>
    ${leads.length ? `<div class="tw"><table><thead><tr><th>접수</th><th>이름 / 도시</th><th>연락처</th><th>시술</th><th>메모</th><th>상태</th></tr></thead><tbody>
    ${leads.map((l, i) => `<tr><td>${new Date(l.created_at).toLocaleString('ko-KR')}</td><td><b>${esc(l.name)}</b><br>${esc(l.city)}</td><td>${esc(l.channel)}<br>${esc(l.contact)}</td>
      <td>${l.procedure_ids.map(id => esc(procById(id)?.name.ko || id)).join('<br>') || '일반 상담'}</td><td>${esc(l.message)}</td>
      <td><select data-st="${i}">${Object.entries(st).map(([k, v]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">아직 문의가 없습니다. 홈에서 시술을 담고 "문의하기"로 테스트해 보세요.</div>`}
  </div>${footer()}`;
  app.querySelectorAll('[data-st]').forEach(s => s.onchange = () => { leads[+s.dataset.st].status = s.value; store.set(LS_LEADS, leads); toast('저장됨'); });
  $('#csv')?.addEventListener('click', () => {
    const rows = [['created_at', 'name', 'city', 'channel', 'contact', 'procedures', 'message', 'status'], ...leads.map(l => [l.created_at, l.name, l.city, l.channel, l.contact, l.procedure_ids.join('|'), l.message, l.status])];
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'mostmed-leads.csv' });
    a.click();
  });
}

// ===== 플랜 =====
function savePlan() { store.set(LS_PLAN, plan); renderPlanbar(); }
function togglePlan(id) {
  plan = inPlan(id) ? plan.filter(x => x !== id) : [...plan, id];
  savePlan();
  document.querySelectorAll(`[data-add="${id}"]`).forEach(b => { const on = inPlan(id); b.classList.toggle('on', on); b.textContent = on ? t('added') : t('add'); });
}
function renderPlanbar() {
  const n = plan.length;
  $('#planbar').classList.toggle('show', n > 0);
  document.body.classList.toggle('has-plan', n > 0);
  $('#planCnt').innerHTML = t('plan_cnt')(n);
  $('#planOpen').textContent = t('plan_open');
}

// ===== 시트 =====
function openSheet(html) { $('#sheetIn').innerHTML = `<div class="grab"></div>${html}`; $('#sheet').classList.add('show'); $('#scrim').classList.add('show'); $('#sheet').scrollTop = 0; }
function closeSheet() { $('#sheet').classList.remove('show'); $('#scrim').classList.remove('show'); }

function openDetail(id) {
  const p = procById(id), c = catById(p.category), on = inPlan(id), cl = p.clinic && clinicById(p.clinic);
  openSheet(`<h3>${esc(L(p.name))}</h3><p class="sub">${esc(L(c.name))}${cl ? ` · <a href="#/clinic/${cl.id}" style="color:var(--celadon);font-weight:700">${esc(cl.name)}</a>` : ''}</p>
    ${gallery(p.images, cl?.photo_credit)}
    <p>${esc(L(p.desc))}</p>
    ${p.facts?.length ? `<ul class="facts">${p.facts.map(f => `<li>${esc(L(f))}</li>`).join('')}</ul>` : ''}
    <dl class="dl"><dt>${t('detail_price')}</dt><dd>${priceRange(p)} <span style="font-weight:400;color:var(--ink-2)">(${hasPrice(p) ? t('approx') : t('after_mri')})</span></dd>
    <dt>${t('detail_stay')}</dt><dd>${esc(t('stay')(p.stay_days))}</dd><dt>${t('detail_rec')}</dt><dd>${esc(L(p.recovery))}</dd></dl>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="add ${on ? 'on' : ''}" data-add="${p.id}">${on ? t('added') : t('add')}</button><button class="btn btn-main btn-sm" data-ask="${p.id}">${t('ask')}</button>
    ${p.source ? `<a class="btn btn-ghost btn-sm" href="${esc(p.source)}" target="_blank" rel="noopener">${ICON.ext} ${t('source')}</a>` : ''}</div>
    <p class="note">${hasPrice(p) ? t('price_note') : t('req_note')}</p>`);
}

function openPlan() {
  const items = plan.map(procById).filter(Boolean);
  const priced = items.filter(hasPrice), anyReq = priced.length < items.length;
  const lo = priced.reduce((s, p) => s + p.price_from_usd, 0), hi = priced.reduce((s, p) => s + (p.price_to_usd || p.price_from_usd), 0);
  const draft = store.get('mostmed.draft', {});
  const ch = draft.channel || 'telegram';
  openSheet(`<h3>${t('plan_h')}</h3>
    <div style="margin:12px 0">${items.length ? items.map(p => `<div class="pl-item"><span>${esc(L(p.name))}<br><small style="color:var(--ink-2)">${priceShort(p)}</small></span><button data-rm="${p.id}" aria-label="remove">×</button></div>`).join('')
      + (priced.length ? `<div class="total"><span>${t('total')}</span><b>${money(lo)}–${money(hi)}${anyReq ? ' + …' : ''}</b></div>` : '') : `<p class="sub">${t('plan_empty')}</p>`}</div>
    <form id="leadForm" novalidate>
      <label class="field"><span>${t('f_name')}</span><input name="name" required value="${esc(draft.name || '')}"></label>
      <label class="field"><span>${t('f_city')}</span><input name="city" placeholder="${esc(t('f_city_ph'))}" value="${esc(draft.city || '')}"></label>
      <div class="field"><span>${t('f_channel')}</span><div class="channels">
        ${['telegram', 'whatsapp', 'phone'].map(c => `<label><input type="radio" name="channel" value="${c}" ${c === ch ? 'checked' : ''}>${c === 'telegram' ? 'Telegram' : c === 'whatsapp' ? 'WhatsApp' : (LANG === 'ru' ? 'Звонок' : '전화')}</label>`).join('')}
      </div></div>
      <label class="field"><span id="contactLbl">${t('f_contact')[ch]}</span><input name="contact" required value="${esc(draft.contact || '')}"></label>
      <label class="field"><span>${t('f_msg')}</span><textarea name="message" rows="3" placeholder="${esc(t('f_msg_ph'))}">${esc(draft.message || '')}</textarea></label>
      <label class="consent"><input type="checkbox" name="consent"><span>${t('consent')}</span></label>
      <button class="btn btn-main" style="width:100%" type="submit">${t('send')}</button>
    </form>`);
  const f = $('#leadForm');
  f.addEventListener('change', e => { if (e.target.name === 'channel') $('#contactLbl').textContent = t('f_contact')[e.target.value]; });
  f.addEventListener('input', () => { const d = Object.fromEntries(new FormData(f)); delete d.consent; store.set('mostmed.draft', d); });
  f.addEventListener('submit', e => { e.preventDefault(); submitLead(f); });
}

function buildMessage(d, items) {
  const lines = [t('msg_head'), ''];
  lines.push(`${t('msg_proc')}: ` + (items.length ? '' : t('msg_general')));
  items.forEach(p => { const cl = p.clinic && clinicById(p.clinic); lines.push(`• ${L(p.name)}${cl ? ` — ${cl.name}` : ''} (${priceShort(p)})`); });
  lines.push('', `${t('msg_name')}: ${d.name}`);
  if (d.city) lines.push(`${t('msg_city')}: ${d.city}`);
  lines.push(`${t('msg_contact')}: ${d.channel} ${d.contact}`);
  if (d.message) lines.push(`${t('msg_note')}: ${d.message}`);
  return lines.join('\n');
}

async function submitLead(f) {
  const d = Object.fromEntries(new FormData(f));
  if (!d.name?.trim() || !d.contact?.trim() || !d.consent) { toast(t('need')); return; }
  const items = plan.map(procById).filter(Boolean);
  const lead = { id: crypto.randomUUID?.() || String(Date.now()), created_at: new Date().toISOString(), name: d.name.trim(), city: (d.city || '').trim(), channel: d.channel, contact: d.contact.trim(), message: (d.message || '').trim(), procedure_ids: [...plan], lang: LANG, status: 'new', consent_at: new Date().toISOString() };
  // v1: await supabase.from('leads').insert(lead)
  const leads = store.get(LS_LEADS, []); leads.unshift(lead); store.set(LS_LEADS, leads);
  const msg = buildMessage(d, items);
  const tgUrl = `https://t.me/${CONFIG.telegram}`, waUrl = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
  if (d.channel === 'telegram') { try { await navigator.clipboard.writeText(msg); } catch {} }
  openSheet(`<div class="ok"><div class="big"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h3>${t('ok_h')}</h3>
    <p class="sub">${d.channel === 'telegram' ? t('ok_tg') : d.channel === 'whatsapp' ? t('ok_wa') : t('ok_ph')}</p>
    <div class="msgbox">${esc(msg)}</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      ${d.channel !== 'whatsapp' ? `<a class="btn btn-tg" href="${tgUrl}" target="_blank" rel="noopener" id="goTg">${ICON.tg} ${t('open_tg')}</a>` : ''}
      ${d.channel !== 'telegram' ? `<a class="btn btn-wa" href="${waUrl}" target="_blank" rel="noopener">${ICON.wa} ${t('open_wa')}</a>` : ''}
      <button class="btn btn-ghost" id="copyMsg">${LANG === 'ru' ? 'Копировать текст' : '텍스트 복사'}</button>
    </div></div>`);
  $('#goTg')?.addEventListener('click', () => navigator.clipboard?.writeText(msg).catch(() => {}));
  $('#copyMsg').onclick = () => navigator.clipboard?.writeText(msg).then(() => toast(t('copied'))).catch(() => {});
  plan = []; savePlan(); store.set('mostmed.draft', { channel: d.channel, contact: d.contact, name: d.name, city: d.city });
  if (location.hash.startsWith('#/c/') || location.hash === '#/' || !location.hash) route();
}

let toastT;
function toast(s) { const el = $('#toast'); el.textContent = s; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }

// ===== 라우팅 & 공통 =====
function chrome() {
  document.documentElement.lang = LANG;
  $('#demoBar').textContent = t('demo');
  $('#logoSub').textContent = t('logoSub');
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
  $('#fab').innerHTML = `<a href="https://t.me/${CONFIG.telegram}" target="_blank" rel="noopener" style="background:var(--tg)" aria-label="Telegram">${ICON.tg}</a><a href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener" style="background:var(--wa)" aria-label="WhatsApp">${ICON.wa}</a>`;
  renderPlanbar();
}
function route() {
  const h = location.hash || '#/';
  const m = h.match(/^#\/c\/([\w-]+)/);
  if (m) renderCategory(m[1]);
  else if (h.startsWith('#/admin')) renderAdmin();
  else if (h.startsWith('#/clinic/')) renderClinic(h.split('/')[2]);
  else renderHome();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-add],[data-ask],[data-detail],[data-chip],[data-rm],[data-openplan],[data-lang],[data-go],[data-zoom]');
  if (!el) return;
  const d = el.dataset;
  if (d.zoom) { if (!el.classList.contains('img-fail')) openZoom(d.zoom, d.cap || ''); }
  else if (d.add) togglePlan(d.add);
  else if (d.ask) { if (!inPlan(d.ask)) togglePlan(d.ask); openPlan(); }
  else if (d.detail) { e.preventDefault(); openDetail(d.detail); }
  else if (d.chip) { query = d.chip; $('#q').value = query; renderResults(); $('#popular').scrollIntoView({ behavior: 'smooth' }); }
  else if (d.rm) { togglePlan(d.rm); openPlan(); }
  else if ('openplan' in d) openPlan();
  else if (d.lang) { LANG = d.lang; store.set(LS_LANG, LANG); query = ''; chrome(); route(); }
  else if (d.go) { e.preventDefault(); const go = () => document.getElementById(d.go)?.scrollIntoView({ behavior: 'smooth' }); if (location.hash.length > 2) { location.hash = '#/'; setTimeout(go, 60); } else go(); }
});
document.addEventListener('submit', e => { if (e.target.id === 'searchForm') { e.preventDefault(); query = $('#q').value; renderResults(); $('#popular').scrollIntoView({ behavior: 'smooth' }); } });
document.addEventListener('input', e => { if (e.target.id === 'q') { query = e.target.value; renderResults(); } });
$('#planOpen').onclick = openPlan;
$('#scrim').onclick = closeSheet; $('#sheetX').onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelector('.zoom')?.remove(); closeSheet(); } });
window.addEventListener('hashchange', () => { closeSheet(); route(); });

// ===== 데이터 로드 (v1: Supabase select 로 교체) =====
Promise.all(['categories', 'procedures', 'clinics'].map(n => fetch(`data/${n}.json`).then(r => r.json())))
  .then(([categories, procedures, clinics]) => {
    DB = { categories: categories.sort((a, b) => a.sort - b.sort), procedures, clinics };
    plan = plan.filter(id => procById(id));
    chrome(); route();
  })
  .catch(err => { app.innerHTML = `<div class="wrap"><div class="empty" style="margin-top:40px">Data load error: ${esc(err.message)}</div></div>`; });
})();
