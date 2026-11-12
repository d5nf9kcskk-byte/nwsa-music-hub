/**
 * Ordinary words, for Ask's name matcher (#ask).
 *
 * Titles are full of them ("We'll go away together", "Down a Country Lane",
 * "Under the Willow Tree"), and a person who types "well" or "go away" is not
 * asking for a piece. A word in this set never picks a thing by itself. It
 * still counts beside a real word of the same name ("love of three oranges",
 * "new world gallery"), and it IS the thing when it is the thing's whole name
 * (a piece called "Forever").
 *
 * It is also what stops a typo being forgiven on an ordinary word, and what
 * lets a search topic through ("did anyone find a stand"): see parse.ts.
 *
 * What does NOT belong here: a word people really use to name something at a
 * music school by itself (symphony, choir, jazz, theory, history, dance,
 * side, state, black). Adding one of those makes "when is theory" stop
 * working, and the self-check will say so.
 *
 * Written from general knowledge: the common words of English and Spanish,
 * three letters and up. Shorter words never pick a thing anyway.
 *
 * A HELPER, NOT THE DEFENCE. This list will never be complete, and nothing
 * in parse.ts leans on it being so: one word out of a longer title is never
 * believed whatever the word, a person's surname never is, and a word a
 * rule has claimed is never also a name. The list only decides whether a
 * thing whose WHOLE name is one word ("Dance", "Winter") may be believed.
 */
export const COMMON_WORDS = new Set((
  // English
  'able about above across act actually add after again against age ago air all almost alone along ' +
  'already also always american among and another answer any anyone anything are around ask away back bad ' +
  'battle beach because become been before began begin behind being believe below best better between big ' +
  'bit blue both box boy bring build bus busy but buy came can cannot car care carry case catch cause ' +
  'center chair child city clean clear close cold come cool could country course cover cross cut dark ' +
  'dear deep did die does dog done door down draw dream drive drop dry during each early earth east easy ' +
  'eat eight else enough even ever every example face fact family fan far fast father feel feet fell felt ' +
  'few find fine fire first fit five fix floor fly follow food foot forever four friend from front full ' +
  'fun game gave get girl give goes going gone good got great green ground grow gym had half hall hand ' +
  'happen happy hard has have head hear heard heart heavy help here high him his hold home hope hot hour ' +
  'house how however ice idea information into job just keep kept key kind knew know land lane large last ' +
  'late later laugh law lay learn least leave led left less let letter lie life light like line list ' +
  'little live long look lot love low made main make man many map mean meeting men met middle might mind ' +
  'minor minute miss mix modified mom money month more morning most mother move much must name near need ' +
  'never new nice night nine north not nothing now number odd off often old once one only open order ' +
  'original other our out over own page paper past pay pen people person picture place plan point poor ' +
  'power pretty problem project pull push put quarter question quick quiet quite rain ran reach read ready ' +
  'real really reason red remember republic rest right rip river road rock round rule run sad said saint ' +
  'same save saw say scene see seem seen self send sent set seven several shall she short should signing ' +
  'simple since sit six sky sleep slow small some something sometimes song soon sorry sound south speak ' +
  'special stand star stars start stay step stop story street strong such sure take talk tell temple ten ' +
  'tender than thank that the their them theme then there these they thing think third those though ' +
  'thought three through tired together told too took top toward town tree true try turn two under ' +
  'unfinished until upon use van very wait walk wall want war warm watch water way week well went were ' +
  'west what when where which while white who whole whose why wide wife will win wish with without woman ' +
  'women won wonder wood word work would write wrong year yes yet you young your ' +
  'address business change day days desk early garage help hours lost lunch office park parking phone price ' +
  'update weeks months years ' +
  // Spanish
  'ahora algo alguien antes aqui asi bien buena bueno cada casa como con cosa creo cuanto desde despues ' +
  'dia donde dos durante ella ellos entonces entre ese eso fue gente gracias grande hace hacer hasta ' +
  'hombre mas mejor menos mientras mismo mucho muy nada nadie noche nueva nuevo nunca otra otro pero poco ' +
  'porque puede puedo quiero saber ser siempre sin sobre solo tambien tan tener tiempo toda todo todos ' +
  'trabajo tres uno ver vez vida'
).split(' '));
