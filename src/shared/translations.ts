/**
 * Español toggle (#42): core UI strings, English + natural Miami Spanish.
 *
 * Guidelines used for the Spanish:
 * - Informal "tú" — this app talks to students and their families.
 * - Miami music-program vocabulary: "ensamble" (not "conjunto"), "ensayo",
 *   "partitura", "tareas y exámenes".
 * - Proper nouns stay as-is ("NWSA Music").
 *
 * Keys are stable dotted slugs; the English value is the exact string the UI
 * showed before #42 so integrators can grep for it.
 */
export const TRANSLATIONS: Record<string, { en: string; es: string }> = {
  // ── Nav + menu + tab bar ────────────────────────────────────────────────
  'nav.home':             { en: 'Home',                es: 'Inicio' },
  'nav.calendar':         { en: 'Calendar',            es: 'Calendario' },
  'nav.announcements':    { en: 'Announcements',       es: 'Anuncios' },
  'nav.repertoire':       { en: 'Repertoire',          es: 'Repertorio' },
  'nav.assignments':      { en: 'Assignments & Exams', es: 'Tareas y exámenes' },
  'nav.assignmentsShort': { en: 'Assignments',         es: 'Tareas' },
  'nav.mySchedule':       { en: 'My Schedule',         es: 'Mi horario' },
  'nav.ensembles':        { en: 'Ensembles',           es: 'Ensambles' },
  'nav.allEnsembles':     { en: 'All ensembles',       es: 'Todos los ensambles' },
  'nav.startHere':        { en: 'Start Here',          es: 'Empieza aquí' },
  'nav.concerts':         { en: 'Concert Season',      es: 'Temporada de conciertos' },
  'nav.directorLogin':    { en: 'Director login',      es: 'Acceso para directores' },
  'nav.more':             { en: 'More',                es: 'Más' },
  'nav.menu':             { en: 'Menu',                es: 'Menú' },
  'nav.closeMenu':        { en: 'Close menu',          es: 'Cerrar menú' },
  'nav.search':           { en: 'Search',              es: 'Buscar' },
  'nav.notYouSwitch':     { en: 'Not you? Switch',     es: '¿No eres tú? Cambiar' },
  'nav.campusMap':        { en: 'Campus Map',          es: 'Mapa del campus' },

  // ── Text-size control (header "Aa") ─────────────────────────────────────
  'textsize.label':   { en: 'Text size', es: 'Tamaño del texto' },
  'textsize.normal':  { en: 'Normal',    es: 'Normal' },
  'textsize.large':   { en: 'Large',     es: 'Grande' },
  'textsize.largest': { en: 'Largest',   es: 'Muy grande' },

  // ── Home headings + quick actions ───────────────────────────────────────
  'home.todayAt':               { en: 'Today at NWSA Music',                es: 'Hoy en NWSA Music' },
  'home.comingUpRehearsals':    { en: 'Coming up — rehearsals',             es: 'Próximos ensayos' },
  'home.comingUpConcerts':      { en: 'Coming up — concerts',               es: 'Próximos conciertos' },
  'home.comingUpEvents':        { en: 'Coming up — events & school dates',  es: 'Próximos eventos y fechas escolares' },
  'home.comingUpAssignments':   { en: 'Coming up — assignments & exams',    es: 'Próximas tareas y exámenes' },
  'home.ourEnsembles':          { en: 'Our ensembles',                      es: 'Nuestros ensambles' },
  'home.repertoireByEnsemble':  { en: 'Repertoire by ensemble',             es: 'Repertorio por ensamble' },
  'home.findMySchedule':        { en: 'Find My Schedule',                   es: 'Buscar mi horario' },
  'home.fullCalendar':          { en: 'Full calendar',                      es: 'Calendario completo' },
  'home.noEventsToday':         { en: 'No rehearsals or events scheduled today.', es: 'Hoy no hay ensayos ni eventos programados.' },

  // ── Ensemble + schedule pages ───────────────────────────────────────────
  'ens.rehearsalSchedule':  { en: 'Rehearsal schedule',       es: 'Horario de ensayos' },
  'ens.concertSchedule':    { en: 'Concert schedule',         es: 'Calendario de conciertos' },
  'ens.eventSchedule':      { en: 'Event schedule',           es: 'Calendario de eventos' },
  'ens.seating':            { en: 'Seating',                  es: 'Asientos' },
  'ens.roster':             { en: 'Roster',                   es: 'Lista de estudiantes' },
  'sched.yourAssignments':  { en: 'Your assignments & exams', es: 'Tus tareas y exámenes' },
  'sched.yourSchedule':     { en: 'Your schedule',            es: 'Tu horario' },
  'sched.nothingToday':     { en: 'Nothing scheduled for you today.', es: 'No tienes nada programado para hoy.' },
  'misc.subscribe':         { en: 'Subscribe',                es: 'Suscribirse' },

  // ── Alert strips (GlobalAlerts + Home banner) ───────────────────────────
  'alert.allClear':           { en: 'No cancellations today — everything as scheduled', es: 'Hoy no hay cancelaciones — todo sigue como estaba programado' },
  'alert.cancelledToday':     { en: 'CANCELLED today',      es: 'CANCELADO hoy' },
  'alert.changedToday':       { en: 'Changed today',        es: 'Cambió hoy' },
  'alert.scheduleChangeToday':{ en: 'Schedule change today',es: 'Cambio de horario hoy' },
  'alert.cancelled':          { en: 'cancelled',            es: 'cancelado' },

  // ── Find My Schedule (lookup) ───────────────────────────────────────────
  'lookup.typeYourName':   { en: 'Type your name (nicknames OK)…',  es: 'Escribe tu nombre (con apodo también sirve)…' },
  'lookup.findYourName':   { en: 'Find your name to see where you should be and when.', es: 'Busca tu nombre para ver dónde te toca estar y a qué hora.' },
  'lookup.byLastName':     { en: 'By last name',                    es: 'Por apellido' },
  'lookup.byScoreOrder':   { en: 'By score order',                  es: 'Por orden de partitura' },
  'lookup.noMatches':      { en: 'No matching names — try fewer letters, or your formal name.', es: 'No encontramos ese nombre — prueba con menos letras o con tu nombre completo.' },
  'lookup.startTyping':    { en: 'Start typing, or tap a letter above.', es: 'Empieza a escribir o toca una letra arriba.' },
  'lookup.all':            { en: 'All',                             es: 'Todos' },
  'lookup.welcomeBack':    { en: 'Welcome back',                    es: 'Qué bueno verte de nuevo' },
  'lookup.yourStudents':   { en: 'Your students',                   es: 'Tus estudiantes' },
  'lookup.isThisYou':      { en: 'Is this you?',                    es: '¿Eres tú?' },
  'lookup.noGoBack':       { en: 'No, go back',                     es: 'No, volver' },
  'lookup.yesShowSchedule':{ en: 'Yes — show my schedule',          es: 'Sí — ver mi horario' },
  'lookup.parentToggle':   { en: "I'm a parent — let me save more than one student", es: 'Soy padre o madre — quiero guardar más de un estudiante' },

  // ── Calendar page ───────────────────────────────────────────────────────
  'cal.everything':       { en: 'Everything',         es: 'Todo' },
  'cal.rehearsals':       { en: 'Rehearsals',         es: 'Ensayos' },
  'cal.concerts':         { en: 'Concerts',           es: 'Conciertos' },
  'cal.events':           { en: 'Events',             es: 'Eventos' },
  'cal.assignments':      { en: 'Assignments',        es: 'Tareas' },
  'cal.listView':         { en: 'List view',          es: 'Vista de lista' },
  'cal.monthView':        { en: 'Month view',         es: 'Vista de mes' },
  'cal.nothingScheduled': { en: 'Nothing scheduled.', es: 'No hay nada programado.' },
  'cal.nothingUpcoming':  { en: 'Nothing coming up for this filter.', es: 'No hay nada próximo con este filtro.' },
  'cal.allEnsembles':     { en: 'All',                es: 'Todos' },
  'cal.due':              { en: 'Due',                es: 'Entrega' },
  'cal.today':            { en: 'Today',              es: 'Hoy' },

  // ── Misc ────────────────────────────────────────────────────────────────
  'misc.loading':        { en: 'Loading…',           es: 'Cargando…' },
  'misc.showMoreDays':   { en: 'Show more days',     es: 'Ver más días' },
  'misc.addToCalendar':  { en: 'Add to my calendar', es: 'Agregar a mi calendario' },
  'misc.openExamForm':   { en: 'Open exam form',     es: 'Abrir el formulario del examen' },
};
