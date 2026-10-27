/**
 * builder.js
 * ---------------------------------------------------------------------------
 * Composant "Builder" du moteur de federation (chapitre 6, section 3).
 *
 * "Le Builder ... consomme [le ConfigDescriptor] pour instancier le
 *  processus d'orchestration de la federation de donnees. En parcourant
 *  chaque entree du ConfigDescriptor, le Builder invoque dynamiquement
 *  l'API GeoAPI correspondante ... afin de construire la variable
 *  GeoConfigFederation, qui rassemble les entrees individuelles
 *  representant les jeux de donnees geographiques recuperes."
 *
 * Le Builder incorpore egalement les mecanismes de gestion d'erreur decrits
 * section 5 du chapitre 6 : une ressource indisponible ne fait pas echouer
 * l'ensemble de la reponse, elle est simplement signalee comme telle dans
 * la variable GeoConfigFederation.
 */

const geoApi = require("./geoApi");

/**
 * Invoque, pour une entree du ConfigDescriptor, la fonction GeoAPI adaptee
 * a son type_source (voir tableau de correspondance chapitre 6, section 3).
 */
async function invoquerGeoApi(entree) {
  const { type_source, connexion } = entree;

  switch (type_source) {
    case "geojson":
      return geoApi.read_geojson(connexion.fichier, connexion.authentification);

    case "shapefile":
      return geoApi.read_shapefile(connexion.fichier, connexion.authentification);

    case "csv":
      return geoApi.read_csv(connexion.fichier, connexion.authentification);

    case "database": {
      // Convention de ce prototype : authentification = "utilisateur:mot_de_passe"
      const [utilisateur, mot_de_passe] = (connexion.authentification || "geofed:geofed").split(":");
      return geoApi.read_postgres(
        utilisateur,
        mot_de_passe,
        connexion.base,
        connexion.table,
        connexion.colonne_geometrie,
        connexion.attributs || []
      );
    }

    default:
      throw new geoApi.GeoApiError("ERR_FORMAT_INVALIDE", `type_source non pris en charge par la bibliotheque GeoAPI : ${type_source}`);
  }
}

/**
 * builder(configDescriptor) : construit la variable GeoConfigFederation.
 * @param {object} configDescriptor - { resultats: [ {identifier, titre, type_source, connexion}, ... ] }
 * @returns {Promise<object>} { entrees: [ {identifier, titre, type_source, statut, geojson|erreur}, ... ] }
 */
async function builder(configDescriptor) {
  const entrees = [];

  for (const entree of configDescriptor.resultats) {
    try {
      const geojson = await invoquerGeoApi(entree);
      entrees.push({
        identifier: entree.identifier,
        titre: entree.titre,
        type_source: entree.type_source,
        champsCanoniques: entree.champsCanoniques,
        statut: "disponible",
        geojson,
      });
    } catch (err) {
      // Gestion d'erreur du Builder (chapitre 6, section 5) : la ressource
      // indisponible est signalee, sans interrompre le traitement des
      // autres entrees du ConfigDescriptor.
      entrees.push({
        identifier: entree.identifier,
        titre: entree.titre,
        type_source: entree.type_source,
        champsCanoniques: entree.champsCanoniques,
        statut: "indisponible",
        erreur: { code: err.code || "ERR_INCONNUE", message: err.message },
      });
    }
  }

  return { entrees };
}

module.exports = { builder };
