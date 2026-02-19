-- Insert BSL 2025 Day 1 agenda items (2025-11-12)
-- Uses NOT EXISTS to avoid duplicate inserts if migration is re-applied

-- 08:00 - 09:00 Registro y café de bienvenida
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T08:00:00Z', 'Registro y café de bienvenida', NULL, NULL, 'keynote', 'Hall Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T08:00:00Z' AND title='Registro y café de bienvenida'
);

-- 09:00 - 09:15 Palabras de apertura
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T09:00:00Z', 'Palabras de apertura', NULL, NULL, 'keynote', 'Auditorio Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T09:00:00Z' AND title='Palabras de apertura'
);

-- 09:20 - 09:45 Keynote – El Rol de las Fintech...
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T09:20:00Z', 'El Rol de las Fintech en la Adopción del Dinero Digital en América Latina', NULL, ARRAY['Speaker TBD']::text[], 'keynote', 'Auditorio Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T09:20:00Z' AND title='El Rol de las Fintech en la Adopción del Dinero Digital en América Latina'
);

-- 09:50 - 10:20 Keynote – El futuro de la supervisión...
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T09:50:00Z', 'El futuro de la supervisión y regulación financiera en la era digital', NULL, ARRAY['Speaker TBD']::text[], 'keynote', 'Auditorio Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T09:50:00Z' AND title='El futuro de la supervisión y regulación financiera en la era digital'
);

-- 10:30 - 11:00 Keynote – Activos Digitales, la experiencia de El Salvador
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T10:30:00Z', 'Activos Digitales, la experiencia de El Salvador', NULL, ARRAY['Speaker TBD']::text[], 'keynote', 'Auditorio Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T10:30:00Z' AND title='Activos Digitales, la experiencia de El Salvador'
);

-- 11:10 - 11:40 Keynote – CBDCs y el Futuro del Dinero en LatAm
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T11:10:00Z', 'CBDCs y el Futuro del Dinero en LatAm', NULL, ARRAY['Speaker TBD']::text[], 'keynote', 'Auditorio Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T11:10:00Z' AND title='CBDCs y el Futuro del Dinero en LatAm'
);

-- 11:45 - 12:15 Panel – De la Ley Fintech a la normativa
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T11:45:00Z', 'De la Ley Fintech a la normativa, fase de implementación en Chile', NULL, ARRAY['Panelists TBD']::text[], 'panel', 'Sala Panel A', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T11:45:00Z' AND title='De la Ley Fintech a la normativa, fase de implementación en Chile'
);

-- 12:20 - 13:00 Keynote – Bancos centrales e innovación (Brasil)
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T12:20:00Z', 'El rol de los bancos centrales en la innovación financiera: lecciones del caso Brasil', NULL, ARRAY['Speaker TBD']::text[], 'keynote', 'Auditorio Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T12:20:00Z' AND title='El rol de los bancos centrales en la innovación financiera: lecciones del caso Brasil'
);

-- 13:00 - 14:00 Almuerzo Libre
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T13:00:00Z', 'Almuerzo Libre', NULL, NULL, 'keynote', 'Área de Comidas', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T13:00:00Z' AND title='Almuerzo Libre'
);

-- 14:00 - 15:00 Panel – Transformación Digital de la Banca Tradicional
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T14:00:00Z', 'Transformación Digital de la Banca Tradicional', NULL, ARRAY['Panelists TBD']::text[], 'panel', 'Sala Panel B', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T14:00:00Z' AND title='Transformación Digital de la Banca Tradicional'
);

-- 15:05 - 15:35 Keynote – Retos en Licenciamiento Bancario Digital
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T15:05:00Z', 'Retos en el proceso de Licenciamiento Bancario Digital', NULL, ARRAY['Speaker TBD']::text[], 'keynote', 'Auditorio Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T15:05:00Z' AND title='Retos en el proceso de Licenciamiento Bancario Digital'
);

-- 15:40 - 16:40 Panel – Marco regulatorio para la innovación financiera en LatAm
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T15:40:00Z', 'Marco regulatorio para la innovación financiera en LatAm', NULL, ARRAY['Regulators TBD']::text[], 'panel', 'Sala Panel A', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T15:40:00Z' AND title='Marco regulatorio para la innovación financiera en LatAm'
);

-- 16:45 - 17:15 Keynote – Pagos globales reinventados
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-12T16:45:00Z', 'Pagos globales reinventados: visión regulatoria para América Latina', NULL, ARRAY['Speaker TBD']::text[], 'keynote', 'Auditorio Principal', '1'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-12T16:45:00Z' AND title='Pagos globales reinventados: visión regulatoria para América Latina'
);
