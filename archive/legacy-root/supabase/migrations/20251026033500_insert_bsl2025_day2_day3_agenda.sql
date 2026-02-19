-- Insert BSL 2025 Day 2 agenda items (2025-11-13)
-- Uses NOT EXISTS to avoid duplicate inserts if migration is re-applied

-- 08:00 - 09:00 Registro y café de bienvenida
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T08:00:00Z', 'Registro y café de bienvenida', NULL, NULL, 'keynote', 'Hall Principal', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T08:00:00Z' AND title='Registro y café de bienvenida'
);

-- 09:00 - 09:25 Keynote – Exchanges en la Nueva Era...
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T09:00:00Z', 'Exchanges en la Nueva Era del Dinero Digital: Regulación, Confianza y Adopción Masiva', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T09:00:00Z' AND title='Exchanges en la Nueva Era del Dinero Digital: Regulación, Confianza y Adopción Masiva'
);

-- 09:30 - 10:30 Panel – Convergencia regulatoria
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T09:30:00Z', 'Hacia la convergencia regulatoria: los retos de armonizar los mercados de valores tokenizados entre América Latina, EE. UU. y la Unión Europea', NULL, 'Panelists TBD', 'panel', 'Sala Panel A', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T09:30:00Z' AND title='Hacia la convergencia regulatoria: los retos de armonizar los mercados de valores tokenizados entre América Latina, EE. UU. y la Unión Europea'
);

-- 10:35 - 11:00 Keynote – Custodia Institucional
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T10:35:00Z', 'Custodia Institucional de Activos Digitales', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T10:35:00Z' AND title='Custodia Institucional de Activos Digitales'
);

-- 11:05 - 12:05 Panel – TradFi vs Digital
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T11:05:00Z', 'Finanzas Tradicionales y Activos Digitales: ¿Competencia o Complemento?', NULL, 'Panelists TBD', 'panel', 'Sala Panel B', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T11:05:00Z' AND title='Finanzas Tradicionales y Activos Digitales: ¿Competencia o Complemento?'
);

-- 12:10 - 13:10 Panel – Tokenización en mercados de capitales
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T12:10:00Z', 'El Rol de la Tokenización en la Evolución de los Mercados de Capitales', NULL, 'Panelists TBD', 'panel', 'Auditorio Principal', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T12:10:00Z' AND title='El Rol de la Tokenización en la Evolución de los Mercados de Capitales'
);

-- 13:10 - 14:00 Almuerzo libre
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T13:10:00Z', 'Almuerzo libre', NULL, NULL, 'keynote', 'Área de Comidas', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T13:10:00Z' AND title='Almuerzo libre'
);

-- 14:00 - 15:00 Panel – PSAV y bancos, Compliance
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T14:00:00Z', 'PSAV y los bancos, el rol del Compliance', NULL, 'Panelists TBD', 'panel', 'Sala Panel A', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T14:00:00Z' AND title='PSAV y los bancos, el rol del Compliance'
);

-- 15:05 - 15:30 Keynote – Fiscalización de criptoactivos
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T15:05:00Z', 'Fiscalización de los criptoactivos: desafíos y oportunidades', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T15:05:00Z' AND title='Fiscalización de los criptoactivos: desafíos y oportunidades'
);

-- 15:35 - 15:50 Keynote – Compliance como motor de adopción
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T15:35:00Z', 'Compliance como motor de adopción: la nueva era de los activos digitales regulados', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T15:35:00Z' AND title='Compliance como motor de adopción: la nueva era de los activos digitales regulados'
);

-- 15:55 - 16:55 Panel – Road to Adoption
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T15:55:00Z', 'Road to Adoption: Estrategias para la institucionalización de los activos tokenizados', NULL, 'Panelists TBD', 'panel', 'Sala Panel B', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T15:55:00Z' AND title='Road to Adoption: Estrategias para la institucionalización de los activos tokenizados'
);

-- 17:00 - 17:25 Keynote – Tokenización de Activos Climáticos
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T17:00:00Z', 'Tokenización de Activos Climáticos', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T17:00:00Z' AND title='Tokenización de Activos Climáticos'
);

-- 17:30 - 18:30 Panel – Blockchain fundamento técnico-financiero
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-13T17:30:00Z', 'Blockchain y su fundamento técnico-financiero: Criptografía y smart contracts', NULL, 'Panelists TBD', 'panel', 'Auditorio Principal', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-13T17:30:00Z' AND title='Blockchain y su fundamento técnico-financiero: Criptografía y smart contracts'
);

-- Insert BSL 2025 Day 3 agenda items (2025-11-14)

-- 08:00 - 09:00 Registro y café de bienvenida
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T08:00:00Z', 'Registro y café de bienvenida', NULL, NULL, 'keynote', 'Hall Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T08:00:00Z' AND title='Registro y café de bienvenida'
);

-- 09:00 - 09:30 Keynote – Banco de la República
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T09:00:00Z', 'Digitalización e Innovación en el Banco de la República', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T09:00:00Z' AND title='Digitalización e Innovación en el Banco de la República'
);

-- 09:35 - 10:35 Panel – Stablecoins como Infraestructura
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T09:35:00Z', 'Stablecoins como Infraestructura: Más Allá del Dinero Digital', NULL, 'Panelists TBD', 'panel', 'Sala Panel A', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T09:35:00Z' AND title='Stablecoins como Infraestructura: Más Allá del Dinero Digital'
);

-- 10:40 - 11:10 Keynote – Infraestructura de pagos
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T10:40:00Z', 'Infraestructura de pagos para la nueva economía latinoamericana: cómo se está moviendo el dinero del mañana', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T10:40:00Z' AND title='Infraestructura de pagos para la nueva economía latinoamericana: cómo se está moviendo el dinero del mañana'
);

-- 11:20 - 12:20 Panel – Interoperabilidad y eficiencia en pagos cross-border
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T11:20:00Z', 'Interoperabilidad y eficiencia en pagos cross-border con stablecoins', NULL, 'Panelists TBD', 'panel', 'Sala Panel B', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T11:20:00Z' AND title='Interoperabilidad y eficiencia en pagos cross-border con stablecoins'
);

-- 12:25 - 12:50 Keynote – Experiencia Global en Stablecoins
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T12:25:00Z', 'Experiencia Global en Stablecoins', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T12:25:00Z' AND title='Experiencia Global en Stablecoins'
);

-- 13:00 - 14:00 Almuerzo Libre
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T13:00:00Z', 'Almuerzo Libre', NULL, NULL, 'keynote', 'Área de Comidas', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T13:00:00Z' AND title='Almuerzo Libre'
);

-- 14:00 - 15:00 Panel – Compliance y Tributación en DeFi y Stablecoins
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T14:00:00Z', 'Compliance y Tributación en el Ecosistema DeFi y Stablecoins', NULL, 'Panelists TBD', 'panel', 'Auditorio Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T14:00:00Z' AND title='Compliance y Tributación en el Ecosistema DeFi y Stablecoins'
);

-- 15:05 - 15:30 Keynote – Ecosistemas colaborativos
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T15:05:00Z', 'Ecosistemas colaborativos para la economía tokenizada', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T15:05:00Z' AND title='Ecosistemas colaborativos para la economía tokenizada'
);

-- 15:35 - 16:35 Panel – DeFi + TradFi
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T15:35:00Z', 'DeFi + TradFi: Nuevas sinergias en infraestructura financiera descentralizada', NULL, 'Panelists TBD', 'panel', 'Sala Panel A', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T15:35:00Z' AND title='DeFi + TradFi: Nuevas sinergias en infraestructura financiera descentralizada'
);

-- 16:40 - 17:05 Keynote – Blockchain como infraestructura económica (Hive)
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T16:40:00Z', 'Blockchain como infraestructura económica: el caso de Hive y la tokenización del valor digital', NULL, 'Speaker TBD', 'keynote', 'Auditorio Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T16:40:00Z' AND title='Blockchain como infraestructura económica: el caso de Hive y la tokenización del valor digital'
);

-- 17:10 - 18:10 Panel – Sistema Financiero Global 2030
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T17:10:00Z', 'Sistema Financiero Global en 2030: Visión, riesgos y oportunidades', NULL, 'Panelists TBD', 'panel', 'Auditorio Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T17:10:00Z' AND title='Sistema Financiero Global en 2030: Visión, riesgos y oportunidades'
);

-- 18:15 - 18:30 Clausura
INSERT INTO public.event_agenda (event_id, time, title, description, speakers, type, location, day)
SELECT 'bsl2025', '2025-11-14T18:15:00Z', 'Clausura', NULL, NULL, 'keynote', 'Auditorio Principal', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_agenda 
  WHERE event_id='bsl2025' AND time='2025-11-14T18:15:00Z' AND title='Clausura'
);
