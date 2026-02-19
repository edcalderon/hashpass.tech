// Speaker priority order for BSL 2025
// This defines the order in which speakers should appear in the search/list

export const SPEAKER_PRIORITY_ORDER = [
  'Claudia Restrepo',
  'Leonardo Villar',
  'César Ferrari',
  'Alberto Naudon',
  'Efraín Barraza',
  'Sandra Meza',
  'Sebastián Durán',
  'Daniel Calvo',
  'Rocelo Lopes',
  'Juan Carlos Reyes',
  'Liliana Vásquez',
  'Ana Garcés',
  'Nagel Paulino',
  'María Paula Rodríguez',
  'Daniel Mangabeira',
  'César Tamayo',
  'Juan Pablo Rodríguez',
  'Willian Santos',
  'Diego Fernández',
  'Andres Florido',
  'Steffen Härting',
  'Andrés Meneses',
  'Rafael Teruszkin',
  'Liz Bejarano',
  'Albi Rodríguez',
  'Judith Vergara',
  'William Durán',
  'Daniel Aguilar',
  'Pablo Santos',
  'Ana María Zuluaga',
  'Alireza Siadat',
  'Rafael Gago',
  'Omar Castelblanco',
  'Pedro Gutiérrez',
  'Nathaly Diniz',
  'Juan Pablo Salazar',
  'Andrés González',
  'Stephanie Sánchez',
  'Santiago Mejía',
  'Camilo Suárez',
  'Vivian Cruz',
  'Mónica Ramírez de Arellano',
  'Luisa Cárdenas',
  'Albert Prat',
  'Markus Kluge',
  'Daniel Marulanda',
  'David Yao',
  'María Fernanda Marín',
  'Sebastián Zapata',
  'Pilar Álvarez',
  'Daniel Mesa',
  'Matias Marmisolle',
  'Karol Benavides',
  'Camilo Romero',
  'José Manuel Souto',
  'Edison Montoya',
  'Camila Santana',
  'Fernando Quirós',
  'Lizeth Jaramillo',
  'Mariangel García',
  'Roberto Darrigrandi',
  'Ed Marquez',
  'Young Cho',
  'Edward Calderón',
  'Arlette Salas',
  'Paula Bermúdez',
  'Diego Osuna',
  'Gerardo Lagos',
  'Mireya Acosta',
  'Juliana Franco',
  'Luis Castañeda',
  '0xj4an',
  'Mercedes Bidart',
  'Michelle Arguelles',
  'Sebastián Ramírez',
  'Camilo Serna',
  'Daniela Corredor',
  'Javier Lozano',
  'Jorge Borges',
  'Lissa Parra',
  'Ximena Monclou',
  'Oscar Moratto',
  'Miguel Ángel Calero',
  'Andrea Jaramillo',
  'Camila Ortegón',
  'Luis Miguel Arroyave',
  'Marco Suvillaga',
  'José Martínez',
  'Juan Carlos Pérez',
  'Manuel Becker',
  'Juan Lalinde',
  'Manú Hersch',
  'Federico Biskupovich',
  'Alvaro Castro',
  'Nick Waytula',
  'Sergio Ramírez',
  'Wilder Rosero',
];

// Create a map for quick lookup
export const SPEAKER_PRIORITY_MAP = new Map(
  SPEAKER_PRIORITY_ORDER.map((name, index) => [name.toLowerCase(), index])
);

/**
 * Sort speakers by priority order (if in priority list) or alphabetically (if not)
 */
export function sortSpeakersByPriority<T extends { name: string }>(speakers: T[]): T[] {
  return [...speakers].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    
    const aPriority = SPEAKER_PRIORITY_MAP.get(aName);
    const bPriority = SPEAKER_PRIORITY_MAP.get(bName);
    
    // Both in priority list - sort by priority
    if (aPriority !== undefined && bPriority !== undefined) {
      return aPriority - bPriority;
    }
    
    // Only a in priority list - a comes first
    if (aPriority !== undefined) {
      return -1;
    }
    
    // Only b in priority list - b comes first
    if (bPriority !== undefined) {
      return 1;
    }
    
    // Neither in priority list - sort alphabetically
    return aName.localeCompare(bName);
  });
}

