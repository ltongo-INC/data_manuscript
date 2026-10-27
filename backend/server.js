/**
 * server.js
 * ---------------------------------------------------------------------------
 * Point d'entree du prototype applicatif GeoFederation.
 *
 * Assemble les trois couches du modele (chapitre 6) derriere une seule API
 * REST :
 *   /api/semantic/...      -> facade GS-DIRECTORY (annuaire LDAP)
 *   /api/federation/...    -> Parser / Builder (bibliotheque GeoAPI)
 *   /api/presentation/...  -> Generateur
 *   /api/rechercher        -> orchestration complete (Parser->Builder->Generateur)
 *
 * Sert egalement les fichiers statiques du frontend (../frontend) afin que
 * l'ensemble puisse etre deploye comme une application unique.
 */

const path = require("path");
const express = require("express");
const cors = require("cors");

const semanticRoutes = require("./routes/semantic.routes");
const federationRoutes = require("./routes/federation.routes");
const presentationRoutes = require("./routes/presentation.routes");
const { rechercherComplet } = require("./routes/presentation.routes");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- API REST par couche, conformement au modele GeoFederation -----------
app.use("/api/semantic", semanticRoutes);
app.use("/api/federation", federationRoutes);
app.use("/api/presentation", presentationRoutes);

// --- Orchestration complete utilisee par le bouton "Rechercher" ----------
app.get("/api/rechercher", rechercherComplet);

// --- Frontend statique (couche presentation - HTML/CSS/JS) ---------------
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(PORT, () => {
  console.log(`GeoFederation - API REST demarree sur http://localhost:${PORT}`);
  console.log(`  Semantique   : http://localhost:${PORT}/api/semantic`);
  console.log(`  Federation   : http://localhost:${PORT}/api/federation`);
  console.log(`  Presentation : http://localhost:${PORT}/api/presentation`);
  console.log(`  Orchestration: http://localhost:${PORT}/api/rechercher?critere=...`);
});
