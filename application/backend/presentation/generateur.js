/**
 * generateur.js
 * ---------------------------------------------------------------------------
 * Module "Generateur" de la couche presentation (chapitre 6, section 4).
 *
 * "Le visualisateur ... se compose de deux modules : un Generateur, qui
 *  recoit la variable GeoConfigFederation en entree et parcourt ses
 *  entrees, et un Viewer, charge de l'affichage des couches geographiques
 *  resultantes. Pour chaque entree de la variable GeoConfigFederation, le
 *  Generateur produit dynamiquement un objet GeoJSON correspondant ...
 *  si la variable GeoConfigFederation contient n entrees, le Viewer
 *  affichera n couches geographiques distinctes."
 *
 * Le Generateur est le dernier maillon cote serveur : il met en forme les
 * entrees de la GeoConfigFederation pour une consommation directe par le
 * Viewer Leaflet cote client (couleur de couche, popup de metadonnees,
 * message d'indisponibilite le cas echeant).
 */

const PALETTE = ["#2E5FA3", "#D85A30", "#0F6E56", "#8E5FA3", "#C99A2E"];

/**
 * generer(geoConfigFederation) : produit la liste des couches a afficher.
 * @param {object} geoConfigFederation - { entrees: [...] } produit par le Builder
 * @returns {object} { couches: [ {identifier, titre, couleur, geojson, metadonnees} ] }
 */
function generer(geoConfigFederation) {
  const couches = geoConfigFederation.entrees.map((entree, index) => ({
    identifier: entree.identifier,
    titre: entree.titre,
    type_source: entree.type_source,
    statut: entree.statut,
    couleur: PALETTE[index % PALETTE.length],
    // Le Viewer affiche un popup de metadonnees au clic droit sur une
    // entite : les 13 champs canoniques (Identifier, Title, Description,
    // Keywords, Creator, Publisher, Date created/issued/modified,
    // Resource type, Rights, Spatial coverage, Distribution link) lui
    // sont fournis directement ici, evitant un aller-retour reseau
    // supplementaire au moment de l'interaction.
    metadonnees: entree.champsCanoniques || { identifier: entree.identifier, title: entree.titre },
    geojson: entree.statut === "disponible" ? entree.geojson : null,
    erreur: entree.erreur || null,
  }));

  return { couches };
}

module.exports = { generer };
