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
  'nav.concertsShort':    { en: 'Concerts',            es: 'Conciertos' },
  'nav.directorLogin':    { en: 'Director login',      es: 'Acceso para directores' },
  'nav.assistantLogin':   { en: 'Personnel Assistant login', es: 'Acceso para asistentes de personal' },
  'nav.more':             { en: 'More',                es: 'Más' },
  'nav.menu':             { en: 'Menu',                es: 'Menú' },
  'nav.closeMenu':        { en: 'Close menu',          es: 'Cerrar menú' },
  'nav.search':           { en: 'Search',              es: 'Buscar' },
  'nav.notYouSwitch':     { en: 'Not you? Switch',     es: '¿No eres tú? Cambiar' },
  'nav.campusMap':        { en: 'Campus Map',          es: 'Mapa del campus' },
  'nav.documents':        { en: 'Documents',           es: 'Documentos' },
  'nav.resources':        { en: 'Resources',           es: 'Recursos' },
  'nav.searchPlaceholder': { en: 'Search events, ensembles, music…', es: 'Buscar eventos, ensambles, música…' },

  // ── Text-size control (header "Aa") ─────────────────────────────────────
  'textsize.label':   { en: 'Text size', es: 'Tamaño del texto' },
  'textsize.normal':  { en: 'Normal',    es: 'Normal' },
  'textsize.large':   { en: 'Large',     es: 'Grande' },
  'textsize.largest': { en: 'Largest',   es: 'Muy grande' },

  // ── Appearance control (header sun/moon) ────────────────────────────────
  'theme.label': { en: 'Appearance',         es: 'Apariencia' },
  'theme.auto':  { en: 'Automatic (device)', es: 'Automática (dispositivo)' },
  'theme.light': { en: 'Light',              es: 'Clara' },
  'theme.dark':  { en: 'Dark',               es: 'Oscura' },

  // ── Home headings + quick actions ───────────────────────────────────────
  'home.todayAt':               { en: 'Today at NWSA Music',                es: 'Hoy en NWSA Music' },
  'home.comingUpRehearsals':    { en: 'Coming up — rehearsals',             es: 'Próximos ensayos' },
  'home.comingUpClasses':       { en: 'Coming up — classes',                es: 'Próximas clases' },
  'home.comingUpConcerts':      { en: 'Coming up — concerts',               es: 'Próximos conciertos' },
  'home.comingUpEvents':        { en: 'Coming up — events & school dates',  es: 'Próximos eventos y fechas escolares' },
  'home.comingUpAssignments':   { en: 'Coming up — assignments & exams',    es: 'Próximas tareas y exámenes' },
  'home.ourEnsembles':          { en: 'Our ensembles',                      es: 'Nuestros ensambles' },
  'home.repertoireByEnsemble':  { en: 'Repertoire by ensemble',             es: 'Repertorio por ensamble' },
  'home.findMySchedule':        { en: 'Find My Schedule',                   es: 'Buscar mi horario' },
  'home.fullCalendar':          { en: 'Full calendar',                      es: 'Calendario completo' },
  'home.noEventsToday':         { en: 'No rehearsals or events scheduled today.', es: 'Hoy no hay ensayos ni eventos programados.' },
  'home.studentSchedule':       { en: "{name}'s schedule",                  es: 'Horario de {name}' },

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
  'cal.classes':          { en: 'Classes',            es: 'Clases' },
  'cal.concerts':         { en: 'Concerts',           es: 'Conciertos' },
  'cal.events':           { en: 'Events',             es: 'Eventos' },
  'cal.assignments':      { en: 'Assignments',        es: 'Tareas' },
  'cal.listView':         { en: 'List view',          es: 'Vista de lista' },
  'cal.monthView':        { en: 'Month view',         es: 'Vista de mes' },
  'cal.nothingScheduled': { en: 'Nothing scheduled.', es: 'No hay nada programado.' },
  'cal.nothingUpcoming':  { en: 'Nothing coming up for this filter.', es: 'No hay nada próximo con este filtro.' },
  'cal.allEnsembles':     { en: 'All',                es: 'Todos' },
  'cal.allTypes':         { en: 'All types',          es: 'Todos los tipos' },
  'cal.filterTypes':      { en: 'Types',              es: 'Tipos' },
  'cal.clearFilter':      { en: 'Clear',              es: 'Limpiar' },
  'cal.due':              { en: 'Due',                es: 'Entrega' },
  'cal.today':            { en: 'Today',              es: 'Hoy' },
  'cal.calendarView':     { en: 'Calendar view',      es: 'Vista de calendario' },
  'cal.prevMonth':        { en: 'Previous month',     es: 'Mes anterior' },
  'cal.nextMonth':        { en: 'Next month',         es: 'Mes siguiente' },
  'cal.jumpToday':        { en: 'Jump back to today', es: 'Volver a hoy' },
  'cal.dueThisDay':       { en: 'Due this day',       es: 'Entrega este día' },
  'cal.noEvents':         { en: 'no events',          es: 'sin eventos' },
  'cal.eventCount.one':   { en: '{count} event',      es: '{count} evento' },
  'cal.eventCount.other': { en: '{count} events',     es: '{count} eventos' },
  'cal.filterByType':     { en: 'Filter by type',     es: 'Filtrar por tipo' },
  'cal.nothingThisDay':   { en: 'Nothing for you this day.', es: 'No tienes nada este día.' },
  'cal.noUpcomingMine':   { en: 'No upcoming rehearsals or events.', es: 'No tienes ensayos ni eventos próximos.' },
  'cal.noneInCategory':   { en: 'Nothing in this category coming up.', es: 'No hay nada próximo en esta categoría.' },
  'cal.showAllUpcoming':  { en: 'Show all {count} upcoming', es: 'Ver los {count} próximos' },

  // ── Event types (the word on every chip, filter, and banner) ────────────
  'type.Rehearsal': { en: 'Rehearsal', es: 'Ensayo' },
  'type.Class':     { en: 'Class',     es: 'Clase' },
  'type.Sectional': { en: 'Sectional', es: 'Seccional' },
  'type.Concert':   { en: 'Concert',   es: 'Concierto' },
  'type.Event':     { en: 'Event',     es: 'Evento' },

  // ── Now / Next banner + the "now" divider in schedule lists ─────────────
  'now.now':      { en: 'NOW',  es: 'AHORA' },
  'now.next':     { en: 'NEXT', es: 'PRÓXIMO' },
  'now.label':    { en: 'Now',  es: 'Ahora' },
  'now.startsIn': { en: 'starts in {mins} min', es: 'empieza en {mins} min' },

  // ── Event cards (shared) ────────────────────────────────────────────────
  'card.allDay':             { en: 'All day',             es: 'Todo el día' },
  'card.cancelled':          { en: 'Cancelled',           es: 'Cancelado' },
  'card.changed':            { en: 'Changed',             es: 'Cambiado' },
  'card.updated':            { en: 'Updated',             es: 'Actualizado' },
  'card.details':            { en: 'Details',             es: 'Detalles' },
  'card.myPart':             { en: 'My part',             es: 'Mi partitura' },
  'card.viewProgram':        { en: 'View concert program', es: 'Ver el programa del concierto' },
  'card.sub':                { en: 'Sub',                 es: 'Suplente' },
  'card.attendanceRequired': { en: 'Attendance required', es: 'Asistencia obligatoria' },
  'card.call':               { en: 'Call',                es: 'Llegada' },

  // ── Event page / Concert Day Sheet ──────────────────────────────────────
  'event.back':             { en: 'Back',                        es: 'Volver' },
  'event.daySheet':         { en: 'Concert Day Sheet',           es: 'Hoja del día del concierto' },
  'event.callTime':         { en: 'Call time',                   es: 'Hora de llegada' },
  'event.concertStarts':    { en: 'Concert starts',              es: 'Empieza el concierto' },
  'event.dress':            { en: 'Dress',                       es: 'Vestimenta' },
  'event.venue':            { en: 'Venue',                       es: 'Lugar' },
  'event.pickup':           { en: 'Pickup',                      es: 'Recogida' },
  'event.openMaps':         { en: 'Open in Maps',                es: 'Abrir en Maps' },
  'event.detailsComing':    { en: 'Details coming — check back soon.', es: 'Pronto habrá más detalles — vuelve a revisar.' },
  'event.printableProgram': { en: 'View the printable program',  es: 'Ver el programa para imprimir' },
  'event.notesDirections':  { en: 'Notes & directions',          es: 'Notas e indicaciones' },
  'event.seeFullCalendar':  { en: 'See the full calendar',       es: 'Ver el calendario completo' },
  'event.scheduleChange':   { en: 'Schedule change:',            es: 'Cambio de horario:' },
  'event.notOnCalendar':    { en: "This event isn't on the calendar anymore.", es: 'Este evento ya no está en el calendario.' },
  'event.todaySuffix':      { en: '— today',                     es: '— hoy' },
  // Spanish drops the {type} word on purpose: "clase" is feminine and
  // "concierto" masculine, so a single templated sentence can't agree with
  // both. The generic "evento" always agrees.
  'event.isCancelled':      { en: 'This {type} is cancelled.',   es: 'Este evento está cancelado.' },
  'event.attendanceLabel':  { en: 'Attendance required:',        es: 'Asistencia obligatoria:' },
  'event.attendanceBody':   {
    en: 'members of {ensembles} must attend this {type} even though they are not performing.',
    es: 'los integrantes de {ensembles} deben asistir aunque no vayan a tocar.',
  },

  // ── Season page ─────────────────────────────────────────────────────────
  'season.intro': {
    en: 'Every concert this year, at a glance. Tap one for call time, dress, and directions.',
    es: 'Todos los conciertos del año, de un vistazo. Toca uno para ver hora de llegada, vestimenta e indicaciones.',
  },
  'season.print':       { en: 'Print season', es: 'Imprimir temporada' },
  'season.none':        { en: 'No concerts on the calendar yet.', es: 'Aún no hay conciertos en el calendario.' },
  'season.noUpcoming':  { en: 'No upcoming concerts — the rest of the season is below.', es: 'No hay conciertos próximos — el resto de la temporada está abajo.' },
  'season.earlier':     { en: 'Earlier this season', es: 'Antes en esta temporada' },
  'season.showingOnly': { en: 'Showing: {name} only.', es: 'Mostrando solo: {name}.' },

  // ── My Schedule page ────────────────────────────────────────────────────
  'sched.yourParts':      { en: 'Your parts',                 es: 'Tus partituras' },
  'sched.plannedAbsence': { en: 'Report a planned absence',   es: 'Avisar una ausencia planificada' },
  'sched.studentNotFound':{ en: 'Student not found.',         es: 'No encontramos a ese estudiante.' },
  'sched.subscribeMine':  { en: "Subscribe · {name}'s calendar", es: 'Suscribirse · calendario de {name}' },
  'sched.part':           { en: 'Part',                       es: 'Partitura' },
  'sched.lessonOverride': {
    en: "Lesson today{time} overrides {ensemble} — you're excused for that window only, then expected back.",
    es: 'Clase particular hoy{time} en lugar de {ensemble} — estás excusado solo en ese horario y después se te espera de vuelta.',
  },

  // ── Practice This Week card ─────────────────────────────────────────────
  'practice.thisWeek':    { en: 'Practice this week',  es: 'Practica esta semana' },
  'practice.due':         { en: 'due',                 es: 'entrega' },
  'practice.myPart':      { en: 'My part',             es: 'Mi partitura' },
  'practice.form':        { en: 'Form',                es: 'Formulario' },
  'practice.markDone':    { en: 'Mark practiced',      es: 'Marcar como practicado' },
  'practice.markNotDone': { en: 'Mark not practiced',  es: 'Quitar la marca de practicado' },
  'practice.note':        { en: 'Check-offs stay on this device — your own practice list.', es: 'Las marcas se quedan en este dispositivo — es tu propia lista de práctica.' },

  // ── Seating chart card ──────────────────────────────────────────────────
  'seat.current':   { en: 'Current',            es: 'Actual' },
  'seat.published': { en: 'Published {date}',   es: 'Publicado el {date}' },
  'seat.stage':     { en: 'Stage · Conductor',  es: 'Escenario · Director' },
  'seat.you':       { en: '(you)',              es: '(tú)' },

  // ── Repertoire lists ────────────────────────────────────────────────────
  'rep.parts':          { en: 'Parts',                    es: 'Partituras' },
  'rep.yourPart':       { en: 'Your part ({instrument})', es: 'Tu partitura ({instrument})' },
  'rep.minutes':        { en: '{count} min',              es: '{count} min' },
  'rep.movements.one':  { en: '{count} mvt',              es: '{count} mov.' },
  'rep.movements.other':{ en: '{count} mvts',             es: '{count} mov.' },
  'rep.browseAll':      { en: 'Browse all repertoire',    es: 'Ver todo el repertorio' },

  // ── Announcement cards ──────────────────────────────────────────────────
  'announce.all':         { en: 'All',              es: 'Todos' },
  'announce.readEnglish': { en: 'Read in English',  es: 'Leer en inglés' },
  'announce.readSpanish': { en: 'Read in Spanish',  es: 'Leer en español' },

  // ── Subscribe-to-calendar wizard ────────────────────────────────────────
  'sub.thisCalendar': { en: 'Subscribe to this calendar', es: 'Suscribirse a este calendario' },
  'sub.allEvents':    { en: 'Subscribe to all events',    es: 'Suscribirse a todos los eventos' },
  'sub.dialog':       { en: 'Subscribe to calendar',      es: 'Suscribirse al calendario' },
  'sub.yourDevice':   { en: 'Your device',                es: 'Tu dispositivo' },
  'sub.close':        { en: 'Close',                      es: 'Cerrar' },
  'sub.ios':          { en: 'iPhone / iPad',              es: 'iPhone / iPad' },
  'sub.android':      { en: 'Android',                    es: 'Android' },
  'sub.desktop':      { en: 'Computer',                   es: 'Computadora' },
  'sub.iosStep1':     { en: 'Tap "Subscribe in Apple Calendar" below.', es: 'Toca “Suscribirse en Apple Calendar” abajo.' },
  'sub.iosStep2':     { en: 'A pop-up appears — tap Subscribe, then Done.', es: 'Aparece una ventana — toca Suscribirse y luego Listo.' },
  'sub.iosStep3':     { en: 'That’s it! New events and schedule changes show up in your Calendar app automatically.', es: '¡Listo! Los eventos nuevos y los cambios de horario aparecen solos en tu app de Calendario.' },
  'sub.andStep1':     { en: 'Tap "Add to Google Calendar" below (sign in to Google if asked).', es: 'Toca “Agregar a Google Calendar” abajo (inicia sesión en Google si te lo pide).' },
  'sub.andStep2':     { en: 'On the page that opens, tap Add to confirm the new calendar.', es: 'En la página que se abre, toca Agregar para confirmar el calendario nuevo.' },
  'sub.andStep3':     { en: 'Done! Events sync to your Google Calendar app automatically. If you don’t see them, turn the calendar on under Settings in the app.', es: '¡Listo! Los eventos se sincronizan solos con tu app de Google Calendar. Si no los ves, activa el calendario en Configuración dentro de la app.' },
  'sub.deskStep1':    { en: 'Click "Add to Google Calendar" below (sign in to Google if asked), then click Add to confirm.', es: 'Haz clic en “Agregar a Google Calendar” abajo (inicia sesión en Google si te lo pide) y luego en Agregar para confirmar.' },
  'sub.deskStep2':    { en: 'Using Outlook or Apple Calendar instead? Copy the link and choose "Add calendar → From URL" (Outlook) or "File → New Calendar Subscription" (Apple).', es: '¿Usas Outlook o Apple Calendar? Copia el enlace y elige “Agregar calendario → Desde URL” (Outlook) o “Archivo → Nueva suscripción de calendario” (Apple).' },
  'sub.deskStep3':    { en: 'Done! New events and schedule changes appear automatically — no need to re-add anything.', es: '¡Listo! Los eventos nuevos y los cambios de horario aparecen solos — no hay que volver a agregar nada.' },
  'sub.apple':        { en: 'Subscribe in Apple Calendar', es: 'Suscribirse en Apple Calendar' },
  'sub.google':       { en: 'Add to Google Calendar',      es: 'Agregar a Google Calendar' },
  'sub.copyLink':     { en: 'Copy link',                   es: 'Copiar enlace' },
  'sub.copied':       { en: 'Copied!',                     es: '¡Copiado!' },
  'sub.hint':         { en: 'This is a live subscription — the calendar updates itself whenever the schedule changes.', es: 'Es una suscripción en vivo — el calendario se actualiza solo cada vez que cambia el horario.' },

  // ── Assignments page ────────────────────────────────────────────────────
  'assign.intro':      { en: 'Playing exams, written tests, and performances coming up.', es: 'Próximos exámenes de ejecución, pruebas escritas y presentaciones.' },
  'assign.dueSoon':    { en: 'Due soon',                       es: 'Próximas entregas' },
  'assign.nothingDue': { en: 'Nothing due right now. Check back soon!', es: 'No hay nada pendiente por ahora. ¡Vuelve pronto!' },
  'assign.individual': { en: 'Individual',                     es: 'Individual' },

  // ── Documents page ──────────────────────────────────────────────────────
  'docs.title':         { en: 'Documents',  es: 'Documentos' },
  'docs.intro':         { en: 'Handbooks, syllabi, forms, and other resources for your ensembles.', es: 'Manuales, programas de estudio, formularios y otros recursos para tus ensambles.' },
  'docs.general':       { en: 'General documents', es: 'Documentos generales' },
  'docs.allTypes':      { en: 'All types',   es: 'Todos los tipos' },
  'docs.allEnsembles':  { en: 'All ensembles', es: 'Todos los ensambles' },
  'docs.none':          { en: 'No documents yet.', es: 'Aún no hay documentos.' },
  'docs.noneFilter':    { en: 'No documents match this filter.', es: 'Ningún documento coincide con este filtro.' },
  'docs.open':          { en: 'Open',        es: 'Abrir' },
  'docs.section':       { en: 'Documents',   es: 'Documentos' },

  // ── Not-found page ──────────────────────────────────────────────────────
  'nf.title': { en: 'Page not found', es: 'Página no encontrada' },

  // ── Misc ────────────────────────────────────────────────────────────────
  'misc.loading':        { en: 'Loading…',           es: 'Cargando…' },
  'misc.showMoreDays':   { en: 'Show more days',     es: 'Ver más días' },
  'misc.addToCalendar':  { en: 'Add to my calendar', es: 'Agregar a mi calendario' },
  'atc.openedGoogle':    { en: 'Google Calendar opened — tap Save there.', es: 'Se abrió Google Calendar — toca Guardar allí.' },
  'atc.sentIos':         { en: 'Sent to your calendar app — look for the new event.', es: 'Enviado a tu app de calendario — busca el evento nuevo.' },
  'atc.icsInstead':      { en: 'Use a .ics file instead', es: 'Usar un archivo .ics' },
  'atc.cancelledTip':    { en: "This event is cancelled — there's nothing to add.", es: 'Este evento está cancelado — no hay nada que agregar.' },
  'atc.cancelledTitle':  { en: 'This event is cancelled', es: 'Este evento está cancelado' },
  'event.getDirections': { en: 'Get directions', es: 'Cómo llegar' },
  'event.when':          { en: 'When & where', es: 'Cuándo y dónde' },
  'misc.showAll':        { en: 'Show all {count}', es: 'Ver los {count}' },
  'misc.next':           { en: 'Next', es: 'Próximo' },
  'ens.members.one':     { en: '{count} member', es: '{count} integrante' },
  'ens.members.other':   { en: '{count} members', es: '{count} integrantes' },
  'misc.openExamForm':   { en: 'Open exam form',     es: 'Abrir el formulario del examen' },
};
