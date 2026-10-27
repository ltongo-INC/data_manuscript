# =============================================================================
# Dockerfile - GeoFederation (backend Express + frontend statique)
# Construit depuis la racine du projet (geofederation-app/), car server.js
# sert le frontend via un chemin relatif ../frontend au backend.
# =============================================================================
FROM node:18-alpine

WORKDIR /app

# Installation des dependances (mise en cache Docker si package.json inchange)
COPY backend/package*.json backend/
RUN cd backend && npm install --omit=dev

# Copie du code source
COPY backend backend
COPY frontend frontend

WORKDIR /app/backend
EXPOSE 4000

CMD ["node", "server.js"]
