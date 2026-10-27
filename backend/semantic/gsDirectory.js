/**
 * gsDirectory.js
 * ---------------------------------------------------------------------------
 * Facade GS-DIRECTORY (chapitre 5, section 4 de la these).
 *
 * Expose les methodes publiques definies dans le modele :
 *   - insererNoeud(metadata: NOEUD)
 *   - mise_a_jourNoeud(metadata: NOEUD)
 *   - rechercherNoeud(critere: String): NOEUD
 *   - supprimerNoeud(nomMetadata: String)
 *   - getNombreMetadata(pays: String, structure: String): int
 *   - getRacine(): String
 *
 * La these decrit un acces SOAP a cette facade ; ce prototype l'expose en
 * REST (voir routes/semantic.routes.js), conformement a la consigne du
 * present travail ("API REST pour chaque couche"). La logique interne -
 * traduction des methodes publiques en operations LDAP - reste identique.
 *
 * Structure attendue pour le parametre `metadata` de insererNoeud /
 * mise_a_jourNoeud (objet JS reproduisant la hierarchie canonique
 * idinfo | dataqual | spdoinfo | spref | distinfo | metainfo etablie au
 * chapitre 4, section 3) :
 *
 *   {
 *     identifier: "ReseauRoutier_CommuneX_2025",
 *     titre: "Reseau routier - Commune X, 2025",
 *     typeSource: "database" | "geojson" | "shapefile" | "csv",
 *     idinfo:   { citation: "...", description: "..." },
 *     dataqual: { attracc: "...", logic: "...", complete: "...",
 *                 posacc: "...", lineage: "..." },
 *     spdoinfo: { ... },
 *     spref:    { ... },
 *     distinfo: { useLimitation: "...", hote: "...", base: "...",
 *                 table: "...", colonneGeometrie: "...", fichier: "...",
 *                 authentification: "..." },
 *     metainfo: { ... }
 *   }
 *
 * Seules les sections canoniques effectivement renseignees (au moins un
 * sous-attribut non vide) donnent lieu a la creation d'un Noeud LDAP,
 * conformement a la regle de production `metadata := idinfo | dataqual |
 * spdoinfo | spref | distinfo | e` du chapitre 4 (une metadonnee peut
 * legitimement ne pas comporter toutes les sections).
 */

const ldapClient = require("./ldapClient");
const ldap = require("ldapjs");

const SECTIONS_CANONIQUES = ["idinfo", "dataqual", "spdoinfo", "spref", "distinfo", "metainfo"];

/** Echappe les caracteres speciaux d'un RDN LDAP (virgule, egal, etc.) */
function nettoyerCn(valeur) {
  return String(valeur).replace(/[,=+"<>;\\]/g, "_");
}

/**
 * getRacine() : retourne le DN racine du catalogue canonique.
 */
function getRacine() {
  return ldapClient.CONFIG.racine;
}

/**
 * insererNoeud(metadata) : insere une metadonnee canonique complete.
 * Traduit l'objet `metadata` en une sous-arborescence LDAP
 * METADATA -> Noeud(section) -> Feuille(attribut), entree racine d'abord
 * (contrainte d'ordre du protocole LDAP, cf. section 3.4 du chapitre 5).
 */
async function insererNoeud(metadata) {
  const racine = getRacine();
  const cnRacine = `Metadata_${nettoyerCn(metadata.identifier)}`;
  const dnRacine = `cn=${cnRacine},${racine}`;

  // 1) Entree racine de type METADATA
  await ldapClient.ajouter(dnRacine, {
    objectClass: ["METADATA", "top"],
    cn: cnRacine,
    titre: metadata.titre || metadata.identifier,
    typeSource: metadata.typeSource || "geojson",
  });

  // 2) Une sous-arborescence Noeud/Feuille par section canonique renseignee
  for (const section of SECTIONS_CANONIQUES) {
    const contenu = metadata[section];
    if (!contenu || typeof contenu !== "object") continue;
    const entreesRenseignees = Object.entries(contenu).filter(([, v]) => v !== undefined && v !== null && v !== "");
    if (entreesRenseignees.length === 0) continue;

    const dnSection = `cn=${section},${dnRacine}`;
    await ldapClient.ajouter(dnSection, {
      objectClass: ["Noeud", "top"],
      cn: section,
      nomNoeud: section,
      abreviationNoeud: section,
    });

    for (const [attribut, valeur] of entreesRenseignees) {
      const dnFeuille = `cn=${nettoyerCn(attribut)},${dnSection}`;
      await ldapClient.ajouter(dnFeuille, {
        objectClass: ["Feuille", "top"],
        cn: nettoyerCn(attribut),
        valeurFeuille: String(valeur),
      });
    }
  }

  return { dn: dnRacine };
}

/**
 * mise_a_jourNoeud(metadata) : met a jour les feuilles existantes d'une
 * metadonnee deja enregistree (le titre et les feuilles des sections
 * fournies dans `metadata` sont remplaces ; les sections absentes de
 * l'objet ne sont pas touchees).
 */
async function mise_a_jourNoeud(metadata) {
  const racine = getRacine();
  const cnRacine = `Metadata_${nettoyerCn(metadata.identifier)}`;
  const dnRacine = `cn=${cnRacine},${racine}`;

  if (metadata.titre) {
    await ldapClient.modifier(dnRacine, [
      new ldap.Change({ operation: "replace", modification: new ldap.Attribute({ type: "titre", values: [metadata.titre] }) }),
    ]);
  }

  for (const section of SECTIONS_CANONIQUES) {
    const contenu = metadata[section];
    if (!contenu || typeof contenu !== "object") continue;

    for (const [attribut, valeur] of Object.entries(contenu)) {
      if (valeur === undefined || valeur === null || valeur === "") continue;
      const dnFeuille = `cn=${nettoyerCn(attribut)},cn=${section},${dnRacine}`;
      try {
        await ldapClient.modifier(dnFeuille, [
          new ldap.Change({ operation: "replace", modification: new ldap.Attribute({ type: "valeurFeuille", values: [String(valeur)] }) }),
        ]);
      } catch (err) {
        // La feuille n'existait pas encore pour cette metadonnee : on la cree.
        if (err.name === "NoSuchObjectError") {
          await ldapClient.ajouter(dnFeuille, {
            objectClass: ["Feuille", "top"],
            cn: nettoyerCn(attribut),
            valeurFeuille: String(valeur),
          });
        } else {
          throw err;
        }
      }
    }
  }

  return { dn: dnRacine };
}

/**
 * rechercherNoeud(critere) : recherche des entrees METADATA dont le titre
 * ou l'identifiant (cn) contient le critere fourni (recherche partielle,
 * insensible a la casse). Retourne la liste des racines METADATA trouvees
 * avec leurs sous-arborescences deployees (utilise ensuite par le Parser
 * pour construire le ConfigDescriptor).
 */
async function rechercherNoeud(critere) {
  const racine = getRacine();
  const filtre = critere
    ? `(&(objectClass=METADATA)(|(titre=*${critere}*)(cn=*${critere}*)))`
    : "(objectClass=METADATA)";

  const racines = await ldapClient.rechercher(racine, { scope: "one", filter: filtre });

  const resultats = [];
  for (const r of racines) {
    const sousArbre = await ldapClient.rechercher(r.dn, { scope: "sub", filter: "(objectClass=*)" });
    resultats.push({ ...r, sousArbre });
  }
  return resultats;
}

/**
 * supprimerNoeud(nomMetadata) : supprime une metadonnee et l'integralite
 * de sa sous-arborescence (equivalent `ldapdelete -r`).
 */
async function supprimerNoeud(nomMetadata) {
  const racine = getRacine();
  const dn = `cn=Metadata_${nettoyerCn(nomMetadata)},${racine}`;
  await ldapClient.supprimer(dn, true);
  return { dn, supprime: true };
}

/**
 * getNombreMetadata(pays, structure) : denombre les entrees METADATA.
 * NB - prototype : le schema de demonstration ne definit pas encore les
 * attributs `pays` / `structure` (non requis par le cas d'usage a une
 * seule commune du chapitre 5). Les parametres sont acceptes pour
 * respecter la signature de la these et appliques des lors que ces
 * attributs sont ajoutes au schema LDAP, selon le meme principe que
 * `titre` ou `typeSource` (voir data/geofederation.schema.ldif).
 */
async function getNombreMetadata(pays, structure) {
  const racine = getRacine();
  let filtre = "(objectClass=METADATA)";
  const clauses = [];
  if (pays) clauses.push(`(pays=${pays})`);
  if (structure) clauses.push(`(structure=${structure})`);
  if (clauses.length) filtre = `(&${filtre}${clauses.join("")})`;

  const resultats = await ldapClient.rechercher(racine, { scope: "one", filter: filtre });
  return resultats.length;
}

module.exports = {
  getRacine,
  insererNoeud,
  mise_a_jourNoeud,
  rechercherNoeud,
  supprimerNoeud,
  getNombreMetadata,
};
