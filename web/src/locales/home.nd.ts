// isiNdebele (nd-ZW) public landing page dictionary — DRAFT.
//
// Status: machine-assisted draft pending certified review by a qualified
// native-speaker translator (mission PI18N-003, gate P). English remains the
// authoritative language until that review approves this file.
// Illustrative product-preview sample data and package/product names remain in
// their original form deliberately.

import type { HomeOverride } from "./index";

export const HOME_ND: HomeOverride = {
  meta: {
    title: "VAKA — I-Operating System yeBhizinisi le-Africa",
    description: "Phatha abathengi, izimali, impahla lemisebenzi kuplatfomu eyodwa yebhizinisi eqalisa ngeZimbabwe, ilefoni, izinkokhelo, ibhanga lamathuluzi obungcitshi endleleni.",
  },
  accessibility: {
    skip: "Yeqela kokuqukethweyo",
    primaryNavigation: "Ukuzulazula okukhulu",
    mobileNavigation: "Ukuzulazula efonini",
    openMenu: "Vula imenyu",
    closeMenu: "Vala imenyu",
  },
  nav: {
    product: "Umkhiqizo",
    outcomes: "Imiphumela",
    why: "Kungani iVAKA",
    pricing: "Intengo",
    resources: "Izinsiza",
    signIn: "Ngena",
    start: "Vula indawo yomsebenzi",
  },
  hero: {
    eyebrow: "VAKA · Yakhelwe iZimbabwe kuqala",
    title: "I-Operating System yeBhizinisi le-Africa.",
    description: "Phatha abathengi bakho, ukuthengisa, izimali, impahla, amaholo lemisebenzi kusukela kuplatfomu eyodwa ehlakaniphileyo.",
    origin: "UVAKA utsho “ukwakha” ngesiShona.",
    position: "Yaklanywa eZimbabwe. Yakhelwa i-Africa.",
    primary: "Vula indawo yakho yomsebenzi yeVAKA mahala",
    secondary: "Bona ukuthi iVAKA isebenza njani",
    trust: "Qalisa ngensuku ezingu-30 zamahala. Akudingeki ikhadi.",
  },
  capabilityLine: "CRM · Izimali · Impahla · Izimali ezinengi · Yakhelwe iZimbabwe kuqala",
  story: {
    eyebrow: "Kungani iVAKA ikhona",
    title: "UVAKA utsho “ukwakha.”",
    lead: "Yonke ibhizinisi eqinileyo iqalisa ngokwakha ulutho.",
    list: "Abathengi. Iqembu. Udumo. Impilo. Ilifa.",
    body: "IVAKA ithatha ibizo layo esenzweni sesiShona esithi kuvaka — ukwakha. Sakha iVAKA ngoba amabhizinisi e-Africa afanelwe yitheknoloji eyakhelwe indlela asebenza ngayo sibili.",
    position: "IZimbabwe yilapho iVAKA iqalisa khona. I-Africa yilapho iplatfomu iklanyelwe ukukhula khona.",
    closing: "Sakha iVAKA ukuze wena wakhe eyakho.",
  },
  zimbabwe: {
    eyebrow: "IZimbabwe kuqala",
    title: "Yakhelwe izimo zoqobo zokwenza ibhizinisi lapha.",
    description: "IVAKA iqalisa ngezindlela zokusebenza lezimo zeZimbabwe, igcina imithetho yamazwe ilungiseka ukuze kukhuliswe ngokulomlandu.",
    capabilities: [
      { title: "USD leZiG", description: "Sebenza ngezimali esezisekelwa ngumkhiqizo osebenzayo.", icon: "currency" },
      { title: "Izindlela zebhizinisi zalapha", description: "Hlanganisa indlela amabhizinisi anika intengo, athengisa, athenga, aqoqa njalo abika ngayo.", icon: "market" },
      { title: "Ukubona ukude", description: "Zwisisa okwenzakalayo kulo lonke ibhizinisi usendaweni eyodwa yomsebenzi.", icon: "visibility" },
      { title: "Amarekhodi ahlanganisiweyo", description: "Gcina abathengi, ama-invoyisi, izinkokhelo lempahla kuhlangene.", icon: "connected" },
      { title: "Izindimi zalapha", description: "IsiNgisi siyasebenza. Amadrafti esiShona lesiNdebele ayatholakala ukubonwa kusahlolwa ngabakhulumi bendimi lezi.", icon: "language" },
      { title: "Yakhelwe ukukhula", description: "Yehlukanisa imithetho yamazwe leplatfomu ukuze imakethe zakusasa zilungiswe ngokulomlandu.", icon: "growth" },
    ],
  },
  problem: {
    eyebrow: "Izinkinga zebhizinisi, imiphumela ehlanganisiweyo",
    title: "Ibhizinisi lakho kalimelanga lisabalale ezindaweni ezinhlanu ezehlukeneyo.",
    description: "Abathengi kuWhatsApp. Impahla kumaspreadsheet. Ukuthengisa emabhukwini. Ama-invoyisi kwenye indawo. IVAKA ihlanganisa umsebenzi ingafihli imininingwane.",
    resolution: "Ibhizinisi linye. Isistimu yinye. Iqiniso linye.",
    fragments: ["WhatsApp", "Ibhuku", "Ispredishithi", "Ama-invoyisi"],
    system: "Umthombo owodwa weqiniso",
  },
  outcomes: {
    eyebrow: "Yakhelwe imiphumela",
    title: "Phatha isithombe sonke, hatshi amathuluzi ehlukeneyo.",
    items: [
      { title: "Zuza abathengi abanengi", description: "Gcina yonke i-lead, ingxoxo lethuba kuhlelekile.", label: "VAKA CRM", icon: "crm" },
      { title: "Khokhelwa ngokulawula okukhulu", description: "Khupha ama-invoyisi, landelela izinkokhelo njalo uzwisise isimo sakho sezimali.", label: "VAKA Finance", icon: "finance" },
      { title: "Ungalahlekelwa yimpahla", description: "Yazi olakho, okuhambayo lokudinga ukunakwa.", label: "VAKA Inventory", icon: "inventory" },
      { title: "Yenza izinqumo ezingcono", description: "Guqula imisebenzi yebhizinisi ehlanganisiweyo ibe lulwazi ongalusebenzisa.", label: "VAKA Insights", icon: "insights" },
      { title: "Qoqa ubuyisane masinyane", description: "Letha ama-invoyisi, iziqinisekiso zezinkokhelo lemisebenzi yebhanga endleleni eyodwa elawulwayo.", label: "VAKA Connected Finance · Kuhleliwe", icon: "finance" },
      { title: "Sebenza lapho ibhizinisi lisenzeka khona", description: "Sebenzisa ukuthatha ngefoni, izimvumo, ukuskena impahla lokwabelana okuvikelekileyo nxa ama-app efoni esekhutshiwe.", label: "VAKA Mobile · Kuhleliwe", icon: "connected" },
    ],
  },
  ai: {
    eyebrow: "VAKA AI",
    title: "Ubuhlakani obuzwisisa umsebenzi ongemuva kwezinombolo.",
    description: "IVAKA AI ihlelelwe ukusiza abasebenzisi abavunyiweyo ukuzwisisa imisebenzi yebhizinisi, ukubona okudinga ukunakwa lokukhetha okulandelayo.",
    progression: "Buza → Zwisisa → Phakamisa → Qinisekisa",
    notice: "Umbukiso womcabango kuphela. IVAKA AI ayitholakali emkhiqizweni osebenzayo.",
    userLabel: "Umbuzo webhizinisi",
    user: "Yibaphi abathengi abadinga ukunakwa lamuhla?",
    responseLabel: "VAKA AI · Umbukiso womcabango",
    answer: "Abathengi abathathu bangadinga ukunakwa. I-invoyisi eyodwa idlule isikhathi njalo ithuba elilodwa elivulekileyo selisondele osukwini obelulindelwe ukuvalwa ngalo. Hlola amarekhodi ungakenzi isenzo.",
  },
  workflow: {
    eyebrow: "Ukusebenza ndawonye kweVAKA",
    title: "Isehlakalo sebhizinisi kumele sivuselele isithombe sonke.",
    description: "IVAKA iklanyelwe ukuthi izindlela zabathengi, ukuthengisa, izimali, impahla lemibiko zabelane ngomthombo owodwa oqinisekileyo weqiniso.",
    steps: ["Umthengi", "Ithuba", "Ukuthengisa", "I-invoyisi", "Inkokhelo", "Impahla", "Imibiko", "Ubuhlakani"],
  },
  trust: {
    eyebrow: "Ukuthenjwa yinto yomkhiqizo",
    title: "Ibhizinisi lakho lihamba ngokuthenjwa. LeVAKA kunjalo.",
    description: "Amarekhodi aqakathekileyo afanelwe ngumnikazi ocacileyo, ukungena okulawulwayo lomlando ongawulandela.",
    items: [
      { title: "Ukwehlukaniswa kwamatenant", description: "Izindawo zomsebenzi zezinkampani zehlukanisiwe." },
      { title: "Izimvumo zezindima", description: "Ukungena kulandela imilandu yomsebenzisi munye ngamunye." },
      { title: "Amarekhodi ahloleklayo", description: "Izehlakalo eziqakathekileyo zemali lempahla zigcina umlando." },
      { title: "Ubunikazi bedatha", description: "Ukukhutshwa okulawulwayo kuhlala kuyingxenye yomkhiqizo." },
    ],
  },
  proof: {
    eyebrow: "Ukungena kwakuqala",
    title: "Ubufakazi phambi kwezithembiso.",
    description: "IVAKA isesigabeni sokuqala somkhiqizo. Sizakhupha izindaba zabathengi lemiphumela elinganisiweyo kuphela ngemvumo yabathengi. Kuze kube yilapho, hlola indawo yomsebenzi esebenzayo wakhe lathi.",
    cta: "Bona umkhiqizo osebenzayo",
  },
  pricing: {
    eyebrow: "Amaphakheji eVAKA",
    title: "Qalisa lapho okhona. Khula ungaguquli isistimu.",
    description: "Intengo zeUSD zamanje zezindawo zomsebenzi ezintsha. Qalisa ngensuku ezingu-30 zamahala. Ezinye izinto zisahleliwe, njalo ukusetshenziswa kwabaphakeli kumbe ukufakwa kungakhokhiswa ngokwehlukileyo.",
    period: "USD / inyanga",
    cta: "Qalisa insuku zakho ezingu-30 zamahala",
    featured: "Kumaqembu akhulayo",
  },
  faq: {
    eyebrow: "Imibuzo, iphenduliwe",
    title: "Okuqakathekileyo ungakaqalisi.",
  },
  final: {
    eyebrow: "Yakha ngeVAKA",
    title: "Yakha umbono ocacileyo webhizinisi lakho.",
    description: "Letha abathengi, ukuthengisa, izimali, impahla lemisebenzi endaweni eyodwa yomsebenzi ehlanganisiweyo eyakhelwe iZimbabwe kuqala.",
    closing: "VAKA — I-Operating System yeBhizinisi le-Africa.",
  },
  footer: {
    position: "Yaklanywa eZimbabwe. Yakhelwa i-Africa.",
    language: "Ulimi",
    languageNotice: "IsiShona lesiNdebele kutshengiswa njengamadrafti kusahlolwa ngabakhulumi bendimi lezi. IsiNgisi yiso esilesigunyazo.",
    languages: {
      english: "English",
      shona: "ChiShona (idrafti)",
      ndebele: "isiNdebele (idrafti)",
    },
    product: "Umkhiqizo",
    company: "Inkampani",
    legal: "Ezomthetho",
    crm: "CRM",
    finance: "Izimali",
    inventory: "Impahla",
    about: "Kungani iVAKA",
    contact: "Sithinte",
    security: "Ukuvikeleka",
    copyright: "© 2026 VAKA OS",
    parent: "Umkhiqizo weJonomi Digital",
  },
} as const;
