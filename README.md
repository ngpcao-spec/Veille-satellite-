# Veille satellite IA

PWA Next.js (Vercel) + Supabase (Auth Google, PostGIS, RLS). L'utilisateur dessine une zone ; le service la surveille avec Sentinel-1/2 (Copernicus) et alerte quand une IA détecte un changement significatif. Voir la spec pour le détail.

## Avancement (plan de livraison)

- [x] **1. Socle** : PWA, auth Google, schéma Postgres + RLS, carte MapLibre avec dessin de polygone, fiche zone
- [x] 2. Connexion Copernicus (Edge Function Supabase `copernicus` : secrets côté Supabase uniquement ; dernière image sur la fiche zone)
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

## Secrets Copernicus

`COPERNICUS_CLIENT_ID` et `COPERNICUS_CLIENT_SECRET` vivent uniquement dans Supabase (secrets des Edge Functions).
L'appli Vercel n'en contient aucun : elle appelle la fonction `copernicus` avec le jeton de session de l'utilisateur.
Déploiement de la fonction : `supabase functions deploy copernicus` (le code partagé est dans `supabase/functions/_shared`).
