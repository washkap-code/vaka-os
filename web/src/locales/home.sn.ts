// ChiShona (sn-ZW) public landing page dictionary — DRAFT.
//
// Status: machine-assisted draft pending certified review by a qualified
// native-speaker translator (mission PI18N-002, gate P). English remains the
// authoritative language until that review approves this file.
// Illustrative product-preview sample data and package/product names remain in
// their original form deliberately.

import type { HomeOverride } from "./index";

export const HOME_SN: HomeOverride = {
  meta: {
    title: "VAKA — Operating System yeBhizimusi reAfrica",
    description: "Fambisa vatengi, mari, sitoko nemabasa mupuratifomu imwe chete yebhizimusi inotanga neZimbabwe, ine nharembozha, mibhadharo, bhengi nezvishandiso zvehunyanzvi munzira.",
  },
  accessibility: {
    skip: "Svetukira kune zviri mukati",
    primaryNavigation: "Nzira huru",
    mobileNavigation: "Nzira dzepanharembozha",
    openMenu: "Vhura menyu",
    closeMenu: "Vhara menyu",
  },
  nav: {
    product: "Chigadzirwa",
    outcomes: "Zvibereko",
    why: "Sei VAKA",
    pricing: "Mitengo",
    resources: "Zviwanikwa",
    signIn: "Pinda",
    start: "Vhura nzvimbo yebasa",
  },
  hero: {
    eyebrow: "VAKA · Yakavakirwa Zimbabwe pakutanga",
    title: "Operating System yeBhizimusi reAfrica.",
    description: "Fambisa vatengi vako, kutengesa, akaunzi, sitoko, mihoro nemabasa kubva mupuratifomu imwe chete ine njere.",
    origin: "VAKA zvinoreva “kuvaka” muchiShona.",
    position: "Yakagadzirirwa muZimbabwe. Yakavakirwa Africa.",
    primary: "Vhura nzvimbo yako yebasa yeVAKA mahara",
    secondary: "Ona kuti VAKA inoshanda sei",
    trust: "Tanga nemazuva makumi matatu emahara. Hapana kadhi rinodiwa.",
  },
  capabilityLine: "CRM · Mari · Sitoko · Mari dzakawanda · Yakavakirwa Zimbabwe pakutanga",
  story: {
    eyebrow: "Sei VAKA iripo",
    title: "VAKA zvinoreva “kuvaka.”",
    lead: "Bhizimusi rega rega rakasimba rinotanga nekuvaka chimwe chinhu.",
    list: "Vatengi. Timu. Mukurumbira. Raramo. Nhaka.",
    body: "VAKA inotora zita rayo kubva pashoko rechiShona rekuti kuvaka. Tiri kuvaka VAKA nekuti mabhizimusi eAfrica anokodzera tekinoroji yakagadzirirwa mashandiro awo chaiwo.",
    position: "Zimbabwe ndipo panotangira VAKA. Africa ndiyo kwakagadzirirwa puratifomu kuti ikure.",
    closing: "Tiri kuvaka VAKA kuti iwe uvake yako.",
  },
  zimbabwe: {
    eyebrow: "Zimbabwe pakutanga",
    title: "Yakavakirwa mamiriro chaiwo ekuita bhizimusi muno.",
    description: "VAKA inotanga nemashandiro nemamiriro eZimbabwe, ichichengeta mitemo yenyika imwe neimwe ichigona kugadziridzwa kuti ikure zvine hungwaru.",
    capabilities: [
      { title: "USD neZiG", description: "Shanda nemari dzatotsigirwa nechigadzirwa chinoshanda.", icon: "currency" },
      { title: "Mashandiro ebhizimusi emuno", description: "Batanidza kuti mabhizimusi anopa mitengo, anotengesa, anotenga, anounganidza uye anoshuma sei.", icon: "market" },
      { title: "Kuona uri kure", description: "Nzwisisa zviri kuitika mubhizimusi rese kubva panzvimbo imwe yebasa.", icon: "visibility" },
      { title: "Zvinyorwa zvakabatana", description: "Chengeta vatengi, mainvoisi, mibhadharo nesitoko zvakabatana.", icon: "connected" },
      { title: "Mitauro yemuno", description: "Chirungu chiri kushanda. Dirafuti dzechiShona nechiNdebele dzinowanikwa kuona kuchakaongororwa nevataura vemitauro iyi.", icon: "language" },
      { title: "Yakavakirwa kukura", description: "Paradzanisa mitemo yenyika nepuratifomu kuti misika yeramangwana igadziridzwe zvine hungwaru.", icon: "growth" },
    ],
  },
  problem: {
    eyebrow: "Matambudziko ebhizimusi, zvibereko zvakabatana",
    title: "Bhizimusi rako harifaniri kuparadzirwa munzvimbo shanu dzakasiyana.",
    description: "Vatengi muWhatsApp. Sitoko mumaspreadsheet. Kutengesa mumabhuku. Mainvoisi kumwewo. VAKA inobatanidza basa isingavigi ruzivo.",
    resolution: "Bhizimusi rimwe. Sisitemu imwe. Chokwadi chimwe.",
    fragments: ["WhatsApp", "Bhuku", "Spreadsheet", "Mainvoisi"],
    system: "Chitubu chimwe chechokwadi",
  },
  outcomes: {
    eyebrow: "Yakavakirwa zvibereko",
    title: "Fambisa mufananidzo wese, kwete zvishandiso zvakaparadzana.",
    items: [
      { title: "Wana vatengi vakawanda", description: "Chengeta lead yega yega, hurukuro nemukana zvakarongeka.", label: "VAKA CRM", icon: "crm" },
      { title: "Bhadharwa nekudzora kwakawanda", description: "Buritsa mainvoisi, tevera mibhadharo uye nzwisisa mamiriro ako emari.", label: "VAKA Finance", icon: "finance" },
      { title: "Usarasikirwa nesitoko", description: "Ziva zvaunazvo, zviri kufamba nezvinoda kutariswa.", label: "VAKA Inventory", icon: "inventory" },
      { title: "Ita sarudzo dziri nani", description: "Shandura zviitiko zvebhizimusi zvakabatana kuva ruzivo rwaunogona kushandisa.", label: "VAKA Insights", icon: "insights" },
      { title: "Unganidza woenzanisa nekukurumidza", description: "Unza mainvoisi, zvisimbiso zvemibhadharo nezviitiko zvebhengi munzira imwe yakadzorwa.", label: "VAKA Connected Finance · Zvakarongwa", icon: "finance" },
      { title: "Shanda pese panoitika bhizimusi", description: "Shandisa kutora nemobile, mvumo, kuscana sitoko nekugovera kwakachengeteka kana maapp enharembozha aburitswa.", label: "VAKA Mobile · Zvakarongwa", icon: "connected" },
    ],
  },
  ai: {
    eyebrow: "VAKA AI",
    title: "Njere dzinonzwisisa basa riri seri kwemanhamba.",
    description: "VAKA AI yakarongwa kubatsira vashandisi vakabvumirwa kunzwisisa zviitiko zvebhizimusi, kuona zvinoda kutariswa nekusarudza zvekuita.",
    progression: "Bvunza → Nzwisisa → Kurudzira → Simbisa",
    notice: "Muenzaniso wepfungwa chete. VAKA AI haiwanikwi muchigadzirwa chinoshanda.",
    userLabel: "Mubvunzo webhizimusi",
    user: "Ndevapi vatengi vanoda kutariswa nhasi?",
    responseLabel: "VAKA AI · Muenzaniso wepfungwa",
    answer: "Vatengi vatatu vangada kutariswa. Invoisi imwe yapfuura nguva uye mukana mumwe wakavhurika wava pedyo nezuva wawaitarisirwa kuvharwa. Ongorora zvinyorwa usati waita chiito.",
  },
  workflow: {
    eyebrow: "Kushanda pamwe kweVAKA",
    title: "Chiitiko chebhizimusi chinofanira kugadziridza mufananidzo wese.",
    description: "VAKA yakagadzirirwa kuti mashandiro evatengi, kutengesa, mari, sitoko nemishumo agovane chitubu chimwe chechokwadi.",
    steps: ["Mutengi", "Mukana", "Kutengesa", "Invoisi", "Mubhadharo", "Sitoko", "Mishumo", "Njere"],
  },
  trust: {
    eyebrow: "Kuvimbika chinhu chechigadzirwa",
    title: "Bhizimusi rako rinofamba nekuvimbika. NeVAKA zvimwe chete.",
    description: "Zvinyorwa zvinokosha zvinokodzera muridzi akajeka, mapindiro akadzorwa nenhoroondo yaunogona kutevera.",
    items: [
      { title: "Kuparadzaniswa kwematenant", description: "Nzvimbo dzebasa dzemakambani dzakaparadzaniswa." },
      { title: "Mvumo dzemabasa", description: "Mapindiro anotevera mabasa emushandisi wega wega." },
      { title: "Zvinyorwa zvinoongororeka", description: "Zviitiko zvikuru zvemari nesitoko zvinochengetedza nhoroondo." },
      { title: "Kuridzi wedata", description: "Kuburitsa kwakadzorwa kunoramba kuri chikamu chechigadzirwa." },
    ],
  },
  proof: {
    eyebrow: "Kupinda kwekutanga",
    title: "Humbowo pamberi pezvivimbiso.",
    description: "VAKA iri padanho rekutanga rechigadzirwa. Tichaburitsa nyaya dzevatengi nezvibereko zvakayerwa chete nemvumo yevatengi. Kusvika ipapo, ongorora nzvimbo yebasa inoshanda uvake nesu.",
    cta: "Ona chigadzirwa chinoshanda",
  },
  pricing: {
    eyebrow: "Mapakeji eVAKA",
    title: "Tanga pauri. Kura usingachinji sisitemu.",
    description: "Mitengo yeUSD yazvino yenzvimbo dzebasa itsva. Tanga nemazuva makumi matatu emahara. Zvimwe zvinogona kuchakarongwa, uye kushandiswa kwevapi kana kuiswa kunogona kubhadhariswa zvakasiyana.",
    period: "USD / mwedzi",
    cta: "Tanga mazuva ako makumi matatu emahara",
    featured: "Kumatimu ari kukura",
  },
  faq: {
    eyebrow: "Mibvunzo, yakapindurwa",
    title: "Zvinokosha usati watanga.",
  },
  final: {
    eyebrow: "Vaka neVAKA",
    title: "Vaka muono wakajeka webhizimusi rako.",
    description: "Unza vatengi, kutengesa, mari, sitoko nemabasa munzvimbo imwe yebasa yakabatana yakavakirwa Zimbabwe pakutanga.",
    closing: "VAKA — Operating System yeBhizimusi reAfrica.",
  },
  footer: {
    position: "Yakagadzirirwa muZimbabwe. Yakavakirwa Africa.",
    language: "Mutauro",
    languageNotice: "ChiShona nechiNdebele zvinoratidzwa sedirafuti kuchakapedzwa kuongororwa nevataura vemitauro iyi. Chirungu ndicho chine chiremera.",
    languages: {
      english: "English",
      shona: "ChiShona (dirafuti)",
      ndebele: "isiNdebele (dirafuti)",
    },
    product: "Chigadzirwa",
    company: "Kambani",
    legal: "Zvemutemo",
    crm: "CRM",
    finance: "Mari",
    inventory: "Sitoko",
    about: "Sei VAKA",
    contact: "Tibate",
    security: "Kuchengetedzeka",
    copyright: "© 2026 VAKA OS",
    parent: "Chigadzirwa cheJonomi Digital",
  },
} as const;
