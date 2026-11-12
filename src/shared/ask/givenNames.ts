/**
 * Common first names, for Ask's name matcher (#ask).
 *
 * THIS IS NOT A LIST OF PEOPLE and was not made from one. It is the ordinary
 * given names of the United States and Latin America, written from general
 * knowledge. The roster was never read to make it, and it must never be
 * "improved" from the roster: a name list derived from students would be a
 * list of students (#privacy).
 *
 * What it is for: titles are full of first names (Carmen Suite, Souvenir de
 * Florence, the James K. Batten Room, Sweeney Todd), and a classmate is asked
 * about far more often than a title is. A word in this set never picks a
 * thing by itself. It still counts beside another word of the same name, so
 * "carmen suite" and "lincoln portrait" work and "where is carmen" does not.
 *
 * Deliberately NOT here: a word that is first of all a place or a group at
 * this school (kendall, lyric, phil, chapman, jazz).
 */
export const GIVEN_NAMES = new Set((
  // English
  'aaliyah aaron abigail adam addison adrian adrienne aidan aiden alex alexa alexander alexandra alexis ' +
  'alice allison alyssa amanda amber amelia amy andrea andrew andy angel angela angelina anna anthony ' +
  'april aria ariana arianna art ashley audrey august austin autumn ava avery bailey barbara bella ben ' +
  'benjamin bill blake brandon brayden brenda brian brianna brooke brooklyn bryan caden caleb cameron ' +
  'carol caroline carson carter catherine charles charlie charlotte chase chloe chris christian christina ' +
  'christine christopher claire cody cole colin connor cynthia dan daniel dave david dawn destiny devin ' +
  'diana dominic donald donna dylan edward eli elijah elizabeth ella ellie emily emma eric erin ethan ' +
  'eva evan eve evelyn faith felix florence frank gabriel gabriella gary gavin george grace grant ' +
  'gregory hailey haley hannah harmony hayden helen henry holly hope hunter ian isaac isabel isabella ' +
  'isabelle isaiah jack jackie jackson jacob jada jaden james jasmine jason jayden jeffrey jenna jennifer ' +
  'jeremiah jeremy jesse jessica jim jocelyn joe john jonathan jordan joseph josh joshua joy julia julian ' +
  'june justin kaitlyn karen kate katherine katie kayla kaylee kenneth kevin kimberly kyle kylie landon ' +
  'larry laura lauren laurie layla leah leo leslie lewis liam lillian lily lincoln linda lisa logan louis ' +
  'louise lucas lucy luke mackenzie madeline madison makayla maria mariah marietta mark martin mary mason ' +
  'matt matthew max may maya megan melanie melody mia michael michelle mike miles molly morgan nancy ' +
  'natalie nathan nathaniel nevaeh nicholas nick nicole noah nora oliver olivia oscar owen paige pamela ' +
  'pat patricia patrick paul peter rachel rebecca richard riley robert ronald rose ruby ruth ryan sam ' +
  'samantha samuel sandra sara sarah savannah scott sean sebastian seth sharon sierra sophia sophie ' +
  'stella stephanie stephen steven summer sunny susan sydney taylor theo thomas tim timothy todd tom tony ' +
  'trinity tyler vanessa victor victoria violet will william wyatt xavier zach zachary zoe ' +
  // Spanish and Portuguese
  'adriana alberto alejandra alejandro alonso ana andres antonella antonio arturo beatriz camila carlos ' +
  'carmen carolina catalina cesar clara cristina daniela diego domingo eduardo elena emilia emiliano ' +
  'emilio enrique ernesto esperanza esteban fernanda fernando francisco gabriela guadalupe guillermo ' +
  'gustavo hector hugo ignacio ines isabela ivan javier jesus jimena joaquin jorge jose juan juana julio ' +
  'juliana lorenzo lucia luciana luis luz manuel marco marcos mariana mario marta martina mateo matias ' +
  'mercedes miguel natalia nicolas omar pablo paola paz pedro pilar rafael ramon raul regina renata ' +
  'ricardo roberto rodrigo rosa salvador santiago sergio sofia teresa valentina valeria ximena yolanda'
).split(' '));
