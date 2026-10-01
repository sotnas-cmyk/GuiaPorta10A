async function loadRestaurants() {
    var response = await fetch("./data/restaurantes.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Não foi possível carregar a base de restaurantes (" + response.status + ").");
    var data = await response.json();
    if (!Array.isArray(data)) throw new Error("A base de restaurantes não tem o formato esperado.");
    return data;
}

(async function () {
  "use strict";

  try {
    var restaurants = await loadRestaurants();
    var byId = new Map(restaurants.map(function (r) { return [r.id, r]; }));

  var REGION_GROUPS = [
    { title: "Norte", provincias: ["Minho", "Douro Litoral", "Douro", "Trás-os-Montes"] },
    { title: "Beiras", provincias: ["Beira Litoral", "Beira Alta", "Beira Baixa"] },
    { title: "Oeste e Tejo", provincias: ["Estremadura", "Ribatejo", "Grande Lisboa", "Setúbal"] },
    { title: "Sul", provincias: ["Alentejo", "Algarve"] },
    { title: "Ilhas", provincias: ["Madeira", "Açores"] },
    { title: "Espanha", provincias: ["Espanha"] }
  ];

  var TIPO_ORDER = ["tasco","taberna","clássico","cervejaria","churrasqueira","marisqueira","petiscos","pastelaria","date / contemporâneo","fine dining","hotel-restaurante","incerto"];
  var TIPO_LABEL = {
    tasco: "Tasco", taberna: "Taberna", "clássico": "Clássico", cervejaria: "Cervejaria",
    churrasqueira: "Churrasqueira", marisqueira: "Marisqueira", petiscos: "Petiscos",
    pastelaria: "Pastelaria", "date / contemporâneo": "Contemporâneo", "fine dining": "Fine dining",
    "hotel-restaurante": "Hotel", incerto: "Por classificar"
  };

  function fold(value) {
    return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function countByProvincia() {
    var counts = new Map();
    restaurants.forEach(function (r) {
      if (r.estado === "encerrado") return;
      counts.set(r.provincia, (counts.get(r.provincia) || 0) + 1);
    });
    return counts;
  }
  var PROV_COUNTS = countByProvincia();

  function zonasFor(provincia) {
    var seen = new Set(), out = [];
    restaurants.forEach(function (r) {
      if (r.provincia !== provincia || r.estado === "encerrado") return;
      if (!r.zona || seen.has(r.zona)) return;
      seen.add(r.zona); out.push(r.zona);
    });
    out.sort(function (a, b) { return a.localeCompare(b, "pt"); });
    return out;
  }

  function tiposPresent(list) {
    var counts = new Map();
    list.forEach(function (r) { if (r.tipo) counts.set(r.tipo, (counts.get(r.tipo) || 0) + 1); });
    var known = TIPO_ORDER.filter(function (t) { return counts.has(t); });
    var extra = Array.from(counts.keys()).filter(function (t) { return TIPO_ORDER.indexOf(t) === -1; });
    return known.concat(extra);
  }

  function filterRestaurants(q) {
    var needle = fold(q.search);
    var idSet = q.ids ? new Set(q.ids) : null;
    var out = [];
    restaurants.forEach(function (r) {
      if (r.estado === "encerrado") return;
      if (!q.includeUncertain && r.estado === "incerto") return;
      if (idSet && !idSet.has(r.id)) return;
      if (q.provincia && r.provincia !== q.provincia) return;
      if (q.zona && r.zona !== q.zona) return;
      if (q.tipo && r.tipo !== q.tipo) return;
      var ra = attrs(r);
      if (q.cozinha && ra.cozinhas.indexOf(q.cozinha) === -1) return;
      if (q.ambiente && ra.ambientes.indexOf(q.ambiente) === -1) return;
      if (q.ocasião && ra.ocasioes.indexOf(q.ocasião) === -1) return;
      if (q.preco && (!r.atributos || r.atributos.preco !== q.preco)) return;
      if (needle) {
        var a = attrs(r);
        var hay = fold([r.nome, r.localidade, r.zona, r.provincia, r.morada, r.tipo, r.especialidade, r.notas]
          .concat(a.cozinhas, a.ambientes, a.ocasioes, a.caracteristicas).filter(Boolean).join(" "));
        if (hay.indexOf(needle) === -1) return;
      }
      out.push(r);
    });
    return out;
  }

  function mapsLinks(r) {
    var query = r.mapsQuery || [r.nome, r.morada, r.localidade, r.provincia, 'Portugal'].filter(Boolean).join(', ');
    var q = encodeURIComponent(query);
    var appleName = encodeURIComponent(r.appleName || r.nome);
    var apple;
    if (r.applePlaceId) {
      apple = "https://maps.apple.com/place?place-id=" + encodeURIComponent(r.applePlaceId);
    } else if (typeof r.lat === "number" && typeof r.lon === "number") {
      apple = "https://maps.apple.com/place?q=" + appleName + "&ll=" + r.lat + "," + r.lon;
    } else {
      apple = "https://maps.apple.com/?q=" + q;
    }
    return {
      google: "https://www.google.com/maps/search/?api=1&query=" + q,
      apple: apple,
      waze: "https://waze.com/ul?q=" + q + "&navigate=yes"
    };
  }
  function telHref(phone) {
    var digits = phone.replace(/[^\d+]/g, "");
    if (digits.indexOf("+") === 0) return "tel:" + digits;
    if (digits.indexOf("00") === 0) return "tel:+" + digits.slice(2);
    return "tel:+351" + digits;
  }
  function websiteHref(url) {
    return /^https?:\/\//i.test(url) ? url : "https://" + url;
  }
  function placeLine(r) {
    var loc = r.localidade, zona = r.zona, prov = r.provincia, parts = [];
    if (loc) parts.push(loc);
    if (zona && (!loc || fold(loc).indexOf(fold(zona)) === -1)) parts.push(zona);
    if (prov && (!loc || fold(loc).indexOf(fold(prov)) === -1) && (!zona || fold(zona) !== fold(prov))) parts.push(prov);
    return parts.join(" · ");
  }
  function openCount() { return restaurants.filter(function (r) { return r.estado !== "encerrado"; }).length; }
  function pickRandom(list) {
    var pool = list.filter(function (r) { return r.estado === "aberto"; });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---- Favorites (localStorage) ----
  var FAV_KEY = "guia-porta-10a-favoritos-v1";
  function loadFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveFavs(ids) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(ids)); } catch (e) {}
  }
  var favIds = loadFavs();
  function isFav(id) { return favIds.indexOf(id) !== -1; }
  function toggleFav(id) {
    var i = favIds.indexOf(id);
    if (i === -1) favIds.unshift(id); else favIds.splice(i, 1);
    saveFavs(favIds);
  }

  // ---- "Onde estás?" (texto livre, sem geolocalização) ----
  var LOC_KEY = "guia-porta-10a-local-v1";
  function loadLoc() {
    try { return localStorage.getItem(LOC_KEY) || ""; } catch (e) { return ""; }
  }
  function saveLoc(text) {
    try { localStorage.setItem(LOC_KEY, text); } catch (e) {}
  }
  var LOC_STOPWORDS = new Set(["estou","fico","moro","ando","aqui","perto","longe","zona","regiao","agora","mesmo","cerca","proximo","proxima","sitio","lado","lados","hoje"].concat(["de","da","do","das","dos","em","na","no","nas","nos","e","a","o","as","os","um","uma"]));
  function locationWords(text) {
    return fold(text).split(" ").filter(function (w) { return w.length >= 3 && !LOC_STOPWORDS.has(w); });
  }
  function matchesLocation(r, words) {
    if (!words.length) return false;
    var hay = fold([r.localidade, r.zona, r.provincia, r.morada].filter(Boolean).join(" "));
    return words.some(function (w) { return hay.indexOf(w) !== -1; });
  }
  function locationPool() {
    var words = locationWords(state.myLocation);
    if (!words.length) return null;
    var base = decideBase();
    var matched = base.filter(function (r) { return matchesLocation(r, words); });
    return matched.length ? matched : null;
  }

  var RAIO_MAX_KM = 30;
  var GAZ = {
    "lisboa":[38.7223,-9.1393],"cascais":[38.6979,-9.4215],"estoril":[38.7057,-9.3975],"oeiras":[38.6970,-9.3090],
    "sintra":[38.7980,-9.3880],"amadora":[38.7538,-9.2308],"loures":[38.8300,-9.1680],"odivelas":[38.7930,-9.1830],
    "almada":[38.6790,-9.1570],"setubal":[38.5244,-8.8882],"sesimbra":[38.4440,-9.1010],"barreiro":[38.6630,-9.0720],
    "porto":[41.1579,-8.6291],"gaia":[41.1240,-8.6110],"matosinhos":[41.1820,-8.6890],"braga":[41.5454,-8.4265],
    "guimaraes":[41.4444,-8.2962],"viana do castelo":[41.6918,-8.8344],"vila real":[41.3006,-7.7441],"chaves":[41.7400,-7.4680],
    "braganca":[41.8061,-6.7567],"viseu":[40.6566,-7.9138],"lamego":[41.0975,-7.8100],"aveiro":[40.6405,-8.6538],
    "coimbra":[40.2033,-8.4103],"leiria":[39.7437,-8.8070],"fatima":[39.6162,-8.6740],"santarem":[39.2362,-8.6868],
    "caldas da rainha":[39.4030,-9.1350],"obidos":[39.3620,-9.1570],"peniche":[39.3560,-9.3810],"nazare":[39.6020,-9.0700],
    "alcobaca":[39.5520,-8.9770],"figueira da foz":[40.1500,-8.8620],"guarda":[40.5373,-7.2676],"covilha":[40.2811,-7.5044],
    "castelo branco":[39.8222,-7.4909],"evora":[38.5714,-7.9135],"beja":[38.0151,-7.8632],"portalegre":[39.2967,-7.4281],
    "faro":[37.0194,-7.9304],"portimao":[37.1386,-8.5376],"lagos":[37.1028,-8.6730],"albufeira":[37.0891,-8.2479],
    "funchal":[32.6669,-16.9241],"ponta delgada":[37.7394,-25.6687],"angra":[38.6550,-27.2180],
    "arruda dos vinhos":[38.9830,-9.0780],"paco de arcos":[38.6950,-9.2930],"parede":[38.6880,-9.3570],
    "benfica":[38.7510,-9.2030],"alvalade":[38.7530,-9.1440],"belem":[38.6970,-9.2060]
  };
  function haversineKm(a, b) {
    var toRad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toRad, dLon = (b[1] - a[1]) * toRad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }
  function restGeo(r) {
    if (typeof r.lat === "number" && typeof r.lon === "number") return [r.lat, r.lon];
    return null;
  }
  function gazLookup(txt) {
    var f = fold(txt), best = null;
    Object.keys(GAZ).forEach(function (k) {
      var hit = f === k || (" " + f + " ").indexOf(" " + k + " ") !== -1;
      if (hit && (!best || k.length > best.length)) best = k;
    });
    return best ? GAZ[best] : null;
  }
  function userGeo() {
    if (state.gps) return { pos: state.gps, label: "a tua posição", exact: true };
    var txt = (state.myLocation || "").trim();
    if (!txt) return null;
    var known = gazLookup(txt);
    if (known) return { pos: known, label: txt, exact: false, source: "lista de localidades" };
    // Nunca inventar uma coordenada a partir da média dos restaurantes encontrados.
    return null;
  }
  function decideBase() {
    return state.tab === "guardados"
      ? favIds.map(function (id) { return byId.get(id); }).filter(Boolean)
      : restaurants.filter(function (r) { return r.estado === "aberto"; });
  }
  function radiusPool(km) {
    var here = userGeo();
    if (!here) return null;
    var out = decideBase().filter(function (r) {
      var g = restGeo(r);
      return g && haversineKm(here.pos, g) <= km;
    });
    return out.length ? out : null;
  }

  function attrs(r) {
    var a = r && r.atributos || {};
    return {
      cozinhas: Array.isArray(a.cozinhas) ? a.cozinhas : [],
      ambientes: Array.isArray(a.ambientes) ? a.ambientes : [],
      ocasioes: Array.isArray(a.ocasioes) ? a.ocasioes : [],
      caracteristicas: Array.isArray(a.caracteristicas) ? a.caracteristicas : []
    };
  }
  function attrHas(r, group, value) { return attrs(r)[group].indexOf(value) !== -1; }
  function attrLabelList(r) {
    var a = attrs(r), out = [];
    a.cozinhas.slice(0,3).forEach(function(x){ if(out.indexOf(x)===-1) out.push(x); });
    a.ambientes.slice(0,2).forEach(function(x){ if(out.indexOf(x)===-1) out.push(x); });
    return out;
  }

  var DECIDE_MOODS = [
    { id: "peixe", label: "Peixe" },
    { id: "marisco", label: "Marisco" },
    { id: "carne", label: "Carne / grelhados" },
    { id: "petiscos", label: "Petiscos" },
    { id: "classico", label: "Português clássico" },
    { id: "romantico", label: "Romântico" },
    { id: "familiar", label: "Família" },
    { id: "grupo", label: "Grupo" },
    { id: "contemporaneo", label: "Contemporâneo" },
    { id: "casual", label: "Casual" },
    { id: "qualquer", label: "Tanto faz" }
  ];
  var MOOD_WORDS = {
    peixe: ["peixe","bacalhau","polvo","sopa de","cataplana","robalo","dourada","sardinha","pescada"],
    marisco: ["marisco","ameijoa","amêijoa","lagosta","lavagante","sapateira","percebe","marisqueira","camarão","gamba"],
    carne: ["carne","porco","cabrito","vitela","novilho","grelhad","churrasc","frango","javali","posta","bife","prego","costeleta","leitão"],
    petiscos: ["petisco","tasco","taberna","petiscos"],
    classico: ["clássico","classico","cozido","feijoada","francesinha","tripas","alentejan"]
  };
  function moodHay(r) {
    return fold([r.especialidade, r.tipo, r.nome, r.notas].filter(Boolean).join(" "));
  }
  function matchesMood(r, mood) {
    if (!mood || mood === "qualquer") return true;
    if (mood === "peixe" && attrHas(r, "cozinhas", "peixe")) return true;
    if (mood === "marisco" && attrHas(r, "cozinhas", "marisco")) return true;
    if (mood === "carne" && (attrHas(r, "cozinhas", "carne") || attrHas(r, "cozinhas", "grelhados"))) return true;
    if (mood === "petiscos" && attrHas(r, "cozinhas", "petiscos")) return true;
    if (mood === "classico" && (attrHas(r, "ambientes", "clássico") || r.tipo === "clássico")) return true;
    if (mood === "romantico" && attrHas(r, "ambientes", "romântico")) return true;
    if (mood === "familiar" && attrHas(r, "ambientes", "familiar")) return true;
    if (mood === "grupo" && attrHas(r, "ambientes", "grupo")) return true;
    if (mood === "contemporaneo" && (attrHas(r, "ambientes", "contemporâneo") || r.tipo === "date / contemporâneo" || r.tipo === "fine dining")) return true;
    if (mood === "casual" && attrHas(r, "ambientes", "casual")) return true;
    var words = MOOD_WORDS[mood] || [];
    var hay = moodHay(r);
    return words.some(function (w) { return hay.indexOf(fold(w)) !== -1; });
  }
  function dataQualityScore(r) {
    var score = 0;
    if (r.morada) score += 1;
    if (r.telefone) score += 1;
    if (r.website) score += 1;
    if (r.especialidade) score += 1;
    if (r.lat != null && r.lon != null) score += 1;
    if (r.fonte) score += 1;
    if (r.actualizado) score += 1;
    var a = attrs(r);
    if (a.cozinhas.length || a.ambientes.length || a.ocasioes.length || a.caracteristicas.length) score += 1;
    return score / 8;
  }
  function rankRestaurants(moods) {
    var here = userGeo();
    moods = moods || [];
    var need = moods.filter(function (m) { return m && m !== "qualquer"; });
    var base = decideBase();
    var candidates = base.map(function (r) {
      var g = restGeo(r);
      var km = (here && g) ? haversineKm(here.pos, g) : null;
      var hits = need.filter(function (m) { return matchesMood(r, m); });
      if (need.length && hits.length === 0) return null;
      return { r:r, km:km, hits:hits.length, need:need.length, quality:dataQualityScore(r), attributes:attrLabelList(r) };
    }).filter(Boolean);
    var withDistance = here ? candidates.filter(function(x){ return x.km != null; }) : [];
    var radiusUsed = null;
    if (here && withDistance.length) {
      var radii = [5, 15, 30];
      for (var i=0;i<radii.length;i++) {
        var pool = withDistance.filter(function(x){ return x.km <= radii[i]; });
        if (pool.length) { candidates = pool; radiusUsed = radii[i]; break; }
      }
    } else if (here) {
      candidates = [];
    }
    candidates.forEach(function(x){
      x.radius = radiusUsed;
      var fit = need.length ? x.hits / need.length : 1;
      var proximity = x.km == null ? 0.5 : Math.max(0, 1 - (x.km / (radiusUsed || RAIO_MAX_KM)));
      x.score = (fit * 0.65) + (proximity * 0.25) + (x.quality * 0.10);
    });
    return candidates.sort(function (a,b) {
      if (b.score !== a.score) return b.score-a.score;
      if (b.hits !== a.hits) return b.hits-a.hits;
      if (a.km != null && b.km != null && a.km !== b.km) return a.km-b.km;
      return String(a.r.nome).localeCompare(String(b.r.nome), 'pt');
    });
  }
  function rankedNearby(moods) { return rankRestaurants(moods); }
  function fmtKm(km) {
    return km < 1 ? "menos de 1 km" : Math.round(km) + " km";
  }

  // ---- Icons (inline SVG) ----
  var ICON = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    shuffle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    phone: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    globe: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    plate: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M5 12h2M17 12h2M12 5v2M12 17v2M7.2 7.2l1.4 1.4M15.4 15.4l1.4 1.4M16.8 7.2l-1.4 1.4M8.6 15.4l-1.4 1.4"/><path d="M4 4c2.2 1.2 3.4 3 3.4 5.2"/></svg>',
    info: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><circle cx="12" cy="7.3" r=".7" fill="currentColor" stroke="none"/></svg>',
    ambience: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20v-8M18 20v-8M4 12h16M8 12V7a4 4 0 0 1 8 0v5M5 20h14"/></svg>'
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- State ----
  var state = {
    tab: "lista",
    search: "",
    provincia: null,
    zona: null,
    tipo: null,
    cozinha: null,
    ambiente: null,
    ocasião: null,
    preco: null,
    focus: null, // { ids, label }
    selectedId: null,
    myLocation: loadLoc(),
    gps: null,
    gpsErro: false,
    decideOpen: false,
    decideMoods: [],
    lastDecideRanked: []
  };

  var app = document.getElementById("app");

  function currentFiltered() {
    return filterRestaurants({
      search: state.search,
      provincia: state.focus ? null : state.provincia,
      zona: state.focus ? null : state.zona,
      tipo: state.focus ? null : state.tipo,
      cozinha: state.focus ? null : state.cozinha,
      ambiente: state.focus ? null : state.ambiente,
      ocasião: state.focus ? null : state.ocasião,
      preco: state.focus ? null : state.preco,
      ids: state.focus ? state.focus.ids : null,
      includeUncertain: true
    });
  }

  function showingList() {
    return state.tab === "guardados" || Boolean(state.search.trim()) || Boolean(state.focus) || Boolean(state.provincia) || Boolean(state.tipo) || Boolean(state.cozinha) || Boolean(state.ambiente) || Boolean(state.ocasião) || Boolean(state.preco);
  }

  function clearFilters() {
    state.search = ""; state.provincia = null; state.zona = null; state.tipo = null; state.cozinha = null; state.ambiente = null; state.ocasião = null; state.preco = null; state.focus = null;
    syncUrl();
    render();
  }

  function selectProvincia(next) {
    state.focus = null; state.provincia = next; state.zona = null; state.tab = "lista";
    syncUrl();
    render();
  }

  function syncUrl() {
    try {
      var p = new URLSearchParams();
      if (state.search) p.set("q", state.search);
      if (state.provincia) p.set("provincia", state.provincia);
      if (state.zona) p.set("zona", state.zona);
      if (state.tipo) p.set("tipo", state.tipo);
      if (state.cozinha) p.set("cozinha", state.cozinha);
      if (state.ambiente) p.set("ambiente", state.ambiente);
      if (state.ocasião) p.set("ocasiao", state.ocasião);
      if (state.preco) p.set("preco", state.preco);
      if (state.tab === "guardados") p.set("tab", "guardados");
      var next = location.pathname + (p.toString() ? "?" + p.toString() : "");
      history.replaceState(null, "", next);
    } catch (e) {}
  }
  function restoreUrl() {
    try {
      var p = new URLSearchParams(location.search);
      state.search = p.get("q") || "";
      state.provincia = p.get("provincia") || null;
      state.zona = p.get("zona") || null;
      state.tipo = p.get("tipo") || null;
      state.cozinha = p.get("cozinha") || null;
      state.ambiente = p.get("ambiente") || null;
      state.ocasião = p.get("ocasiao") || null;
      state.preco = p.get("preco") || null;
      state.tab = p.get("tab") === "guardados" ? "guardados" : "lista";
    } catch (e) {}
  }

  function decide() {
    state.decideOpen = true;
    openDecideDrawer();
  }

  function applyMoods(moods) {
    moods = (moods || []).filter(function (m) { return m && m !== "qualquer"; });
    var ranked = rankedNearby(moods);
    if (!ranked.length) {
      state.selectedId = null;
      state.lastDecideRanked = [];
      renderDecideDrawer(moods, []);
      return;
    }
    state.lastDecideRanked = ranked.slice(0, 5);
    state.lastDecideKm = ranked[0].km;
    state.lastDecideMoods = moods;
    state.lastDecideHits = ranked[0].hits;
    openDrawer(ranked[0].r.id);
  }

  function cardHtml(r) {
    var fav = isFav(r.id);
    var tipoLabel = r.tipo ? (TIPO_LABEL[r.tipo] || r.tipo) : "";
    var photo = r.imagem || r.image || r.foto || '';
    return (
      '<li><article class="card" data-id="' + r.id + '">' +
        (photo ? '<button type="button" class="card-media has-photo" data-open="' + r.id + '" aria-label="Abrir ficha de ' + esc(r.nome) + '"><img src="' + esc(photo) + '" alt="" loading="lazy"></button>' : '<button type="button" class="card-media" data-open="' + r.id + '" aria-label="Abrir ficha de ' + esc(r.nome) + '"><span>10A</span></button>') +
        '<div class="card-content">' +
          '<div class="card-top">' +
            '<button type="button" class="card-main" data-open="' + r.id + '">' +
              '<div class="card-title-row"><h3 class="card-title">' + esc(r.nome) + '</h3>' +
                (tipoLabel ? '<span class="card-tipo">' + esc(tipoLabel) + '</span>' : '') +
              '</div>' +
              '<p class="card-place">' + esc(placeLine(r)) + '</p>' +
              (attrLabelList(r).length ? '<div class="attr-chips">' + attrLabelList(r).map(function(x){ return '<span class="attr-chip">'+esc(x)+'</span>'; }).join('') + '</div>' : '') +
              (r.estado === "incerto" ? '<p class="card-uncertain">Por confirmar</p>' : '') +
            '</button>' +
            '<button type="button" class="fav-btn' + (fav ? ' saved' : '') + '" data-fav="' + r.id + '" aria-label="Guardar">' + ICON.heart + '</button>' +
          '</div>' +
          '<div class="card-action-row"><button type="button" class="card-open" data-open="' + r.id + '">Ver ficha ' + ICON.chevron + '</button></div>' +
        '</div>' +
      '</article></li>'
    );
  }

  function mapsRowHtml(r, compact) {
    var l = mapsLinks(r);
    if (compact) return '<div class="btn-row maps map-single"><a href="' + l.google + '" target="_blank" rel="noopener noreferrer">Abrir no mapa</a></div>';
    return '<div class="btn-row maps">' +
      '<a href="' + l.google + '" target="_blank" rel="noopener noreferrer">Google Maps</a>' +
      '<a class="map-apple" href="' + l.apple + '" target="_blank" rel="noopener noreferrer">Apple Maps</a>' +
      '<a href="' + l.waze + '" target="_blank" rel="noopener noreferrer">Waze</a>' +
    '</div>';
  }

  function emptyHtml(title, body) {
    return '<div class="empty"><p class="title">' + esc(title) + '</p><p class="body">' + esc(body) + '</p></div>';
  }

  function regionIndexHtml() {
    var html = '<div class="region-grid">';
    REGION_GROUPS.forEach(function (group) {
      var rows = group.provincias.map(function (p) {
        var n = PROV_COUNTS.get(p) || 0;
        if (!n) return "";
        var active = state.provincia === p;
        return '<li><button type="button" class="region-row' + (active ? ' active' : '') + '" data-region="' + esc(p) + '">' +
          '<span class="name">' + esc(p) + '</span><span class="n">' + n + '</span></button></li>';
      }).join("");
      if (!rows) return;
      html += '<section class="region-group"><h2>' + esc(group.title) + '</h2><ul>' + rows + '</ul></section>';
    });
    html += '</div>';
    return html;
  }


  function attrValues(list, group) {
    var set = new Set();
    list.forEach(function(r){ attrs(r)[group].forEach(function(v){ set.add(v); }); });
    return Array.from(set).sort(function(a,b){ return a.localeCompare(b,"pt"); });
  }
  function filterAttrRow(label, key, group, list, selected) {
    var values = attrValues(list, group);
    if (values.length < 2) return "";
    var html = '<div class="filter-block"><span class="filter-label">' + esc(label) + '</span><div class="chip-row">';
    html += '<button type="button" class="chip' + (!selected ? ' active' : '') + '" data-' + key + '="">Todos</button>';
    values.forEach(function(v){ html += '<button type="button" class="chip' + (selected===v?' active':'') + '" data-' + key + '="' + esc(v) + '">' + esc(v) + '</button>'; });
    return html + '</div></div>';
  }
  function filterPriceRow(list) {
    var values = ["€","€€","€€€","€€€€"].filter(function(v){ return list.some(function(r){ return r.atributos && r.atributos.preco===v; }); });
    if (values.length < 2) return "";
    var html='<div class="filter-block"><span class="filter-label">Preço</span><div class="chip-row">';
    html += '<button type="button" class="chip' + (!state.preco?' active':'') + '" data-preco="">Todos</button>';
    values.forEach(function(v){ html += '<button type="button" class="chip' + (state.preco===v?' active':'') + '" data-preco="' + v + '">' + v + '</button>'; });
    return html+'</div></div>';
  }

  function listResultsHtml(list, zonas, tipos) {
    var html = '<div class="list-head"><p class="list-count"><b>' + list.length + '</b> ' + (list.length === 1 ? "sítio" : "sítios") +
      (state.provincia && !state.focus ? " · " + esc(state.provincia) : "") +
      (state.focus ? " · " + esc(state.focus.label) : "") +
      '</p><button type="button" class="clear-link" id="clear-btn">Limpar</button></div>';

    if (!state.focus && zonas.length > 1) {
      html += '<div class="chip-row">';
      html += '<button type="button" class="chip' + (!state.zona ? ' active' : '') + '" data-zona="">Todas as zonas</button>';
      zonas.forEach(function (z) {
        html += '<button type="button" class="chip' + (state.zona === z ? ' active' : '') + '" data-zona="' + esc(z) + '">' + esc(z) + '</button>';
      });
      html += '</div>';
    }
    if (!state.focus && tipos.length > 1) {
      html += '<div class="chip-row">';
      html += '<button type="button" class="chip' + (!state.tipo ? ' active' : '') + '" data-tipo="">Qualquer tipo</button>';
      tipos.forEach(function (t) {
        html += '<button type="button" class="chip' + (state.tipo === t ? ' active' : '') + '" data-tipo="' + esc(t) + '">' + esc(TIPO_LABEL[t] || t) + '</button>';
      });
      html += '</div>';
    }

    html += filterAttrRow("Cozinha", "cozinha", "cozinhas", list, state.cozinha);
    html += filterAttrRow("Ambiente", "ambiente", "ambientes", list, state.ambiente);
    html += filterAttrRow("Ocasião", "ocasião", "ocasioes", list, state.ocasião);
    html += filterPriceRow(list);

    if (!list.length) {
      html += emptyHtml("Nenhum sítio com isto", "Tenta outra terra, outro nome, ou limpa os filtros.");
    } else {
      html += '<ul class="cards">' + list.map(cardHtml).join("") + '</ul>';
    }
    return html;
  }

  function render(opts) {
    var total = openCount();
    var headerHtml =
      '<header role="banner"><div class="header-inner">' +
        '<div class="brand-lockup"><div class="brand-copy"><p class="brand-title">Porta 10A</p><p class="brand-sub">by ForumSCP</p></div><p class="count">' + total + ' sítios</p></div>' +
        '<div class="title-lockup"><h1 class="display">Porta-10A</h1><span class="title-rule" aria-hidden="true"></span></div>' +
        '<div class="search-wrap">' + ICON.search +
          '<input id="search" type="text" placeholder="Um sítio, uma terra, uma especialidade" value="' + esc(state.search) + '" aria-label="Procurar">' +
          '<button type="button" class="clear-search' + (state.search ? ' show' : '') + '" id="clear-search" aria-label="Limpar pesquisa">' + ICON.x + '</button>' +
        '</div>' +
        '<div class="loc-wrap">' + ICON.pin +
          '<input id="loc-input" type="text" placeholder="Onde estás? (opcional, ex: Barcelos, Almada…)" value="' + esc(state.myLocation) + '" aria-label="Onde estás">' +
          '<button type="button" class="clear-loc' + (state.myLocation ? ' show' : '') + '" id="clear-loc" aria-label="Limpar localização">' + ICON.x + '</button>' +
        '</div>' +
        (state.gps ? '<p class="loc-hint">«Decide por mim» começa perto da tua posição e alarga a procura se necessário.</p>' :
          (state.myLocation ? (gazLookup(state.myLocation) ? '<p class="loc-hint">Localidade reconhecida. «Decide por mim» usa essa referência para calcular proximidade.</p>' : '<p class="loc-hint">Localidade não reconhecida para cálculo de distância; a decisão continuará sem distância.</p>') : '<p class="loc-hint">Diz onde estás, ou usa a localização, para dar peso à proximidade.</p>')) +
        '<button type="button" class="gps-btn" id="gps-btn">' + (state.gps ? 'A usar a tua posição · desligar' : 'Usar a minha localização') + '</button>' +
        (state.gpsErro ? '<p class="loc-hint">Não deu para obter o GPS. Escreve a terra.</p>' : '') +
        '<button type="button" class="decide-btn" id="decide-btn">' + ICON.shuffle + ' Decide por mim</button>' +
        '<nav class="tabs" aria-label="Secções">' +
          ['lista:Sítios', 'guardados:Guardados'].map(function (pair) {
            var parts = pair.split(":"); var id = parts[0], label = parts[1];
            return '<button type="button" data-tab="' + id + '" class="' + (state.tab === id ? "active" : "") + '">' + label + '</button>';
          }).join("") +
        '</nav>' +
      '</div></header>';

    var mainHtml = '<main>';
    if (state.tab === "guardados") {
      var savedList = favIds.map(function (id) { return byId.get(id); }).filter(Boolean);
      if (!savedList.length) {
        mainHtml += emptyHtml("Nada guardado ainda", "O coração, na lista, fica nesta gaveta — para quando não apetece pensar.");
      } else {
        mainHtml += '<ul class="cards">' + savedList.map(cardHtml).join("") + '</ul>';
      }
    } else {
      if (showingList()) {
        var filtered = currentFiltered();
        var zonas = state.provincia ? zonasFor(state.provincia) : [];
        var tipos = tiposPresent(filtered);
        mainHtml += listResultsHtml(filtered, zonas, tipos);
      } else {
        mainHtml += '<section class="home-hero" aria-labelledby="home-title">' +
          '<div class="home-kicker"><span class="home-brand-dot" aria-hidden="true"></span> Porta 10A · by ForumSCP</div>' +
          '<h2 id="home-title">Boa mesa. Boas escolhas. À maneira do Fórum.</h2>' +
          '<p>Um guia de restaurantes feito pela comunidade ForumSCP. Explora por território, pesquisa um nome ou deixa o Guia escolher por ti.</p>' +
          '<div class="home-actions"><button type="button" class="home-primary" id="home-decide">' + ICON.shuffle + ' Decide por mim</button><button type="button" class="home-secondary" id="home-explore">Explorar por região</button></div>' +
        '</section>' + regionIndexHtml();
      }
    }
    mainHtml += '</main>' + '<footer class="site-footer"><strong>Porta 10A</strong> · by ForumSCP · restaurantes em Portugal</footer>';

    if (opts && opts.skipHeader && document.querySelector("header") && document.querySelector("main")) {
      document.querySelector("main").outerHTML = mainHtml;
      wireMainEvents();
      return;
    }
    app.innerHTML = headerHtml + mainHtml;
    wireEvents();
  }

  function wireEvents() {
    var searchEl = document.getElementById("search");
    if (searchEl) {
      searchEl.addEventListener("input", function (e) {
        state.search = e.target.value; state.focus = null; state.tab = "lista"; syncUrl();
        var clear = document.getElementById("clear-search");
        if (clear) clear.classList.toggle("show", Boolean(state.search));
        render({ skipHeader: true });
      });
    }
    var clearSearch = document.getElementById("clear-search");
    if (clearSearch) clearSearch.addEventListener("click", function () { state.search = ""; render(); document.getElementById("search").focus(); });

    var homeDecide = document.getElementById("home-decide");
    if (homeDecide) homeDecide.addEventListener("click", decide);
    var homeExplore = document.getElementById("home-explore");
    if (homeExplore) homeExplore.addEventListener("click", function(){ document.querySelector(".region-grid").scrollIntoView({behavior:"smooth", block:"start"}); });

    var decideBtn = document.getElementById("decide-btn");
    if (decideBtn) decideBtn.addEventListener("click", decide);

    var locEl = document.getElementById("loc-input");
    if (locEl) {
      locEl.addEventListener("input", function (e) {
        state.myLocation = e.target.value;
        state.gps = null; state.gpsErro = false;
        saveLoc(state.myLocation);
        var clear = document.getElementById("clear-loc");
        if (clear) clear.classList.toggle("show", Boolean(state.myLocation));
      });
    }
    var clearLoc = document.getElementById("clear-loc");
    if (clearLoc) clearLoc.addEventListener("click", function () {
      state.myLocation = ""; state.gps = null; state.gpsErro = false; saveLoc(""); render();
      var again = document.getElementById("loc-input");
      if (again) again.focus();
    });
    var gpsBtn = document.getElementById("gps-btn");
    if (gpsBtn) gpsBtn.addEventListener("click", function () {
      if (state.gps) { state.gps = null; render(); return; }
      if (!navigator.geolocation) { state.gpsErro = true; render(); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        state.gps = [pos.coords.latitude, pos.coords.longitude];
        state.gpsErro = false; state.myLocation = ""; saveLoc("");
        render();
      }, function () {
        state.gpsErro = true; render();
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-tab]"), function (btn) {
      btn.addEventListener("click", function () { state.tab = btn.getAttribute("data-tab"); syncUrl(); render(); });
    });

    wireMainEvents();
  }

  function wireMainEvents() {
    var clearBtn = document.getElementById("clear-btn");
    if (clearBtn) clearBtn.addEventListener("click", clearFilters);

    Array.prototype.forEach.call(document.querySelectorAll("[data-region]"), function (btn) {
      btn.addEventListener("click", function () {
        var p = btn.getAttribute("data-region");
        selectProvincia(state.provincia === p ? null : p);
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-zona]"), function (btn) {
      btn.addEventListener("click", function () {
        var chosen = btn.getAttribute("data-zona");
        state.zona = chosen === "" ? null : (state.zona === chosen ? null : chosen);
        syncUrl();
        render({ skipHeader: true });
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-tipo]"), function (btn) {
      btn.addEventListener("click", function () {
        var chosen = btn.getAttribute("data-tipo");
        state.tipo = chosen === "" ? null : (state.tipo === chosen ? null : chosen);
        syncUrl();
        render({ skipHeader: true });
      });
    });


    ["cozinha","ambiente","ocasião","preco"].forEach(function(key){
      Array.prototype.forEach.call(document.querySelectorAll("[data-" + key + "]"), function(btn){
        btn.addEventListener("click", function(){
          var value = btn.getAttribute("data-" + key);
          state[key] = value || null;
          state.tab = "lista";
          syncUrl();
          render({skipHeader:true});
        });
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-open]"), function (btn) {
      btn.addEventListener("click", function () { openDrawer(btn.getAttribute("data-open")); });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-fav]"), function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFav(btn.getAttribute("data-fav"));
        render({ skipHeader: true });
        if (state.selectedId != null) renderDrawer();
      });
    });

  }

  // ---- Drawer ----
  var overlay = document.getElementById("overlay");
  var drawer = document.getElementById("drawer");
  var drawerBody = document.getElementById("drawer-body");

  var lastFocused = null;
  function openDrawer(id) {
    lastFocused = document.activeElement;
    // data-open vem do HTML como string; a base guarda os IDs como números.
    // Normalizamos aqui para a ficha correta ser encontrada.
    var normalizedId = (typeof id === "string" && /^\d+$/.test(id)) ? Number(id) : id;
    state.selectedId = normalizedId;
    if (state.lastDecideRanked && state.lastDecideRanked.length && !state.lastDecideMoods) state.lastDecideRanked = [];
    renderDrawer();
    overlay.classList.add("open");
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    var close = document.getElementById("drawer-close");
    if (close) close.focus();
  }
  function closeDrawer(resetDecision) {
    overlay.classList.remove("open");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    state.selectedId = null;
    state.decideOpen = false;
    if (resetDecision !== false) {
      state.lastDecideKm = null;
      state.lastDecideMood = null;
      state.lastDecideMoods = null;
      state.lastDecideHits = null;
      state.lastDecideRanked = [];
      state.decideMoods = [];
    }
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  function openDecideDrawer() {
    state.selectedId = null;
    state.decideOpen = true;
    state.decideMoods = state.decideMoods || [];
    renderDecideDrawer(state.decideMoods, null);
    overlay.classList.add("open");
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    var close = document.getElementById("drawer-close");
    if (close) close.focus();
  }

  function renderDecideDrawer(moods, ranked) {
    var here = userGeo();
    moods = moods || state.decideMoods || [];
    var html = '<div class="drawer-top"><div class="min0"><h2 class="drawer-title" id="drawer-title">O que vos apetece?</h2>' +
      '<p class="drawer-place">' + (here
        ? 'Vários gostos: começo perto e alargo progressivamente até ' + RAIO_MAX_KM + ' km.'
        : 'Sem localização: procuro em todo o Guia, sem inventar distâncias.') +
      '</p></div><button type="button" class="close-x" id="drawer-close" aria-label="Fechar">' + ICON.x + '</button></div>';
    html += '<p class="drawer-notes">Podes marcar mais do que uma vontade (peixe e carne, por exemplo). ' +
      (here ? 'A proximidade desempata entre opções com a mesma adequação.' : 'Se quiseres proximidade, escreve uma localidade conhecida ou usa o GPS.') + '</p>';
    html += '<div class="mood-grid">';
    DECIDE_MOODS.forEach(function (m) {
      var on = moods.indexOf(m.id) !== -1;
      html += '<button type="button" class="mood-btn' + (on ? ' on' : '') + '" data-mood="' + m.id + '">' + esc(m.label) + '</button>';
    });
    html += '</div>';
    html += '<button type="button" class="decide-go" id="decide-go"' + (moods.length ? '' : ' disabled') + '>Encontrar mesa</button>';
    if (ranked && !ranked.length) {
      html += '<p class="drawer-notes">Nada a ' + RAIO_MAX_KM + ' km com essa combinação. Tira uma vontade ou escolhe «Tanto faz».</p>';
    }
    drawerBody.innerHTML = html;
    var closeBtn = document.getElementById("drawer-close");
    if (closeBtn) closeBtn.addEventListener("click", function(){ closeDrawer(); });
    Array.prototype.forEach.call(drawerBody.querySelectorAll("[data-mood]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-mood");
        var next = (state.decideMoods || []).slice();
        if (id === "qualquer") next = ["qualquer"];
        else {
          next = next.filter(function (x) { return x !== "qualquer"; });
          var i = next.indexOf(id);
          if (i === -1) next.push(id); else next.splice(i, 1);
        }
        state.decideMoods = next;
        renderDecideDrawer(next, null);
      });
    });
    var go = document.getElementById("decide-go");
    if (go) go.addEventListener("click", function () {
      applyMoods(state.decideMoods || []);
    });
  }

  overlay.addEventListener("click", closeDrawer);

  function renderDrawer() {
    var r = byId.get(state.selectedId);
    if (!r) { drawerBody.innerHTML = ""; return; }
    var fav = isFav(r.id);
    var tipoLabel = r.tipo ? (TIPO_LABEL[r.tipo] || r.tipo) : "";
    var html =
      '<div class="drawer-top">' +
        '<div class="min0"><h2 class="drawer-title" id="drawer-title">' + esc(r.nome) + '</h2>' +
          '<p class="drawer-place">' + esc(placeLine(r)) +
            (state.lastDecideKm != null ? ' · a ' + fmtKm(state.lastDecideKm) : '') +
            (state.lastDecideMoods && state.lastDecideMoods.length > 1
              ? ' · cobre ' + state.lastDecideHits + '/' + state.lastDecideMoods.filter(function(x){return x!=="qualquer";}).length + ' vontades'
              : '') + '</p></div><button type="button" class="close-x" id="drawer-close" aria-label="Fechar">' + ICON.x + '</button>' +
        '<button type="button" class="fav-btn' + (fav ? ' saved' : '') + '" id="drawer-fav" aria-label="Guardar">' + ICON.heart + '</button>' +
      '</div>' +
      '<div class="drawer-tags">' +
        (tipoLabel ? '<span class="tag">' + esc(tipoLabel) + '</span>' : '') +
        attrLabelList(r).map(function(x){ return '<span class="tag">' + esc(x) + '</span>'; }).join('') +
        (r.atributos && r.atributos.preco ? '<span class="tag">' + esc(r.atributos.preco) + '</span>' : '') +
        (r.estado === "incerto" ? '<span class="tag uncertain">Por confirmar</span>' : '') +
      '</div>' +
      '<div class="drawer-maps">' +
        mapsRowHtml(r) +
      '</div>' +
      (r.especialidade ? '<section class="drawer-section"><div class="drawer-section-icon">' + ICON.plate + '</div><div><h3>Especialidade</h3><p>' + esc(r.especialidade) + '</p></div></section>' : '') +
      (r.notas ? '<section class="drawer-section"><div class="drawer-section-icon">' + ICON.info + '</div><div><h3>Sobre</h3><p>' + esc(r.notas) + '</p></div></section>' : '') +
      ((r.atributos && r.atributos.ambientes && r.atributos.ambientes.length) ? '<section class="drawer-section"><div class="drawer-section-icon">' + ICON.ambience + '</div><div><h3>Ambiente</h3><p>' + esc(r.atributos.ambientes.join(' · ')) + '</p></div></section>' : '') +
      '<div class="drawer-address">' + (r.morada ? '<span>' + ICON.pin + '</span><p>' + esc(r.morada) + '</p>' : '<span>' + ICON.pin + '</span><p>Sem morada completa — o mapa pesquisa pelo nome e a terra.</p>') + '</div>' +
      (state.lastDecideMoods ? '<div class="recommendation"><strong>Sugestão do Guia</strong>' +
        (state.lastDecideMoods.length ? 'Combina com ' + esc(state.lastDecideMoods.map(function(m){ var x=DECIDE_MOODS.find(function(d){return d.id===m;}); return x ? x.label : m; }).join(' + ')) : 'Escolha livre') +
        (state.lastDecideHits != null && state.lastDecideMoods.length ? ' · corresponde a ' + state.lastDecideHits + ' de ' + state.lastDecideMoods.length : '') +
        (state.lastDecideKm != null ? ' · ' + fmtKm(state.lastDecideKm) : '') +
      '</div>' : '') +
      '<div class="contact-row' + ((r.telefone || r.website) ? '' : ' single') + '">' +
        (r.telefone ? '<a href="' + telHref(r.telefone) + '">' + ICON.phone + ' Ligar</a>' : '') +
        (r.website ? '<a href="' + websiteHref(r.website) + '" target="_blank" rel="noopener noreferrer">' + ICON.globe + ' Website</a>' : '') +
        (!r.telefone && !r.website ? '<span class="disabled">Contactos não disponíveis</span>' : '') +
      '</div>' +
      (r.fonte ? '<p class="data-note">Dados: ' + esc(r.fonte) + '.</p>' : '') +
      (state.lastDecideRanked && state.lastDecideRanked.length > 1 ? '<div class="alternatives"><p class="row-label">Outras opções</p>' +
        state.lastDecideRanked.slice(1).map(function(x){ return '<button type="button" class="alternative" data-alt="' + x.r.id + '"><span class="alternative-title">' + esc(x.r.nome) + '</span><span class="alternative-meta">' + esc(placeLine(x.r)) + (x.km != null ? ' · ' + fmtKm(x.km) : '') + '</span></button>'; }).join('') +
      '</div>' : '');
    drawerBody.innerHTML = html;
    var closeBtn = document.getElementById("drawer-close");
    if (closeBtn) closeBtn.addEventListener("click", function(){ closeDrawer(); });
    Array.prototype.forEach.call(drawerBody.querySelectorAll("[data-alt]"), function(btn){
      btn.addEventListener("click", function(){
        state.lastDecideRanked = [];
        openDrawer(btn.getAttribute("data-alt"));
      });
    });
    var favBtn = document.getElementById("drawer-fav");
    if (favBtn) favBtn.addEventListener("click", function () { toggleFav(r.id); renderDrawer(); render({ skipHeader: true }); });
  }

  document.addEventListener("keydown", function (e) {
    if (!drawer.classList.contains("open")) return;
    if (e.key === "Escape") { closeDrawer(); return; }
    if (e.key === "Tab") {
      var focusables = drawer.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  restoreUrl();
  render();
  } catch (error) {
    console.error(error);
    var app = document.getElementById("app");
    if (app) {
      var local = window.location.protocol === "file:";
      app.innerHTML = '<main class="fatal-error">' +
        '<div class="fatal-kicker">Porta 10A · by ForumSCP</div>' +
        '<h1>O Guia não conseguiu carregar.</h1>' +
        '<p>' + (local
          ? 'Estás a abrir o index.html diretamente do computador. Como os restaurantes vivem num ficheiro JSON separado, o navegador bloqueia esse acesso por segurança.'
          : 'Não foi possível carregar a base de restaurantes.') + '</p>' +
        (local
          ? '<div class="fatal-code"><strong>Para testar no Mac</strong><br>Abre o ficheiro <code>start.command</code> que está na pasta do projeto.</div>'
          : '<p class="fatal-code">Verifica se <code>data/restaurantes.json</code> está publicado e acessível.</p>') +
        '<button type="button" class="fatal-retry" onclick="location.reload()">Tentar novamente</button>' +
      '</main>';
    }
  }
})();
