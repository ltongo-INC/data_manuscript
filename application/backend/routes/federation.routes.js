/**
 * federation.routes.js
 * ---------------------------------------------------------------------------
 * API REST de la couche federation : Parser (annuaire -> ConfigDescriptor)
 * et Builder (ConfigDescriptor -> GeoConfigFederation), conformement a la
 * these : "La variable ConfigDescriptor est echangee entre le Parser et le
 * Builder par une interface RESTful utilisant HTTP(S), avec prise en
 * charge des methodes POST et GET."
 */

const express = require("express");
const { parser } = require("../federation/parser");
const { builder } = require("../federation/builder");

const router = express.Router();

// GET /api/federation/parser?critere=... -> ConfigDescriptor (JSON)
router.get("/parser", async (req, res) => {
  try {
    const configDescriptor = await parser(req.query.critere || "");
    res.json(configDescriptor);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// POST /api/federation/builder  (body = ConfigDescriptor) -> GeoConfigFederation
router.post("/builder", async (req, res) => {
  try {
    const geoConfigFederation = await builder(req.body);
    res.json(geoConfigFederation);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

module.exports = router;
