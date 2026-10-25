-- =====================================================================
-- NOUS ÉTIONS LÀ — Migration 004 : œuvres de DÉMONSTRATION
-- Ce ne sont PAS de vraies photographies. Remplacez-les (ou supprimez-les) avant l'exposition.
-- =====================================================================
insert into public.artworks (id, title, taken_on, location, caption, image_path, is_demo) values
 ('001', 'Photographie de démonstration 001', null, null, 'Légende de démonstration. À remplacer par votre légende documentaire.', null, true),
 ('002', 'Photographie de démonstration 002', null, null, 'Légende de démonstration. À remplacer par votre légende documentaire.', null, true),
 ('003', 'Photographie de démonstration 003', null, null, 'Légende de démonstration. À remplacer par votre légende documentaire.', null, true),
 ('004', 'Photographie de démonstration 004', null, null, 'Légende de démonstration. À remplacer par votre légende documentaire.', null, true),
 ('005', 'Photographie de démonstration 005', null, null, 'Légende de démonstration. À remplacer par votre légende documentaire.', null, true),
 ('006', 'Photographie de démonstration 006', null, null, 'Légende de démonstration. À remplacer par votre légende documentaire.', null, true)
on conflict (id) do nothing;
