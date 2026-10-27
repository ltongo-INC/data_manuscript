/**
 * ldapClient.js
 * ---------------------------------------------------------------------------
 * Couche d'acces bas niveau a l'annuaire LDAP (OpenLDAP / slapd).
 *
 * Ce module NE FAIT PAS partie de la facade GS-DIRECTORY : il fournit
 * uniquement les operations elementaires (bind, search, add, modify, delete)
 * sur lesquelles la facade GS-DIRECTORY (gsDirectory.js) s'appuie pour
 * exposer ses methodes publiques (insererNoeud, rechercherNoeud, etc.),
 * conformement a la description du chapitre 5 : "GS-DIRECTORY possede des
 * methodes privees qui lui permettent de se connecter a l'annuaire LDAP
 * sous-jacent et de lui deleguer les traitements effectifs".
 *
 * Bibliotheque utilisee : ldapjs (client LDAP pur JavaScript, ne necessite
 * aucune dependance systeme).
 */

const ldap = require("ldapjs");

// -----------------------------------------------------------------------
// Configuration de connexion (correspond aux attributs de la classe
// GS-DIRECTORY definie au chapitre 5 : racine, login admin, mot de passe
// admin, dn admin, adresse IP du serveur LDAP).
// -----------------------------------------------------------------------
const CONFIG = {
  url: process.env.LDAP_URL || "ldap://127.0.0.1:389",
  racine: process.env.LDAP_RACINE || "dc=bloc_metadata,dc=monde",
  dnAdmin: process.env.LDAP_ADMIN_DN || "cn=admin,dc=bloc_metadata,dc=monde",
  mdpAdmin: process.env.LDAP_ADMIN_PW || "admin123",
};

/**
 * Ouvre une connexion authentifiee au serveur LDAP et retourne le client.
 * Une nouvelle connexion est etablie a chaque appel : c'est un choix
 * volontairement simple pour ce prototype (voir README pour les pistes
 * de mise en pool des connexions dans une implementation de production).
 */
function connecterEtAuthentifier() {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({ url: CONFIG.url, reconnect: false });

    client.on("error", (err) => reject(err));

    client.bind(CONFIG.dnAdmin, CONFIG.mdpAdmin, (err) => {
      if (err) return reject(err);
      resolve(client);
    });
  });
}

/**
 * Execute une recherche LDAP.
 * @param {string} baseDn  - DN de depart de la recherche
 * @param {object} options - options ldapjs (scope, filter, attributes)
 * @returns {Promise<Array<object>>} liste d'entrees { dn, attributes... }
 */
async function rechercher(baseDn, options) {
  const client = await connecterEtAuthentifier();
  return new Promise((resolve, reject) => {
    const entries = [];
    client.search(baseDn, options, (err, res) => {
      if (err) {
        client.unbind();
        return reject(err);
      }
      res.on("searchEntry", (entry) => {
        // ldapjs v3 expose les attributs via entry.pojo.attributes
        const obj = { dn: entry.pojo.objectName };
        for (const attr of entry.pojo.attributes) {
          obj[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
        }
        entries.push(obj);
      });
      res.on("error", (err2) => {
        client.unbind();
        reject(err2);
      });
      res.on("end", () => {
        client.unbind();
        resolve(entries);
      });
    });
  });
}

/**
 * Ajoute une entree dans l'annuaire.
 * @param {string} dn         - DN complet de la nouvelle entree
 * @param {object} attributes - attributs LDAP (dont objectClass)
 */
async function ajouter(dn, attributes) {
  const client = await connecterEtAuthentifier();
  return new Promise((resolve, reject) => {
    client.add(dn, attributes, (err) => {
      client.unbind();
      if (err) return reject(err);
      resolve(true);
    });
  });
}

/**
 * Modifie un ou plusieurs attributs d'une entree existante.
 * @param {string} dn  - DN de l'entree a modifier
 * @param {Array}  changes - tableau de ldap.Change
 */
async function modifier(dn, changes) {
  const client = await connecterEtAuthentifier();
  return new Promise((resolve, reject) => {
    client.modify(dn, changes, (err) => {
      client.unbind();
      if (err) return reject(err);
      resolve(true);
    });
  });
}

/**
 * Supprime une entree. Si `recursif` est vrai, supprime prealablement
 * tous les descendants (equivalent de `ldapdelete -r`), car LDAP refuse
 * de supprimer une entree qui a encore des enfants.
 */
async function supprimer(dn, recursif = false) {
  if (recursif) {
    const enfants = await rechercher(dn, { scope: "one", filter: "(objectClass=*)" });
    for (const enfant of enfants) {
      await supprimer(enfant.dn, true);
    }
  }
  const client = await connecterEtAuthentifier();
  return new Promise((resolve, reject) => {
    client.del(dn, (err) => {
      client.unbind();
      if (err) return reject(err);
      resolve(true);
    });
  });
}

module.exports = { CONFIG, rechercher, ajouter, modifier, supprimer };
