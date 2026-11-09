# GitSkin — self-hosted

Des cartes SVG pour un profil GitHub, générées depuis l'API GitHub publique et servies depuis mon homelab.

Pas de SaaS, pas de workflow, pas de dépendance : un fichier Node.js, cinq endpoints, un thème « plan d'ingénieur ».

<p align="center">
  <img src="https://skin.aq0a11q1.com/api/hero?username=a11q1&theme=blueprint" width="100%" alt="Aperçu de la carte hero" />
</p>

<p align="center">
  <img src="https://skin.aq0a11q1.com/api/arch?theme=blueprint" width="100%" alt="Aperçu du schéma d'architecture" />
</p>

## Endpoints

| Endpoint | Description |
|---|---|
| `/api/hero?username=a11q1&theme=blueprint` | Carte de présentation : nom, rôle, tags, panneau système |
| `/api/arch?theme=blueprint` | Schéma d'architecture du homelab (Proxmox, pfSense, Tailscale, Cloudflare) |
| `/api/stats?username=a11q1&theme=blueprint` | Dépôts, étoiles, followers, following |
| `/api/stack?username=a11q1&theme=blueprint` | Top 5 des langages, calculé sur les octets des dépôts publics |
| `/api/status?theme=blueprint` | Bandeau de statut du service |
| `/api/profile?username=a11q1` | Données JSON brutes |
| `/healthz` | Healthcheck |

Thèmes : `blueprint`, `cyber`, `aurora`, `light`. Le paramètre `mode=light` force le thème clair.

## Lancer en local

```bash
git clone https://github.com/a11q1/gitskin.git
cd gitskin
node server.js
# http://127.0.0.1:8792
```

Aucune dépendance npm. Node.js 20+ suffit (fetch natif).

## Docker

```bash
docker compose up -d --build
# http://127.0.0.1:8792
```

Le service écoute uniquement sur `127.0.0.1:8792` ; c'est Cloudflare Tunnel qui l'expose publiquement.

## Configuration

Tout est dans [`profile.json`](./profile.json) : nom, rôle, tags, localisation, statut, liens, lignes du panneau « system scan » et données de secours si l'API GitHub est indisponible.

Pour changer le propriétaire du skin, modifie `username` et les champs associés. Les cartes restent génériques : n'importe quel utilisateur GitHub peut être passé en query string.

## Déploiement derrière Cloudflare Tunnel

Le service est prévu pour tourner sur un petit LXC ou un conteneur Docker, sans port exposé sur Internet. Exemple de route dans la configuration du tunnel :

```json
{
  "hostname": "skin.example.com",
  "service": "http://127.0.0.1:8792"
}
```

Puis un CNAME `skin.example.com` vers `<tunnel-id>.cfargotunnel.com`, proxied.

## Notes

- Les données viennent uniquement de l'API GitHub publique (`/users/:user` et `/repos`).
- Cache mémoire de 10 minutes pour éviter de taper dans la limite de 60 req/h.
- Limite de 180 requêtes/minute par IP.
- Aucun secret n'est nécessaire. Un `GITHUB_TOKEN` optionnel permet d'augmenter la limite API.
- Les SVG sont autonomes : pas de police externe, pas d'image distante, pas de script.

## Licence

MIT — voir [`LICENSE`](./LICENSE).
