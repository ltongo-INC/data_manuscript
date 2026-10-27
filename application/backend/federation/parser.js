/**
 * parser.js
 * ---------------------------------------------------------------------------
 * Composant "Parser" du moteur de federation (chapitre 6, section 2).
 *
 * "Le composant d'analyse syntaxique (parser) facilite les operations
 *  d'interrogation au sein de l'annuaire de metadonnees replique et
 *  recupere le resultat correspondant a la requete soumise. Sur la base
 *  de ce resultat, il genere une variable de configuration au format
 *  JSON - denommee ConfigDescriptor."
 *
 * Le Parser s'appuie sur la facade GS-DIRECTORY (rechercherNoeud) pour
 * interroger l'annuaire, puis reconstruit, a partir de la sous-arborescence
 * Noeud/Feuille retournee, les parametres de connexion necessaires a la
 * recuperation effective du jeu de donnees (section distinfo), au format
 * exact illustre au chapitre 6, section 4 de la these.
 */

const gsDirectory = require("../semantic/gsDirectory");

/**
 * Extrait, a partir de la sous-arborescence LDAP plate (sousArbre) d'une
 * entree METADATA, les feuilles d'une section canonique donnee sous la
 * forme d'un objet cle/valeur { nomFeuille: valeurFeuille }.
 */
function extraireSection(sousArbre, dnRacine, nomSection) {
  const dnSection = `cn=${nomSection},${dnRacine}`;
  const feuilles = sousArbre.filter((e) => e.dn.endsWith(`,${dnSection}`) && e.objectClass && e.objectClass.includes && e.objectClass.includes("Feuille"));
  // objectClass peut etre une chaine unique ou un tableau selon ldapjs
  const estFeuille = (e) => {
    const oc = e.objectClass;
    return Array.isArray(oc) ? oc.includes("Feuille") : oc === "Feuille";
  };
  const resultat = {};
  for (const e of sousArbre) {
    if (e.dn.endsWith(`,${dnSection}`) && estFeuille(e)) {
      resultat[e.cn] = e.valeurFeuille;
    }
  }
  return resultat;
}

/**
 * Construit l'entree "connexion" du ConfigDescriptor a partir de la
 * section distinfo et du typeSource porte par l'entree METADATA racine.
 * Reproduit le format illustre chapitre 6 section 4 (exemple PostgreSQL)
 * et l'etend, selon le meme principe, aux sources geojson / shapefile / csv.
 */
function construireConnexion(typeSource, distinfo) {
  switch (typeSource) {
    case "database":
      return {
        hote: distinfo.hote,
        base: distinfo.base,
        table: distinfo.table,
        colonne_geometrie: distinfo.colonneGeometrie,
        authentification: distinfo.authentification || null,
      };
    case "geojson":
    case "shapefile":
    case "csv":
      return {
        fichier: distinfo.fichier,
        authentification: distinfo.authentification || null,
      };
    default:
      return { ...distinfo };
  }
}

/**
 * parser(critere) : point d'entree principal du Parser.
 * @param {string} critere - critere de recherche transmis par le moteur
 *                            de requete de la couche presentation.
 * @returns {Promise<object>} le ConfigDescriptor au format JSON.
 */
async function parser(critere) {
  const resultatsLdap = await gsDirectory.rechercherNoeud(critere);

  const resultats = resultatsLdap.map((r) => {
    const typeSource = r.typeSource;
    const distinfo = extraireSection(r.sousArbre, r.dn, "distinfo");
    const identifier = r.cn.replace(/^Metadata_/, "");

    // Champs canoniques descriptifs (table de correspondance ISO 19115 /
    // CSDGM / Dublin Core, chapitre 4) : transmis a part de "connexion",
    // qui ne concerne que les parametres techniques exploites par GeoAPI.
    const idinfo = extraireSection(r.sousArbre, r.dn, "idinfo");
    const metainfo = extraireSection(r.sousArbre, r.dn, "metainfo");
    const spref = extraireSection(r.sousArbre, r.dn, "spref");

    return {
      identifier,
      titre: r.titre,
      type_source: typeSource,
      connexion: construireConnexion(typeSource, distinfo),
      champsCanoniques: {
        identifier: idinfo.identifier || identifier,
        title: idinfo.title || r.titre,
        description: idinfo.description,
        keywords: idinfo.keywords,
        creator: idinfo.creator,
        publisher: idinfo.publisher,
        dateCreated: idinfo.dateCreated,
        dateIssued: idinfo.dateIssued,
        dateModified: metainfo.dateModified,
        resourceType: idinfo.resourceType,
        rights: distinfo.rights,
        spatialCoverage: spref.spatialCoverage,
        distributionLink: distinfo.distributionLink,
      },
    };
  });

  return { resultats };
}

module.exports = { parser };
