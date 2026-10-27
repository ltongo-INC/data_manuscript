# GeoFederation — Prototype applicatif

Prototype demontrant les trois couches du modele GeoFederation (these,
chapitre 6) : presentation (formulaire + Viewer Leaflet), semantique
(facade GS-DIRECTORY sur annuaire LDAP) et federation (Parser / Builder /
GeoAPI). Chaque couche est exposee via une API REST independante.

## 0. Déploiement rapide sous Windows (Docker)

Sur Windows, préférez le déploiement via Docker Desktop : voir
**[DEPLOIEMENT_WINDOWS.md](./DEPLOIEMENT_WINDOWS.md)**. Il évite
l'installation native d'OpenLDAP (non disponible sous Windows) et
démarre l'ensemble (annuaire + application) en une seule commande
(`docker compose up -d --build`). Les sections suivantes de ce README
décrivent le déploiement natif Linux (installation directe d'OpenLDAP et
de Node.js), qui reste pertinent pour un serveur de production ou WSL2.

## 1. Arborescence

```
geofederation-app/
├── backend/
│   ├── server.js                  point d'entree Express
│   ├── semantic/
│   │   ├── ldapClient.js          acces bas niveau a l'annuaire (ldapjs)
│   │   └── gsDirectory.js         facade GS-DIRECTORY
│   ├── federation/
│   │   ├── parser.js              annuaire -> ConfigDescriptor
│   │   ├── geoApi.js              read_geojson / read_shapefile / read_csv / read_postgres
│   │   └── builder.js             ConfigDescriptor -> GeoConfigFederation
│   ├── presentation/
│   │   └── generateur.js          GeoConfigFederation -> couches pour le Viewer
│   ├── routes/                    definitions des routes REST par couche
│   └── sample-datasets/           jeux de donnees geospatiales d'exemple
├── frontend/
│   ├── index.html                 page d'accueil (mise en page 4/5 + 1/5)
│   ├── style.css
│   ├── app.js                     Viewer Leaflet, formulaire, panneau de resultats
│   └── vendor/leaflet/            Leaflet embarque (pas de dependance CDN)
├── sample_metadata.ldif           jeu de donnees LDAP (3 parties prenantes)
└── geofederation.schema.ldif      schema LDAP personnalise (Noeud/Feuille/METADATA)
```

## 2. Installation et configuration d'OpenLDAP

Les commandes suivantes ont ete validees sur Ubuntu/Debian.

### 2.1. Installation des paquets

```bash
sudo apt-get update
sudo apt-get install -y slapd ldap-utils
```

### 2.2. Reconfiguration du domaine et du mot de passe administrateur

```bash
sudo dpkg-reconfigure slapd
```
Repondre : domaine `bloc_metadata.monde`, organisation `GeoFederation`,
mot de passe administrateur au choix (repris ci-dessous : `admin123`),
backend `MDB`, ne pas purger la base au retrait du paquet.

> Sur un systeme sans service `init` standard (conteneur, CI), la
> reconfiguration interactive peut ne pas aboutir : appliquer alors la
> methode manuelle equivalente ci-dessous, directement via `cn=config`.

```bash
# Demarrage manuel de slapd
sudo /usr/sbin/slapd -h "ldap:/// ldapi:///" -u openldap -g openldap -F /etc/ldap/slapd.d

# Calcul du hash du mot de passe administrateur
slappasswd -s admin123   # -> {SSHA}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Modification du suffixe / rootDN / rootPW (fichier chsuffix.ldif)
cat > chsuffix.ldif << EOF
dn: olcDatabase={1}mdb,cn=config
changetype: modify
replace: olcSuffix
olcSuffix: dc=bloc_metadata,dc=monde
-
replace: olcRootDN
olcRootDN: cn=admin,dc=bloc_metadata,dc=monde
-
replace: olcRootPW
olcRootPW: {SSHA}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EOF
sudo ldapmodify -Y EXTERNAL -H ldapi:/// -f chsuffix.ldif
```

### 2.3. Chargement du schéma personnalisé GeoFederation

Le fichier `geofederation.schema.ldif` (fourni) définit les classes
`Noeud`, `Feuille` et `METADATA` (patron Composite du chapitre 5) :

```bash
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f geofederation.schema.ldif
```

Redémarrer `slapd` pour que le nouveau schéma soit pris en compte :

```bash
sudo systemctl restart slapd
# ou, en démarrage manuel :
sudo pkill slapd && sudo /usr/sbin/slapd -h "ldap:/// ldapi:///" -u openldap -g openldap -F /etc/ldap/slapd.d
```

### 2.4. Création de la racine du DIT

```bash
cat > base.ldif << 'EOF'
dn: dc=bloc_metadata,dc=monde
objectClass: top
objectClass: dcObject
objectClass: organization
dc: bloc_metadata
o: GeoFederation

dn: cn=admin,dc=bloc_metadata,dc=monde
objectClass: organizationalRole
cn: admin
EOF
ldapadd -x -D "cn=admin,dc=bloc_metadata,dc=monde" -w admin123 -f base.ldif
```

### 2.5. Chargement du jeu de données d'exemple

```bash
ldapadd -x -D "cn=admin,dc=bloc_metadata,dc=monde" -w admin123 -f sample_metadata.ldif
```

### 2.6. Vérification

```bash
ldapsearch -x -D "cn=admin,dc=bloc_metadata,dc=monde" -w admin123 \
  -b "dc=bloc_metadata,dc=monde" "(objectClass=METADATA)" cn titre typeSource
```

## 3. Backend (API REST)

```bash
cd backend
npm install
# Variables d'environnement (valeurs par defaut entre parentheses) :
#   LDAP_URL       (ldap://127.0.0.1:389)
#   LDAP_RACINE    (dc=bloc_metadata,dc=monde)
#   LDAP_ADMIN_DN  (cn=admin,dc=bloc_metadata,dc=monde)
#   LDAP_ADMIN_PW  (admin123)
#   PORT           (4000)
npm start
```

Le serveur sert également le frontend statique (`../frontend`) : l'application
complète est accessible sur **http://localhost:4000**.

### Résumé de l'API REST

| Couche | Méthode | Route | Rôle |
|---|---|---|---|
| Sémantique | GET | `/api/semantic/racine` | `getRacine()` |
| Sémantique | GET | `/api/semantic/noeud?critere=` | `rechercherNoeud()` |
| Sémantique | POST | `/api/semantic/noeud` | `insererNoeud()` |
| Sémantique | PUT | `/api/semantic/noeud` | `mise_a_jourNoeud()` |
| Sémantique | DELETE | `/api/semantic/noeud/:nom` | `supprimerNoeud()` |
| Sémantique | GET | `/api/semantic/count` | `getNombreMetadata()` |
| Fédération | GET | `/api/federation/parser?critere=` | Parser → ConfigDescriptor |
| Fédération | POST | `/api/federation/builder` | Builder → GeoConfigFederation |
| Présentation | POST | `/api/presentation/generateur` | Générateur → couches |
| Orchestration | GET | `/api/rechercher?critere=` | Parser→Builder→Générateur enchaînés |

## 4. Champs canoniques du formulaire

Le formulaire de métadonnées (insertion et recherche) expose exactement les
13 champs de la colonne « Canonical Field » de la table de correspondance
ISO 19115 / CSDGM / Dublin Core (chapitre 4) :

| Canonical Field | Chemin LDAP (Noeud.Feuille) |
|---|---|
| Identifier | `idinfo.identifier` (dupliqué depuis le champ Identifiant, qui pilote aussi le DN) |
| Title | `idinfo.title` |
| Description | `idinfo.description` |
| Keywords | `idinfo.keywords` |
| Creator | `idinfo.creator` |
| Publisher | `idinfo.publisher` |
| Date created | `idinfo.dateCreated` |
| Date issued | `idinfo.dateIssued` |
| Date modified | `metainfo.dateModified` |
| Resource type | `idinfo.resourceType` |
| Rights | `distinfo.rights` |
| Spatial coverage | `spref.spatialCoverage` |
| Distribution link | `distinfo.distributionLink` |

Ces 13 champs sont distincts des paramètres de connexion technique
(`distinfo.fichier`, `distinfo.hote`, `distinfo.base`, `distinfo.table`,
`distinfo.colonneGeometrie`) : ces derniers ne figurent pas dans la table de
correspondance mais restent indispensables au Builder pour invoquer la
bonne fonction GeoAPI. Le formulaire les regroupe dans une section dépliable
séparée. Les 13 champs canoniques sont également renvoyés par le Parser et
affichés dans le popup de métadonnées du Viewer (clic droit sur une entité).

## 5. Jeu de données d'exemple

Trois parties prenantes du cas d'usage de planification urbaine (chapitre 5) :

| Métadonnée | Type de source | Fichier / connexion |
|---|---|---|
| Réseau routier — Commune X | `database` | PostGIS (hôte, base, table, colonne géométrie fictifs — nécessite un serveur PostGIS réel) |
| Réseau adduction d'eau potable— Commune X | `geojson` | `sample-datasets/aep.json` |
| Parcelles cadastrales — Commune X | `shapefile` | `sample-datasets/esapce_urbains.json` |
| Réseau routier — Commune X | `shapefile` | `sample-datasets/voiriepdu.json` |

Un fichier `sample-datasets/points_interet_communex.csv` est également fourni
pour couvrir la fonction `read_csv` de la bibliothèque GeoAPI.

> Le réseau routier (source `database`) est volontairement laissé
> « indisponible » dans l'environnement de démonstration : aucun serveur
> PostgreSQL/PostGIS n'y est déployé. C'est un cas réel d'exercice du
> mécanisme de gestion d'erreur du Builder (chapitre 6, section 5) : la
> métadonnée reste consultable, seule la donnée géographique associée
> est signalée comme indisponible dans l'interface.

## 6. Limites connues de ce prototype

- `read_postgres` est codé selon les conventions standard du pilote `pg`
  mais n'a pas été exécuté contre un serveur PostGIS réel dans
  l'environnement de démonstration.
- Les fonds de carte (OpenStreetMap, Esri World Imagery) nécessitent un
  accès Internet sortant vers `tile.openstreetmap.org` et
  `server.arcgisonline.com` ; en environnement réseau restreint, les
  tuiles ne se chargent pas mais l'application (formulaire, recherche,
  affichage vectoriel, popups de métadonnées) reste pleinement
  fonctionnelle.
- Connexion LDAP ouverte à la demande (une par requête) plutôt que mise
  en pool — suffisant pour ce prototype, à revoir pour un déploiement à
  fort trafic.
- Authentification HTTP de l'API elle-même non implémentée (hors périmètre
  du prototype) : à ajouter avant toute exposition publique.
