/**
 * geoApi.js
 * ---------------------------------------------------------------------------
 * Bibliotheque "Rest GeoAPI" du moteur de federation (chapitre 6, section 3).
 *
 * "La bibliotheque GeoAPI est responsable de l'etablissement des connexions
 *  vers les donnees distantes resultant des operations de recherche. Elle
 *  expose des fonctions principales telles que read_geojson(chemin_fichier,
 *  authentification), read_shapefile(chemin_fichier, authentification),
 *  read_csv(chemin_fichier, authentification) et read_postgres(utilisateur,
 *  mot_de_passe, base, table, colonne_geometrie, attributs), chacune
 *  retournant un GeoDataset structure au format GeoJSON."
 *
 * Chaque fonction retourne systematiquement une FeatureCollection GeoJSON,
 * quel que soit le format de la source - c'est cette normalisation qui
 * permet au Viewer de la couche presentation de rester independant du
 * format d'origine des donnees (section 3, chapitre 6).
 *
 * Gestion des erreurs (tableau 9 de la these) : chaque fonction leve une
 * erreur typee (ERR_FICHIER_INTROUVABLE, ERR_FORMAT_INVALIDE,
 * ERR_CONNEXION_BASE, ERR_AUTHENTIFICATION) que le Builder intercepte pour
 * degrader proprement l'experience utilisateur (section 5, chapitre 6)
 * plutot que de faire echouer l'ensemble de la reponse.
 */

const fs = require("fs");
const path = require("path");
const shapefile = require("shapefile");
const { parse: parseCsv } = require("csv-parse/sync");
const { Client: PgClient } = require("pg");

// Repertoire racine ou sont recherches les fichiers references par les
// metadonnees (chemin relatif "fichier" du ConfigDescriptor). A adapter en
// production a l'emplacement reel des donnees institutionnelles.
const REPERTOIRE_DONNEES = process.env.GEOFED_DATA_DIR || path.join(__dirname, "..", "sample-datasets");

class GeoApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GeoApiError";
    this.code = code;
  }
}

function resoudreChemin(cheminFichier) {
  const chemin = path.isAbsolute(cheminFichier) ? cheminFichier : path.join(REPERTOIRE_DONNEES, cheminFichier);
  if (!fs.existsSync(chemin)) {
    throw new GeoApiError("ERR_FICHIER_INTROUVABLE", `Fichier introuvable : ${cheminFichier}`);
  }
  return chemin;
}

/**
 * read_geojson(chemin_fichier, authentification)
 * Lit un fichier GeoJSON local et le retourne tel quel (deja au format cible).
 */
async function read_geojson(cheminFichier, _authentification) {
  const chemin = resoudreChemin(cheminFichier);
  try {
    const contenu = JSON.parse(fs.readFileSync(chemin, "utf-8"));
    if (contenu.type !== "FeatureCollection") {
      throw new GeoApiError("ERR_FORMAT_INVALIDE", "Le fichier ne contient pas de FeatureCollection GeoJSON valide");
    }
    return contenu;
  } catch (err) {
    if (err instanceof GeoApiError) throw err;
    throw new GeoApiError("ERR_FORMAT_INVALIDE", `GeoJSON illisible (${err.message})`);
  }
}

/**
 * read_shapefile(chemin_fichier, authentification)
 * Lit un fichier .shp (avec son .dbf associe de meme nom) et le convertit
 * en FeatureCollection GeoJSON via la bibliotheque `shapefile`.
 */
async function read_shapefile(cheminFichier, _authentification) {
  const cheminShp = resoudreChemin(cheminFichier);
  const cheminDbf = cheminShp.replace(/\.shp$/i, ".dbf");

  try {
    const source = await shapefile.open(cheminShp, fs.existsSync(cheminDbf) ? cheminDbf : undefined);
    const features = [];
    let resultat = await source.read();
    while (!resultat.done) {
      features.push(resultat.value);
      resultat = await source.read();
    }
    return { type: "FeatureCollection", features };
  } catch (err) {
    throw new GeoApiError("ERR_FORMAT_INVALIDE", `Shapefile illisible (${err.message})`);
  }
}

/**
 * read_csv(chemin_fichier, authentification)
 * Lit un fichier CSV comportant des colonnes latitude/longitude et le
 * convertit en FeatureCollection GeoJSON de points. Les noms de colonnes
 * de coordonnees acceptes sont configurables via colonnesCoord.
 */
async function read_csv(cheminFichier, _authentification, colonnesCoord = { lat: "latitude", lon: "longitude" }) {
  const chemin = resoudreChemin(cheminFichier);
  try {
    const lignes = parseCsv(fs.readFileSync(chemin, "utf-8"), { columns: true, skip_empty_lines: true });
    const features = lignes.map((ligne) => {
      const { [colonnesCoord.lat]: lat, [colonnesCoord.lon]: lon, ...proprietes } = ligne;
      return {
        type: "Feature",
        properties: proprietes,
        geometry: { type: "Point", coordinates: [parseFloat(lon), parseFloat(lat)] },
      };
    });
    return { type: "FeatureCollection", features };
  } catch (err) {
    throw new GeoApiError("ERR_FORMAT_INVALIDE", `CSV illisible (${err.message})`);
  }
}

/**
 * read_postgres(utilisateur, mot_de_passe, base, table, colonne_geometrie, attributs)
 * Se connecte a une base PostgreSQL/PostGIS institutionnelle et retourne
 * les enregistrements de la table indiquee sous forme de FeatureCollection,
 * via la fonction native PostGIS ST_AsGeoJSON.
 *
 * NB - ce prototype documente la connexion reelle a un serveur institutionnel
 * distant (aucun transit par un serveur tiers, conformement au chapitre 6).
 * Elle n'a pas ete executee dans l'environnement de demonstration (qui ne
 * deploie pas de serveur PostgreSQL) ; se referer a l'annexe / README pour
 * la configuration d'un serveur PostGIS de test.
 */
async function read_postgres(utilisateur, mot_de_passe, base, table, colonne_geometrie, attributs, hote = "localhost", port = 5432) {
  const client = new PgClient({ user: utilisateur, password: mot_de_passe, database: base, host: hote, port });

  try {
    await client.connect();
  } catch (err) {
    throw new GeoApiError("ERR_CONNEXION_BASE", `Connexion PostgreSQL impossible (${err.message})`);
  }

  try {
    const listeAttributs = (attributs && attributs.length ? attributs : []).map((a) => `"${a}"`).join(", ");
    const requete = `
      SELECT ${listeAttributs ? listeAttributs + "," : ""}
             ST_AsGeoJSON("${colonne_geometrie}") AS geometrie_json
      FROM "${table}"
    `;
    const resultat = await client.query(requete);

    const features = resultat.rows.map((ligne) => {
      const { geometrie_json, ...proprietes } = ligne;
      return { type: "Feature", properties: proprietes, geometry: JSON.parse(geometrie_json) };
    });
    return { type: "FeatureCollection", features };
  } catch (err) {
    if (/password authentication failed/i.test(err.message)) {
      throw new GeoApiError("ERR_AUTHENTIFICATION", "Authentification PostgreSQL refusee");
    }
    throw new GeoApiError("ERR_CONNEXION_BASE", `Requete PostgreSQL echouee (${err.message})`);
  } finally {
    await client.end();
  }
}

module.exports = { GeoApiError, read_geojson, read_shapefile, read_csv, read_postgres };
