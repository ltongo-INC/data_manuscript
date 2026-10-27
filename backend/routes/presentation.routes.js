/**
 * presentation.routes.js
 * ---------------------------------------------------------------------------
 * API REST de la couche presentation : Generateur (GeoConfigFederation ->
 * couches pretes pour le Viewer), et un point d'entree d'orchestration
 * `/api/rechercher` qui enchaine Parser -> Builder -> Generateur en un seul
 * appel, pour le compte du moteur de requete de la page d'accueil (bouton
 * "Rechercher"). Chaque etage reste par ailleurs appelable independamment
 * via /api/federation/parser, /api/federation/builder et
 * /api/presentation/generateur, conformement a la consigne "des API REST
 * pour chaque couche".
 */

const express = require("express");
const { parser } = require("../federation/parser");
const { builder } = require("../federation/builder");
const { generer } = require("../presentation/generateur");

const router = express.Router();

// POST /api/presentation/generateur (body = GeoConfigFederation) -> couches
router.post("/generateur", (req, res) => {
  try {
    const resultat = generer(req.body);
    res.json(resultat);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

module.exports = router;

// Route d'orchestration exposee separement dans server.js sous /api/rechercher
module.exports.rechercherComplet = async (req, res) => {
  try {
    const configDescriptor = await parser(req.query.critere || "");
    const geoConfigFederation = await builder(configDescriptor);
    const { couches } = generer(geoConfigFederation);
    res.json({ couches });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
};
