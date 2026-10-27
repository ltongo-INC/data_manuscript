/**
 * app.js
 * ---------------------------------------------------------------------------
 * Logique cote client de la couche presentation du prototype GeoFederation.
 * Regroupe : initialisation du Viewer (Leaflet), outils de la carte
 * (bascule OSM/satellite, mesure de distance, echelle), gestion du
 * formulaire de metadonnees (Inserer / Rechercher) et du panneau de
 * resultats a droite (cases a cocher pilotant l'affichage des couches).
 */

const API = ""; // meme origine (server.js sert aussi le frontend) ; sinon "http://localhost:4000"

// =============================================================================
// 1. Initialisation du Viewer
// =============================================================================
const viewer = L.map("viewer", { zoomControl: true }).setView([3.848, 11.518], 15);

const fondOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© contributeurs OpenStreetMap",
  maxZoom: 19,
});

const fondSatellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Esri World Imagery", maxZoom: 19 }
);

fondOSM.addTo(viewer);
let modeSatellite = false;

// --- Controle Leaflet personnalise : bascule OSM / satellite ---------------
const ControleBascule = L.Control.extend({
  options: { position: "topleft" },
  onAdd() {
    const icone = L.DomUtil.create("div", "outil-viewer");
    icone.innerHTML = "🛰️";
    icone.title = "Basculer fond de carte OSM / Satellite";
    L.DomEvent.disableClickPropagation(icone);
    icone.addEventListener("click", () => {
      modeSatellite = !modeSatellite;
      if (modeSatellite) {
        viewer.removeLayer(fondOSM);
        fondSatellite.addTo(viewer);
        icone.classList.add("actif");
      } else {
        viewer.removeLayer(fondSatellite);
        fondOSM.addTo(viewer);
        icone.classList.remove("actif");
      }
    });
    return icone;
  },
});
viewer.addControl(new ControleBascule());

// --- Controle Leaflet personnalise : mesure de distance ---------------------
let mesureActive = false;
let pointsMesure = [];
let ligneMesure = null;
let etiquetteMesure = null;

function reinitialiserMesure() {
  pointsMesure = [];
  if (ligneMesure) { viewer.removeLayer(ligneMesure); ligneMesure = null; }
  if (etiquetteMesure) { viewer.removeLayer(etiquetteMesure); etiquetteMesure = null; }
}

function clicMesure(e) {
  pointsMesure.push(e.latlng);
  if (ligneMesure) viewer.removeLayer(ligneMesure);
  ligneMesure = L.polyline(pointsMesure, { color: "#D85A30", weight: 3 }).addTo(viewer);

  let distanceTotale = 0;
  for (let i = 1; i < pointsMesure.length; i++) {
    distanceTotale += pointsMesure[i - 1].distanceTo(pointsMesure[i]); // metres, formule Leaflet (haversine)
  }
  const texte = distanceTotale >= 1000 ? `${(distanceTotale / 1000).toFixed(2)} km` : `${distanceTotale.toFixed(0)} m`;

  if (etiquetteMesure) viewer.removeLayer(etiquetteMesure);
  etiquetteMesure = L.marker(pointsMesure[pointsMesure.length - 1], {
    icon: L.divIcon({ className: "", html: `<div style="background:white;padding:2px 6px;border-radius:4px;font-size:12px;box-shadow:0 1px 3px rgba(0,0,0,.4)">${texte}</div>` }),
  }).addTo(viewer);
}

const ControleMesure = L.Control.extend({
  options: { position: "topleft" },
  onAdd() {
    const icone = L.DomUtil.create("div", "outil-viewer");
    icone.innerHTML = "📏";
    icone.title = "Mesurer une distance (clic pour ajouter des points, ré-activer pour effacer)";
    L.DomEvent.disableClickPropagation(icone);
    icone.addEventListener("click", () => {
      mesureActive = !mesureActive;
      icone.classList.toggle("actif", mesureActive);
      if (mesureActive) {
        reinitialiserMesure();
        viewer.on("click", clicMesure);
      } else {
        viewer.off("click", clicMesure);
      }
    });
    return icone;
  },
});
viewer.addControl(new ControleMesure());

// --- Echelle native Leaflet --------------------------------------------------
L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(viewer);

// =============================================================================
// 2. Gestion des couches affichees (resultat de recherche <-> Viewer)
// =============================================================================
const couchesLeaflet = {}; // identifier -> instance L.geoJSON actuellement sur la carte

/**
 * Cree la couche Leaflet d'une entree de resultat et l'ajoute au Viewer.
 * Attache un gestionnaire de clic droit (contextmenu) sur chaque entite,
 * qui ouvre un popup affichant les informations de metadonnees associees.
 */
function afficherCouche(couche) {
  if (!couche.geojson) return;

  const style = () => ({ color: couche.couleur, weight: 3, fillColor: couche.couleur, fillOpacity: 0.35 });

  const layer = L.geoJSON(couche.geojson, {
    style,
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 6, color: couche.couleur, fillColor: couche.couleur, fillOpacity: 0.8 }),
    onEachFeature: (feature, leafletLayer) => {
      leafletLayer.on("contextmenu", (e) => {
        e.originalEvent.preventDefault();
        const proprietesEntite = feature.properties || {};
        const lignesMeta = Object.entries(couche.metadonnees)
          .filter(([, val]) => val !== undefined && val !== null && val !== "")
          .map(([cle, val]) => `<tr><td class="cle">${cle}</td><td>${val}</td></tr>`).join("");
        const lignesAttr = Object.entries(proprietesEntite)
          .map(([cle, val]) => `<tr><td class="cle">${cle}</td><td>${val}</td></tr>`).join("");

        L.popup()
          .setLatLng(e.latlng)
          .setContent(
            `<div class="popup-metadonnees">
               <h3>Métadonnées</h3>
               <table>${lignesMeta}</table>
               <h3>Attributs de l'entité</h3>
               <table>${lignesAttr}</table>
             </div>`
          )
          .openOn(viewer);
      });
    },
  });

  couchesLeaflet[couche.identifier] = layer;
  layer.addTo(viewer);
}

function masquerCouche(identifier) {
  if (couchesLeaflet[identifier]) {
    viewer.removeLayer(couchesLeaflet[identifier]);
    delete couchesLeaflet[identifier];
  }
}

/**
 * Construit le panneau de resultats (colonne de droite) a partir de la
 * reponse de l'orchestration /api/rechercher (Parser -> Builder -> Generateur).
 * Chaque resultat est precede d'une case a cocher pilotant son affichage
 * sur le Viewer.
 */
function afficherResultats(couches) {
  const liste = document.getElementById("liste-resultats");
  liste.innerHTML = "";

  // Toute nouvelle recherche retire les couches precedemment affichees.
  Object.keys(couchesLeaflet).forEach(masquerCouche);

  if (couches.length === 0) {
    liste.innerHTML = "<li>Aucun résultat.</li>";
    return;
  }

  couches.forEach((couche) => {
    const item = document.createElement("li");
    if (couche.statut === "indisponible") item.classList.add("indisponible");

    const caseACocher = document.createElement("input");
    caseACocher.type = "checkbox";
    caseACocher.disabled = couche.statut === "indisponible";
    caseACocher.addEventListener("change", () => {
      if (caseACocher.checked) afficherCouche(couche);
      else masquerCouche(couche.identifier);
    });

    const puce = document.createElement("span");
    puce.className = "puce-couleur";
    puce.style.background = couche.couleur;

    const texte = document.createElement("div");
    texte.innerHTML = `<strong>${couche.titre}</strong><br/><small>${couche.type_source}${couche.statut === "indisponible" ? " — indisponible" : ""}</small>`;

    item.append(caseACocher, puce, texte);
    liste.appendChild(item);
  });
}

// =============================================================================
// 3. Formulaire de métadonnées (Insérer / Rechercher)
// =============================================================================
const formulaire = document.getElementById("formulaire-metadonnees");
const messageFormulaire = document.getElementById("message-formulaire");

/** Affiche/masque les groupes de champs de connexion selon le type de source. */
function ajusterChampsConnexion() {
  const type = formulaire.typeSource.value;
  document.querySelectorAll("[data-groupe-connexion]").forEach((groupe) => {
    const correspond = groupe.dataset.groupeConnexion === "database" ? type === "database" : type !== "database";
    groupe.style.display = correspond ? "flex" : "none";
  });
}
formulaire.typeSource.addEventListener("change", ajusterChampsConnexion);
ajusterChampsConnexion();

/**
 * Construit l'objet metadata attendu par GS-DIRECTORY.insererNoeud à partir
 * des champs du formulaire, en reconstituant les sections canoniques a
 * partir de la notation pointee des attributs `name` ("idinfo.title" ->
 * { idinfo: { title: ... } }). Les 13 champs canoniques (Identifier,
 * Title, Description, Keywords, Creator, Publisher, Date created, Date
 * issued, Date modified, Resource type, Rights, Spatial coverage,
 * Distribution link) correspondent exactement a la colonne "Canonical
 * Field" de la table de correspondance ISO 19115 / CSDGM / Dublin Core.
 */
function construireObjetMetadata() {
  const donnees = new FormData(formulaire);
  const metadata = { identifier: donnees.get("identifier"), typeSource: donnees.get("typeSource") };

  for (const [nomChamp, valeur] of donnees.entries()) {
    if (!valeur || nomChamp === "identifier" || nomChamp === "typeSource") continue;
    const [section, attribut] = nomChamp.split(".");
    if (!attribut) continue;
    metadata[section] = metadata[section] || {};
    metadata[section][attribut] = valeur;
  }

  // Le champ Identifier est saisi une seule fois (il pilote aussi le DN),
  // mais il est egalement duplique comme feuille canonique idinfo.identifier
  // pour rester consultable au meme titre que les 12 autres champs.
  metadata.idinfo = metadata.idinfo || {};
  metadata.idinfo.identifier = metadata.identifier;

  metadata.titre = metadata.idinfo.title || metadata.identifier;
  return metadata;
}

// --- Bouton "Inserer" : ecriture dans l'annuaire (POST /api/semantic/noeud) --
document.getElementById("btn-inserer").addEventListener("click", async (e) => {
  e.preventDefault();
  const metadata = construireObjetMetadata();
  if (!metadata.identifier) { messageFormulaire.textContent = "Identifiant requis."; return; }

  messageFormulaire.textContent = "Insertion en cours…";
  try {
    const reponse = await fetch(`${API}/api/semantic/noeud`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    if (!reponse.ok) throw new Error((await reponse.json()).erreur || "échec de l'insertion");
    messageFormulaire.textContent = "Métadonnée insérée dans l'annuaire.";
  } catch (err) {
    messageFormulaire.textContent = `Erreur : ${err.message}`;
  }
});

// --- Bouton "Rechercher" : lecture (GET /api/rechercher -> Parser->Builder->Generateur) --
document.getElementById("btn-rechercher").addEventListener("click", async () => {
  const critere = formulaire.querySelector('[name="idinfo.title"]').value || formulaire.identifier.value || "";
  messageFormulaire.textContent = "Recherche en cours…";
  try {
    const reponse = await fetch(`${API}/api/rechercher?critere=${encodeURIComponent(critere)}`);
    const { couches } = await reponse.json();
    afficherResultats(couches);
    messageFormulaire.textContent = `${couches.length} résultat(s).`;
  } catch (err) {
    messageFormulaire.textContent = `Erreur : ${err.message}`;
  }
});

// =============================================================================
// 4. Initialisation : racine de l'annuaire affichée dans l'en-tête
// =============================================================================
fetch(`${API}/api/semantic/racine`)
  .then((r) => r.json())
  .then(({ racine }) => { document.getElementById("racine-annuaire").textContent = `Racine du catalogue : ${racine}`; })
  .catch(() => { document.getElementById("racine-annuaire").textContent = "Racine du catalogue : indisponible"; });
