# Veille satellite IA

PWA Next.js (Vercel) + Supabase (Auth Google, PostGIS, RLS). L'utilisateur dessine une zone ; le service la surveille avec Sentinel-1/2 (Copernicus) et alerte quand une IA détecte un changement significatif. Voir la spec pour le détail.

## Avancement (plan de livraison)

- [x] **1. Socle** : PWA, auth Google, schéma Postgres + RLS, carte MapLibre avec dessin de polygone, fiche zone
- [ ] 2. Connexion Copernicus
- [ ] 3. Référence et mesures
- [ ] 4. Détection
- [ ] 5. IA et alertes
- [ ] 6. Durcissement

## Démarrer

```bash
cp .env.example .env.local   # renseigner l'URL et la clé anon Supabase
npm install
npm run dev
```

Base de données : appliquer `supabase/migrations/*.sql` (Supabase CLI `supabase db push` ou éditeur SQL).
Auth : activer le fournisseur Google dans Supabase (Authentication → Providers) et ajouter
`<site>/auth/callback` aux URL de redirection autorisées.

Ne jamais committer de clé : tout passe par les variables d'environnement Supabase / Vercel.
