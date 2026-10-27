/**
 * semantic.routes.js
 * ---------------------------------------------------------------------------
 * API REST de la couche semantique : expose la facade GS-DIRECTORY.
 * La these decrit un acces SOAP a ces memes methodes ; ce prototype les
 * expose en REST, conformement a la consigne de ce travail.
 */

const express = require("express");
const gsDirectory = require("../semantic/gsDirectory");

const router = express.Router();

// GET /api/semantic/racine -> getRacine()
router.get("/racine", (req, res) => {
  res.json({ racine: gsDirectory.getRacine() });
});

// GET /api/semantic/noeud?critere=... -> rechercherNoeud(critere)
// Ecriture (recherche = lecture) de l'annuaire : requete transmise telle
// quelle a la facade GS-DIRECTORY.
router.get("/noeud", async (req, res) => {
  try {
    const resultats = await gsDirectory.rechercherNoeud(req.query.critere || "");
    res.json({ resultats });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// POST /api/semantic/noeud -> insererNoeud(metadata)
// Ecriture dans l'annuaire : utilise par le bouton "Inserer" du formulaire.
router.post("/noeud", async (req, res) => {
  try {
    const resultat = await gsDirectory.insererNoeud(req.body);
    res.status(201).json(resultat);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

// PUT /api/semantic/noeud -> mise_a_jourNoeud(metadata)
router.put("/noeud", async (req, res) => {
  try {
    const resultat = await gsDirectory.mise_a_jourNoeud(req.body);
    res.json(resultat);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

// DELETE /api/semantic/noeud/:nom -> supprimerNoeud(nomMetadata)
router.delete("/noeud/:nom", async (req, res) => {
  try {
    const resultat = await gsDirectory.supprimerNoeud(req.params.nom);
    res.json(resultat);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

// GET /api/semantic/count?pays=&structure= -> getNombreMetadata(pays, structure)
router.get("/count", async (req, res) => {
  try {
    const total = await gsDirectory.getNombreMetadata(req.query.pays, req.query.structure);
    res.json({ total });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

module.exports = router;
