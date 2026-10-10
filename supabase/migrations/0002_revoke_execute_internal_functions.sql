-- Les fonctions de trigger ne doivent pas être appelables via l'API REST publique.
revoke execute on function public.enqueue_reference_job() from public, anon, authenticated;
revoke execute on function public.set_zone_surface() from public, anon, authenticated;
revoke execute on function public.create_zone(text, jsonb, sensibilite, text[]) from public, anon;
grant execute on function public.create_zone(text, jsonb, sensibilite, text[]) to authenticated;
