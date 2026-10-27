# Déploiement sur Windows (Docker Desktop)

Sur Windows, OpenLDAP ne s'installe pas nativement : la façon la plus simple
de déployer GeoFederation est de faire tourner l'annuaire et l'application
dans des conteneurs **Docker**, via le fichier `docker-compose.yml` fourni.
Aucune installation manuelle de Node.js ni d'OpenLDAP n'est nécessaire.

## 1. Prérequis

- **Docker Desktop pour Windows** (inclut Docker Engine + Docker Compose) :
  https://www.docker.com/products/docker-desktop/
  À l'installation, choisir le backend **WSL2** (proposé par défaut) —
  Docker Desktop installe et configure WSL2 automatiquement si besoin.
- Redémarrer Windows si l'installateur le demande, puis lancer Docker
  Desktop et attendre que l'icône de la barre des tâches indique qu'il est
  démarré ("Docker Desktop is running").

## 2. Récupération du projet

Extraire l'archive `geofederation-app.zip` dans un dossier, par exemple :
```
C:\Users\<vous>\geofederation-app\
```

## 3. Démarrage

Ouvrir un terminal (PowerShell) dans ce dossier — clic droit dans
l'explorateur de fichiers → *Ouvrir dans le terminal* — puis :

```powershell
docker compose up -d --build
```

Cette commande :
1. construit l'image du backend (Node.js + frontend) ;
2. télécharge l'image officielle `osixia/openldap` ;
3. démarre l'annuaire LDAP et y charge automatiquement, au premier
   démarrage, le schéma personnalisé GeoFederation (`Noeud` / `Feuille` /
   `METADATA`) et le jeu de données d'exemple à 3 parties prenantes ;
4. démarre le backend, qui sert aussi le frontend.

Le tout premier démarrage prend 30 secondes à 1 minute (initialisation de
l'annuaire). Les démarrages suivants sont quasi instantanés.

## 4. Accès à l'application

Ouvrir un navigateur sur **http://localhost:4000**

## 5. Commandes utiles

```powershell
docker compose logs -f              # suivre les journaux des deux services
docker compose ps                   # état des conteneurs
docker compose down                 # arrêter (conserve les données LDAP)
docker compose down -v              # arrêter ET effacer l'annuaire (repart de zéro)
docker compose up -d --build        # reconstruire après une modification du code
```

## 6. Vérifier l'annuaire directement (optionnel)

Avec un client LDAP graphique (par exemple **Apache Directory Studio**,
multiplateforme Windows/Mac/Linux) ou en ligne de commande via le
conteneur lui-même :

```powershell
docker exec -it geofed-ldap ldapsearch -x -D "cn=admin,dc=bloc_metadata,dc=monde" -w admin123 -b "dc=bloc_metadata,dc=monde" "(objectClass=METADATA)" cn titre typeSource
```

## 7. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `docker compose` non reconnu | Docker Desktop pas démarré, ou installation incomplète | Lancer Docker Desktop, réessayer |
| Port 389 ou 4000 déjà utilisé | Un autre service LDAP ou une autre appli occupe le port | Modifier les ports dans `docker-compose.yml` (partie gauche du `:`), ex. `"3890:389"` |
| Page blanche / erreurs 403 sur les fonds de carte | Réseau d'entreprise bloquant les tuiles OSM/Esri | Sans impact sur le formulaire, la recherche, les popups — voir README section « Limites » |
| L'annuaire semble vide après un `docker compose down -v` | Volumes effacés intentionnellement | Normal : `-v` réinitialise l'annuaire ; relancer `docker compose up -d` recharge le schéma et le jeu de données |

## 8. Limite de validation à connaître

Ce fichier `docker-compose.yml` s'appuie sur l'image officielle
`osixia/openldap` et sur son mécanisme documenté de chargement automatique
de schéma/données (dossier `ldif-bootstrap/`, monté dans le conteneur).
Cette configuration n'a pas pu être exécutée de bout en bout dans
l'environnement de préparation de ce document (Docker n'y est pas
disponible) — seule la syntaxe du `docker-compose.yml` a été vérifiée.
Le déploiement natif Linux décrit dans `README.md` (OpenLDAP installé
directement via `apt`), lui, a été testé et validé de bout en bout avec de
vraies requêtes. Si une étape Docker se comporte différemment de ce qui
est documenté ici, comparez avec la configuration native du README, qui
fait référence.
